import { createFileRoute, Link } from '@tanstack/react-router'
import { Building2Icon, MapPinIcon } from 'lucide-react'
import { PageSection } from '@/components/page-blocks'
import { ProgramLink } from '@/components/program/program-link'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { ListPageHeader } from '@/components/site/list-page-header'
import { getSchoolsListPage } from '@/data/get-site-pages'
import { formatCount } from '@/lib/format'
import { canonicalLink } from '@/lib/site'
import { buildSchoolsListDescription, buildSchoolsListTitle, schoolsListCount } from '@/lib/site-copy'

// The index route matches /schools exactly; school pages are its children.
export const Route = createFileRoute('/schools/')({
  loader: () => getSchoolsListPage(),
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return {
      links: [canonicalLink('/schools')],
      meta: [{ title: buildSchoolsListTitle() }, { name: 'description', content: buildSchoolsListDescription(loaderData) }],
    }
  },
  component: SchoolsListView,
})

const LINK_CLASS_NAME = 'text-primary underline underline-offset-3'

function SchoolsListView() {
  const page = Route.useLoaderData()
  return (
    <div className="min-h-screen bg-muted/40 text-pretty">
      <SiteHeader />
      <main>
        <ListPageHeader
          crumb="Schools"
          title={buildSchoolsListTitle()}
          facts={[
            { icon: <Building2Icon aria-hidden />, text: `${formatCount(schoolsListCount(page))} schools` },
            { icon: <MapPinIcon aria-hidden />, text: `${formatCount(page.states.length)} states and territories` },
          ]}
        />
        <div className="mx-auto max-w-3xl px-5">
          <p data-section="intro" className="mt-9 max-w-[66ch]">
            This page lists every US school with at least one program page, by state. School names link to the school's
            page, and schools with one program link straight to that program. The number after each school counts its
            programs that report first-year pay.
          </p>
          {page.states.map((state) => (
            <PageSection key={state.href} name={`state-${state.href.split('/')[2]}`} title={state.name}>
              <p className="text-sm text-muted-foreground">
                {formatCount(state.schools.length)} {state.schools.length === 1 ? 'school' : 'schools'}.{' '}
                <Link to="/states/$stateSlug" params={{ stateSlug: state.href.split('/')[2] }} className={LINK_CLASS_NAME}>
                  See the {state.name} page
                </Link>
              </p>
              <ul className="grid gap-x-6 gap-y-1.5 text-base md:grid-cols-2">
                {state.schools.map((school) => (
                  // data-unit-id lets scripts/verify check each school against the raw data.
                  <li key={school.unitId} data-unit-id={school.unitId}>
                    <span data-name="">
                      {school.href.split('/').length === 4 ? (
                        <ProgramLink href={school.href} className={LINK_CLASS_NAME}>
                          {school.name}
                        </ProgramLink>
                      ) : (
                        <Link to="/schools/$schoolSlug" params={{ schoolSlug: school.href.split('/')[2] }} className={LINK_CLASS_NAME}>
                          {school.name}
                        </Link>
                      )}
                    </span>{' '}
                    <span className="text-sm text-muted-foreground tabular-nums">{formatCount(school.programCount)}</span>
                  </li>
                ))}
              </ul>
            </PageSection>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
