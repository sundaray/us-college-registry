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

          {/* What the three tables show and who the figures count. Each statement was checked
              against the Department of Education's field of study documentation. */}
          <PageSection name="about-data" title="About this data">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              <li>
                The figures are from the U.S. Department of Education's College Scorecard. Pay comes from federal tax
                records, and debt comes from federal student loan records.
              </li>
              <li>
                Each row is one type of program, for example bachelor's programs in nursing. Its pay and debt are the
                medians across the programs of that type in the US. Each program counts once, however many graduates it
                has.
              </li>
              <li>
                "Programs" is the number of programs that report first-year pay. The debt figure is the median across the
                programs that report debt, which can be a different number.
              </li>
              <li>
                "Year 1 pay" starts from each program's own figure: the median pay of its graduates in the first year
                after graduation. It only counts graduates who received federal financial aid, were working and were not
                enrolled in more school.
              </li>
              <li>
                "Debt" starts from each program's own figure too: the median amount borrowed by its graduates who took
                federal student loans. Loans taken by parents and private loans are not counted.
              </li>
            </ul>
          </PageSection>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
