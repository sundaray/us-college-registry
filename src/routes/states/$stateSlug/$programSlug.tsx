import { createFileRoute } from '@tanstack/react-router'
import { RankingTable } from '@/components/hub/ranking-table'
import { StateProgramHeader } from '@/components/hub/state-program-header'
import { RelatedRankingLink } from '@/components/hub/state-program-link'
import { RelatedNationalLink } from '@/components/national/national-program-link'
import { answerText, JobRow, KeyFigures, MainColumn, Note, PageColumns, PageSection, payRangeScale, QuestionList, RankedList, RelatedPages, Summary } from '@/components/page-blocks'
import type { KeyFigureTile, PageQuestion, RankedEntry } from '@/components/page-blocks'
import { DebtEarningsScatter } from '@/components/program/debt-earnings-scatter'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { getStateProgramPage } from '@/data/get-state-program-page'
import type { RankedProgram } from '@/data/state-program-page'
import { combinedCampusesNotes, payPrivacyNote } from '@/lib/data-notes'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount, formatMoney, formatShare } from '@/lib/format'
import { officialFieldSentence } from '@/lib/key-figure-copy'
import { placeInSentence } from '@/lib/place-names'
import { canonicalLink } from '@/lib/site'
import {
  buildKeyFigureQuestions,
  buildRankingNotes,
  buildStateProgramDescription,
  buildStateProgramFaq,
  buildStateProgramSummary,
  buildStateProgramTitle,
  careersIntro,
  careersTitle,
  degreeLabel,
  lowestDebtIntro,
  lowestDebtPrograms,
  lowestDebtTitle,
  matchingJobIntro,
  programKind,
  programsWithDebt,
  rankingTitle,
} from '@/lib/state-program-copy'

export const Route = createFileRoute('/states/$stateSlug/$programSlug')({
  loader: async ({ params }) => {
    const page = await getStateProgramPage({ data: params })
    const figureQuestions = buildKeyFigureQuestions(page)
    const faq: PageQuestion[] = buildStateProgramFaq(page).map((item) => ({ question: item.question, answer: [item.answer] }))
    return { page, figureQuestions, faq }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { page, figureQuestions, faq } = loaderData
    return {
      links: [canonicalLink(`/states/${params.stateSlug}/${params.programSlug}`)],
      meta: [
        { title: buildStateProgramTitle(page) },
        { name: 'description', content: buildStateProgramDescription(page) },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          // One FAQPage for both lists of questions, in the order the page shows them.
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [...figureQuestions, ...faq].map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: answerText(item) },
            })),
          }),
        },
      ],
    }
  },
  component: StateProgramPageView,
})

