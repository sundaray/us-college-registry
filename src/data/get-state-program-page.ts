import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type StateProgramPageParams = {
  stateSlug: string
  programSlug: string
}

// A static server function, like getProgramPage: prerendering saves each result
// as a JSON file that link clicks fetch later. staticFunctionMiddleware must stay
// the last middleware.
export const getStateProgramPage = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .validator((params: StateProgramPageParams) => {
    if (!SLUG_PATTERN.test(params.stateSlug) || !SLUG_PATTERN.test(params.programSlug)) throw notFound()
    return params
  })
  .handler(async ({ data }) => {
    const { readStateProgramRecord } = await import('./program-records.server')
    const page = await readStateProgramRecord(data.stateSlug, data.programSlug)
    if (!page) throw notFound()
    return page
  })
