// Builds and verifies one bucket of 100 program pages, then records the result in
// data/buckets/progress.json.
//
//   pnpm bucket 1                         (program pages)
//   pnpm bucket 1 --type state-programs   (ranking pages)
//   pnpm bucket 1 --type schools          (school pages)
//   pnpm bucket 1 --type states           (state pages)
//   pnpm bucket 1 --type national-programs (national program pages)
//   pnpm bucket 1 --type occupations      (occupation pages)
//   pnpm bucket 1 --type site             (home page and the navbar's list pages)
//
// Steps: typecheck; production build that prerenders only this bucket; the
// independent number checker (scripts/verify/check_program_pages.py); titles and
// descriptions against the full list (scripts/verify/list-titles.ts); static data
// files; sitemap; internal links and 404s against the production preview server;
// layout checks and screenshots at desktop and phone width in Chrome.
//
// Exits with status 1 if any check fails. Committing is left to the person running it.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import puppeteer, { type Page } from 'puppeteer-core'
type IndexEntry = { schoolSlug?: string; stateSlug?: string; programSlug?: string; careerSlug?: string; path?: string }

// Each page type: its build-order index, URL, independent checker, and whether
// its pages have the scatter chart.
const PAGE_TYPES = {
  programs: {
    index: 'data/generated/program-index.json',
    pathOf: (entry: IndexEntry) => `/schools/${entry.schoolSlug}/${entry.programSlug}`,
    checker: 'scripts/verify/check_program_pages.py',
    progress: 'data/buckets/progress.json',
    label: '',
    hasChart: true,
  },
  'state-programs': {
    index: 'data/generated/state-program-index.json',
    pathOf: (entry: IndexEntry) => `/states/${entry.stateSlug}/${entry.programSlug}`,
    checker: 'scripts/verify/check_state_program_pages.py',
    progress: 'data/buckets/state-program-progress.json',
    label: 'state-programs-',
    hasChart: true,
  },
  schools: {
    index: 'data/generated/school-index.json',
    pathOf: (entry: IndexEntry) => `/schools/${entry.schoolSlug}`,
    checker: 'scripts/verify/check_school_pages.py',
    progress: 'data/buckets/school-progress.json',
    label: 'schools-',
    hasChart: false,
  },
  states: {
    index: 'data/generated/state-index.json',
    pathOf: (entry: IndexEntry) => `/states/${entry.stateSlug}`,
    checker: 'scripts/verify/check_state_pages.py',
    progress: 'data/buckets/state-progress.json',
    label: 'states-',
    hasChart: false,
  },
  'national-programs': {
    index: 'data/generated/national-program-index.json',
    pathOf: (entry: IndexEntry) => `/programs/${entry.programSlug}`,
    checker: 'scripts/verify/check_national_program_pages.py',
    progress: 'data/buckets/national-program-progress.json',
    label: 'national-programs-',
    hasChart: false,
  },
  occupations: {
    index: 'data/generated/occupation-index.json',
    pathOf: (entry: IndexEntry) => `/careers/${entry.careerSlug}`,
    checker: 'scripts/verify/check_occupation_pages.py',
    progress: 'data/buckets/occupation-progress.json',
    label: 'occupations-',
    hasChart: false,
  },
  site: {
    index: 'data/generated/site-index.json',
    pathOf: (entry: IndexEntry) => entry.path!,
    checker: 'scripts/verify/check_site_pages.py',
    progress: 'data/buckets/site-progress.json',
    label: 'site-',
    hasChart: false,
  },
} as const
type PageType = keyof typeof PAGE_TYPES

const BUCKET_SIZE = 100
const PREVIEW_PORT = 4174
const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// The sitemap needs an absolute address. Until the domain is chosen, bucket
// builds use a placeholder that is only checked for paths.
const PLACEHOLDER_SITE_URL = 'https://example.invalid'
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900, isMobile: false },
  { name: 'phone', width: 390, height: 844, isMobile: true },
]

type CheckResult = { name: string; passed: boolean; details?: string[] }

