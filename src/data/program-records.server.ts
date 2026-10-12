import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { NationalProgramPage } from '@/data/national-program-page'
import type { OccupationPage } from '@/data/occupation-page'
import type { NamedOccupation, OccupationOutlook, ProgramPage } from '@/data/program-page'
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

// Keeps words written in capitals (HVAC), as scripts/build-data.ts does.
function lowercaseWords(name: string) {
  return name
    .split(' ')
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(' ')
}

// Adds each job's name as it reads inside a sentence ("software developers"). It
// is the name the job's career page uses. A job without a career page uses its
// title, lowercased word by word.
export function withSentenceNames(occupations: OccupationOutlook[]): Promise<NamedOccupation[]> {
  return Promise.all(
    occupations.map(async (occupation) => {
      const career = occupation.careerSlug ? await readOccupationRecord(occupation.careerSlug) : undefined
      return { ...occupation, sentenceName: career?.sentenceName ?? lowercaseWords(occupation.title) }
    }),
  )
}

// The home page and the navbar's list pages: data/generated/site/{name}.json.
export function readSiteRecord<Record>(name: string) {
  return readRecord<Record>('site', name)
}
