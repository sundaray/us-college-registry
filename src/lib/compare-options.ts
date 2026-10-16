import type { CredentialLevel } from '@/data/program-page'
import { searchText } from '@/lib/name-search'
import type { SearchText } from '@/lib/name-search'
import { SEARCH_INDEX_PATH } from '@/lib/site-search'
import type { SearchIndexFile } from '@/lib/site-search'

// What a reader can choose on the compare page: a degree, a field of study at
// that degree and the schools with a program page in that field. The lists come
// from the site search's index, which already names every field and every
// program page. Programs are compared one degree at a time, because a master's
// debt figure counts different loans from an undergraduate one.

// The degrees in the order of the Programs page. A field's address ends with
// the degree's word: /programs/business-administration-masters.
export const COMPARE_DEGREES: { credentialLevel: CredentialLevel; label: string; addressEnding: string }[] = [
  { credentialLevel: 5, label: "Master's", addressEnding: 'masters' },
  { credentialLevel: 3, label: "Bachelor's", addressEnding: 'bachelors' },
  { credentialLevel: 2, label: "Associate's", addressEnding: 'associate' },
  { credentialLevel: 1, label: 'Certificates', addressEnding: 'certificate' },
]

// The most programs one comparison holds.
export const COMPARE_SLOTS = 4

export type CompareSchool = {
  slug: string
  shortName: string
  // "Amherst, MA"
  place: string
  // The state the school is in, for the state box: "MA" and "Massachusetts".
  stateCode: string
  stateName: string
  // Every name the school answers to in the box: its listed and official names,
  // its city and its state.
  searchName: SearchText
}

export type CompareField = {
  // The field's address on the site, which is also the program's address at a
  // school: /schools/{school}/{slug}.
  slug: string
  credentialLevel: CredentialLevel
  // "Business Administration", without the degree the page has already chosen.
  name: string
  searchName: SearchText
  // A to Z.
  schools: CompareSchool[]
}

export type CompareOptions = {
  fieldsByLevel: Map<CredentialLevel, CompareField[]>
  fieldsBySlug: Map<string, CompareField>
}

function byName(first: string, second: string) {
  return first.localeCompare(second, 'en')
}

// The degree a field's address names, or undefined for an address no degree ends.
export function fieldLevel(fieldSlug: string) {
  return COMPARE_DEGREES.find((degree) => fieldSlug.endsWith(`-${degree.addressEnding}`))?.credentialLevel
}

export function prepareCompareOptions(file: SearchIndexFile): CompareOptions {
  const { states, fields, schools, programs } = file
  const schoolsByField = new Map<number, CompareSchool[]>()
  const compareSchools = schools.map(([slug, name, shortName, city, stateNumber]) => {
    const [, stateName, stateCode] = states[stateNumber]
    return { slug, shortName, place: `${city}, ${stateCode}`, stateCode, stateName, searchName: searchText([shortName, name, city, stateName, stateCode].join(' ')) }
  })
  for (const [schoolNumber, fieldNumber] of programs) {
    let fieldSchools = schoolsByField.get(fieldNumber)
    if (!fieldSchools) schoolsByField.set(fieldNumber, (fieldSchools = []))
    fieldSchools.push(compareSchools[schoolNumber])
  }

  const fieldsByLevel = new Map<CredentialLevel, CompareField[]>(COMPARE_DEGREES.map((degree) => [degree.credentialLevel, []]))
  const fieldsBySlug = new Map<string, CompareField>()
  fields.forEach(([slug, label], fieldNumber) => {
    const credentialLevel = fieldLevel(slug)
    const fieldSchools = schoolsByField.get(fieldNumber)
    if (credentialLevel === undefined || !fieldSchools) return
    // The search labels a field with its degree: "Nursing (BSN)".
    const name = label.replace(/ \([^()]+\)$/, '')
    const field = { slug, credentialLevel, name, searchName: searchText(name), schools: [...fieldSchools].sort((first, second) => byName(first.shortName, second.shortName)) }
    fieldsByLevel.get(credentialLevel)!.push(field)
    fieldsBySlug.set(slug, field)
  })
  for (const levelFields of fieldsByLevel.values()) levelFields.sort((first, second) => byName(first.name, second.name))
  return { fieldsByLevel, fieldsBySlug }
}

let optionsPromise: Promise<CompareOptions> | null = null

// Fetches the index once and keeps it. A failed fetch is not kept, and the next
// try fetches again.
export function loadCompareOptions() {
  optionsPromise ??= fetch(SEARCH_INDEX_PATH)
    .then((response) => {
      if (!response.ok) throw new Error(`Search index returned ${response.status}`)
      return response.json() as Promise<SearchIndexFile>
    })
    .then(prepareCompareOptions)
    .catch((error: unknown) => {
      optionsPromise = null
      throw error
    })
  return optionsPromise
}

// The same field at another degree, when the site has it: business
// administration master's for business administration bachelor's.
export function sameFieldAtLevel(options: CompareOptions, fieldSlug: string, credentialLevel: CredentialLevel) {
  const currentLevel = fieldLevel(fieldSlug)
  const ending = COMPARE_DEGREES.find((degree) => degree.credentialLevel === currentLevel)?.addressEnding
  const wantedEnding = COMPARE_DEGREES.find((degree) => degree.credentialLevel === credentialLevel)?.addressEnding
  if (!ending || !wantedEnding) return undefined
  return options.fieldsBySlug.get(`${fieldSlug.slice(0, -ending.length)}${wantedEnding}`)
}

// The states that have the field, A to Z, with how many of its schools each has.
export function fieldStates(field: CompareField) {
  const states = new Map<string, { code: string; name: string; schoolCount: number }>()
  for (const school of field.schools) {
    const state = states.get(school.stateCode)
    if (state) state.schoolCount += 1
    else states.set(school.stateCode, { code: school.stateCode, name: school.stateName, schoolCount: 1 })
  }
  return [...states.values()].sort((first, second) => byName(first.name, second.name))
}
