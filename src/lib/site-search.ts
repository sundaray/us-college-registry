import { formatCount } from '@/lib/format'
import { matchesName, searchText, startsEveryWord } from '@/lib/name-search'
import type { SearchText } from '@/lib/name-search'

// The site search: one list with a line for every page a reader can find, which
// the browser searches as the reader types. The site is static, and nothing is
// searched on a server.

// The file scripts/build-search-index.ts writes to public/search-index.json.
// Names are stored once and pages point at them by position, which keeps the
// file small: a program page at a school is two numbers.
export type SearchIndexFile = {
  states: [slug: string, name: string, code: string][]
  // Every kind of program with its own pages. `nationalCount` is the number of
  // programs on its nationwide page, or null when it has none.
  fields: [slug: string, label: string, nationalCount: number | null][]
  careers: [slug: string, name: string, jobs: number | null][]
  schools: [slug: string, name: string, shortName: string, city: string, state: number, hasPage: boolean][]
  rankings: [state: number, field: number, programCount: number][]
  programs: [school: number, field: number][]
}

export const SEARCH_INDEX_PATH = '/search-index.json'

export type SearchKind = 'state' | 'national' | 'career' | 'ranking' | 'school' | 'program'

// The groups of results, in the order they show: the few broad pages first and
// the many narrow ones last. `one` and `many` name a result on the group's "Show
// more" button ("Show 1 more school", "Show 20 more schools").
export const SEARCH_GROUPS: { kind: SearchKind; heading: string; one: string; many: string }[] = [
  { kind: 'state', heading: 'States', one: 'state', many: 'states' },
  { kind: 'national', heading: 'Nationwide programs', one: 'nationwide program', many: 'nationwide programs' },
  { kind: 'career', heading: 'Careers', one: 'career', many: 'careers' },
  { kind: 'ranking', heading: 'State rankings', one: 'state ranking', many: 'state rankings' },
  { kind: 'school', heading: 'Schools', one: 'school', many: 'schools' },
  { kind: 'program', heading: 'Programs at schools', one: 'program at a school', many: 'programs at schools' },
]

// One page as the search shows it: a name, a line under it, and its address.
export type SearchRow = {
  kind: SearchKind
  title: string
  detail: string
  href: string
  // The title alone, and every name the page answers to: the title, the line
  // under it, and the school's official name and state where they are not shown.
  titleText: SearchText
  allText: SearchText
  // The page's place among equally good matches in its group.
  order: number
}

let rowsPromise: Promise<SearchRow[]> | null = null

// Fetches the index once and keeps it. A failed fetch is not kept, and the next
// try fetches again.
export function loadSearchRows() {
  rowsPromise ??= fetch(SEARCH_INDEX_PATH)
    .then((response) => {
      if (!response.ok) throw new Error(`Search index returned ${response.status}`)
      return response.json() as Promise<SearchIndexFile>
    })
    .then(prepareSearchRows)
    .catch((error: unknown) => {
      rowsPromise = null
      throw error
    })
  return rowsPromise
}

function byName(first: string, second: string) {
  return first.localeCompare(second, 'en')
}

// Positions 0, 1, 2... in the order the comparison gives.
function placesBy<Item>(items: Item[], compare: (first: Item, second: Item) => number) {
  const places = new Map<Item, number>()
  ;[...items].sort(compare).forEach((item, place) => places.set(item, place))
  return places
}

function makeRow(kind: SearchKind, title: string, detail: string, href: string, order: number, otherNames: string[] = []): SearchRow {
  return { kind, title, detail, href, order, titleText: searchText(title), allText: searchText([title, detail, ...otherNames].join(' ')) }
}

