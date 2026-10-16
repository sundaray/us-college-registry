// The compare page's check, run by `pnpm verify-site` on the preview server.
//
// The compare page fills in its figures in the browser, from each program
// page's saved record, so the built HTML holds no figures for a checker to
// read. This check uses the page as a reader does, in Chrome: it picks a
// degree, a field and schools in the boxes, presses Compare, and compares
// every figure on the screen with the federal files in data/raw. The raw
// values and their formatting are worked out here, not taken from the site's
// code. It also checks the layout at desktop, tablet and phone widths, the
// state box, the links and the header link from another page.
//
// The record fields behind the figures are the program pages' own, which
// check_program_pages.py compares with the raw files on every page. This check
// covers what the compare page does with them, on a fixed sample of programs.

import { readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'
import type { Page } from 'puppeteer-core'
import type { ProgramIndexEntry } from '../../src/data/program-page'
import type { SearchIndexFile } from '../../src/lib/site-search'
import { parseNumber, readCsv } from '../lib/csv'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const RAW_DIRECTORY = 'data/raw'
// Random comparisons tried, one degree after another, and the seed that picks them.
const SAMPLE_ROUNDS = 8
const SAMPLE_SEED = 20261016
const WIDTHS = { desktop: { width: 1280, height: 900 }, tablet: { width: 768, height: 1000 }, phone: { width: 390, height: 844 } }
type WidthName = keyof typeof WIDTHS

const NOT_REPORTED = 'Not reported'
const CONTROL_NAMES: Record<string, string> = { 1: 'Public', 2: 'Private nonprofit', 3: 'Private for-profit' }
const REPAYMENT_COLUMNS = {
  paidInFull: 'BBRR2_FED_COMP_PAIDINFULL',
  makingProgress: 'BBRR2_FED_COMP_MAKEPROG',
  forbearance: 'BBRR2_FED_COMP_FBR',
  default: 'BBRR2_FED_COMP_DFLT',
}
// The box that picks each degree, counted from the left.
const DEGREE_BUTTONS: Record<number, number> = { 5: 1, 3: 2, 2: 3, 1: 4 }
const EXAMPLE_SCHOOLS = ['university-of-massachusetts-amherst', 'purdue-university-main-campus', 'university-of-california-san-diego', 'boston-university']

// ---- What the page should show, from the raw files ----

const formatMoney = (amount: number) => `$${Math.round(amount).toLocaleString('en-US')}`
const formatCount = (count: number) => Math.round(count).toLocaleString('en-US')
const wholePercent = (share: number) => Math.round(Number((share * 100).toFixed(6)))
const formatShare = (share: number) => `${wholePercent(share)}%`

// Scorecard writes repayment shares as "<=0.05", ">=0.9", "0.40 - 0.44" or "0.3".
function formatShareRange(value: string) {
  const trimmed = value.trim()
  if (['', 'PS', 'NA', 'NULL'].includes(trimmed)) return undefined
  if (trimmed.startsWith('<=')) return `${wholePercent(Number(trimmed.slice(2)))}% or less`
  if (trimmed.startsWith('>=')) return `${wholePercent(Number(trimmed.slice(2)))}% or more`
  const between = trimmed.match(/^(\d*\.?\d+)\s*-\s*(\d*\.?\d+)$/)
  if (between) return `${wholePercent(Number(between[1]))}–${wholePercent(Number(between[2]))}%`
  return `${wholePercent(Number(trimmed))}%`
}

type RawFiles = {
  programIndex: ProgramIndexEntry[]
  searchIndex: SearchIndexFile
  fieldRows: Map<string, Record<string, string>>
  schoolRows: Map<string, Record<string, string>>
}

async function readRawFiles(): Promise<RawFiles> {
  const programIndex = JSON.parse(await readFile('data/generated/program-index.json', 'utf8')) as ProgramIndexEntry[]
  const searchIndex = JSON.parse(await readFile('dist/client/search-index.json', 'utf8')) as SearchIndexFile
  const wanted = new Set(programIndex.map((entry) => `${entry.unitId}|${entry.cipCode}|${entry.credentialLevel}`))
  const fieldRows = new Map<string, Record<string, string>>()
  const fieldColumns = [
    'UNITID', 'CIPCODE', 'CREDLEV', 'EARN_MDN_1YR', 'EARN_MDN_5YR', 'EARN_COUNT_WNE_1YR', 'EARN_IN_STATE_1YR',
    'DEBT_ALL_STGP_ANY_MDN', 'DEBT_ALL_STGP_ANY_MDN10YRPAY', 'DEBT_ALL_STGP_EVAL_MDN', 'DEBT_ALL_STGP_EVAL_MDN10YRPAY',
    'DEBT_ALL_STGP_EVAL_N', 'BBRR2_FED_COMP_N', ...Object.values(REPAYMENT_COLUMNS),
  ]
  for (const row of await readCsv(`${RAW_DIRECTORY}/Most-Recent-Cohorts-Field-of-Study.csv`, { columns: fieldColumns })) {
    const key = `${row.UNITID}|${row.CIPCODE}|${row.CREDLEV}`
    if (wanted.has(key)) fieldRows.set(key, row)
  }
  const unitIds = new Set(programIndex.map((entry) => entry.unitId))
  const schoolRows = new Map<string, Record<string, string>>()
  for (const row of await readCsv(`${RAW_DIRECTORY}/Most-Recent-Cohorts-Institution.csv`, { columns: ['UNITID', 'CITY', 'STABBR', 'CONTROL'] })) {
    if (unitIds.has(row.UNITID)) schoolRows.set(row.UNITID, row)
  }
  return { programIndex, searchIndex, fieldRows, schoolRows }
}

// Every row's text for one program, keyed by the row's data-row name, and the
// place and type the row of school names gives.
function expectedProgram(raw: RawFiles, entry: ProgramIndexEntry) {
  const row = raw.fieldRows.get(`${entry.unitId}|${entry.cipCode}|${entry.credentialLevel}`)!
  const school = raw.schoolRows.get(entry.unitId)!
  const stateNames = new Map(raw.searchIndex.states.map(([, name, code]) => [code, name]))
  const graduate = entry.credentialLevel === 5
  const year1 = parseNumber(row.EARN_MDN_1YR)!
  const year5 = parseNumber(row.EARN_MDN_5YR)
  const debt = parseNumber(graduate ? row.DEBT_ALL_STGP_EVAL_MDN : row.DEBT_ALL_STGP_ANY_MDN)!
  const payment = parseNumber(graduate ? row.DEBT_ALL_STGP_EVAL_MDN10YRPAY : row.DEBT_ALL_STGP_ANY_MDN10YRPAY)
  const working = parseNumber(row.EARN_COUNT_WNE_1YR)
  const inState = parseNumber(row.EARN_IN_STATE_1YR)
  const cells: Record<string, string> = {
    year1: formatMoney(year1),
    year5: year5 !== undefined ? formatMoney(year5) : NOT_REPORTED,
    working: working ? formatCount(working) : NOT_REPORTED,
    debt: formatMoney(debt),
    'debt-to-earnings': formatShare(debt / year1),
    payment: payment !== undefined ? `${formatMoney(payment)} a month` : NOT_REPORTED,
    'in-state':
      working && inState !== undefined && inState <= working
        ? `${formatShare(inState / working)}\n${formatCount(inState)} of ${formatCount(working)}, in ${stateNames.get(school.STABBR)}`
        : NOT_REPORTED,
  }
  if (graduate) {
    const borrowers = parseNumber(row.DEBT_ALL_STGP_EVAL_N)
    cells.borrowers = borrowers ? formatCount(borrowers) : NOT_REPORTED
  } else {
    // A master's comparison has no repayment rows.
    const shares = Object.fromEntries(Object.entries(REPAYMENT_COLUMNS).map(([status, column]) => [status, formatShareRange(row[column])]))
    const repaymentBorrowers = parseNumber(row.BBRR2_FED_COMP_N)
    const hasRepayment = Boolean(repaymentBorrowers) && Object.values(shares).some(Boolean)
    cells['repayment-borrowers'] = hasRepayment ? formatCount(repaymentBorrowers!) : NOT_REPORTED
    for (const [status, share] of Object.entries(shares)) cells[`repayment-${status}`] = hasRepayment && share ? share : NOT_REPORTED
  }
  return { cells, placeAndType: `${school.CITY}, ${school.STABBR} · ${CONTROL_NAMES[school.CONTROL].toLowerCase()}` }
}

// ---- The page, used as a reader uses it ----

export async function checkComparePage(origin: string) {
  const raw = await readRawFiles()
  const problems: string[] = []
  let checked = 0
  const same = (what: string, shown: unknown, expected: unknown) => {
    checked += 1
    if (shown !== expected) problems.push(`${what}: shown ${JSON.stringify(shown)}, expected ${JSON.stringify(expected)}`)
  }
  const indexByAddress = new Map(raw.programIndex.map((entry) => [`${entry.schoolSlug}/${entry.programSlug}`, entry]))
  const shortNames = new Map(raw.searchIndex.schools.map(([slug, , shortName]) => [slug, shortName]))
  const schoolPlaces = new Map(raw.searchIndex.schools.map(([slug, , shortName, city, stateNumber]) => [slug, { shortName, place: `${city}, ${raw.searchIndex.states[stateNumber][2]}` }]))
  const fieldNames = new Map(raw.searchIndex.fields.map(([slug, label]) => [slug, label.replace(/ \([^()]+\)$/, '')]))

  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true })
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  const failedRequests: string[] = []
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`)
  })

  try {
    await page.setViewport(WIDTHS.desktop)
    // The header link, from another page to this one, without a page load.
    await page.goto(`${origin}/programs`, { waitUntil: 'networkidle0' })
    await page.evaluate(() => Object.assign(window, { stayedOnPage: true }))
    await press(page, 'header a[href="/programs/compare"]')
    await waitFor(page, problems, () => location.pathname === '/programs/compare' && Boolean(document.getElementById('compare-field')), 'the compare page after the header link')
    same('the header link navigates in place', await page.evaluate(() => (window as unknown as { stayedOnPage?: boolean }).stayedOnPage === true), true)
    same('the page title', await page.title(), 'Compare US College Programs Side by Side')

    // The empty page: nothing to choose until the box before is chosen.
    await openEmpty(page, origin, problems)
    same('empty: field box off', await page.evaluate(() => (document.getElementById('compare-field') as HTMLInputElement).disabled), true)
    same('empty: state box off', await page.evaluate(() => (document.getElementById('compare-state') as HTMLInputElement).disabled), true)
    same('empty: school boxes off', await page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('[id^="compare-school-"]')].every((input) => input.disabled)), true)
    same('empty: Compare off', await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Compare')!.disabled), true)
    same('empty: no figures', await page.evaluate(() => document.querySelectorAll('[data-row]').length), 0)

    // Chooses a degree, a field and schools in the boxes, then presses Compare.
    const compareThrough = async (credentialLevel: number, fieldSlug: string, schoolSlugs: string[]) => {
      await press(page, `[data-slot="toggle-group-item"]:nth-child(${DEGREE_BUTTONS[credentialLevel]})`)
      await choose(page, problems, 'compare-field', fieldNames.get(fieldSlug)!, fieldNames.get(fieldSlug)!)
      for (const [slot, schoolSlug] of schoolSlugs.entries()) {
        const school = schoolPlaces.get(schoolSlug)!
        await choose(page, problems, `compare-school-${slot + 1}`, school.shortName, school.shortName, school.place)
      }
      await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Compare')!.setAttribute('data-check', 'compare'))
      await press(page, '[data-check="compare"]')
    }
    // Every figure on the screen for these programs, against the raw files.
    const checkFigures = async (scenario: string, addresses: string[]) => {
      await waitFor(page, problems, () => !document.querySelector('[data-section="comparison"] [data-slot="skeleton"]') && Boolean(document.querySelector('[data-row]')), `${scenario}: figures`)
      const cells = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-row]')].flatMap((row) =>
          [...row.querySelectorAll<HTMLElement>('[data-cell]')].map((cell) => ({ row: row.dataset.row!, school: cell.children[0].textContent, text: (cell.children[1] as HTMLElement).innerText.trim() })),
        ),
      )
      const names = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-section="compare-names"] [data-name]')].map((cell) => cell.innerText.trim().split('\n')))
      for (const address of addresses) {
        const name = shortNames.get(address.split('/')[0])
        const expected = expectedProgram(raw, indexByAddress.get(address)!)
        const shown = cells.filter((cell) => cell.school === name)
        for (const [rowKey, expectedText] of Object.entries(expected.cells)) {
          same(`${scenario}: ${name} ${rowKey}`, shown.find((cell) => cell.row === rowKey)?.text, expectedText)
        }
        same(`${scenario}: ${name} has no other rows`, [...new Set(shown.map((cell) => cell.row))].filter((rowKey) => !(rowKey in expected.cells)).join(','), '')
        same(`${scenario}: ${name} place and type`, names.find((lines) => lines[0] === name)?.[1], expected.placeAndType)
      }
    }

    // The example at each width: one table, the strips in view, nothing sideways.
    await compareThrough(3, 'computer-science-bachelors', EXAMPLE_SCHOOLS)
    for (const width of Object.keys(WIDTHS) as WidthName[]) {
      await page.setViewport(WIDTHS[width])
      await pause(400)
      await checkFigures(`example at ${width} width`, EXAMPLE_SCHOOLS.map((slug) => `${slug}/computer-science-bachelors`))
      const layout = await page.evaluate(() => {
        const cell = document.querySelector('[data-row="year1"] [data-cell]')!
        const groups = [...document.querySelectorAll('[data-section="comparison"] > section')]
        return {
          sideways: document.documentElement.scrollWidth > window.innerWidth,
          namesOnLines: getComputedStyle(cell.children[0]).position !== 'absolute',
          columns: getComputedStyle(document.querySelector('[data-row="year1"]')!).gridTemplateColumns.split(' ').length,
          names: getComputedStyle(document.querySelector('[data-section="compare-names"]')!).position,
          band: getComputedStyle(document.querySelector('[data-section="compare-pay"] [data-slot="compare-band"]')!).position,
          groups: groups.map((group) => group.querySelector('h2')!.textContent).join('|'),
          gaps: groups.slice(1).map((group, position) => Math.round(group.getBoundingClientRect().top - groups[position].getBoundingClientRect().bottom)).join(','),
        }
      })
      const phone = width === 'phone'
      same(`${width}: no sideways scroll`, layout.sideways, false)
      same(`${width}: school name on every line`, layout.namesOnLines, phone)
      same(`${width}: columns`, layout.columns, phone ? 1 : 4)
      same(`${width}: names row stays in view`, layout.names, phone ? 'static' : 'sticky')
      same(`${width}: group band stays in view`, layout.band, phone ? 'sticky' : 'static')
      same(`${width}: groups`, layout.groups, 'Graduate pay|Debt|Two years into repayment|Where graduates work')
      same(`${width}: one table without gaps`, layout.gaps, '0,0,0')
      await page.evaluate(() => document.querySelector('[data-row="repayment-default"]')!.scrollIntoView({ block: 'center' }))
      await pause(300)
      const underHeader = await page.evaluate((stuckSelector) => {
        const header = document.querySelector('header')!.getBoundingClientRect()
        return Math.round(document.querySelector(stuckSelector)!.getBoundingClientRect().top - header.bottom)
      }, phone ? '[data-section="compare-repayment"] [data-slot="compare-band"]' : '[data-section="compare-names"]')
      same(`${width}: ${phone ? 'group band' : 'names row'} sits under the header`, Math.abs(underHeader) <= 1, true)
      await page.evaluate(() => window.scrollTo(0, 0))
    }
    await page.setViewport(WIDTHS.desktop)

    // A school's name leads to its program page, without a page load.
    await page.evaluate(() => Object.assign(window, { stayedOnPage: true }))
    await press(page, '[data-section="compare-names"] a[href="/schools/purdue-university-main-campus/computer-science-bachelors"]')
    await waitFor(page, problems, () => location.pathname === '/schools/purdue-university-main-campus/computer-science-bachelors' && Boolean(document.querySelector('main[data-unit-id]')), 'the program page')
    same('a school name navigates in place', await page.evaluate(() => (window as unknown as { stayedOnPage?: boolean }).stayedOnPage === true), true)

    // A master's comparison, the state box, a school added and one cleared, and a new degree.
    await openEmpty(page, origin, problems)
    const masters = ['university-of-massachusetts-amherst', 'harvard-university']
    await compareThrough(5, 'business-administration-masters', masters)
    await checkFigures("master's", masters.map((slug) => `${slug}/business-administration-masters`))
    same("master's: groups", await page.evaluate(() => [...document.querySelectorAll('[data-slot="compare-band"] h2')].map((title) => title.textContent).join('|')), 'Graduate pay|Debt|Where graduates work')
    const terms = await page.evaluate(() => (document.querySelector('[data-section="compare-terms"]') as HTMLElement).innerText)
    same("master's: the terms name graduate loans and 7.54%", terms.includes('borrowed for graduate study at that school') && terms.includes('7.54%') && !terms.includes('4.99%') && !terms.includes('Paid off in full'), true)
    const schoolsByState = new Map<string, number>()
    for (const entry of raw.programIndex.filter((candidate) => candidate.programSlug === 'business-administration-masters')) schoolsByState.set(entry.state, (schoolsByState.get(entry.state) ?? 0) + 1)
    const stateNames = new Map(raw.searchIndex.states.map(([, name, code]) => [code, name]))
    await press(page, '#compare-state')
    await pause(300)
    same(
      'the states offered and their schools',
      (await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]')].map((item) => item.innerText.trim().split('\n').join(' ')))).join('|'),
      [...schoolsByState].map(([code, total]) => `${stateNames.get(code)} ${total.toLocaleString('en-US')} ${total === 1 ? 'school' : 'schools'}`).sort((first, second) => first.localeCompare(second, 'en')).join('|'),
    )
    await page.keyboard.press('Escape')
    await choose(page, problems, 'compare-state', 'massachusetts', 'Massachusetts')
    await press(page, '#compare-school-3')
    await pause(300)
    const listedPlaces = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]')].map((item) => item.innerText.trim().split('\n')[1]))
    same('a state narrows the school list', listedPlaces.filter((place) => !place.endsWith(', MA')).length, 0)
    same('every school in the state is offered', listedPlaces.length, (schoolsByState.get('MA') ?? 0) - masters.length)
    await page.keyboard.press('Escape')
    await choose(page, problems, 'compare-school-3', 'babson', 'Babson College', 'Wellesley, MA')
    await checkFigures('a school added after Compare', [...masters, 'babson-college'].map((slug) => `${slug}/business-administration-masters`))
    await press(page, '[data-slot="compare-combobox"]:has(#compare-school-1) [data-slot="combobox-clear"]')
    await pause(300)
    same('a cleared box empties its column', (await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-section="compare-names"] [data-name]')].map((cell) => cell.innerText.trim().split('\n')[0]))).join('|'), 'Harvard University|Babson College')
    await press(page, '[data-slot="toggle-group-item"]:nth-child(2)')
    same("a new degree keeps the field", await page.evaluate(() => (document.getElementById('compare-field') as HTMLInputElement).value), 'Business Administration')
    same('a new degree keeps the state', await page.evaluate(() => (document.getElementById('compare-state') as HTMLInputElement).value), 'Massachusetts')
    const kept = ['harvard-university', 'babson-college'].filter((slug) => indexByAddress.has(`${slug}/business-administration-bachelors`))
    await checkFigures("bachelor's after the new degree", kept.map((slug) => `${slug}/business-administration-bachelors`))

    // Random comparisons at every degree, on desktop and phone widths.
    let seed = SAMPLE_SEED
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let round = 0; round < SAMPLE_ROUNDS; round += 1) {
      const credentialLevel = [5, 3, 2, 1][round % 4]
      await page.setViewport(round % 3 === 2 ? WIDTHS.phone : WIDTHS.desktop)
      await openEmpty(page, origin, problems)
      const fields = [...new Set(raw.programIndex.filter((entry) => entry.credentialLevel === credentialLevel).map((entry) => entry.programSlug))]
      const fieldSlug = fields[Math.floor(random() * fields.length)]
      const candidates = raw.programIndex.filter((entry) => entry.programSlug === fieldSlug)
      const picks: ProgramIndexEntry[] = []
      while (picks.length < Math.min(4, candidates.length)) {
        const pick = candidates[Math.floor(random() * candidates.length)]
        if (!picks.includes(pick)) picks.push(pick)
      }
      await compareThrough(credentialLevel, fieldSlug, picks.map((pick) => pick.schoolSlug))
      await checkFigures(`sample ${round + 1} (${fieldSlug})`, picks.map((pick) => `${pick.schoolSlug}/${pick.programSlug}`))
    }

    same('page errors', pageErrors.join(' | '), '')
    same('failed requests', failedRequests.join(' | '), '')
  } finally {
    await browser.close()
  }
  return { checked, problems }
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(page: Page, problems: string[], condition: () => boolean, what: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await page.evaluate(condition)) return true
    await pause(50)
  }
  problems.push(`timed out waiting for ${what}`)
  return false
}

async function openEmpty(page: Page, origin: string, problems: string[]) {
  await page.goto(`${origin}/programs/compare`, { waitUntil: 'networkidle0' })
  await waitFor(page, problems, () => !(document.querySelector('[data-slot="toggle-group-item"]') as HTMLButtonElement | null)?.disabled, 'the degree buttons')
}

// Clicks an element at its centre, after scrolling it to the middle of the window.
async function press(page: Page, selector: string) {
  await page.evaluate((target) => document.querySelector(target)!.scrollIntoView({ block: 'center' }), selector)
  await pause(150)
  const box = (await (await page.$(selector))!.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await pause(150)
}

// Types into a box and picks the option with this name, and this place when given.
async function choose(page: Page, problems: string[], inputId: string, typed: string, label: string, place?: string) {
  const input = `#${inputId}`
  await press(page, input)
  await page.evaluate((target) => (document.querySelector(target) as HTMLInputElement).select(), input)
  await page.keyboard.press('Backspace')
  await page.type(input, typed, { delay: 5 })
  const findOption = ([wantedLabel, wantedPlace]: [string, string | undefined]) =>
    [...document.querySelectorAll('[data-slot="combobox-item"]')].findIndex((item) => item.querySelector('span span')?.textContent === wantedLabel && (!wantedPlace || item.textContent!.includes(wantedPlace)))
  let position = -1
  for (let attempt = 0; attempt < 300 && position === -1; attempt += 1) {
    position = await page.evaluate(findOption, [label, place] as [string, string | undefined])
    if (position === -1) await pause(50)
  }
  if (position === -1) {
    problems.push(`"${label}" is not in the list of ${input}`)
    return
  }
  const option = (await page.$$('[data-slot="combobox-item"]'))[position]
  await option.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
  const box = (await option.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await pause(250)
}
