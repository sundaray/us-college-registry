import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type ProgramPageParams = {
  schoolSlug: string
  programSlug: string
}

// A static server function (TanStack Start guide "Static Server Functions"). At
// build time, prerendering runs it once per page and saves the result as a JSON
// file in the client output; after the page loads, link clicks fetch that file
// instead of calling a server. Page records never enter the JavaScript bundle.
// staticFunctionMiddleware must stay the last middleware.
export const getProgramPage = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .validator((params: ProgramPageParams) => {
    // Slugs come from the URL and become a file path on the server.
    if (!SLUG_PATTERN.test(params.schoolSlug) || !SLUG_PATTERN.test(params.programSlug)) throw notFound()
    return params
  })
  .handler(async ({ data }) => {
    const { readProgramRecord } = await import('./program-records.server')
    const page = await readProgramRecord(data.schoolSlug, data.programSlug)
    if (!page) throw notFound()
    return page
  })
