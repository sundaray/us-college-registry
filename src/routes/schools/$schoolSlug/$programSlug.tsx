import { createFileRoute } from '@tanstack/react-router'
import { RelatedRankingLink } from '@/components/hub/state-program-link'
import { RelatedNationalLink } from '@/components/national/national-program-link'
import { answerText, JobRow, KeyFigures, MainColumn, Note, PageColumns, PageSection, payRangeScale, QuestionList, RelatedPages, Summary } from '@/components/page-blocks'
import type { KeyFigureTile } from '@/components/page-blocks'
import { DebtEarningsScatter } from '@/components/program/debt-earnings-scatter'
import { EarningsBars } from '@/components/program/earnings-bars'
import { ProgramHeader } from '@/components/program/program-header'
import { ProgramLink } from '@/components/program/program-link'
import { RelatedSchoolLink } from '@/components/school/school-link'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getProgramPage } from '@/data/get-program-page'
import type { ProgramPage, RepaymentStatus } from '@/data/program-page'
import { hasSchoolPage } from '@/data/school-page'
import { campusesNote, combinedCampusesNotes, payPrivacyNote } from '@/lib/data-notes'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount, formatMiles, formatMoney, formatShare, formatShareRange } from '@/lib/format'
import { officialProgramFieldSentence } from '@/lib/key-figure-copy'
import { placeInSentence } from '@/lib/place-names'
import {
  buildFamilyIncomeSentence,
  buildFaq,
  buildFiveYearSentence,
  buildGrowthSentence,
  buildKeyFigureQuestions,
  buildMetaDescription,
  buildOccupationPriceSentence,
  buildPageTitle,
  buildPriceSentence,
  buildSchoolRankSentence,
  buildSummary,
  capitalize,
  careersIntro,
  careersTitle,
  compareTitle,
  computeMetrics,
  nationalPayStandingLabel,
  paymentShareLabel,
  rankLowest,
  schoolProgramsToList,
  year5ChangeLabel,
} from '@/lib/program-copy'
import { canonicalLink } from '@/lib/site'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/schools/$schoolSlug/$programSlug')({
  loader: async ({ params }) => {
    const page = await getProgramPage({ data: params })
    const metrics = computeMetrics(page)
    return { page, metrics, figureQuestions: buildKeyFigureQuestions(page), faq: buildFaq(page, metrics) }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { page, figureQuestions, faq } = loaderData
    return {
      links: [canonicalLink(`/schools/${params.schoolSlug}/${params.programSlug}`)],
      meta: [
        { title: buildPageTitle(page) },
        { name: 'description', content: buildMetaDescription(page) },
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
  component: ProgramPageView,
})

// A table with a name and three figures in each row is too wide for a phone. On
// a phone each row stacks: the name takes a line of its own and the three figures
// sit under the three column headings. The role attributes keep it a table for
// screen readers once the layout is no longer a table's.
const STACKED = {
  table: 'max-sm:block',
  group: 'max-sm:block',
  row: 'max-sm:grid max-sm:grid-cols-3 max-sm:gap-x-3 max-sm:px-4',
  // The middle column of the comparison table is wider, so the longest state
  // name ("Massachusetts") stays whole on the narrowest phones.
  compareRow: 'max-sm:grid max-sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)] max-sm:gap-x-3 max-sm:px-4',
  // The heading over the names has no figure under it on a phone.
  nameHead: 'max-sm:hidden',
  head: 'max-sm:h-auto max-sm:px-0 max-sm:py-2 max-sm:text-left max-sm:wrap-anywhere',
  name: 'max-sm:col-span-3 max-sm:px-0 max-sm:pb-0',
  figure: 'max-sm:px-0 max-sm:pt-0.5 max-sm:text-left',
}

const REPAYMENT_LABELS: Record<RepaymentStatus, string> = {
  paidInFull: 'Paid off in full',
  makingProgress: 'Paying down the balance',
  forbearance: 'Paused payments (forbearance)',
  default: 'In default',
}

function ProgramPageView() {
  const { page, metrics, figureQuestions, faq } = Route.useLoaderData()
  const { school, program, earnings, debt, ranks, benchmarks } = page
  const programLower = program.sentenceName
  const credentialLower = program.credential.toLowerCase()
  const fiveYearSentence = buildFiveYearSentence(page, metrics)
  const familyIncomeSentence = buildFamilyIncomeSentence(page)
  const growthSentence = buildGrowthSentence(page, metrics)
  const priceSentence = buildPriceSentence(page, metrics)
  const occupationPriceSentence = buildOccupationPriceSentence(page, metrics)
  const fieldNote = comparisonNote(program.cipCode, program.credentialLevel)
  const hasYear5 = earnings.year5 !== undefined && metrics.year5Growth !== undefined
  const jobs = page.occupations.filter((occupation) => occupation.stateMedianPay !== undefined || occupation.nationalMedianPay !== undefined)
  const schoolFacts = buildSchoolFacts(page)
  const schoolPrograms = schoolProgramsToList(page)
  const figures: KeyFigureTile[] = [
    { label: 'Median first-year pay', value: formatMoney(earnings.year1), context: nationalPayStandingLabel(page) },
    ...(hasYear5 ? [{ label: 'Median pay after 5 years', value: formatMoney(earnings.year5!), context: year5ChangeLabel(metrics.year5Growth!) }] : []),
    {
      label: 'Median federal debt',
      value: formatMoney(debt.median),
      context: `${capitalize(rankLowest(ranks.stateDebtRank, ranks.stateProgramsWithBoth))} ${school.stateName} programs`,
    },
    {
      label: 'Debt-to-earnings',
      value: formatShare(metrics.debtToEarnings),
      context: `${school.stateName} median ${formatShare(benchmarks.state.debtToEarnings)}, national ${formatShare(benchmarks.national.debtToEarnings)}`,
    },
  ]

  return (
    <div className="min-h-screen bg-muted/40 text-pretty">
      <SiteHeader />
      {/* The key gives each program's page its own state. Without it, a link from one
          program page to another keeps the open questions. data-* attributes let
          scripts/verify find the program and each section. */}
      <main
        key={`${page.schoolSlug}/${page.programSlug}`}
        data-unit-id={school.unitId}
        data-cip={program.cipCode}
        data-credential-level={program.credentialLevel}
        data-school-name={school.shortName}
      >
        <ProgramHeader page={page} />
        <PageColumns>
          <MainColumn>
            <Summary paragraphs={buildSummary(page)} />

            <KeyFigures figures={figures} />
            {page.inStateGraduateShare !== undefined ? (
              <div data-section="campuses" className="mt-3">
                <Note>{campusesNote(page.inStateGraduateShare, programLower, school.stateName)}</Note>
              </div>
            ) : null}
            <QuestionList name="figures" section="key-figure-questions" questions={figureQuestions} className="mt-3" />

            <PageSection name="compare" title={compareTitle(page)}>
              <p>
                The first column shows this program, where each figure is the median for its graduates. The other two
                show the median across all {programLower} {credentialLower} programs that report the figure, in{' '}
                {placeInSentence(school.stateName)} and in the country as a whole.
              </p>
              <Card size="sm" className="py-0">
                <Table role="table" className={STACKED.table}>
                  <TableHeader role="rowgroup" className={STACKED.group}>
                    <TableRow role="row" className={STACKED.compareRow}>
                      <TableHead role="columnheader" className={cn('px-4', STACKED.nameHead)} />
                      <TableHead role="columnheader" className={cn('px-4 text-right whitespace-normal', STACKED.head)}>{school.shortName}</TableHead>
                      <TableHead role="columnheader" className={cn('px-4 text-right whitespace-normal', STACKED.head)}>{school.stateName} median</TableHead>
                      <TableHead role="columnheader" className={cn('px-4 text-right whitespace-normal', STACKED.head)}>National median</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody role="rowgroup" className={cn('tabular-nums', STACKED.group)}>
                    <CompareRow label="Median first-year pay" values={[earnings.year1, benchmarks.state.earningsYear1, benchmarks.national.earningsYear1].map(formatMoney)} />
                    {hasYear5 && benchmarks.state.earningsYear5 !== undefined && benchmarks.national.earningsYear5 !== undefined ? (
                      <CompareRow label="Median pay after 5 years" values={[earnings.year5!, benchmarks.state.earningsYear5, benchmarks.national.earningsYear5].map(formatMoney)} />
                    ) : null}
                    <CompareRow label="Median federal debt" values={[debt.median, benchmarks.state.medianDebt, benchmarks.national.medianDebt].map(formatMoney)} />
                    <CompareRow label="Debt-to-earnings" values={[metrics.debtToEarnings, benchmarks.state.debtToEarnings, benchmarks.national.debtToEarnings].map(formatShare)} />
                    <CompareRow label="Programs compared" values={['', formatCount(benchmarks.state.earningsYear1Count), formatCount(benchmarks.national.earningsYear1Count)]} />
                  </TableBody>
                </Table>
              </Card>
              {fiveYearSentence ? <p>{fiveYearSentence}</p> : null}
            </PageSection>

            <PageSection name="scatter" title={`Debt and first-year pay at every ${school.stateName} ${programLower} program`}>
              <p>
                Programs in the upper left give graduates higher pay for less debt. Dashed lines mark the{' '}
                {school.stateName} medians.
              </p>
              <Card size="sm">
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" />{school.shortName}</span>
                    <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/45" />Other {school.stateName} programs</span>
                  </div>
                  {/* On a narrow screen the chart scrolls sideways instead of shrinking. */}
                  <ScrollArea data-slot="chart-scroll-area" className="w-full">
                    <div className="min-w-140 pb-3">
                      <DebtEarningsScatter
                        programs={page.stateComparison}
                        medianDebt={benchmarks.state.medianDebt}
                        medianEarnings={benchmarks.state.earningsYear1}
                        stateName={school.stateName}
                      />
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </CardContent>
              </Card>
              <Note>
                Hover over or tap a dot to see the school. Only the {formatCount(page.stateComparison.length)} programs that
                report both pay and debt are shown.
              </Note>
              {fieldNote ? <Note>{fieldNote}</Note> : null}
            </PageSection>

            {hasYear5 && growthSentence ? (
              <PageSection name="over-time" title="What graduates earn over time">
                <p>{growthSentence}</p>
                <Card size="sm">
                  <CardContent>
                    <EarningsBars
                      bars={[
                        { label: `${school.shortName} graduates`, detail: 'year 1', amount: earnings.year1, highlight: true },
                        { label: `${school.shortName} graduates`, detail: 'year 5', amount: earnings.year5!, highlight: true },
                        ...(benchmarks.state.earningsYear5 !== undefined
                          ? [{ label: `All ${school.stateName} ${programLower} graduates`, detail: 'year 5', amount: benchmarks.state.earningsYear5 }]
                          : []),
                        ...(page.matchingOccupation
                          ? [{ label: `All ${page.matchingOccupation.pluralName} in ${placeInSentence(school.stateName)}`, amount: page.matchingOccupation.stateMedianPay }]
                          : []),
                        ...(page.matchingOccupation?.metroMedianPay !== undefined
                          ? [{ label: `${capitalize(page.matchingOccupation.pluralName)} in the ${page.matchingOccupation.metroName} area`, amount: page.matchingOccupation.metroMedianPay }]
                          : []),
                      ]}
                    />
                  </CardContent>
                </Card>
                <Note>
                  Year 1 and year 5 figures come from different graduating classes, which makes the growth rate an
                  estimate.
                  {page.matchingOccupation
                    ? ` The Bureau of Labor Statistics figures cover ${page.matchingOccupation.pluralName} at every experience level.`
                    : ''}
                </Note>
              </PageSection>
            ) : null}

            {familyIncomeSentence ? (
              <PageSection name="family-income" title="Does family income change the outcome?">
                <p>{familyIncomeSentence}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SmallStat
                    label="Pell Grant recipients, median first-year pay"
                    value={formatMoney(earnings.pellYear1!)}
                    note={debt.pellMedian !== undefined ? `Median federal debt ${formatMoney(debt.pellMedian)}` : undefined}
                  />
                  <SmallStat
                    label="Other graduates, median first-year pay"
                    value={formatMoney(earnings.otherYear1!)}
                    note={debt.otherMedian !== undefined ? `Median federal debt ${formatMoney(debt.otherMedian)}` : undefined}
                  />
                </div>
              </PageSection>
            ) : null}

            {debt.monthlyPayment !== undefined && metrics.paymentShareOfPay !== undefined ? (
              <PageSection name="repayment" title="Paying back the loans">
                <p>
                  On a standard 10-year plan, the median debt means a payment of about{' '}
                  <strong>{formatMoney(debt.monthlyPayment)} a month</strong>, or{' '}
                  <strong>{paymentShareLabel(metrics.paymentShareOfPay)}</strong> of a graduate's typical monthly
                  pay in the first year.
                </p>
                {page.repayment ? (
                  <Card size="sm" className="py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-4 whitespace-normal">Two years into repayment ({formatCount(page.repayment.borrowers)} borrowers)</TableHead>
                          <TableHead className="px-4 text-right">Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {page.repayment.rows.map((row) => (
                          <TableRow key={row.status}>
                            <TableCell className="px-4 py-2.5 whitespace-normal">{REPAYMENT_LABELS[row.status]}</TableCell>
                            <TableCell className="px-4 py-2.5 text-right tabular-nums">{formatShareRange(row.share)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                ) : null}
                {page.repayment ? (
                  <Note>
                    The government publishes these as ranges to protect privacy. They were measured in 2018 to 2020,
                    partly during the pandemic pause on federal loan payments. The forbearance share may be higher than
                    usual.
                    {debt.parentPlusBorrowers && debt.parentPlusMedian !== undefined
                      ? ` Separately, ${formatCount(debt.parentPlusBorrowers)} parents took out Parent PLUS loans for these students, with a median of ${formatMoney(debt.parentPlusMedian)}.`
                      : ''}
                  </Note>
                ) : debt.parentPlusBorrowers && debt.parentPlusMedian !== undefined ? (
                  <Note>
                    {formatCount(debt.parentPlusBorrowers)} parents took out Parent PLUS loans for these students,
                    with a median of {formatMoney(debt.parentPlusMedian)}.
                  </Note>
                ) : null}
              </PageSection>
            ) : null}

            {metrics.inStateShare !== undefined || priceSentence || occupationPriceSentence ? (
              <PageSection name="work" title="Where graduates work and what the pay is worth">
                {metrics.inStateShare !== undefined || priceSentence ? (
                  <p>
                    {metrics.inStateShare !== undefined ? (
                      <>
                        <strong>{formatShare(metrics.inStateShare)} of graduates</strong> ({formatCount(earnings.workingInStateCount!)} of{' '}
                        {formatCount(earnings.workingCount!)}) were working in {placeInSentence(school.stateName)} one year after graduating.
                        {priceSentence ? ' ' : ''}
                      </>
                    ) : null}
                    {priceSentence ? (
                      <>
                        {priceSentence.lead}
                        {priceSentence.adjustedPay ? (
                          <>
                            <strong>{priceSentence.adjustedPay}</strong>
                            {priceSentence.tail}
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </p>
                ) : null}
                {occupationPriceSentence ? (
                  <p>
                    {occupationPriceSentence.lead}
                    <strong>{occupationPriceSentence.adjustedPay}</strong>
                    {occupationPriceSentence.tail}
                  </p>
                ) : null}
                {metrics.inStateShare !== undefined ? (
                  <Note>{`The share of graduates working in ${placeInSentence(school.stateName)} is approximate, because the government adjusts these counts slightly to protect privacy.`}</Note>
                ) : null}
              </PageSection>
            ) : null}

            {jobs.length > 0 ? (
              <PageSection name="careers" title={careersTitle(page)}>
                <p>{careersIntro(page, jobs.every((job) => job.stateMedianPay !== undefined))}</p>
                <Card size="sm" className="gap-0 py-0">
                  {jobs.map((job) => (
                    <JobRow key={job.socCode} job={job} areaName={school.stateName} scale={payRangeScale(jobs)} />
                  ))}
                </Card>
              </PageSection>
            ) : null}

            <PageSection name="school" title={`About ${school.shortName}`}>
              {schoolFacts.length > 0 ? (
                <Card size="sm" className="py-0">
                  <Table>
                    <TableBody className="tabular-nums">
                      {schoolFacts.map((fact) => (
                        <FactRow key={fact.label} label={fact.label} value={fact.value} />
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ) : null}
              <p>
                {buildSchoolRankSentence(page)}
                {schoolPrograms ? (
                  <>
                    {' '}
                    {schoolPrograms.lead}{' '}
                    {schoolPrograms.programs.map((topProgram, index) => (
                      <span key={topProgram.name}>
                        {index === 0 ? '' : index === schoolPrograms.programs.length - 1 ? ' and ' : ', '}
                        {topProgram.href ? (
                          <ProgramLink href={topProgram.href} className="text-primary underline underline-offset-3">{topProgram.name}</ProgramLink>
                        ) : (
                          topProgram.name
                        )}{' '}
                        ({formatMoney(topProgram.earningsYear1)})
                      </span>
                    ))}
                    .
                  </>
                ) : null}
              </p>
            </PageSection>

            {page.nearby.length > 1 ? (
              <PageSection name="nearby" title={`Other ${programLower} ${credentialLower} programs near ${school.city}`}>
                <Card size="sm" className="py-0">
                  <Table role="table" className={STACKED.table}>
                    <TableHeader role="rowgroup" className={STACKED.group}>
                      <TableRow role="row" className={STACKED.row}>
                        <TableHead role="columnheader" className={cn('px-4', STACKED.nameHead)}>School</TableHead>
                        <TableHead role="columnheader" className={cn('px-4 text-right', STACKED.head)}>Distance</TableHead>
                        <TableHead role="columnheader" className={cn('px-4 text-right', STACKED.head)}>Year 1 pay</TableHead>
                        <TableHead role="columnheader" className={cn('px-4 text-right', STACKED.head)}>Debt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody role="rowgroup" className={cn('tabular-nums', STACKED.group)}>
                      {page.nearby.map((nearbyProgram) => (
                        <TableRow
                          key={nearbyProgram.href ?? nearbyProgram.schoolName}
                          role="row"
                          className={cn(STACKED.row, nearbyProgram.isCurrent && 'bg-primary/8 font-semibold')}
                        >
                          <TableCell role="cell" className={cn('px-4 py-2.5 whitespace-normal', STACKED.name)}>
                            <span data-name="">
                              {nearbyProgram.href ? (
                                <ProgramLink href={nearbyProgram.href} className="text-primary underline underline-offset-3">{nearbyProgram.schoolName}</ProgramLink>
                              ) : (
                                nearbyProgram.schoolName
                              )}
                            </span>
                            <span data-name="" className="block text-sm font-normal text-muted-foreground">
                              {nearbyProgram.city}, {nearbyProgram.state} · {nearbyProgram.control.toLowerCase()}
                            </span>
                          </TableCell>
                          <TableCell role="cell" className={cn('px-4 py-2.5 text-right align-top text-muted-foreground', STACKED.figure)}>
                            {nearbyProgram.isCurrent ? '' : formatMiles(nearbyProgram.milesAway)}
                          </TableCell>
                          <TableCell role="cell" className={cn('px-4 py-2.5 text-right align-top', STACKED.figure)}>{formatMoney(nearbyProgram.earningsYear1)}</TableCell>
                          <TableCell role="cell" className={cn('px-4 py-2.5 text-right align-top', STACKED.figure)}>{formatMoney(nearbyProgram.medianDebt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </PageSection>
            ) : null}

            <PageSection name="faq" title="Common questions">
              <QuestionList name="faq" questions={faq} openFirst />
            </PageSection>
          </MainColumn>

          <RelatedPages side>
            <RelatedRankingLink
              href={page.stateRankingHref}
              title={`${program.name} ${credentialLower} programs in ${placeInSentence(school.stateName)}, ranked`}
              detail={`${formatCount(benchmarks.state.earningsYear1Count)} programs by pay and debt`}
            />
            <RelatedNationalLink
              href={`/programs/${page.programSlug}`}
              title={`${program.name} ${credentialLower} programs in the US, ranked`}
              detail={`${formatCount(benchmarks.national.earningsYear1Count)} programs by pay and debt`}
            />
            {hasSchoolPage(page.schoolProgramTotal) ? (
              <RelatedSchoolLink
                schoolSlug={page.schoolSlug}
                title={`All ${school.shortName} programs, ranked`}
                detail={`${formatCount(page.schoolProgramTotal)} programs by pay and debt`}
              />
            ) : null}
          </RelatedPages>

          <MainColumn>
            <PageSection name="about-data" title="About this data">
              <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
                <li>{officialProgramFieldSentence(program)}</li>
                <li>Pay and debt only include students who received federal financial aid (grants or loans).</li>
                <li>Pay only counts graduates who were working and not enrolled in more school. Graduates who went straight to further study are not included.</li>
                <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
                <li>{payPrivacyNote()}</li>
                {combinedCampusesNotes(school.stateName).map((note) => (
                  <li key={note}>{note}</li>
                ))}
                <li>College Scorecard figures describe graduating classes from several years ago. Bureau of Labor Statistics wages are from May 2025.</li>
                <li>School-level numbers like tuition, admission rate and graduation rate are for the whole school, not the {programLower} program.</li>
              </ul>
              <h3 className="text-base font-bold">Sources</h3>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
                <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
                <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
                <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
                <li>Bureau of Economic Analysis, Regional Price Parities, 2024</li>
                <li>NCES, CIP 2020 to SOC 2018 crosswalk, and IPEDS institution directory, 2024</li>
              </ol>
            </PageSection>
          </MainColumn>
        </PageColumns>
      </main>
      <SiteFooter wide />
    </div>
  )
}

function buildSchoolFacts(page: ProgramPage) {
  const { school } = page
  const facts: { label: string; value: string }[] = []
  if (school.reportsByProgram) {
    // Whole-program figures for the school's largest program, not yearly ones.
    if (school.programTuition !== undefined) {
      facts.push({ label: "Tuition and fees for the school's largest program", value: formatMoney(school.programTuition) })
    }
    if (school.averageNetPrice !== undefined) {
      facts.push({ label: 'Average net price after aid, largest program', value: formatMoney(school.averageNetPrice) })
    }
  } else {
    if (school.inStateTuition !== undefined && school.inStateTuition === school.outOfStateTuition) {
      facts.push({ label: 'Tuition and fees', value: `${formatMoney(school.inStateTuition)} a year` })
    } else {
      // Scorecard's figure is the in-district rate, which is lower than the
      // in-state rate at schools with district pricing (many community colleges).
      const localLabel = school.hasDistrictTuition ? 'In-district tuition and fees' : 'In-state tuition and fees'
      if (school.inStateTuition !== undefined) facts.push({ label: localLabel, value: `${formatMoney(school.inStateTuition)} a year` })
      if (school.outOfStateTuition !== undefined) facts.push({ label: 'Out-of-state tuition and fees', value: `${formatMoney(school.outOfStateTuition)} a year` })
    }
    if (school.averageNetPrice !== undefined) facts.push({ label: 'Average net price after aid', value: `${formatMoney(school.averageNetPrice)} a year` })
  }
  if (school.admissionRate !== undefined) facts.push({ label: 'Admission rate', value: formatShare(school.admissionRate) })
  if (school.graduationRate !== undefined) {
    // The rate counts first-time, full-time students who finish within 150% of
    // the normal time, which is six years only where the school mostly awards
    // bachelor's degrees.
    const timeSpan = school.graduationRate.withinSixYears ? 'within 6 years' : 'within 1.5 times the normal program length'
    facts.push({
      label: `Graduation rate of first-time, full-time students (${timeSpan})`,
      value: formatShare(school.graduationRate.rate),
    })
  }
  if (school.undergraduates !== undefined) facts.push({ label: 'Undergraduate students', value: formatCount(school.undergraduates) })
  return facts
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <TableRow role="row" className={STACKED.compareRow}>
      <TableCell role="cell" className={cn('px-4 py-2.5 whitespace-normal', STACKED.name)}>{label}</TableCell>
      {values.map((value, index) => (
        <TableCell key={index} role="cell" className={cn('px-4 py-2.5 text-right', index === 0 && 'font-bold', STACKED.figure)}>
          {value}
        </TableCell>
      ))}
    </TableRow>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <TableRow>
      <TableCell className="px-4 py-2.5 whitespace-normal">{label}</TableCell>
      <TableCell className="px-4 py-2.5 text-right">{value}</TableCell>
    </TableRow>
  )
}

// One figure with a line of context, as in the family income section.
function SmallStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card size="sm" className="gap-0.5 px-4">
      <span className="text-sm leading-snug font-semibold text-neutral-700">{label}</span>
      <span className="text-2xl font-extrabold tabular-nums">{value}</span>
      {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
    </Card>
  )
}
