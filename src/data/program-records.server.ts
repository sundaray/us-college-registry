import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { NationalProgramPage } from '@/data/national-program-page'
import type { OccupationPage } from '@/data/occupation-page'
import type { ProgramPage } from '@/data/program-page'
import type { SchoolPage } from '@/data/school-page'
import type { StatePage } from '@/data/state-page'
import type { StateProgramPage } from '@/data/state-program-page'

// Written by `pnpm build-data`. Read on the server only: by the dev server and by
// the prerender step at build time.
const GENERATED_DIRECTORY = 'data/generated'

// Slugs are checked against a strict pattern before they get here, so they can't
// reach outside data/generated.
async function readRecord<Record>(folder: string, ...slugs: string[]) {
  try {
    const text = await readFile(`${path.join(GENERATED_DIRECTORY, folder, ...slugs)}.json`, 'utf8')
    return JSON.parse(text) as Record
  } catch {
    // No record for these slugs. The deployed Worker has no generated data at
    // all; it only sees URLs that have no prerendered page, which are 404s.
    return undefined
  }
}

export function readProgramRecord(schoolSlug: string, programSlug: string) {
  return readRecord<ProgramPage>('programs', schoolSlug, programSlug)
}

export function readStateProgramRecord(stateSlug: string, programSlug: string) {
  return readRecord<StateProgramPage>('state-programs', stateSlug, programSlug)
}

export function readSchoolRecord(schoolSlug: string) {
  return readRecord<SchoolPage>('school-pages', schoolSlug)
}

export function readStateRecord(stateSlug: string) {
  return readRecord<StatePage>('state-pages', stateSlug)
}

export function readNationalProgramRecord(programSlug: string) {
  return readRecord<NationalProgramPage>('national-programs', programSlug)
}

export function readOccupationRecord(careerSlug: string) {
  return readRecord<OccupationPage>('occupations', careerSlug)
}

// The home page and the navbar's list pages: data/generated/site/{name}.json.
export function readSiteRecord<Record>(name: string) {
  return readRecord<Record>('site', name)
}
