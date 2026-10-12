import { createFileRoute } from '@tanstack/react-router'
import { ListIcon } from 'lucide-react'
import { PageSection } from '@/components/page-blocks'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { ListedProgramTable } from '@/components/site/listed-program-table'
import { ListPageHeader } from '@/components/site/list-page-header'
import { getProgramsListPage } from '@/data/get-site-pages'
import { formatCount } from '@/lib/format'
import { canonicalLink } from '@/lib/site'
import { buildProgramsListDescription, buildProgramsListTitle, programsListCount } from '@/lib/site-copy'

// The index route matches /programs exactly; national program pages are its
// children at /programs/{program}.
export const Route = createFileRoute('/programs/')({
  loader: () => getProgramsListPage(),
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return {
      links: [canonicalLink('/programs')],
      meta: [{ title: buildProgramsListTitle() }, { name: 'description', content: buildProgramsListDescription(loaderData) }],
    }
  },
  component: ProgramsListView,
})

function ProgramsListView() {
  const page = Route.useLoaderData()
  return (
    <div className={PAGE_CLASS_NAME}>
      <SiteHeader />
      <main className={MAIN_CLASS_NAME}>
        <ListPageHeader
          crumb="Programs"
          title={buildProgramsListTitle()}
          facts={[{ icon: <ListIcon aria-hidden />, text: `${formatCount(programsListCount(page))} types of programs` }]}
        />
        <div className="mx-auto max-w-3xl px-5">
          {page.levels.map((level) => (
            <PageSection key={level.credentialLevel} name={`programs-${level.credentialLevel}`} title={`${level.credential} programs`}>
              <ListedProgramTable programs={level.programs} searchLabel={`Search ${level.credential.toLowerCase()} programs`} />
            </PageSection>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
