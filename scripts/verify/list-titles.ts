// Writes every page's title and meta description (program, ranking, school,
// state, national program, occupation, home, and list pages) to data/generated/titles.json and fails if any title or description is
// used by more than one page. The bucket runner compares each built page against
// this list.
//
//   pnpm tsx scripts/verify/list-titles.ts

import { readFile, writeFile } from 'node:fs/promises'
import type { ProgramIndexEntry, ProgramPage } from '../../src/data/program-page'
import type { NationalProgramIndexEntry, NationalProgramPage } from '../../src/data/national-program-page'
import type { OccupationIndexEntry, OccupationPage } from '../../src/data/occupation-page'
import type { CareersListPage, HomePage, ProgramsListPage, SchoolsListPage } from '../../src/data/site-pages'
import type { SchoolIndexEntry, SchoolPage } from '../../src/data/school-page'
import type { StateIndexEntry, StatePage } from '../../src/data/state-page'
import type { StateProgramIndexEntry, StateProgramPage } from '../../src/data/state-program-page'
import { buildNationalDescription, buildNationalTitle } from '../../src/lib/national-program-copy'
import { buildOccupationDescription, buildOccupationTitle } from '../../src/lib/occupation-copy'
import {
  buildCareersListDescription,
  buildCareersListTitle,
  buildHomeDescription,
  buildHomeTitle,
  buildProgramsListDescription,
  buildProgramsListTitle,
  buildSchoolsListDescription,
  buildSchoolsListTitle,
} from '../../src/lib/site-copy'
import { buildMetaDescription, buildPageTitle } from '../../src/lib/program-copy'
import { buildSchoolDescription, buildSchoolTitle } from '../../src/lib/school-copy'
import { buildStateDescription, buildStateTitle } from '../../src/lib/state-copy'
import { buildStateProgramDescription, buildStateProgramTitle } from '../../src/lib/state-program-copy'

const index = JSON.parse(await readFile('data/generated/program-index.json', 'utf8')) as ProgramIndexEntry[]
const titles: Record<string, { title: string; description: string }> = {}
const pagesByTitle = new Map<string, string[]>()
const pagesByDescription = new Map<string, string[]>()

for (const entry of index) {
  const path = `/schools/${entry.schoolSlug}/${entry.programSlug}`
  const page = JSON.parse(
    await readFile(`data/generated/programs/${entry.schoolSlug}/${entry.programSlug}.json`, 'utf8'),
  ) as ProgramPage
  const title = buildPageTitle(page)
  const description = buildMetaDescription(page)
  titles[path] = { title, description }
  pagesByTitle.set(title, [...(pagesByTitle.get(title) ?? []), path])
  pagesByDescription.set(description, [...(pagesByDescription.get(description) ?? []), path])
}

const stateProgramIndex = JSON.parse(await readFile('data/generated/state-program-index.json', 'utf8')) as StateProgramIndexEntry[]
for (const entry of stateProgramIndex) {
  const path = `/states/${entry.stateSlug}/${entry.programSlug}`
  const page = JSON.parse(
    await readFile(`data/generated/state-programs/${entry.stateSlug}/${entry.programSlug}.json`, 'utf8'),
  ) as StateProgramPage
  const title = buildStateProgramTitle(page)
  const description = buildStateProgramDescription(page)
  titles[path] = { title, description }
  pagesByTitle.set(title, [...(pagesByTitle.get(title) ?? []), path])
  pagesByDescription.set(description, [...(pagesByDescription.get(description) ?? []), path])
}

const schoolIndex = JSON.parse(await readFile('data/generated/school-index.json', 'utf8')) as SchoolIndexEntry[]
for (const entry of schoolIndex) {
  const path = `/schools/${entry.schoolSlug}`
  const page = JSON.parse(await readFile(`data/generated/school-pages/${entry.schoolSlug}.json`, 'utf8')) as SchoolPage
  const title = buildSchoolTitle(page)
  const description = buildSchoolDescription(page)
  titles[path] = { title, description }
  pagesByTitle.set(title, [...(pagesByTitle.get(title) ?? []), path])
  pagesByDescription.set(description, [...(pagesByDescription.get(description) ?? []), path])
}

