// Final check of the complete static site, after every bucket has passed.
//
//   pnpm build   (all pages, no BUCKET)
//   pnpm verify-site [--no-layout]
//
// Runs the independent number checker on every page, checks that every internal
// link points at a built file, that the sitemap and static page data are
// complete, that every page's canonical link is its own address on the site,
// that unknown pages return 404, that every page fits at phone width (skipped
// with --no-layout), and that link clicks navigate in place on a sample of
// pages. Writes the result to data/buckets/site-check.json. A build made with
// SITE_URL set needs the same SITE_URL here, for the sitemap check.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'
import type { NationalProgramIndexEntry } from '../src/data/national-program-page'
import type { OccupationIndexEntry } from '../src/data/occupation-page'
import type { ProgramIndexEntry } from '../src/data/program-page'
import type { SiteIndexEntry } from '../src/data/site-pages'
import type { SchoolIndexEntry } from '../src/data/school-page'
import type { StateIndexEntry } from '../src/data/state-page'
import type { StateProgramIndexEntry } from '../src/data/state-program-page'
import { SITE_ORIGIN } from '../src/lib/site'

const PREVIEW_PORT = 4175
const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SITEMAP_HOST = process.env.SITE_URL ?? SITE_ORIGIN
const SKIP_LAYOUT = process.argv.includes('--no-layout')
const PHONE_TABS = 6
// Link clicks tried per page type.
const NAVIGATION_SAMPLES = 5

type Check = { name: string; passed: boolean; details: string[] }
const checks: Check[] = []

