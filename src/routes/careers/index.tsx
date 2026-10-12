import { createFileRoute } from '@tanstack/react-router'
import { BriefcaseIcon } from 'lucide-react'
import { PageSection } from '@/components/page-blocks'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { CareersTable } from '@/components/site/careers-table'
import { ListPageHeader } from '@/components/site/list-page-header'
import { getCareersListPage } from '@/data/get-site-pages'
import { formatCount } from '@/lib/format'
import { canonicalLink } from '@/lib/site'
import { buildCareersListDescription, buildCareersListTitle, LABOR_SOURCE_LINE } from '@/lib/site-copy'

// The index route matches /careers exactly; occupation pages are its children.
export const Route = createFileRoute('/careers/')({
  loader: () => getCareersListPage(),
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return {
      links: [canonicalLink('/careers')],
      meta: [{ title: buildCareersListTitle() }, { name: 'description', content: buildCareersListDescription(loaderData) }],
    }
  },
  component: CareersListView,
})

function CareersListView() {
  const page = Route.useLoaderData()
  return (
    <div className={PAGE_CLASS_NAME}>
      <SiteHeader />
      <main className={MAIN_CLASS_NAME}>
        <ListPageHeader
          crumb="Careers"
          title={buildCareersListTitle()}
          facts={[{ icon: <BriefcaseIcon aria-hidden />, text: `${formatCount(page.careers.length)} careers` }]}
          source={LABOR_SOURCE_LINE}
        />
        <div className="mx-auto max-w-3xl px-5">
          <PageSection name="careers" title={`${formatCount(page.careers.length)} careers, ranked by pay`}>
            <p>
              Pay is the US median across all experience levels. Growth is the projected change in the number of jobs from
              2025 to 2035. Career names link to pay in every state and the programs that lead there.
            </p>
            <CareersTable careers={page.careers} />
          </PageSection>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
