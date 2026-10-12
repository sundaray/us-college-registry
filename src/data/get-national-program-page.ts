import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import type { NationalProgramView } from '@/data/national-program-page'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
    const { readNationalProgramRecord, withSentenceNames } = await import('./program-records.server')
    const page = await readNationalProgramRecord(data.programSlug)
    if (!page) throw notFound()
    const occupations = await withSentenceNames(page.occupations)
    const matchingJob = page.matchingJob ? { ...page.matchingJob, sentenceName: page.matchingJob.pluralName } : undefined
    return { ...page, occupations, matchingJob }
  })
