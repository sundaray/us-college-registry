import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'

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
  .handler(async ({ data }) => {
    const { readNationalProgramRecord } = await import('./program-records.server')
    const page = await readNationalProgramRecord(data.programSlug)
    if (!page) throw notFound()
    return page
  })
