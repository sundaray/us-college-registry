// Writes the site search's index: one entry for every page a reader can find,
// with each name stored once (the format is SearchIndexFile in
// src/lib/site-search.ts). Reads the page records `pnpm build-data` wrote.
// vite.config.ts calls it when a build or the dev server starts, so the index
// always matches the records the pages are built from.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CareersListPage, ProgramsListPage } from '../src/data/site-pages'
import type { NationalProgramIndexEntry } from '../src/data/national-program-page'
import type { ProgramIndexEntry, ProgramPage } from '../src/data/program-page'
import type { SchoolIndexEntry } from '../src/data/school-page'
import type { StateIndexEntry } from '../src/data/state-page'
import type { StateProgramIndexEntry } from '../src/data/state-program-page'
import type { SearchIndexFile } from '../src/lib/site-search'

export async function writeSearchIndex(generatedFolder: string, outputFile: string) {
  async function readJson<Record>(...parts: string[]) {
    return JSON.parse(await readFile(path.join(generatedFolder, ...parts), 'utf8')) as Record
  }

  const programIndex = await readJson<ProgramIndexEntry[]>('program-index.json')
  const rankingIndex = await readJson<StateProgramIndexEntry[]>('state-program-index.json')
  const schoolIndex = await readJson<SchoolIndexEntry[]>('school-index.json')
  const stateIndex = await readJson<StateIndexEntry[]>('state-index.json')
  const nationalIndex = await readJson<NationalProgramIndexEntry[]>('national-program-index.json')
  const programsList = await readJson<ProgramsListPage>('site', 'programs.json')
  const careersList = await readJson<CareersListPage>('site', 'careers.json')

  // A school's names and place come from one of its program records, the same
  // record its pages are built from.
  const firstProgram = new Map<string, ProgramIndexEntry>()
  for (const entry of programIndex) if (!firstProgram.has(entry.schoolSlug)) firstProgram.set(entry.schoolSlug, entry)
  const schoolRecords = new Map<string, ProgramPage['school']>()
  for (const [schoolSlug, entry] of firstProgram) {
    const record = await readJson<ProgramPage>('programs', schoolSlug, `${entry.programSlug}.json`)
    schoolRecords.set(schoolSlug, record.school)
  }

  // States, named as their pages name them.
  const stateNames = new Map<string, string>()
  for (const school of schoolRecords.values()) stateNames.set(school.stateSlug, school.stateName)
  const states: SearchIndexFile['states'] = stateIndex.map((entry) => [entry.stateSlug, stateNames.get(entry.stateSlug)!, entry.state])
  const statePosition = new Map(states.map(([slug], position) => [slug, position]))

  // Every kind of program, labelled as the programs list labels it ("Nursing (BSN)").
  const labels = new Map(programsList.levels.flatMap((level) => level.programs.map((program) => [program.href.split('/')[2], program.label] as const)))
  const nationalCounts = new Map(nationalIndex.map((entry) => [entry.programSlug, entry.programCount]))
  const fieldSlugs = [...new Set([...nationalIndex.map((entry) => entry.programSlug), ...programIndex.map((entry) => entry.programSlug)])]
  const missingLabels = fieldSlugs.filter((slug) => !labels.has(slug))
  if (missingLabels.length > 0) throw new Error(`Search index: no label for ${missingLabels.join(', ')}`)
  const fields: SearchIndexFile['fields'] = fieldSlugs.map((slug) => [slug, labels.get(slug)!, nationalCounts.get(slug) ?? null])
  const fieldPosition = new Map(fields.map(([slug], position) => [slug, position]))

  const careers: SearchIndexFile['careers'] = careersList.careers.map((career) => [career.href.split('/')[2], career.name, career.employment ?? null])

  const schoolPages = new Set(schoolIndex.map((entry) => entry.schoolSlug))
  const schools: SearchIndexFile['schools'] = [...schoolRecords].map(([slug, school]) => [slug, school.name, school.shortName, school.city, statePosition.get(school.stateSlug)!, schoolPages.has(slug)])
  const schoolPosition = new Map(schools.map(([slug], position) => [slug, position]))

  const rankings: SearchIndexFile['rankings'] = rankingIndex.map((entry) => [statePosition.get(entry.stateSlug)!, fieldPosition.get(entry.programSlug)!, entry.programCount])
  const programs: SearchIndexFile['programs'] = programIndex.map((entry) => [schoolPosition.get(entry.schoolSlug)!, fieldPosition.get(entry.programSlug)!])

  const index: SearchIndexFile = { states, fields, careers, schools, rankings, programs }
  await writeFile(outputFile, JSON.stringify(index))
  return states.length + nationalIndex.length + careers.length + rankings.length + schoolPages.size + programs.length
}