const stateIndex = JSON.parse(await readFile('data/generated/state-index.json', 'utf8')) as StateIndexEntry[]
for (const entry of stateIndex) {
  const path = `/states/${entry.stateSlug}`
  const page = JSON.parse(await readFile(`data/generated/state-pages/${entry.stateSlug}.json`, 'utf8')) as StatePage
  const title = buildStateTitle(page)
  const description = buildStateDescription(page)
  titles[path] = { title, description }
  pagesByTitle.set(title, [...(pagesByTitle.get(title) ?? []), path])
  pagesByDescription.set(description, [...(pagesByDescription.get(description) ?? []), path])
}

const nationalIndex = JSON.parse(await readFile('data/generated/national-program-index.json', 'utf8')) as NationalProgramIndexEntry[]
for (const entry of nationalIndex) {
  const path = `/programs/${entry.programSlug}`
  const page = JSON.parse(await readFile(`data/generated/national-programs/${entry.programSlug}.json`, 'utf8')) as NationalProgramPage
  const title = buildNationalTitle(page)
  const description = buildNationalDescription(page)
  titles[path] = { title, description }
  pagesByTitle.set(title, [...(pagesByTitle.get(title) ?? []), path])
  pagesByDescription.set(description, [...(pagesByDescription.get(description) ?? []), path])
}

const occupationIndex = JSON.parse(await readFile('data/generated/occupation-index.json', 'utf8')) as OccupationIndexEntry[]
for (const entry of occupationIndex) {
  const path = `/careers/${entry.careerSlug}`
  const page = JSON.parse(await readFile(`data/generated/occupations/${entry.careerSlug}.json`, 'utf8')) as OccupationPage
  const title = buildOccupationTitle(page)
  const description = buildOccupationDescription(page)
  titles[path] = { title, description }
  pagesByTitle.set(title, [...(pagesByTitle.get(title) ?? []), path])
  pagesByDescription.set(description, [...(pagesByDescription.get(description) ?? []), path])
}

const siteRecord = async <Record>(name: string) => JSON.parse(await readFile(`data/generated/site/${name}.json`, 'utf8')) as Record
const sitePages: [string, string, string][] = [
  ['/', buildHomeTitle(), buildHomeDescription(await siteRecord<HomePage>('home'))],
  ['/programs', buildProgramsListTitle(), buildProgramsListDescription(await siteRecord<ProgramsListPage>('programs'))],
  ['/schools', buildSchoolsListTitle(), buildSchoolsListDescription(await siteRecord<SchoolsListPage>('schools'))],
  ['/careers', buildCareersListTitle(), buildCareersListDescription(await siteRecord<CareersListPage>('careers'))],
]
for (const [path, title, description] of sitePages) {
  titles[path] = { title, description }
  pagesByTitle.set(title, [...(pagesByTitle.get(title) ?? []), path])
  pagesByDescription.set(description, [...(pagesByDescription.get(description) ?? []), path])
}

await writeFile('data/generated/titles.json', JSON.stringify(titles))
const duplicateTitles = [...pagesByTitle].filter(([, paths]) => paths.length > 1)
const duplicateDescriptions = [...pagesByDescription].filter(([, paths]) => paths.length > 1)
const lengths = Object.values(titles)
console.log(
  `${lengths.length} pages. Titles over 60 characters: ${lengths.filter((item) => item.title.length > 60).length}. ` +
    `Descriptions over 160: ${lengths.filter((item) => item.description.length > 160).length}.`,
)
if (duplicateTitles.length > 0 || duplicateDescriptions.length > 0) {
  console.error(`Duplicate titles: ${duplicateTitles.length}, duplicate descriptions: ${duplicateDescriptions.length}`)
  for (const [text, paths] of [...duplicateTitles, ...duplicateDescriptions].slice(0, 20)) console.error(`  ${text}\n    ${paths.join('\n    ')}`)
  process.exit(1)
}
console.log('Every title and description is unique.')
