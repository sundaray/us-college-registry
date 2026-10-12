import { createFileRoute } from '@tanstack/react-router'
import { Building2Icon, MapPinIcon } from 'lucide-react'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { ListPageHeader } from '@/components/site/list-page-header'
import { SchoolSearchBox, SchoolStates, useSchoolSearch } from '@/components/site/school-search'
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

function SchoolsListView() {
  const page = Route.useLoaderData()
  const search = useSchoolSearch(page)
  return (
    <div className={PAGE_CLASS_NAME}>
      <SiteHeader />
      <main className={MAIN_CLASS_NAME}>
        <ListPageHeader
          crumb="Schools"
          title={buildSchoolsListTitle()}
          facts={[
            { icon: <Building2Icon aria-hidden />, text: `${formatCount(schoolsListCount(page))} schools` },
            { icon: <MapPinIcon aria-hidden />, text: `${formatCount(page.states.length)} states and territories` },
          ]}
        />
        <div className="mx-auto max-w-3xl px-5">
          <SchoolSearchBox search={search} />
          <SchoolStates page={page} result={search.result} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
