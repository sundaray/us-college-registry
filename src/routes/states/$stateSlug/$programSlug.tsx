import { createFileRoute } from '@tanstack/react-router'
import { RankingTable } from '@/components/hub/ranking-table'
import { StateProgramHeader } from '@/components/hub/state-program-header'
import { RelatedRankingLink } from '@/components/hub/state-program-link'
import { RelatedNationalLink } from '@/components/national/national-program-link'
import { KeyFigure, Note, OccupationRow, payRangeScale, Section } from '@/components/page-sections'
import { DebtEarningsScatter } from '@/components/program/debt-earnings-scatter'
import { ProgramLink } from '@/components/program/program-link'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { getStateProgramPage } from '@/data/get-state-program-page'
import type { RankedProgram } from '@/data/state-program-page'
import { formatCount, formatMoney, formatShare } from '@/lib/format'
import {
  buildRankingNotes,
  buildStateProgramDescription,
  buildStateProgramFaq,
  buildStateProgramSummary,
  buildStateProgramTitle,
  degreeLabel,
  programKind,
  programsWithDebt,
} from '@/lib/state-program-copy'
import { comparisonNote } from '@/lib/field-notes'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/states/$stateSlug/$programSlug')({
  loader: async ({ params }) => {
    const page = await getStateProgramPage({ data: params })
    return { page, faq: buildStateProgramFaq(page) }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { page, faq } = loaderData
    return {
      meta: [
        { title: buildStateProgramTitle(page) },
        { name: 'description', content: buildStateProgramDescription(page) },
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
  component: StateProgramPageView,
})

const QUICK_PICK_COUNT = 5

function StateProgramPageView() {
  const { page, faq } = Route.useLoaderData()
  const { state, national } = page.benchmarks
  const kind = programKind(page)
  const withDebt = programsWithDebt(page)
  const notes = buildRankingNotes(page)
  const hasYear5 = state.earningsYear5 !== undefined && national.earningsYear5 !== undefined
  const careers = page.occupations.filter(
    (occupation) => occupation.stateMedianPay !== undefined || occupation.nationalMedianPay !== undefined,
  )
  const ratio = (program: RankedProgram) => program.medianDebt! / program.earningsYear1
  const byDebt = [...withDebt].sort((first, second) => first.debtRank! - second.debtRank! || first.payRank - second.payRank)
  const byRatio = [...withDebt].sort((first, second) => first.ratioRank! - second.ratioRank! || first.payRank - second.payRank)

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      {/* data-* attributes let scripts/verify find the field, credential, and state. */}
      <main data-cip={page.program.cipCode} data-credential-level={page.program.credentialLevel} data-state={page.state.code}>
        <StateProgramHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Card className="mt-7" data-section="summary">
            <CardContent className="gap-2.5">
              <p className="text-xs font-bold tracking-widest text-primary uppercase">The short answer</p>
              <p className="max-w-[64ch] text-lg leading-relaxed">{buildStateProgramSummary(page)}</p>
            </CardContent>
          </Card>

          <div
            data-section="key-figures"
            className={cn(
              'mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border',
              hasYear5 ? 'md:grid-cols-4' : 'md:grid-cols-3',
            )}
          >
            <KeyFigure label="Median first-year pay" value={formatMoney(state.earningsYear1)} context={`National ${formatMoney(national.earningsYear1)}`} />
            {hasYear5 ? (
              <KeyFigure label="Median pay after 5 years" value={formatMoney(state.earningsYear5!)} context={`National ${formatMoney(national.earningsYear5!)}`} />
            ) : null}
            <KeyFigure label="Median federal debt" value={formatMoney(state.medianDebt)} context={`National ${formatMoney(national.medianDebt)}`} />
            <KeyFigure label="Debt-to-earnings" value={formatShare(state.debtToEarnings)} context={`National ${formatShare(national.debtToEarnings)}`} />
          </div>

          <Section name="ranking" title={`All ${formatCount(page.programs.length)} programs, ranked`}>
            <p>
              Each figure is the median for the program's graduates. Programs that don't report a figure are
              listed last when you sort by it.
            </p>
            <RankingTable programs={page.programs} />
            {comparisonNote(page.program.cipCode, page.program.credentialLevel) ? (
              <Note>{comparisonNote(page.program.cipCode, page.program.credentialLevel)}</Note>
            ) : null}
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
          </Section>

          <Section name="scatter" title={`Debt and first-year pay at every ${page.state.name} ${page.program.sentenceName} program`}>
            <p>
              Programs in the upper left give graduates higher pay for less debt. Dashed lines mark the{' '}
              {page.state.name} medians.
            </p>
            <Card size="sm">
              <CardContent>
                {/* Below 560px the chart scrolls sideways instead of shrinking. */}
                <ScrollArea data-slot="chart-scroll-area" className="w-full">
                  <div className="min-w-[560px] pb-3">
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
              both earnings and debt are shown.
            </Note>
          </Section>

          <Section name="quick-picks" title="Quick picks">
            <div className="grid gap-3 md:grid-cols-3">
              <QuickPick title="Highest first-year pay" programs={page.programs.slice(0, QUICK_PICK_COUNT)} value={(program) => formatMoney(program.earningsYear1)} />
              <QuickPick title="Lowest median debt" programs={byDebt.slice(0, QUICK_PICK_COUNT)} value={(program) => formatMoney(program.medianDebt!)} />
              <QuickPick title="Lowest debt for the pay" programs={byRatio.slice(0, QUICK_PICK_COUNT)} value={(program) => formatShare(ratio(program))} />
            </div>
            <Note>
              "Debt for the pay" is median debt divided by first-year pay. Only programs that report both figures are
              included.
            </Note>
          </Section>

          {page.matchingJob ? (
            <Section name="careers" title={`What ${page.matchingJob.pluralName} earn in ${page.state.name}`}>
              <p>Pay for {page.matchingJob.pluralName} in {page.state.name}, across all experience levels, from the Bureau of Labor Statistics.</p>
              <Card size="sm" className="gap-0 py-0">
                <OccupationRow occupation={page.matchingJob} stateName={page.state.name} scale={payRangeScale([page.matchingJob])} />
              </Card>
            </Section>
          ) : careers.length > 0 ? (
            <Section name="careers" title="Careers this field leads to">
              <p>
                These are the jobs that the federal crosswalk from fields of study to occupations links to{' '}
                {page.program.sentenceName}, largest first. Pay is the median across all experience levels.
              </p>
              <Card size="sm" className="gap-0 py-0">
                {careers.map((occupation) => (
                  <OccupationRow key={occupation.socCode} occupation={occupation} stateName={page.state.name} scale={payRangeScale(careers)} />
                ))}
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

          <Section name="related" title="Related pages">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <RelatedNationalLink
                href={`/programs/${page.programSlug}`}
                title={`${page.program.name} (${degreeLabel(page)}) programs in the US, ranked`}
                detail={`${formatCount(national.earningsYear1Count)} programs by pay and debt`}
              />
              {page.otherCredentials.map((other) => (
                <RelatedRankingLink key={other.href} href={other.href} title={other.title} detail={`${formatCount(other.programCount)} programs by pay and debt`} />
              ))}
            </div>
          </Section>

          <Section name="about-data" title="About this data">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              <li>Earnings and debt only include students who received federal financial aid, and earnings only count graduates who were working and not enrolled in more school.</li>
              <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
              <li>Some schools with several campuses report one combined figure for all of them. We count each of those schools once, and leave them out of {page.state.name} rankings when their main campus is in another state.</li>
              <li>Medians are across the {kind} programs that report each figure, so the counts differ by figure. Scorecard figures describe graduating classes from several years ago. BLS wages are from May 2025.</li>
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
              <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
              <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
              <li>NCES, CIP 2020 to SOC 2018 crosswalk, and IPEDS institution directory, 2024</li>
            </ol>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function QuickPick({ title, programs, value }: { title: string; programs: RankedProgram[]; value: (program: RankedProgram) => string }) {
  return (
    <Card size="sm" className="gap-2.5 px-4">
      <h3 className="text-[15px] font-bold">{title}</h3>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        {programs.map((program) => (
          <li key={`${program.schoolName}-${program.city}`}>
            <span data-name="" className="block">
              {program.href ? (
                <ProgramLink href={program.href} className="text-primary underline underline-offset-3">{program.schoolName}</ProgramLink>
              ) : (
                program.schoolName
              )}
            </span>
            <span className="block text-[13px] text-muted-foreground tabular-nums">{value(program)}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
