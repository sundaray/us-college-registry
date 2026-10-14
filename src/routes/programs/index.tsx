import { createFileRoute } from '@tanstack/react-router'
import { ListIcon } from 'lucide-react'
import { Note, PageSection } from '@/components/page-blocks'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { ListedProgramTable } from '@/components/site/listed-program-table'
import { ListPageHeader } from '@/components/site/list-page-header'
import { buttonVariants } from '@/components/ui/button'
import type { CredentialLevel } from '@/data/program-page'
import { isGraduateLevel } from '@/data/program-page'
import { getProgramsListPage } from '@/data/get-site-pages'
import { formatCount } from '@/lib/format'
import { canonicalLink } from '@/lib/site'
import { cn } from '@/lib/utils'
import { buildProgramsListDescription, buildProgramsListTitle, programsListCount } from '@/lib/site-copy'

// Each table's place on the page, for the links at the top that jump to it, and
// the word each link shows.
const TABLES: Record<CredentialLevel, { anchor: string; link: string }> = {
  5: { anchor: 'masters', link: "Master's" },
  3: { anchor: 'bachelors', link: "Bachelor's" },
  2: { anchor: 'associates', link: "Associate's" },
  1: { anchor: 'certificates', link: 'Certificates' },
}

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
          {/* The page holds four long tables. Links at the top jump to each. */}
          <nav data-section="jump" aria-label="Jump to a table" className="mt-9 flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">Jump to</span>
            {page.levels.map((level) => (
              <a
                key={level.credentialLevel}
                href={`#${TABLES[level.credentialLevel].anchor}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'rounded-full px-3.5 text-base')}
              >
                {TABLES[level.credentialLevel].link}
              </a>
            ))}
          </nav>
          {page.levels.map((level) => (
            <PageSection
              key={level.credentialLevel}
              name={`programs-${level.credentialLevel}`}
              id={TABLES[level.credentialLevel].anchor}
              title={`${level.credential} programs`}
            >
              <ListedProgramTable programs={level.programs} searchLabel={`Search ${level.credential.toLowerCase()} programs`} />
              {/* A graduate debt figure counts less than the others on the page, and the table says so. */}
              {isGraduateLevel(level.credentialLevel) ? (
                <Note>
                  Debt for a master's program counts only the federal loans its graduates took for graduate study at that
                  school. Undergraduate loans and loans taken at other schools are not counted.
                </Note>
              ) : null}
            </PageSection>
          ))}

          {/* What the four tables show and who the figures count. Each statement was checked
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
                federal student loans. Loans taken by parents and private loans are not counted. For a master's
                program, it only counts loans for graduate study at that school.
              </li>
            </ul>
          </PageSection>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