export function prepareSearchRows(file: SearchIndexFile): SearchRow[] {
  const { states, fields, careers, schools, rankings, programs } = file
  const rows: SearchRow[] = []
  const statePlaces = placesBy(states, (first, second) => byName(first[1], second[1]))
  // A kind of program with more programs comes first among equal matches.
  const fieldPlaces = placesBy(fields, (first, second) => (second[2] ?? 0) - (first[2] ?? 0) || byName(first[1], second[1]))
  const schoolPlaces = placesBy(schools, (first, second) => byName(states[first[4]][1], states[second[4]][1]) || byName(first[2], second[2]) || byName(first[3], second[3]))

  for (const state of states) {
    const [slug, name, code] = state
    rows.push(makeRow('state', name, 'Colleges and majors, ranked by graduate pay and debt', `/states/${slug}`, statePlaces.get(state)!, [code]))
  }
  for (const field of fields) {
    const [slug, label, nationalCount] = field
    if (nationalCount === null) continue
    rows.push(makeRow('national', label, `${formatCount(nationalCount)} programs across the US`, `/programs/${slug}`, fieldPlaces.get(field)!))
  }
  // The career with the most jobs comes first among equal matches.
  const careerPlaces = placesBy(careers, (first, second) => (second[2] ?? 0) - (first[2] ?? 0) || byName(first[1], second[1]))
  for (const career of careers) {
    const [slug, name, jobs] = career
    rows.push(makeRow('career', name, jobs !== null ? `${formatCount(jobs)} jobs in the US` : 'Career', `/careers/${slug}`, careerPlaces.get(career)!))
  }
  // Rankings follow the states from A to Z, and the larger rankings come first within a state.
  const rankingPlaces = placesBy(rankings, (first, second) => statePlaces.get(states[first[0]])! - statePlaces.get(states[second[0]])! || second[2] - first[2])
  for (const ranking of rankings) {
    const [stateNumber, fieldNumber, programCount] = ranking
    const [stateSlug, stateName, stateCode] = states[stateNumber]
    const [fieldSlug, label] = fields[fieldNumber]
    rows.push(makeRow('ranking', `${label} in ${stateName}`, `${formatCount(programCount)} programs ranked`, `/states/${stateSlug}/${fieldSlug}`, rankingPlaces.get(ranking)!, [stateCode]))
  }
  // A school's line says where it is, and its official name when the page uses
  // another one. Names that differ only in spaces, signs or a leading "The" count
  // as the same ("Alabama A & M University" and "Alabama A&M University").
  const nameLetters = (name: string) => searchText(name).letters.replace(/^the/, '')
  const schoolDetail = (school: SearchIndexFile['schools'][number]) => {
    const [, name, shortName, city, stateNumber] = school
    const place = `${city}, ${states[stateNumber][2]}`
    return nameLetters(name) === nameLetters(shortName) ? place : `${name}, ${place}`
  }
  for (const school of schools) {
    const [slug, , shortName, , stateNumber, hasPage] = school
    if (!hasPage) continue
    rows.push(makeRow('school', shortName, schoolDetail(school), `/schools/${slug}`, schoolPlaces.get(school)!, [states[stateNumber][1]]))
  }
  // Programs follow their schools, and a more common kind of program comes first at a school.
  const fieldCount = fields.length
  for (const [schoolNumber, fieldNumber] of programs) {
    const school = schools[schoolNumber]
    const [slug, , shortName, , stateNumber] = school
    const [fieldSlug, label] = fields[fieldNumber]
    const order = schoolPlaces.get(school)! * fieldCount + fieldPlaces.get(fields[fieldNumber])!
    rows.push(makeRow('program', `${shortName} ${label}`, schoolDetail(school), `/schools/${slug}/${fieldSlug}`, order, [states[stateNumber][1]]))
  }
  return rows
}

// Lower is a better match. Null when the page does not match.
// 0: the title starts with what was typed ("nursing" for "Nursing (BSN)").
// 1: every typed word starts a word of the title.
// 2: every typed word starts a word of the title, the line under it, or another name of the page.
// 3: the typed letters appear as one run somewhere in those names (src/lib/name-search.ts).
function matchScore(typed: SearchText, row: SearchRow) {
  if (row.titleText.letters.startsWith(typed.letters)) return 0
  if (startsEveryWord(typed.words, row.titleText.words)) return 1
  if (startsEveryWord(typed.words, row.allText.words)) return 2
  if (matchesName(typed, row.allText)) return 3
  return null
}

export type SearchGroup = (typeof SEARCH_GROUPS)[number] & { results: SearchRow[] }

// Every page that matches what was typed, in its group, best matches first.
// Groups with no match are left out.
export function searchSite(rows: SearchRow[], query: string): SearchGroup[] {
  const typed = searchText(query)
  if (typed.words.length === 0) return []
  const found = new Map<SearchKind, { score: number; row: SearchRow }[]>()
  for (const row of rows) {
    const score = matchScore(typed, row)
    if (score === null) continue
    let group = found.get(row.kind)
    if (!group) found.set(row.kind, (group = []))
    group.push({ score, row })
  }
  return SEARCH_GROUPS.flatMap((group) => {
    const matches = found.get(group.kind)
    if (!matches) return []
    matches.sort((first, second) => first.score - second.score || first.row.order - second.row.order)
    return [{ ...group, results: matches.map((match) => match.row) }]
  })
}