function StateProgramPageView() {
  const { page, figureQuestions, faq } = Route.useLoaderData()
  const { state, national } = page.benchmarks
  const kind = programKind(page)
  const withDebt = programsWithDebt(page)
  const notes = buildRankingNotes(page)
  const fieldNote = comparisonNote(page.program.cipCode, page.program.credentialLevel)
  const hasYear5 = state.earningsYear5 !== undefined && national.earningsYear5 !== undefined
  const jobs = page.occupations.filter((occupation) => occupation.stateMedianPay !== undefined || occupation.nationalMedianPay !== undefined)
  const lowestDebt = lowestDebtPrograms(page)
  const figures: KeyFigureTile[] = [
    { label: 'Median first-year pay', value: formatMoney(state.earningsYear1), context: `National ${formatMoney(national.earningsYear1)}` },
    ...(hasYear5 ? [{ label: 'Median pay after 5 years', value: formatMoney(state.earningsYear5!), context: `National ${formatMoney(national.earningsYear5!)}` }] : []),
    { label: 'Median federal debt', value: formatMoney(state.medianDebt), context: `National ${formatMoney(national.medianDebt)}` },
    { label: 'Debt-to-earnings', value: formatShare(state.debtToEarnings), context: `National ${formatShare(national.debtToEarnings)}` },
  ]

  return (
    <div className={PAGE_CLASS_NAME}>
      <SiteHeader />
      {/* The key gives each ranking page its own state. Without it, a link from one
          ranking page to another keeps the table's sort and page number and the open
          questions. data-* attributes let scripts/verify find the field, credential,
          and state. */}
      <main
        className={MAIN_CLASS_NAME}
        key={`${page.stateSlug}/${page.programSlug}`}
        data-cip={page.program.cipCode}
        data-credential-level={page.program.credentialLevel}
        data-state={page.state.code}
      >
        <StateProgramHeader page={page} />
        <PageColumns>
          <MainColumn>
            <Summary paragraphs={buildStateProgramSummary(page)} />

            <KeyFigures figures={figures} />
            <QuestionList name="figures" section="key-figure-questions" questions={figureQuestions} className="mt-3" />

            <PageSection name="ranking" title={rankingTitle(page)}>
              <p>
                Each figure is the median for the program's graduates. Programs that don't report a figure are
                listed last when you sort by it.
              </p>
              <RankingTable programs={page.programs} />
              {fieldNote ? <Note>{fieldNote}</Note> : null}
              {notes.length > 0 ? (
                <Note>
                  {notes.map((piece, position) =>
                    'name' in piece ? (
                      <span key={position} data-name="">{piece.name}</span>
                    ) : (
                      <span key={position}>{piece.text}</span>
                    ),
                  )}
                </Note>
              ) : null}
            </PageSection>

            <PageSection name="scatter" title={`Debt and first-year pay at every ${page.state.name} ${page.program.sentenceName} program`}>
              <p>
                Programs in the upper left give graduates higher pay for less debt. Dashed lines mark the{' '}
                {page.state.name} medians.
              </p>
              <Card size="sm">
                <CardContent>
                  {/* On a narrow screen the chart scrolls sideways instead of shrinking. */}
                  <ScrollArea data-slot="chart-scroll-area" className="w-full">
                    <div className="min-w-140 pb-3">
                      <DebtEarningsScatter
                        programs={withDebt.map((program) => ({
                          schoolName: program.schoolName,
                          city: program.city,
                          state: page.state.code,
                          earningsYear1: program.earningsYear1,
                          medianDebt: program.medianDebt!,
                        }))}
                        medianDebt={state.medianDebt}
                        medianEarnings={state.earningsYear1}
                        stateName={page.state.name}
                      />
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </CardContent>
              </Card>
              <Note>
                Hover over or tap a dot to see the school. Only the {formatCount(withDebt.length)} programs that report
                both pay and debt are shown.
              </Note>
            </PageSection>

            <PageSection name="lowest-debt" title={lowestDebtTitle(page)}>
              <p>{lowestDebtIntro(lowestDebt.byDebt.length)}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <RankedList title="Lowest debt" entries={lowestDebt.byDebt.map((program) => debtEntry(program, formatMoney(program.medianDebt!)))} />
                <RankedList
                  title="Lowest debt-to-earnings"
                  entries={lowestDebt.byDebtToEarnings.map((program) => debtEntry(program, formatShare(program.medianDebt! / program.earningsYear1)))}
                />
              </div>
            </PageSection>

            {page.matchingJob ? (
              <PageSection name="careers" title={`What ${page.matchingJob.pluralName} earn in ${placeInSentence(page.state.name)}`}>
                <p>{matchingJobIntro(page.matchingJob.pluralName, page.state.name)}</p>
                <Card size="sm" className="gap-0 py-0">
                  <JobRow job={page.matchingJob} areaName={page.state.name} scale={payRangeScale([page.matchingJob])} />
                </Card>
              </PageSection>
            ) : jobs.length > 0 ? (
              <PageSection name="careers" title={careersTitle(page)}>
                <p>{careersIntro(page, jobs.every((job) => job.stateMedianPay !== undefined))}</p>
                <Card size="sm" className="gap-0 py-0">
                  {jobs.map((job) => (
                    <JobRow key={job.socCode} job={job} areaName={page.state.name} scale={payRangeScale(jobs)} />
                  ))}
                </Card>
              </PageSection>
            ) : null}

            <PageSection name="faq" title="Common questions">
              <QuestionList name="faq" questions={faq} openFirst />
            </PageSection>
          </MainColumn>

          <RelatedPages side>
            <RelatedNationalLink
              href={`/programs/${page.programSlug}`}
              title={`${page.program.name} (${degreeLabel(page)}) programs in the US, ranked`}
              detail={`${formatCount(national.earningsYear1Count)} programs by pay and debt`}
            />
            {page.otherCredentials.map((other) => (
              <RelatedRankingLink
                key={other.href}
                href={other.href}
                title={other.title}
                detail={`${formatCount(other.programCount)} programs by pay and debt`}
              />
            ))}
          </RelatedPages>

          <MainColumn>
            <PageSection name="about-data" title="About this data">
              <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
                <li>{officialFieldSentence(page.program)}</li>
                <li>Pay and debt only include students who received federal financial aid, and pay only counts graduates who were working and not enrolled in more school.</li>
                <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
                <li>{payPrivacyNote()}</li>
                {combinedCampusesNotes(page.state.name).map((note) => (
                  <li key={note}>{note}</li>
                ))}
                <li>Medians are across the {kind} programs that report each figure, which is why the counts differ by figure. College Scorecard figures describe graduating classes from several years ago. Bureau of Labor Statistics wages are from May 2025.</li>
              </ul>
              <h3 className="text-base font-bold">Sources</h3>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
                <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
                <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
                <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
                <li>NCES, CIP 2020 to SOC 2018 crosswalk, and IPEDS institution directory, 2024</li>
              </ol>
            </PageSection>
          </MainColumn>
        </PageColumns>
      </main>
      <SiteFooter />
    </div>
  )
}

// A ranked program as an entry of one of the two lowest-debt lists.
function debtEntry(program: RankedProgram, value: string): RankedEntry {
  return { key: `${program.schoolName}-${program.city}`, name: program.schoolName, href: program.href, value }
}