type ProgressEntry = {
  bucket: number
  checkedAt: string
  passed: boolean
  pages: string[]
  checks: CheckResult[]
  warnings: { titlesOver60: number; descriptionsOver160: number }
  screenshots: string[]
}

const bucket = Number(process.argv[2])
const typeFlag = process.argv.indexOf('--type')
const pageType = (typeFlag === -1 ? 'programs' : process.argv[typeFlag + 1]) as PageType
if (!Number.isInteger(bucket) || bucket < 1 || !(pageType in PAGE_TYPES)) {
  console.error('Usage: pnpm bucket <bucket number, from 1> [--type programs|state-programs|schools|states|national-programs|occupations|site]')
  process.exit(2)
}
const pageTypeConfig = PAGE_TYPES[pageType]

function run(command: string, args: string[], environment: Record<string, string> = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...environment }, maxBuffer: 64 * 1024 * 1024 })
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

function lastLines(text: string, count: number) {
  return text.trim().split('\n').slice(-count)
}

async function waitForServer(url: string, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fetch(url)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`Server at ${url} did not start`)
}

async function main() {
  const index = JSON.parse(await readFile(pageTypeConfig.index, 'utf8')) as IndexEntry[]
  const entries = index.slice((bucket - 1) * BUCKET_SIZE, bucket * BUCKET_SIZE)
  if (entries.length === 0) throw new Error(`Bucket ${bucket} is empty; there are ${index.length} pages.`)
  const pagePaths = entries.map((entry) => pageTypeConfig.pathOf(entry))
  const bucketLabel = `${pageTypeConfig.label}${String(bucket).padStart(3, '0')}`
  const workDirectory = path.join('data/generated/buckets', bucketLabel)
  const screenshotDirectory = path.join('data/generated/screenshots', `bucket-${bucketLabel}`)
  await mkdir(workDirectory, { recursive: true })
  await mkdir(screenshotDirectory, { recursive: true })
  const checks: CheckResult[] = []
  const record = (name: string, passed: boolean, details?: string[]) => {
    checks.push({ name, passed, ...(details && details.length > 0 ? { details } : {}) })
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${details && !passed ? `\n      ${details.slice(0, 10).join('\n      ')}` : ''}`)
  }

  const typecheck = run('pnpm', ['typecheck'])
  record('typecheck', typecheck.ok, typecheck.ok ? undefined : lastLines(typecheck.output, 15))

  const build = run('pnpm', ['build'], { BUCKET: String(bucket), PAGE_TYPE: pageType, SITE_URL: PLACEHOLDER_SITE_URL })
  record('build and prerender', build.ok, build.ok ? undefined : lastLines(build.output, 15))
  if (!build.ok) return finish()

  // Independent number and wording check.
  const pagesFile = path.join(workDirectory, 'pages.txt')
  const reportFile = path.join(workDirectory, 'report.json')
  await writeFile(pagesFile, pagePaths.join('\n'))
  const checker = run('python3', [pageTypeConfig.checker, '--html-dir', 'dist/client', '--pages', pagesFile, '--report', reportFile])
  const report = existsSync(reportFile)
    ? (JSON.parse(await readFile(reportFile, 'utf8')) as {
        page: string
        title?: string
        description?: string
        errors: string[]
        warnings: string[]
        links: string[]
      }[])
    : []
  const pageErrors = report.flatMap((result) => result.errors.map((error) => `${result.page}: ${error}`))
  record(`numbers, wording, and page HTML (${report.length} pages)`, checker.ok && report.length === pagePaths.length && pageErrors.length === 0, pageErrors.length > 0 ? pageErrors : lastLines(checker.output, 10))

  // Titles and descriptions: what was built matches the full list, which is unique.
  const titleList = run('npx', ['tsx', 'scripts/verify/list-titles.ts'])
  const allTitles = existsSync('data/generated/titles.json')
    ? (JSON.parse(await readFile('data/generated/titles.json', 'utf8')) as Record<string, { title: string; description: string }>)
    : {}
  const titleMismatches = report
    .filter((result) => allTitles[result.page]?.title !== result.title || allTitles[result.page]?.description !== result.description)
    .map((result) => result.page)
  record('titles and descriptions unique across all pages', titleList.ok && titleMismatches.length === 0, titleList.ok ? titleMismatches : lastLines(titleList.output, 10))

  // Static data files that client-side navigation fetches.
  const cacheDirectory = 'dist/client/__tsr/staticServerFnCache'
  const cacheFiles = existsSync(cacheDirectory) ? await readdir(cacheDirectory) : []
  const unreadable: string[] = []
  for (const fileName of cacheFiles) {
    try {
      JSON.parse(await readFile(path.join(cacheDirectory, fileName), 'utf8'))
    } catch {
      unreadable.push(fileName)
    }
  }
  // TanStack Start also prerenders every route without URL parameters (the home
  // page and the three list pages), so their data files are always built too.
  const sitePaths = (JSON.parse(await readFile('data/generated/site-index.json', 'utf8')) as IndexEntry[]).map((entry) => entry.path!)
  const expectedCacheFiles = pagePaths.length + sitePaths.filter((sitePath) => !pagePaths.includes(sitePath)).length
  record(
    `static page data files (${cacheFiles.length})`,
    cacheFiles.length === expectedCacheFiles && unreadable.length === 0,
    unreadable.length > 0 ? unreadable : [`expected ${expectedCacheFiles}`],
  )

  // Sitemap lists every built page.
  const sitemap = existsSync('dist/client/sitemap.xml') ? await readFile('dist/client/sitemap.xml', 'utf8') : ''
  const missingFromSitemap = pagePaths.filter((pagePath) => !sitemap.includes(`<loc>${PLACEHOLDER_SITE_URL}${pagePath}</loc>`))
  record('sitemap lists every page', sitemap.length > 0 && missingFromSitemap.length === 0, missingFromSitemap)

  // Links and 404s, against the production build.
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' })
  const screenshots: string[] = []
  try {
    await waitForServer(PREVIEW_ORIGIN)
    const links = [...new Set(report.flatMap((result) => result.links))]
    const brokenLinks: string[] = []
    for (const link of links) {
      const response = await fetch(`${PREVIEW_ORIGIN}${link}`)
      if (response.status !== 200) brokenLinks.push(`${link} -> ${response.status}`)
    }
    record(`internal links return 200 (${links.length})`, brokenLinks.length === 0, brokenLinks)

    const missingPaths = ['/schools/no-such-school/no-such-program', '/schools/no-such-school', '/states/no-such-state/no-such-program', '/states/no-such-state', '/programs/no-such-program', '/careers/no-such-career', `${pagePaths[0]}-extra`]
    const wrongStatus: string[] = []
    for (const missingPath of missingPaths) {
      const response = await fetch(`${PREVIEW_ORIGIN}${missingPath}`)
      if (response.status !== 404) wrongStatus.push(`${missingPath} -> ${response.status}`)
    }
    record('unknown pages return 404', wrongStatus.length === 0, wrongStatus)

    // Layout: the first page of the bucket and the one with the fewest sections.
    const sectionCounts = report.map((result) => ({ page: result.page, links: result.links.length }))
    const sampled = [pagePaths[0], sectionCounts.sort((first, second) => first.links - second.links)[0].page]
    const visualProblems = await checkLayout([...new Set(sampled)], screenshotDirectory, screenshots)
    record('layout at desktop and phone width', visualProblems.length === 0, visualProblems)

    // Every page at phone width: no sideways scrolling and every table fits.
    const phoneProblems = await checkEveryPageAtPhoneWidth(pagePaths)
    record(
      `every page fits at phone width; tables${pageTypeConfig.hasChart ? ' and chart' : ''} scroll in their cards (${pagePaths.length})`,
      phoneProblems.length === 0,
      phoneProblems,
    )

    // In-place navigation needs a link between two pages built in this bucket.
    const builtPaths = new Set(pagePaths)
    const navigationSource = report.find((result) => result.links.some((link) => builtPaths.has(link) && link !== result.page))
    if (navigationSource) {
      const navigationProblems = await checkNavigation(navigationSource.page, pagePaths)
      record(`link click navigates in place (from ${navigationSource.page})`, navigationProblems.length === 0, navigationProblems)
    } else {
      record('link click navigates in place (skipped: no link between two pages of this bucket)', true)
    }
  } finally {
    preview.kill()
  }

  const warnings = {
    titlesOver60: report.filter((result) => (result.title ?? '').length > 60).length,
    descriptionsOver160: report.filter((result) => (result.description ?? '').length > 160).length,
  }
  return finish(warnings, screenshots)

  async function finish(warnings = { titlesOver60: 0, descriptionsOver160: 0 }, screenshotPaths: string[] = []) {
    const passed = checks.every((check) => check.passed)
    const progressPath = pageTypeConfig.progress
    await mkdir('data/buckets', { recursive: true })
    const progress = existsSync(progressPath) ? (JSON.parse(await readFile(progressPath, 'utf8')) as ProgressEntry[]) : []
    const entry: ProgressEntry = {
      bucket,
      checkedAt: new Date().toISOString(),
      passed,
      pages: pagePaths,
      checks,
      warnings,
      screenshots: screenshotPaths,
    }
    const updated = [...progress.filter((item) => item.bucket !== bucket), entry].sort((first, second) => first.bucket - second.bucket)
    await writeFile(progressPath, `${JSON.stringify(updated, null, 1)}\n`)
    console.log(`\nBucket ${bucket}: ${passed ? 'PASSED' : 'FAILED'} (${checks.filter((check) => check.passed).length} of ${checks.length} checks)`)
    process.exitCode = passed ? 0 : 1
  }
}

// Opens pages in Chrome at both widths: no sideways scrolling, tables fit their
// boxes, the chart has its dots, no console errors or failed requests, and a
// link to another built page navigates in place using the static data file.
async function checkLayout(samplePaths: string[], screenshotDirectory: string, screenshots: string[]) {
  const problems: string[] = []
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true })
  try {
    for (const samplePath of samplePaths) {
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage()
        const pageProblems: string[] = []
        page.on('console', (message) => {
          if (message.type() === 'error') pageProblems.push(`console error: ${message.text()}`)
        })
        page.on('response', (response) => {
          if (response.status() >= 400) pageProblems.push(`request failed ${response.status()}: ${response.url()}`)
        })
        await page.setViewport({ width: viewport.width, height: viewport.height, isMobile: viewport.isMobile, hasTouch: viewport.isMobile, deviceScaleFactor: 1 })
        await page.goto(`${PREVIEW_ORIGIN}${samplePath}`, { waitUntil: 'networkidle0' })
        const layout = await page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth
          // A table may be wider than its card only inside a scrolling ScrollArea.
          const overflowingTables = [...document.querySelectorAll('table')].filter((table) => {
            const scroller = table.closest('[data-slot="scroll-area-viewport"]')
            const overflow = scroller ? getComputedStyle(scroller).overflowX : 'visible'
            return !scroller || (overflow !== 'scroll' && overflow !== 'auto')
          }).length
          const dots = document.querySelector('[data-section="scatter"] svg')?.querySelectorAll('circle').length ?? 0
          return { pageWidth: document.documentElement.scrollWidth, viewportWidth, overflowingTables, dots }
        })
        if (layout.pageWidth > layout.viewportWidth) pageProblems.push(`page scrolls sideways (${layout.pageWidth} > ${layout.viewportWidth})`)
        if (layout.overflowingTables > 0) pageProblems.push(`${layout.overflowingTables} table(s) not in a scrolling ScrollArea`)
        if (pageTypeConfig.hasChart && layout.dots < 5) pageProblems.push(`scatter chart has ${layout.dots} dots`)
        const screenshotName = samplePath === '/' ? 'home' : samplePath.split('/').slice(1).join('--')
        const screenshotPath = path.join(screenshotDirectory, `${screenshotName}-${viewport.name}.png`)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        screenshots.push(screenshotPath)
        problems.push(...pageProblems.map((problem) => `${samplePath} (${viewport.name}): ${problem}`))
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
  return problems
}

async function checkEveryPageAtPhoneWidth(pagePaths: string[]) {
  const problems: string[] = []
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    for (const pagePath of pagePaths) {
      await page.goto(`${PREVIEW_ORIGIN}${pagePath}`, { waitUntil: 'load' })
      const layout = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        // A table may be wider than its card only inside a scrolling ScrollArea.
        overflowingTables: [...document.querySelectorAll('table')]
          .filter((table) => {
            const scroller = table.closest('[data-slot="scroll-area-viewport"]')
            const overflow = scroller ? getComputedStyle(scroller).overflowX : 'visible'
            return !scroller || (overflow !== 'scroll' && overflow !== 'auto')
          })
          .map((table) => table.closest('[data-section]')?.getAttribute('data-section') ?? 'table'),
        // The scatter chart keeps 560px and scrolls rather than shrinking past readable.
        chartWidth: document.querySelector('[data-section="scatter"] svg')?.getBoundingClientRect().width ?? 0,
        chartScrolls: (() => {
          const scroller = document.querySelector('[data-section="scatter"] [data-slot="scroll-area-viewport"]')
          return scroller ? scroller.scrollWidth > scroller.clientWidth : false
        })(),
      }))
      if (layout.pageWidth > layout.viewportWidth) problems.push(`${pagePath}: page scrolls sideways (${layout.pageWidth} > ${layout.viewportWidth})`)
      if (layout.overflowingTables.length > 0) problems.push(`${pagePath}: table not in a scrolling ScrollArea in ${layout.overflowingTables.join(', ')}`)
      if (pageTypeConfig.hasChart && (layout.chartWidth < 559 || !layout.chartScrolls)) {
        problems.push(`${pagePath}: scatter chart is ${Math.round(layout.chartWidth)}px wide and ${layout.chartScrolls ? 'scrolls' : 'does not scroll'}`)
      }
    }
  } finally {
    await browser.close()
  }
  return problems
}

async function checkNavigation(sourcePath: string, builtPaths: string[]) {
  const problems: string[] = []
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true })
  try {
    const page = await browser.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console error: ${message.text()}`)
    })
    await page.setViewport({ width: 1280, height: 900 })
    await page.goto(`${PREVIEW_ORIGIN}${sourcePath}`, { waitUntil: 'networkidle0' })
    await clickBuiltLink(page, builtPaths, problems)
  } finally {
    await browser.close()
  }
  return problems
}

