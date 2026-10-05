import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import type { CareersListPage, HomePage, ProgramsListPage, SchoolsListPage } from '@/data/site-pages'

// Static server functions, like getProgramPage: prerendering saves each result as
// a JSON file that link clicks fetch later. staticFunctionMiddleware must stay
// the last middleware. Each page has its own function so its record is typed.

async function readSite<Record>(name: string) {
  const { readSiteRecord } = await import('./program-records.server')
  const record = await readSiteRecord<Record>(name)
  if (!record) throw new Error(`data/generated/site/${name}.json is missing. Run \`pnpm build-data\` first.`)
  return record
}

export const getHomePage = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(() => readSite<HomePage>('home'))

export const getProgramsListPage = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(() => readSite<ProgramsListPage>('programs'))

export const getSchoolsListPage = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(() => readSite<SchoolsListPage>('schools'))

export const getCareersListPage = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(() => readSite<CareersListPage>('careers'))
