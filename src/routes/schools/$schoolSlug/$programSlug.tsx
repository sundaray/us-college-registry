import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DebtEarningsScatter } from '@/components/program/debt-earnings-scatter'
import { EarningsBars } from '@/components/program/earnings-bars'
import { ProgramHeader } from '@/components/program/program-header'
import { ProgramLink } from '@/components/program/program-link'
import { RelatedRankingLink } from '@/components/hub/state-program-link'
import { RelatedSchoolLink } from '@/components/school/school-link'
import { RelatedNationalLink } from '@/components/national/national-program-link'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getProgramPage } from '@/data/get-program-page'
import type { OccupationOutlook, ProgramPage, RepaymentStatus } from '@/data/program-page'
import { hasSchoolPage } from '@/data/school-page'
import { formatCount, formatMiles, formatMoney, formatShare, formatShareRange, roundedPercent } from '@/lib/format'
import {
  buildFamilyIncomeSentence,
  buildFaq,
  buildFiveYearSentence,
  buildGrowthSentence,
  buildMetaDescription,
  buildOccupationPriceSentence,
  buildPageTitle,
  buildPriceSentence,
  buildSchoolRankSentence,
  buildSummary,
  capitalize,
  computeMetrics,
  nationalPercentileLabel,
  rankLowest,
  schoolProgramsToList,
  year5ChangeLabel,
} from '@/lib/program-copy'
import { comparisonNote } from '@/lib/field-notes'
import { cn } from '@/lib/utils'
import { KeyFigure, Note, OccupationRow, payRangeScale, Section } from '@/components/page-sections'

export const Route = createFileRoute('/schools/$schoolSlug/$programSlug')({
  loader: async ({ params }) => {
    const page = await getProgramPage({ data: params })
    const metrics = computeMetrics(page)
    return { page, metrics, faq: buildFaq(page, metrics) }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { page, faq } = loaderData
    return {
      meta: [
        { title: buildPageTitle(page) },
        { name: 'description', content: buildMetaDescription(page) },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faq.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: item.answer },
            })),
          }),
        },
      ],
    }
  },
  component: ProgramPageView,
})

const REPAYMENT_LABELS: Record<RepaymentStatus, string> = {
  paidInFull: 'Paid off in full',
  makingProgress: 'Paying down the balance',
  forbearance: 'Paused payments (forbearance)',
  default: 'In default',
}

