import { createFileRoute } from '@tanstack/react-router'
import { NationalProgramHeader } from '@/components/national/national-program-header'
import { RelatedNationalLink } from '@/components/national/national-program-link'
import { NationalRankingTable } from '@/components/national/national-ranking-table'
import { NationalStateTable } from '@/components/national/national-state-table'
import { answerText, JobRow, KeyFigures, Note, PageSection, payRangeScale, QuestionList, RankedList, RelatedPages, Summary } from '@/components/page-blocks'
import type { KeyFigureTile, PageQuestion, RankedEntry } from '@/components/page-blocks'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Card } from '@/components/ui/card'
import { getNationalProgramPage } from '@/data/get-national-program-page'
import type { NationalRankedProgram } from '@/data/national-program-page'
import { payPrivacyNote } from '@/lib/data-notes'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount, formatMoney, formatShare } from '@/lib/format'
import { debtTileLabel, GRADUATE_DATA_NOTES, GRADUATE_DEBT_COLUMN_NOTE, GRADUATE_LOWEST_DEBT_CAUTION, graduateClassYears, isGraduateRanking } from '@/lib/graduate-ranking-copy'
import { officialFieldSentence } from '@/lib/key-figure-copy'
import {
  buildKeyFigureQuestions,
  buildNationalDescription,
  buildNationalFaq,
  buildNationalRankingNotes,
  buildNationalSummary,
  buildNationalTitle,
  careersIntro,
  careersTitle,
  lowestDebtIntro,
  lowestDebtPrograms,
  lowestDebtTitle,
  matchingJobIntro,
  programKind,
  programLabel,
  rankingTitle,
  statesIntro,
  unrankedNote,
} from '@/lib/national-program-copy'
import { notStatesNote } from '@/lib/place-names'
import { canonicalLink } from '@/lib/site'

// BLS figures on this page are for the whole US; the shared JobRow names the
// area it describes.
const AREA_NAME = 'the US'

