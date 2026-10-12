import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import type { NationalProgramView } from '@/data/national-program-page'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Keeps words written in capitals (HVAC), as scripts/build-data.ts does.
function lowercaseWords(name: string) {
  return name
    .split(' ')
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(' ')
}

// A static server function, like getProgramPage: prerendering saves each result
// as a JSON file that link clicks fetch later. staticFunctionMiddleware must stay
// the last middleware.
export const getNationalProgramPage = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .validator((params: { programSlug: string }) => {
    if (!SLUG_PATTERN.test(params.programSlug)) throw notFound()
    return params
  })
  .handler(async ({ data }): Promise<NationalProgramView> => {
    const { readNationalProgramRecord, readOccupationRecord } = await import('./program-records.server')
    const page = await readNationalProgramRecord(data.programSlug)
    if (!page) throw notFound()
    // A job's name inside a sentence ("software developers") is the one its career
    // page uses. Jobs without a career page use their title, lowercased word by word.
    const occupations = await Promise.all(
      page.occupations.map(async (occupation) => {
        const career = occupation.careerSlug ? await readOccupationRecord(occupation.careerSlug) : undefined
        return { ...occupation, sentenceName: career?.sentenceName ?? lowercaseWords(occupation.title) }
      }),
    )
    const matchingJob = page.matchingJob ? { ...page.matchingJob, sentenceName: page.matchingJob.pluralName } : undefined
    return { ...page, occupations, matchingJob }
  })