async function clickBuiltLink(page: Page, builtPaths: string[], problems: string[]) {
  const target = await page.evaluate((paths: string[]) => {
    const built = new Set(paths)
    const link = [...document.querySelectorAll<HTMLAnchorElement>('main a[href^="/"]')].find(
      (anchor) => built.has(anchor.getAttribute('href') ?? '') && anchor.getAttribute('href') !== location.pathname,
    )
    return link?.getAttribute('href') ?? null
  }, builtPaths)
  if (!target) {
    problems.push('no link to another built page found')
    return
  }
  const titleBefore = await page.$eval('h1', (heading) => heading.textContent)
  await page.evaluate(() => {
    ;(window as unknown as { navigationMarker: boolean }).navigationMarker = true
  })
  const dataResponse = page.waitForResponse((response) => response.url().includes('/__tsr/staticServerFnCache/'), { timeout: 10000 })
  await page.click(`main a[href="${target}"]`)
  try {
    const response = await dataResponse
    // 304 means the browser already had the file and the server confirmed it.
    if (response.status() !== 200 && response.status() !== 304) problems.push(`page data file returned ${response.status()}`)
  } catch {
    problems.push(`link click to ${target} did not fetch a static page data file`)
  }
  await page.waitForFunction((expected: string) => location.pathname === expected, { timeout: 10000 }, target).catch(() => {
    problems.push(`link click did not reach ${target}`)
  })
  await page.waitForFunction((before: string | null) => document.querySelector('h1')?.textContent !== before, { timeout: 10000 }, titleBefore).catch(() => {
    problems.push(`heading did not change after navigating to ${target}`)
  })
  const stayedOnPage = await page.evaluate(() => (window as unknown as { navigationMarker?: boolean }).navigationMarker === true)
  if (!stayedOnPage) problems.push(`link to ${target} reloaded the whole page instead of navigating in place`)
}

await main()
