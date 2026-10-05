import type { ReactNode } from 'react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DebtEarningsScatter } from '@/components/program/debt-earnings-scatter'
import { EarningsBars } from '@/components/program/earnings-bars'
import { ProgramHeader } from '@/components/program/program-header'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getProgramPage } from '@/data/programs'
import { formatCount, formatMoney, formatShare } from '@/lib/format'
import {
  buildFamilyIncomeSentence,
  buildFaq,
  buildFiveYearSentence,
  buildMetaDescription,
  buildPageTitle,
  buildSummary,
  computeMetrics,
  ordinal,
} from '@/lib/program-copy'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/schools/$schoolSlug/$programSlug')({
  loader: ({ params }) => {
    const page = getProgramPage(params.schoolSlug, params.programSlug)
    if (!page) throw notFound()
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

function ProgramPageView() {
  const { page, metrics, faq } = Route.useLoaderData()
  const { school, program, earnings, debt, ranks, benchmarks, occupationPay } = page
  const programLower = program.name.toLowerCase()
  const registeredNurse = page.occupations[0]

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main>
        <ProgramHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Card className="mt-7">
            <CardContent className="gap-2.5">
              <p className="text-xs font-bold tracking-widest text-primary uppercase">The short answer</p>
              <p className="max-w-[64ch] text-lg leading-relaxed">{buildSummary(page)}</p>
            </CardContent>
          </Card>

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border md:grid-cols-4">
            <KeyFigure
              label="First-year earnings"
              value={formatMoney(earnings.year1)}
              context={`${ordinal(ranks.nationalEarningsPercentile)} percentile of ${formatCount(benchmarks.national.programCount)} programs nationally`}
            />
            <KeyFigure
              label="Earnings after 5 years"
              value={formatMoney(earnings.year5)}
              context={`${formatShare(metrics.year5Growth)} more than year one`}
            />
            <KeyFigure
              label="Median federal debt"
              value={formatMoney(debt.median)}
              context={`${ordinal(ranks.stateDebtRank)} lowest of ${ranks.stateProgramsWithBoth} ${school.stateName} programs`}
            />
            <KeyFigure
              label="Debt-to-earnings"
              value={formatShare(metrics.debtToEarnings)}
              context={`${school.stateName} median ${formatShare(benchmarks.state.debtToEarnings)}, national ${formatShare(benchmarks.national.debtToEarnings)}`}
            />
          </div>

          <Section title="How it compares">
            <p>
              Each figure is the median for graduates of the program. The {school.stateName} and national
              columns are the medians across all {programLower} {program.credential.toLowerCase()} programs
              that report the figure.
            </p>
            <Card size="sm" className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4" />
                    <TableHead className="px-4 text-right">{school.shortName}</TableHead>
                    <TableHead className="px-4 text-right">{school.stateName}</TableHead>
                    <TableHead className="px-4 text-right">National</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  <CompareRow label="Earnings, 1 year after graduating" values={[earnings.year1, benchmarks.state.earningsYear1, benchmarks.national.earningsYear1].map(formatMoney)} />
                  <CompareRow label="Earnings, 5 years after graduating" values={[earnings.year5, benchmarks.state.earningsYear5, benchmarks.national.earningsYear5].map(formatMoney)} />
                  <CompareRow label="Median federal debt at graduation" values={[debt.median, benchmarks.state.medianDebt, benchmarks.national.medianDebt].map(formatMoney)} />
                  <CompareRow label="Debt as share of first-year pay" values={[metrics.debtToEarnings, benchmarks.state.debtToEarnings, benchmarks.national.debtToEarnings].map(formatShare)} />
                  <CompareRow label="Programs compared" values={['', formatCount(benchmarks.state.programCount), formatCount(benchmarks.national.programCount)]} />
                </TableBody>
              </Table>
            </Card>
            <p>{buildFiveYearSentence(page, metrics)}</p>
          </Section>

          <Section title={`Debt and first-year pay at every ${school.stateName} ${programLower} program`}>
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
                <DebtEarningsScatter
                  programs={page.stateComparison}
                  medianDebt={benchmarks.state.medianDebt}
                  medianEarnings={benchmarks.state.earningsYear1}
                  stateName={school.stateName}
                />
              </CardContent>
            </Card>
            <Note>Hover a dot to see the school. Only programs that report both earnings and debt are shown.</Note>
          </Section>

          <Section title="What graduates earn over time">
            <p>
              Pay rises about {formatShare(metrics.year5Growth)} between the first and fifth year. Experienced
              registered nurses in {school.stateName} earn more, which shows how much room there is to grow
              after the first few years.
            </p>
            <Card size="sm">
              <CardContent>
                <EarningsBars
                  bars={[
                    { label: `${school.shortName} grads`, detail: 'year 1', amount: earnings.year1, highlight: true },
                    { label: `${school.shortName} grads`, detail: 'year 5', amount: earnings.year5, highlight: true },
                    { label: `All ${school.stateName} ${programLower} grads`, detail: 'year 5', amount: benchmarks.state.earningsYear5 },
                    { label: `All registered nurses in ${school.stateName}`, amount: occupationPay.stateMedian },
                    { label: `Registered nurses in ${occupationPay.metroName}`, amount: occupationPay.metroMedian },
                  ]}
                />
              </CardContent>
            </Card>
            <Note>
              Year 1 and year 5 figures come from different graduating classes, so the growth rate is an
              estimate. BLS figures cover nurses at every experience level.
            </Note>
          </Section>

          <Section title="Does family income change the outcome?">
            <p>{buildFamilyIncomeSentence(page)}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <SmallStat label="Pell Grant recipients, year 1 earnings" value={formatMoney(earnings.pellYear1)} note={`Median debt ${formatMoney(debt.pellMedian)}`} />
              <SmallStat label="Other graduates, year 1 earnings" value={formatMoney(earnings.otherYear1)} note={`Median debt ${formatMoney(debt.otherMedian)}`} />
            </div>
          </Section>

          <Section title="Paying back the loans">
            <p>
              On a standard 10-year plan, the median debt means a payment of about{' '}
              <strong>{formatMoney(debt.monthlyPayment)} a month</strong>, or{' '}
              <strong>{(metrics.paymentShareOfPay * 100).toFixed(1)}%</strong> of a graduate's typical monthly
              pay in the first year.
            </p>
            <Card size="sm" className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Two years into repayment ({formatCount(page.repayment.borrowers)} borrowers)</TableHead>
                    <TableHead className="px-4 text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.repayment.rows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="px-4 py-2.5">{row.label}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right tabular-nums">{row.share}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Note>
              The government publishes these as ranges to protect privacy. Separately,{' '}
              {formatCount(debt.parentPlusBorrowers)} parents took out Parent PLUS loans for these students, with
              a median of {formatMoney(debt.parentPlusMedian)}.
            </Note>
          </Section>

          <Section title="Where graduates work, and what the pay is worth">
            <p>
              <strong>{formatShare(metrics.inStateShare)} of graduates</strong> ({formatCount(earnings.workingInStateCount)} of{' '}
              {formatCount(earnings.workingCount)}) were working in {school.stateName} one year after graduating.
              Prices in the {page.priceLevels.areaName} are about {formatShare(metrics.areaPriceGap)} below the
              national average, so a {formatMoney(earnings.year1)} salary here buys what about{' '}
              <strong>{formatMoney(metrics.adjustedYear1)}</strong> buys in a typical US city.
            </p>
            <p>
              The median {school.stateName} RN earns {formatMoney(occupationPay.stateMedian)}, compared with a
              national median of {formatMoney(occupationPay.nationalMedian)}. After adjusting for{' '}
              {school.stateName} prices, that pay is worth about{' '}
              <strong>{formatMoney(metrics.adjustedStateOccupationPay)}</strong>
              {metrics.adjustedStateOccupationPay > occupationPay.nationalMedian
                ? `, which puts ${school.stateName} slightly ahead.`
                : '.'}
            </p>
          </Section>

          <Section title="Careers this degree leads to">
            <p>Most graduates become registered nurses. With a graduate degree, two higher-paying paths open up.</p>
            <Card size="sm" className="gap-0 py-0">
              {page.occupations.map((occupation) => (
                <div key={occupation.title} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b px-4 py-4 last:border-b-0">
                  <h3 className="text-base font-bold">{occupation.title}</h3>
                  <span className="text-right text-xl font-extrabold tabular-nums">{formatMoney(occupation.stateMedianPay)}</span>
                  <p className="col-span-2 text-sm text-muted-foreground">
                    Median pay in {school.stateName}.{' '}
                    {occupation === registeredNurse && occupation.stateEmployment
                      ? `${formatCount(occupation.stateEmployment)} people work as RNs in ${school.stateName}. Nationally, jobs are projected to grow ${formatShare(occupationPay.growthShare)} from ${occupationPay.growthPeriod}, with about ${formatCount(occupationPay.openingsPerYear)} openings a year.`
                      : occupation.requirement}
                  </p>
                  {occupation.stateP10Pay && occupation.stateP90Pay ? (
                    <PayRange low={occupation.stateP10Pay} middle={occupation.stateMedianPay} high={occupation.stateP90Pay} />
                  ) : null}
                </div>
              ))}
            </Card>
          </Section>

          <Section title={`About ${school.shortName}`}>
            <Card size="sm" className="py-0">
              <Table>
                <TableBody className="tabular-nums">
                  <FactRow label="In-state tuition and fees" value={`${formatMoney(school.inStateTuition)} / year`} />
                  <FactRow label="Out-of-state tuition and fees" value={`${formatMoney(school.outOfStateTuition)} / year`} />
                  <FactRow label="Average net price after aid" value={`${formatMoney(school.averageNetPrice)} / year`} />
                  <FactRow label="Admission rate" value={formatShare(school.admissionRate)} />
                  <FactRow label="Graduation rate (within 6 years)" value={formatShare(school.graduationRate)} />
                  <FactRow label="Undergraduate students" value={formatCount(school.undergraduates)} />
                </TableBody>
              </Table>
            </Card>
            <p>
              {program.name} ranks <strong>{ordinal(ranks.schoolEarningsRank)} of {ranks.schoolProgramCount}</strong>{' '}
              {program.credential.toLowerCase()} programs at {school.shortName} by first-year earnings. The top three are{' '}
              {page.topSchoolPrograms
                .map((topProgram) => `${topProgram.name} (${formatMoney(topProgram.earningsYear1)})`)
                .join(', ')
                .replace(/, ([^,]*)$/, ', and $1')}
              .
            </p>
          </Section>

          <Section title={`Other ${programLower} ${program.credential.toLowerCase()} programs near ${school.city}`}>
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
                    <TableRow key={nearbyProgram.schoolName} className={cn(nearbyProgram.isCurrent && 'bg-primary/8 font-semibold')}>
                      <TableCell className="px-4 py-2.5 whitespace-normal">
                        {nearbyProgram.isCurrent ? (
                          nearbyProgram.schoolName
                        ) : (
                          <Link to="/" className="text-primary underline underline-offset-3">{nearbyProgram.schoolName}</Link>
                        )}
                        <span className="block text-[13px] font-normal text-muted-foreground">
                          {nearbyProgram.city} · {nearbyProgram.control.toLowerCase()}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right align-top text-muted-foreground">
                        {nearbyProgram.isCurrent ? '' : `${nearbyProgram.milesAway} mi`}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right align-top">{formatMoney(nearbyProgram.earningsYear1)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right align-top">{formatMoney(nearbyProgram.medianDebt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            {page.nearbyNote ? <Note>{page.nearbyNote}</Note> : null}
          </Section>

          <Section title="Common questions">
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

          <Section title="About this data">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              <li>Earnings and debt only include students who received federal financial aid (grants or loans).</li>
              <li>Earnings only count graduates who were working and not enrolled in more school. Graduates who went straight to a master's program are not included.</li>
              <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
              <li>Some schools with several campuses report one combined figure for all of them. We count each of those schools once, and leave them out of {school.stateName} comparisons when their main campus is in another state.</li>
              <li>Scorecard figures describe graduating classes from several years ago. BLS wages are from May 2025.</li>
              <li>School-level numbers like tuition, admission rate, and graduation rate are for the whole university, not the {programLower} program.</li>
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
              <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
              <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
              <li>Bureau of Economic Analysis, Regional Price Parities, 2024</li>
              <li>NCES and BLS, CIP to SOC crosswalk</li>
            </ol>
          </Section>

          <Section title="Related pages">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <RelatedLink title={`${program.name} ${program.credential.toLowerCase()} programs in ${school.stateName}, ranked`} detail={`${benchmarks.state.programCount} programs by pay, debt, and value`} />
              <RelatedLink title={`${program.name} ${program.credential.toLowerCase()} degrees nationwide`} detail={`${formatCount(benchmarks.national.programCount)} programs compared`} />
              <RelatedLink title={`All ${school.shortName} programs by earnings`} detail={`${ranks.schoolProgramCount} ${program.credential.toLowerCase()} programs`} />
              <RelatedLink title="Which degrees lead to registered nursing?" detail="Programs, pay, and job growth" />
            </div>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-13 flex flex-col gap-3.5 [&>p]:max-w-[66ch]">
      <h2 className="text-[23px] leading-tight font-bold tracking-tight text-balance">{title}</h2>
      {children}
    </section>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-[66ch] text-sm text-muted-foreground">{children}</p>
}

function KeyFigure({ label, value, context }: { label: string; value: string; context: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 pt-4 pb-4.5">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <span className="text-[28px] leading-tight font-extrabold tracking-tight tabular-nums">{value}</span>
      <span className="text-[13px] leading-snug text-muted-foreground">{context}</span>
    </div>
  )
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
      <TableCell className="px-4 py-2.5">{label}</TableCell>
      <TableCell className="px-4 py-2.5 text-right">{value}</TableCell>
    </TableRow>
  )
}

function SmallStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card size="sm" className="gap-0.5 px-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[22px] font-extrabold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </Card>
  )
}

function PayRange({ low, middle, high }: { low: number; middle: number; high: number }) {
  // Fixed scale from $50k to $150k so ranges on different pages read the same way.
  const scaleMin = 50000
  const scaleMax = 150000
  const position = (amount: number) => ((amount - scaleMin) / (scaleMax - scaleMin)) * 100
  return (
    <div className="col-span-2 mt-2" aria-label={`Pay range: bottom 10% ${formatMoney(low)}, median ${formatMoney(middle)}, top 10% ${formatMoney(high)}`}>
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 rounded-full border border-primary bg-primary/15"
          style={{ left: `${position(low)}%`, right: `${100 - position(high)}%` }}
        />
        <div className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full bg-primary" style={{ left: `${position(middle)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>Bottom 10%: {formatMoney(low)}</span>
        <span>Top 10%: {formatMoney(high)}</span>
      </div>
    </div>
  )
}

function RelatedLink({ title, detail }: { title: string; detail: string }) {
  return (
    <Link to="/" className="block rounded-lg bg-card px-3.5 py-3 text-[15px] leading-snug font-semibold ring-1 ring-foreground/10 hover:ring-primary">
      {title}
      <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">{detail}</span>
    </Link>
  )
}