function ProgramPageView() {
  const { page, metrics, faq } = Route.useLoaderData()
  const { school, program, earnings, debt, ranks, benchmarks } = page
  const programLower = program.sentenceName
  const credentialLower = program.credential.toLowerCase()
  const fiveYearSentence = buildFiveYearSentence(page, metrics)
  const familyIncomeSentence = buildFamilyIncomeSentence(page)
  const growthSentence = buildGrowthSentence(page, metrics)
  const priceSentence = buildPriceSentence(page, metrics)
  const occupationPriceSentence = buildOccupationPriceSentence(page, metrics)
  const hasYear5 = earnings.year5 !== undefined && metrics.year5Growth !== undefined
  const careers = page.occupations.filter(
    (occupation) => occupation.stateMedianPay !== undefined || occupation.nationalMedianPay !== undefined,
  )
  const schoolFacts = buildSchoolFacts(page)
  const schoolPrograms = schoolProgramsToList(page)

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      {/* data-* attributes let scripts/verify find the program and each section. */}
      <main
        data-unit-id={school.unitId}
        data-cip={program.cipCode}
        data-credential-level={program.credentialLevel}
        data-school-name={school.shortName}
      >
        <ProgramHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Card className="mt-7" data-section="summary">
            <CardContent className="gap-2.5">
              <p className="text-xs font-bold tracking-widest text-primary uppercase">The short answer</p>
              <p className="max-w-[64ch] text-lg leading-relaxed">{buildSummary(page)}</p>
            </CardContent>
          </Card>

          <div
            data-section="key-figures"
            className={cn(
              'mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border',
              hasYear5 ? 'md:grid-cols-4' : 'md:grid-cols-3',
            )}
          >
            <KeyFigure label="First-year earnings" value={formatMoney(earnings.year1)} context={nationalPercentileLabel(page)} />
            {hasYear5 ? (
              <KeyFigure
                label="Earnings after 5 years"
                value={formatMoney(earnings.year5!)}
                context={year5ChangeLabel(metrics.year5Growth!)}
              />
            ) : null}
            <KeyFigure
              label="Median federal debt"
              value={formatMoney(debt.median)}
              context={`${capitalize(rankLowest(ranks.stateDebtRank, ranks.stateProgramsWithBoth))} ${school.stateName} programs`}
            />
            <KeyFigure
              label="Debt-to-earnings"
              value={formatShare(metrics.debtToEarnings)}
              context={`${school.stateName} median ${formatShare(benchmarks.state.debtToEarnings)}, national ${formatShare(benchmarks.national.debtToEarnings)}`}
            />
          </div>

          <Section name="compare" title="How it compares">
            <p>
              Each figure is the median for graduates of the program. The {school.stateName} and national
              columns are the medians across all {programLower} {credentialLower} programs that report the
              figure.
            </p>
            <Card size="sm" className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4" />
                    <TableHead className="px-4 text-right whitespace-normal">{school.shortName}</TableHead>
                    <TableHead className="px-4 text-right whitespace-normal">{school.stateName}</TableHead>
                    <TableHead className="px-4 text-right">National</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  <CompareRow label="Earnings, 1 year after graduating" values={[earnings.year1, benchmarks.state.earningsYear1, benchmarks.national.earningsYear1].map(formatMoney)} />
                  {hasYear5 && benchmarks.state.earningsYear5 !== undefined && benchmarks.national.earningsYear5 !== undefined ? (
                    <CompareRow label="Earnings, 5 years after graduating" values={[earnings.year5!, benchmarks.state.earningsYear5, benchmarks.national.earningsYear5].map(formatMoney)} />
                  ) : null}
                  <CompareRow label="Median federal debt at graduation" values={[debt.median, benchmarks.state.medianDebt, benchmarks.national.medianDebt].map(formatMoney)} />
                  <CompareRow label="Debt as share of first-year pay" values={[metrics.debtToEarnings, benchmarks.state.debtToEarnings, benchmarks.national.debtToEarnings].map(formatShare)} />
                  <CompareRow label="Programs compared" values={['', formatCount(benchmarks.state.earningsYear1Count), formatCount(benchmarks.national.earningsYear1Count)]} />
                </TableBody>
              </Table>
            </Card>
            {fiveYearSentence ? <p>{fiveYearSentence}</p> : null}
          </Section>

          <Section name="scatter" title={`Debt and first-year pay at every ${school.stateName} ${programLower} program`}>
            <p>
              Programs in the upper left give graduates higher pay for less debt. Dashed lines mark the{' '}
              {school.stateName} medians.
            </p>
            <Card size="sm">
              <CardContent>
                <div className="flex flex-wrap gap-4 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" />{school.shortName}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/45" />Other {school.stateName} programs</span>
                </div>
                {/* Keeps axis labels readable on phones: below 560px the chart scrolls
                    sideways in a ScrollArea instead of shrinking. */}
                <ScrollArea data-slot="chart-scroll-area" className="w-full">
                  <div className="min-w-[560px] pb-3">
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
            <Note>Hover over or tap a dot to see the school. Only programs that report both earnings and debt are shown.</Note>
            {comparisonNote(program.cipCode, program.credentialLevel) ? (
              <Note>{comparisonNote(program.cipCode, program.credentialLevel)}</Note>
            ) : null}
          </Section>

          {hasYear5 && growthSentence ? (
            <Section name="over-time" title="What graduates earn over time">
              <p>{growthSentence}</p>
              <Card size="sm">
                <CardContent>
                  <EarningsBars
                    bars={[
                      { label: `${school.shortName} grads`, detail: 'year\u00a01', amount: earnings.year1, highlight: true },
                      { label: `${school.shortName} grads`, detail: 'year\u00a05', amount: earnings.year5!, highlight: true },
                      ...(benchmarks.state.earningsYear5 !== undefined
                        ? [{ label: `All ${school.stateName} ${programLower} grads`, detail: 'year\u00a05', amount: benchmarks.state.earningsYear5 }]
                        : []),
                      ...(page.matchingOccupation
                        ? [{ label: `All ${page.matchingOccupation.pluralName} in ${school.stateName}`, amount: page.matchingOccupation.stateMedianPay }]
                        : []),
                      ...(page.matchingOccupation?.metroMedianPay !== undefined
                        ? [{ label: `${capitalize(page.matchingOccupation.pluralName)} in ${page.matchingOccupation.metroName}`, amount: page.matchingOccupation.metroMedianPay }]
                        : []),
                    ]}
                  />
                </CardContent>
              </Card>
              <Note>
                Year 1 and year 5 figures come from different graduating classes, so the growth rate is an
                estimate.
                {page.matchingOccupation ? ` BLS figures cover ${page.matchingOccupation.pluralName} at every experience level.` : ''}
              </Note>
            </Section>
          ) : null}

          {familyIncomeSentence ? (
            <Section name="family-income" title="Does family income change the outcome?">
              <p>{familyIncomeSentence}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SmallStat
                  label="Pell Grant recipients, year 1 earnings"
                  value={formatMoney(earnings.pellYear1!)}
                  note={debt.pellMedian !== undefined ? `Median debt ${formatMoney(debt.pellMedian)}` : undefined}
                />
                <SmallStat
                  label="Other graduates, year 1 earnings"
                  value={formatMoney(earnings.otherYear1!)}
                  note={debt.otherMedian !== undefined ? `Median debt ${formatMoney(debt.otherMedian)}` : undefined}
                />
              </div>
            </Section>
          ) : null}

          {debt.monthlyPayment !== undefined && metrics.paymentShareOfPay !== undefined ? (
            <Section name="repayment" title="Paying back the loans">
              <p>
                On a standard 10-year plan, the median debt means a payment of about{' '}
                <strong>{formatMoney(debt.monthlyPayment)} a month</strong>, or{' '}
                <strong>{(metrics.paymentShareOfPay * 100).toFixed(1)}%</strong> of a graduate's typical monthly
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
                          <TableCell className="px-4 py-2.5">{REPAYMENT_LABELS[row.status]}</TableCell>
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
                  partly during the pandemic pause on federal loan payments, so the forbearance share may be higher
                  than usual.
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
            </Section>
          ) : null}

          {metrics.inStateShare !== undefined || priceSentence || occupationPriceSentence ? (
            <Section name="work" title="Where graduates work, and what the pay is worth">
              {metrics.inStateShare !== undefined || priceSentence ? (
                <p>
                  {metrics.inStateShare !== undefined ? (
                    <>
                      <strong>{formatShare(metrics.inStateShare)} of graduates</strong> ({formatCount(earnings.workingInStateCount!)} of{' '}
                      {formatCount(earnings.workingCount!)}) were working in {school.stateName} one year after graduating.
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
            </Section>
          ) : null}

          {careers.length > 0 ? (
            <Section name="careers" title="Careers this field leads to">
              <p>
                These are the jobs that the federal crosswalk from fields of study to occupations links to{' '}
                {programLower}, largest first. Pay is the median across all experience levels.
              </p>
              <Card size="sm" className="gap-0 py-0">
                {careers.map((occupation) => (
                  <OccupationRow key={occupation.socCode} occupation={occupation} stateName={school.stateName} scale={payRangeScale(careers)} />
                ))}
              </Card>
            </Section>
          ) : null}

          <Section name="school" title={`About ${school.shortName}`}>
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
                      {index > 0
                        ? index === schoolPrograms.programs.length - 1
                          ? schoolPrograms.programs.length === 2 ? ' and ' : ', and '
                          : ', '
                        : ''}
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
          </Section>

          {page.nearby.length > 1 ? (
            <Section name="nearby" title={`Other ${programLower} ${credentialLower} programs near ${school.city}`}>
              <Card size="sm" className="py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4">School</TableHead>
                      <TableHead className="px-4 text-right">Distance</TableHead>
                      <TableHead className="px-4 text-right">Year 1 pay</TableHead>
                      <TableHead className="px-4 text-right">Debt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="tabular-nums">
                    {page.nearby.map((nearbyProgram) => (
                      <TableRow key={nearbyProgram.href ?? nearbyProgram.schoolName} className={cn(nearbyProgram.isCurrent && 'bg-primary/8 font-semibold')}>
                        <TableCell className="px-4 py-2.5 whitespace-normal">
                          <span data-name="">
                            {nearbyProgram.href ? (
                              <ProgramLink href={nearbyProgram.href} className="text-primary underline underline-offset-3">{nearbyProgram.schoolName}</ProgramLink>
                            ) : (
                              nearbyProgram.schoolName
                            )}
                          </span>
                          <span data-name="" className="block text-[13px] font-normal text-muted-foreground">
                            {nearbyProgram.city}, {nearbyProgram.state} · {nearbyProgram.control.toLowerCase()}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right align-top text-muted-foreground">
                          {nearbyProgram.isCurrent ? '' : formatMiles(nearbyProgram.milesAway)}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right align-top">{formatMoney(nearbyProgram.earningsYear1)}</TableCell>
                        <TableCell className="px-4 py-2.5 text-right align-top">{formatMoney(nearbyProgram.medianDebt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </Section>
          ) : null}

          <Section name="faq" title="Common questions">
            <Accordion defaultValue={['faq-0']} hiddenUntilFound className="rounded-xl bg-card px-4 ring-1 ring-foreground/10">
              {faq.map((item, index) => (
                <AccordionItem key={item.question} value={`faq-${index}`}>
                  <AccordionTrigger className="text-[15px] font-semibold">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                    <p>{item.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Section>

          <Section name="about-data" title="About this data">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              <li>Earnings and debt only include students who received federal financial aid (grants or loans).</li>
              <li>Earnings only count graduates who were working and not enrolled in more school. Graduates who went straight to further study are not included.</li>
              <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
              <li>Some schools with several campuses report one combined figure for all of them. We count each of those schools once, and leave them out of {school.stateName} comparisons when their main campus is in another state.</li>
              <li>Scorecard figures describe graduating classes from several years ago. BLS wages are from May 2025.</li>
              <li>School-level numbers like tuition, admission rate, and graduation rate are for the whole school, not the {programLower} program.</li>
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
              <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
              <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
              <li>Bureau of Economic Analysis, Regional Price Parities, 2024</li>
              <li>NCES, CIP 2020 to SOC 2018 crosswalk, and IPEDS institution directory, 2024</li>
            </ol>
          </Section>

          <Section name="related" title="Related pages">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <RelatedRankingLink
                href={page.stateRankingHref}
                title={`${program.name} ${credentialLower} programs in ${school.stateName}, ranked`}
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
            </div>
          </Section>
        </div>
      </main>
      <SiteFooter />
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
      facts.push({ label: "Average net price after aid, largest program", value: formatMoney(school.averageNetPrice) })
    }
  } else {
    if (school.inStateTuition !== undefined && school.inStateTuition === school.outOfStateTuition) {
      facts.push({ label: 'Tuition and fees', value: `${formatMoney(school.inStateTuition)} / year` })
    } else {
      // Scorecard's figure is the in-district rate, which is lower than the
      // in-state rate at schools with district pricing (many community colleges).
      const localLabel = school.hasDistrictTuition ? 'In-district tuition and fees' : 'In-state tuition and fees'
      if (school.inStateTuition !== undefined) facts.push({ label: localLabel, value: `${formatMoney(school.inStateTuition)} / year` })
      if (school.outOfStateTuition !== undefined) facts.push({ label: 'Out-of-state tuition and fees', value: `${formatMoney(school.outOfStateTuition)} / year` })
    }
    if (school.averageNetPrice !== undefined) facts.push({ label: 'Average net price after aid', value: `${formatMoney(school.averageNetPrice)} / year` })
  }
  if (school.admissionRate !== undefined) facts.push({ label: 'Admission rate', value: formatShare(school.admissionRate) })
  if (school.graduationRate !== undefined) {
    facts.push({
      label:
        school.graduationRate.basis === 'fourYear'
          ? 'Graduation rate (within 6 years)'
          : 'Graduation rate (within 1.5 times the normal program length)',
      value: formatShare(school.graduationRate.rate),
    })
  }
  if (school.undergraduates !== undefined) facts.push({ label: 'Undergraduate students', value: formatCount(school.undergraduates) })
  return facts
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <TableRow>
      <TableCell className="px-4 py-2.5 whitespace-normal">{label}</TableCell>
      {values.map((value, index) => (
        <TableCell key={index} className={cn('px-4 py-2.5 text-right', index === 0 && 'font-bold')}>
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

function SmallStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card size="sm" className="gap-0.5 px-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[22px] font-extrabold tabular-nums">{value}</span>
      {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
    </Card>
  )
}
