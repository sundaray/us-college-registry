import { createFileRoute } from '@tanstack/react-router'
import { Section } from '@/components/page-sections'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { CareersTable } from '@/components/site/careers-table'
import { ListPageHeader } from '@/components/site/list-page-header'
import { getCareersListPage } from '@/data/get-site-pages'
import { formatCount } from '@/lib/format'
import { buildCareersListDescription, buildCareersListTitle } from '@/lib/site-copy'

// The index route matches /careers exactly; occupation pages are its children.
export const Route = createFileRoute('/careers/')({
  loader: () => getCareersListPage(),
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return {
      meta: [{ title: buildCareersListTitle() }, { name: 'description', content: buildCareersListDescription(loaderData) }],
    }
  },
  component: CareersListView,
})

function CareersListView() {
  const page = Route.useLoaderData()
  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main>
        <ListPageHeader
          crumb="Careers"
          title={buildCareersListTitle()}
          facts={[`${formatCount(page.careers.length)} careers`]}
          source="BLS wages May 2025 · BLS projections 2025 to 2035"
        />
        <div className="mx-auto max-w-3xl px-5">
          <Section name="careers" title="Every career, ranked">
            <p>
              Pay is the US median across all experience levels. Growth is the projected change in the number of jobs from
              2025 to 2035. Career names link to pay in every state and the programs that lead there.
            </p>
            <CareersTable careers={page.careers} />
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