export const Route = createFileRoute('/programs/$programSlug')({
  loader: async ({ params }) => {
    const page = await getNationalProgramPage({ data: params })
    const figureQuestions = buildKeyFigureQuestions(page)
    const faq: PageQuestion[] = buildNationalFaq(page).map((item) => ({ question: item.question, answer: [item.answer] }))
    return { page, figureQuestions, faq }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { page, figureQuestions, faq } = loaderData
    return {
      links: [canonicalLink(`/programs/${params.programSlug}`)],
      meta: [
        { title: buildNationalTitle(page) },
        { name: 'description', content: buildNationalDescription(page) },
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
  component: NationalProgramPageView,
})

function NationalProgramPageView() {
  const { page, figureQuestions, faq } = Route.useLoaderData()
  const { national } = page
  const kind = programKind(page)
  const unranked = unrankedNote(page)
  const notStates = notStatesNote(page.states.map((state) => state.stateName))
  const fieldNote = comparisonNote(page.program.cipCode, page.program.credentialLevel)
  const jobs = page.occupations.filter((occupation) => occupation.stateMedianPay !== undefined)
  const lowestDebt = lowestDebtPrograms(page)
  const graduate = isGraduateRanking(page)
  const across = (programCount: number) => `Across ${formatCount(programCount)} programs`
  const figures: KeyFigureTile[] = [
    { label: 'Median first-year pay', value: formatMoney(national.earningsYear1), context: across(national.earningsYear1Count) },
    ...(national.earningsYear5 !== undefined
      ? [{ label: 'Median pay after 5 years', value: formatMoney(national.earningsYear5), context: across(national.earningsYear5Count) }]
      : []),
    { label: debtTileLabel(graduate), value: formatMoney(national.medianDebt), context: across(national.medianDebtCount) },
    { label: 'Debt-to-earnings', value: formatShare(national.debtToEarnings), context: across(national.debtToEarningsCount) },
  ]

  return (
    <div className={PAGE_CLASS_NAME}>
      <SiteHeader />
      {/* The key gives each program's page its own state. Without it, a link from one
          national page to another keeps the table's sort and page number and the open
          questions, and a page number past the new table's end shows no rows.
          data-* attributes let scripts/verify find the field and credential. */}
      <main className={MAIN_CLASS_NAME} key={page.programSlug} data-cip={page.program.cipCode} data-credential-level={page.program.credentialLevel}>
        <NationalProgramHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Summary paragraphs={buildNationalSummary(page)} />

          <KeyFigures figures={figures} />
          <QuestionList name="figures" section="key-figure-questions" questions={figureQuestions} className="mt-3" />

          <PageSection name="ranking" title={rankingTitle(page)}>
            {/* Every program in the table reports pay. The last sentence names the
                figure a program can lack. The user worded this paragraph on 2026-10-14. */}
            <p>
              Each program is ranked by the median pay of its graduates one year after they finished. The figures come
              from College Scorecard, the U.S. Department of Education's public database of colleges and their
              programs. It takes pay from federal tax records. The ranking shows what graduates earn, not how good the
              teaching is. Pay also depends on where graduates live and work. Every program listed here reports pay. A
              program that does not report debt is listed last when you sort by debt.
            </p>
            {fieldNote ? <Note>{fieldNote}</Note> : null}
            <NationalRankingTable programs={page.ranking} />
            {graduate ? <Note>{GRADUATE_DEBT_COLUMN_NOTE}</Note> : null}
            {buildNationalRankingNotes(page).map((note) => (
              <Note key={note}>{note}</Note>
            ))}
          </PageSection>

          <PageSection name="states" title={`${programLabel(page)} programs by state`}>
            <p>{statesIntro(page)}</p>
            <NationalStateTable states={page.states} />
            {notStates ? <Note>{notStates}</Note> : null}
            {unranked ? <Note>{unranked}</Note> : null}
          </PageSection>

          {lowestDebt.byDebt.length > 0 ? (
            <PageSection name="lowest-debt" title={lowestDebtTitle(page)}>
              <p>{lowestDebtIntro(lowestDebt.byDebt.length, graduate)}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <RankedList title="Lowest debt" entries={lowestDebt.byDebt.map((program) => debtEntry(program, formatMoney(program.medianDebt!)))} />
                <RankedList
                  title="Lowest debt-to-earnings"
                  entries={lowestDebt.byDebtToEarnings.map((program) => debtEntry(program, formatShare(program.medianDebt! / program.earningsYear1)))}
                />
              </div>
              {graduate ? <Note>{GRADUATE_LOWEST_DEBT_CAUTION}</Note> : null}
            </PageSection>
          ) : null}

          {page.matchingJob ? (
            <PageSection name="careers" title={`What ${page.matchingJob.pluralName} earn`}>
              <p>{matchingJobIntro(page.matchingJob.pluralName)}</p>
              <Card size="sm" className="gap-0 py-0">
                <JobRow job={page.matchingJob} areaName={AREA_NAME} scale={payRangeScale([page.matchingJob])} />
              </Card>
            </PageSection>
          ) : jobs.length > 0 ? (
            <PageSection name="careers" title={careersTitle(page)}>
              <p>{careersIntro(page)}</p>
              <Card size="sm" className="gap-0 py-0">
                {jobs.map((job) => (
                  <JobRow key={job.socCode} job={job} areaName={AREA_NAME} scale={payRangeScale(jobs)} />
                ))}
              </Card>
            </PageSection>
          ) : null}

          <PageSection name="faq" title="Common questions">
            <QuestionList name="faq" questions={faq} openFirst />
          </PageSection>

        </div>

        {/* The links stay a band on every screen. The ranking table is wider than
            the page column on large screens, which leaves no room for a column of
            links beside it. The band runs the full width, outside the page column. */}
        {page.otherCredentials.length > 0 ? (
          <RelatedPages>
            {page.otherCredentials.map((other) => (
              <RelatedNationalLink
                key={other.href}
                href={other.href}
                title={other.title}
                detail={`${formatCount(other.programCount)} programs by pay and debt`}
              />
            ))}
          </RelatedPages>
        ) : null}

        <div className="mx-auto max-w-3xl px-5">
          <PageSection name="about-data" title="About this data">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              <li>{officialFieldSentence(page.program)}</li>
              {graduate ? (
                GRADUATE_DATA_NOTES.map((note) => <li key={note}>{note}</li>)
              ) : (
                <>
                  <li>Pay and debt only include students who received federal financial aid, and pay only counts graduates who were working and not enrolled in more school.</li>
                  <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
                </>
              )}
              <li>{payPrivacyNote()}</li>
              <li>Medians are across programs, not students. Each program counts once, however many graduates it has.</li>
              <li>National medians include every program in the 50 states, DC and US territories, including schools that have since closed. Schools with several campuses that report one combined figure are counted once.</li>
              <li>Programs are ranked by College Scorecard median pay one year after graduation. Pay after cost of living uses the price level of the school's state.</li>
              {graduate ? (
                <li>{graduateClassYears(national.earningsYear5 !== undefined)} Bureau of Labor Statistics wages are from May 2025. Price levels are the Bureau of Economic Analysis Regional Price Parities for 2024.</li>
              ) : (
                <li>College Scorecard figures describe graduating classes from several years ago. Bureau of Labor Statistics wages are from May 2025. Price levels are the Bureau of Economic Analysis Regional Price Parities for 2024.</li>
              )}
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
              <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
              <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
              <li>NCES, CIP 2020 to SOC 2018 crosswalk</li>
              <li>Bureau of Economic Analysis, Regional Price Parities, 2024</li>
            </ol>
          </PageSection>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

// A ranked program as an entry of one of the two lowest-debt lists.
function debtEntry(program: NationalRankedProgram, value: string): RankedEntry {
  return { key: program.unitId, unit: program.unitId, name: program.schoolName, href: program.href, place: program.stateCode, value }
}
