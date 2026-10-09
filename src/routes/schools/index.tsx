import { createFileRoute, Link } from '@tanstack/react-router'
import { Section } from '@/components/page-sections'
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
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main>
        <ListPageHeader
          crumb="Schools"
          title={buildSchoolsListTitle()}
          facts={[`${formatCount(schoolsListCount(page))} schools`, `${formatCount(page.states.length)} states and territories`]}
          source="College Scorecard June 2026 release"
        />
        <div className="mx-auto max-w-3xl px-5">
          <p className="mt-7 max-w-[66ch]">
            Every US school with at least one program page, by state. School names link to the school's page, and schools
            with one program link straight to that program. The number after each school counts its programs that report
            first-year pay.
          </p>
          {page.states.map((state) => (
            <Section key={state.href} name={`state-${state.href.split('/')[2]}`} title={state.name}>
              <p className="text-sm text-muted-foreground">
                {formatCount(state.schools.length)} {state.schools.length === 1 ? 'school' : 'schools'}.{' '}
                <Link to="/states/$stateSlug" params={{ stateSlug: state.href.split('/')[2] }} className={LINK_CLASS_NAME}>
                  See the {state.name} page
                </Link>
              </p>
              <ul className="grid gap-x-6 gap-y-1.5 text-[15px] md:grid-cols-2">
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
                    <span className="text-[13px] text-muted-foreground tabular-nums">{formatCount(school.programCount)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