function record(name: string, passed: boolean, details: string[] = []) {
  checks.push({ name, passed, details: details.slice(0, 50) })
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${passed ? '' : `\n      ${details.slice(0, 10).join('\n      ')}`}`)
}

// Prerendering writes / as index.html and every other page as {path}.html.
function builtFile(pagePath: string) {
  return pagePath === '/' ? 'dist/client/index.html' : `dist/client${pagePath}.html`
}

async function main() {
  const programIndex = JSON.parse(await readFile('data/generated/program-index.json', 'utf8')) as ProgramIndexEntry[]
  const rankingIndex = JSON.parse(await readFile('data/generated/state-program-index.json', 'utf8')) as StateProgramIndexEntry[]
  const schoolIndex = JSON.parse(await readFile('data/generated/school-index.json', 'utf8')) as SchoolIndexEntry[]
  const stateIndex = JSON.parse(await readFile('data/generated/state-index.json', 'utf8')) as StateIndexEntry[]
  const nationalIndex = JSON.parse(await readFile('data/generated/national-program-index.json', 'utf8')) as NationalProgramIndexEntry[]
  const occupationIndex = JSON.parse(await readFile('data/generated/occupation-index.json', 'utf8')) as OccupationIndexEntry[]
  const siteIndex = JSON.parse(await readFile('data/generated/site-index.json', 'utf8')) as SiteIndexEntry[]
  const programPaths = programIndex.map((entry) => `/schools/${entry.schoolSlug}/${entry.programSlug}`)
  const rankingPaths = rankingIndex.map((entry) => `/states/${entry.stateSlug}/${entry.programSlug}`)
  const schoolPaths = schoolIndex.map((entry) => `/schools/${entry.schoolSlug}`)
  const statePaths = stateIndex.map((entry) => `/states/${entry.stateSlug}`)
  const nationalPaths = nationalIndex.map((entry) => `/programs/${entry.programSlug}`)
  const occupationPaths = occupationIndex.map((entry) => `/careers/${entry.careerSlug}`)
  const sitePaths = siteIndex.map((entry) => entry.path)
  const pagePaths = [...programPaths, ...rankingPaths, ...schoolPaths, ...statePaths, ...nationalPaths, ...occupationPaths, ...sitePaths]
  // Only program and ranking pages have the scatter chart.
  const chartPaths = new Set([...programPaths, ...rankingPaths])
  await mkdir('data/generated/site-check', { recursive: true })

  const missingFiles = pagePaths.filter((pagePath) => !existsSync(builtFile(pagePath)))
  record(`every page is built (${pagePaths.length})`, missingFiles.length === 0, missingFiles)

  // Independent number and wording check on every page, with each page type's checker.
  type CheckResult = { page: string; title?: string; description?: string; errors: string[]; links: string[] }
  const report: CheckResult[] = []
  let checkerFailed = false
  for (const [label, paths, checkerScript] of [
    ['programs', programPaths, 'scripts/verify/check_program_pages.py'],
    ['rankings', rankingPaths, 'scripts/verify/check_state_program_pages.py'],
    ['schools', schoolPaths, 'scripts/verify/check_school_pages.py'],
    ['states', statePaths, 'scripts/verify/check_state_pages.py'],
    ['national', nationalPaths, 'scripts/verify/check_national_program_pages.py'],
    ['occupations', occupationPaths, 'scripts/verify/check_occupation_pages.py'],
    ['site', sitePaths, 'scripts/verify/check_site_pages.py'],
  ] as const) {
    await writeFile(`data/generated/site-check/${label}.txt`, paths.join('\n'))
    const checker = spawnSync(
      'python3',
      [checkerScript, '--html-dir', 'dist/client', '--pages', `data/generated/site-check/${label}.txt`, '--report', `data/generated/site-check/${label}-report.json`],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    )
    if (checker.status !== 0) checkerFailed = true
    report.push(...(JSON.parse(await readFile(`data/generated/site-check/${label}-report.json`, 'utf8')) as CheckResult[]))
  }
  const pageErrors = report.flatMap((result) => result.errors.map((error) => `${result.page}: ${error}`))
  record(`numbers, wording, and page HTML on every page (${report.length})`, !checkerFailed && report.length === pagePaths.length && pageErrors.length === 0, pageErrors)

  const duplicateTitles = findDuplicates(report.map((result) => result.title ?? ''))
  const duplicateDescriptions = findDuplicates(report.map((result) => result.description ?? ''))
  record('titles and descriptions unique across the built site', duplicateTitles.length === 0 && duplicateDescriptions.length === 0, [...duplicateTitles, ...duplicateDescriptions])

  // Every internal link points at a page that exists as a built file.
  const links = [...new Set(report.flatMap((result) => result.links))]
  const brokenLinks = links.filter((link) => !existsSync(builtFile(link)))
  record(`every internal link has a built page (${links.length} distinct links)`, brokenLinks.length === 0, brokenLinks)

  const cacheFiles = await readdir('dist/client/__tsr/staticServerFnCache')
  record(`static page data files (${cacheFiles.length})`, cacheFiles.length === pagePaths.length, [`expected ${pagePaths.length}`])

  const sitemap = await readFile('dist/client/sitemap.xml', 'utf8')
  const missingFromSitemap = pagePaths.filter((pagePath) => !sitemap.includes(`<loc>${SITEMAP_HOST}${pagePath}</loc>`))
  record('sitemap lists every page', missingFromSitemap.length === 0, missingFromSitemap)

  // Each page names itself as the canonical address ("SEO" guide), and
  // robots.txt points crawlers at the sitemap.
  const canonicalProblems: string[] = []
  for (const pagePath of pagePaths) {
    const html = await readFile(builtFile(pagePath), 'utf8')
    const canonicalTags = html.match(/<link[^>]*rel="canonical"[^>]*>/g) ?? []
    const href = canonicalTags[0]?.match(/href="([^"]*)"/)?.[1]
    if (canonicalTags.length !== 1 || href !== `${SITE_ORIGIN}${pagePath}`) {
      canonicalProblems.push(`${pagePath}: ${canonicalTags.length} canonical links, ${href ?? 'no href'}`)
    }
  }
  const robots = await readFile('dist/client/robots.txt', 'utf8').catch(() => '')
  if (!robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)) canonicalProblems.push('robots.txt does not point to the sitemap')
  record(`every page has its own canonical link, and robots.txt names the sitemap (${pagePaths.length})`, canonicalProblems.length === 0, canonicalProblems)

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' })
  try {
    await waitForServer(PREVIEW_ORIGIN)
    const notFoundProblems: string[] = []
    for (const missingPath of ['/schools/no-such-school/no-such-program', '/schools/no-such-school', `${programPaths[0]}-extra`, `${rankingPaths[0]}-extra`, `${schoolPaths[0]}-extra`, `${statePaths[0]}-extra`, '/states/nope/nope', '/states/nope', '/programs/nope', `${nationalPaths[0]}-extra`, '/careers/nope', `${occupationPaths[0]}-extra`]) {
      const response = await fetch(`${PREVIEW_ORIGIN}${missingPath}`)
      if (response.status !== 404) notFoundProblems.push(`${missingPath} -> ${response.status}`)
    }
    record('unknown pages return 404', notFoundProblems.length === 0, notFoundProblems)

    if (SKIP_LAYOUT) {
      console.log('SKIP  every page fits at phone width (--no-layout)')
    } else {
      const phoneProblems = await checkPhoneLayout(pagePaths, chartPaths)
      record(`every page fits at phone width (${pagePaths.length})`, phoneProblems.length === 0, phoneProblems)
    }

    const navigationProblems: string[] = []
    for (const paths of [programPaths, rankingPaths, schoolPaths, statePaths, nationalPaths, occupationPaths, sitePaths]) {
      const typePaths = new Set(paths)
      navigationProblems.push(...(await checkNavigation(report.filter((result) => typePaths.has(result.page)))))
    }
    record(`link clicks navigate in place (${NAVIGATION_SAMPLES} samples per page type)`, navigationProblems.length === 0, navigationProblems)
  } finally {
    preview.kill()
  }

  const passed = checks.every((check) => check.passed)
  await writeFile(
    'data/buckets/site-check.json',
    `${JSON.stringify({ checkedAt: new Date().toISOString(), passed, pages: pagePaths.length, checks }, null, 1)}\n`,
  )
  console.log(`\nSite check: ${passed ? 'PASSED' : 'FAILED'} (${checks.filter((check) => check.passed).length} of ${checks.length} checks)`)
  process.exitCode = passed ? 0 : 1
}

function findDuplicates(values: string[]) {
  const seen = new Map<string, number>()
  for (const value of values) seen.set(value, (seen.get(value) ?? 0) + 1)
  return [...seen].filter(([, total]) => total > 1).map(([value]) => value)
}

async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(url)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`Server at ${url} did not start`)
}

// Several tabs share the work. Same rules as the bucket check: the page never
// scrolls sideways, wide tables sit in a scrolling ScrollArea, and the scatter
// chart, on pages that have one, keeps its 560px width and scrolls.
async function checkPhoneLayout(pagePaths: string[], chartPaths: Set<string>) {
  const problems: string[] = []
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true })
  let next = 0
  let done = 0
  try {
    await Promise.all(
      Array.from({ length: PHONE_TABS }, async () => {
        const page = await browser.newPage()
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
        while (next < pagePaths.length) {
          const pagePath = pagePaths[next]
          next += 1
          await page.goto(`${PREVIEW_ORIGIN}${pagePath}`, { waitUntil: 'load' })
          // No named functions inside evaluate: tsx would wrap them in a helper
          // that doesn't exist in the browser.
          const layout = await page.evaluate(() => {
            const chart = document.querySelector('[data-section="scatter"] svg')
            const elements = [...document.querySelectorAll('table'), ...(chart ? [chart] : [])]
            const inArea = elements.map((element) => {
              const scroller = element.closest('[data-slot="scroll-area-viewport"]')
              const overflow = scroller ? getComputedStyle(scroller).overflowX : 'visible'
              return Boolean(scroller) && (overflow === 'scroll' || overflow === 'auto')
            })
            const tableCount = document.querySelectorAll('table').length
            return {
              pageWidth: document.documentElement.scrollWidth,
              viewportWidth: document.documentElement.clientWidth,
              looseTables: inArea.slice(0, tableCount).filter((isInArea) => !isInArea).length,
              chartWidth: chart?.getBoundingClientRect().width ?? 0,
              chartInArea: chart ? inArea[tableCount] : false,
            }
          })
          if (layout.pageWidth > layout.viewportWidth) problems.push(`${pagePath}: page scrolls sideways`)
          if (layout.looseTables > 0) problems.push(`${pagePath}: ${layout.looseTables} table(s) outside a ScrollArea`)
          if (chartPaths.has(pagePath) && (layout.chartWidth < 559 || !layout.chartInArea)) problems.push(`${pagePath}: scatter chart ${Math.round(layout.chartWidth)}px`)
          done += 1
          if (done % 2000 === 0) console.log(`      phone check: ${done} of ${pagePaths.length}`)
        }
      }),
    )
  } finally {
    await browser.close()
  }
  return problems
}

// With every static data file built, any page's links can be clicked.
async function checkNavigation(report: { page: string; links: string[] }[]) {
  const problems: string[] = []
  const isPageLink = (link: string) => link.startsWith('/schools/') || link.startsWith('/states/') || link.startsWith('/programs/') || link.startsWith('/careers/')
  const withLinks = report.filter((result) => result.links.some((link) => isPageLink(link) && link !== result.page))
  const step = Math.max(1, Math.floor(withLinks.length / NAVIGATION_SAMPLES))
  const samples = withLinks.filter((_, position) => position % step === 0).slice(0, NAVIGATION_SAMPLES)
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true })
  try {
    for (const sample of samples) {
      const page = await browser.newPage()
      const target = sample.links.find((link) => isPageLink(link) && link !== sample.page)!
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`${sample.page}: console error ${message.text()}`)
      })
      await page.goto(`${PREVIEW_ORIGIN}${sample.page}`, { waitUntil: 'networkidle0' })
      const headingBefore = await page.$eval('h1', (heading) => heading.textContent)
      await page.evaluate(() => {
        ;(window as unknown as { navigationMarker: boolean }).navigationMarker = true
      })
      const dataResponse = page.waitForResponse((response) => response.url().includes('/__tsr/staticServerFnCache/'), { timeout: 10000 }).catch(() => null)
      await page.click(`main a[href="${target}"]`)
      const response = await dataResponse
      // 304 means the browser already had the file from an earlier sample and the server confirmed it.
      if (!response || (response.status() !== 200 && response.status() !== 304)) problems.push(`${sample.page} -> ${target}: static page data not loaded`)
      await page.waitForFunction((before: string | null) => document.querySelector('h1')?.textContent !== before, { timeout: 10000 }, headingBefore).catch(() => {
        problems.push(`${sample.page} -> ${target}: heading did not change`)
      })
      const stayed = await page.evaluate(() => (window as unknown as { navigationMarker?: boolean }).navigationMarker === true)
      if (!stayed) problems.push(`${sample.page} -> ${target}: full page reload`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
  return problems
}

await main()
