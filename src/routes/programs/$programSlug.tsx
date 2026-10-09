import { createFileRoute } from '@tanstack/react-router'
import { NationalProgramHeader } from '@/components/national/national-program-header'
import { RelatedNationalLink } from '@/components/national/national-program-link'
import { NationalRankingTable } from '@/components/national/national-ranking-table'
import { NationalStateTable } from '@/components/national/national-state-table'
import { KeyFigure, Note, OccupationRow, payRangeScale, Section } from '@/components/page-sections'
import { ProgramLink } from '@/components/program/program-link'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { getNationalProgramPage } from '@/data/get-national-program-page'
import type { NationalPick } from '@/data/national-program-page'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount, formatMoney, formatShare } from '@/lib/format'
import {
  buildNationalDescription,
  buildNationalFaq,
  buildNationalRankingNotes,
  buildNationalSummary,
  buildNationalTitle,
  programKind,
  programLabel,
  unrankedNote,
} from '@/lib/national-program-copy'
import { canonicalLink } from '@/lib/site'
import { cn } from '@/lib/utils'

// BLS figures on this page are for the whole US; the shared OccupationRow names
// the area it describes.
const AREA_NAME = 'the US'

export const Route = createFileRoute('/programs/$programSlug')({
  loader: async ({ params }) => {
    const page = await getNationalProgramPage({ data: params })
    return { page, faq: buildNationalFaq(page) }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { page, faq } = loaderData
    return {
      links: [canonicalLink(`/programs/${params.programSlug}`)],
      meta: [
        { title: buildNationalTitle(page) },
        { name: 'description', content: buildNationalDescription(page) },
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
  component: NationalProgramPageView,
})

function NationalProgramPageView() {
  const { page, faq } = Route.useLoaderData()
  const { national } = page
  const kind = programKind(page)
  const unranked = unrankedNote(page)
  const fieldNote = comparisonNote(page.program.cipCode, page.program.credentialLevel)
  const hasYear5 = national.earningsYear5 !== undefined
  const careers = page.occupations.filter((occupation) => occupation.stateMedianPay !== undefined)
  const across = (programCount: number) => `Across ${formatCount(programCount)} programs`

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      {/* data-* attributes let scripts/verify find the field and credential. */}
      <main data-cip={page.program.cipCode} data-credential-level={page.program.credentialLevel}>
        <NationalProgramHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Card className="mt-7" data-section="summary">
            <CardContent className="gap-2.5">
              <p className="text-xs font-bold tracking-widest text-primary uppercase">The short answer</p>
              <p className="max-w-[64ch] text-lg leading-relaxed">{buildNationalSummary(page)}</p>
            </CardContent>
          </Card>

          <div
            data-section="key-figures"
            className={cn('mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border', hasYear5 ? 'md:grid-cols-4' : 'md:grid-cols-3 [&>:last-child]:col-span-2 md:[&>:last-child]:col-span-1')}
          >
            <KeyFigure label="Median first-year pay" value={formatMoney(national.earningsYear1)} context={across(national.earningsYear1Count)} />
            {hasYear5 ? <KeyFigure label="Median pay after 5 years" value={formatMoney(national.earningsYear5!)} context={across(national.earningsYear5Count)} /> : null}
            <KeyFigure label="Median federal debt" value={formatMoney(national.medianDebt)} context={across(national.medianDebtCount)} />
            <KeyFigure label="Debt-to-earnings" value={formatShare(national.debtToEarnings)} context={across(national.debtToEarningsCount)} />
          </div>

          <Section name="ranking" title={`All ${formatCount(page.ranking.length)} programs, ranked by graduate pay`}>
            <p>
              Each program is ranked by the median pay of its graduates one year after they finished, from College
              Scorecard. This measures what graduates earn, not how good the teaching is. Pay also depends on where
              graduates live and work. Programs that don't report a figure are listed last when you sort by it.
            </p>
            {fieldNote ? <Note>{fieldNote}</Note> : null}
            <NationalRankingTable programs={page.ranking} />
            {buildNationalRankingNotes(page).map((note) => (
              <Note key={note}>{note}</Note>
            ))}
          </Section>

          <Section name="states" title={`${programLabel(page)} programs by state`}>
            <p>
              Each row is the median across the state's {kind} programs. State names link to the full ranking of that
              state's programs.
            </p>
            <NationalStateTable states={page.states} />
            {unranked ? <Note>{unranked}</Note> : null}
          </Section>

          <Section name="quick-picks" title="Quick picks nationwide">
            <div className="grid gap-3 md:grid-cols-2">
              <QuickPick title="Lowest median debt" picks={page.picks.byDebt} value={(pick) => formatMoney(pick.medianDebt)} />
              <QuickPick title="Lowest debt for the pay" picks={page.picks.byDebtForPay} value={(pick) => formatShare(pick.medianDebt / pick.earningsYear1)} />
            </div>
            <Note>
              Only the {formatCount(page.programPageCount)} programs with their own page here are included. "Debt for the
              pay" is median debt divided by first-year pay.
            </Note>
          </Section>

          {page.matchingJob ? (
            <Section name="careers" title={`What ${page.matchingJob.pluralName} earn`}>
              <p>Pay for {page.matchingJob.pluralName} across the US, across all experience levels, from the Bureau of Labor Statistics.</p>
              <Card size="sm" className="gap-0 py-0">
                <OccupationRow occupation={page.matchingJob} stateName={AREA_NAME} scale={payRangeScale([page.matchingJob])} />
              </Card>
            </Section>
          ) : careers.length > 0 ? (
            <Section name="careers" title="Careers this field leads to">
              <p>
                These are the jobs that the federal crosswalk from fields of study to occupations links to{' '}
                {page.program.sentenceName}, largest first. Pay is the median across the US and all experience levels.
              </p>
              <Card size="sm" className="gap-0 py-0">
                {careers.map((occupation) => (
                  <OccupationRow key={occupation.socCode} occupation={occupation} stateName={AREA_NAME} scale={payRangeScale(careers)} />
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

          {page.otherCredentials.length > 0 ? (
            <Section name="related" title="Related pages">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {page.otherCredentials.map((other) => (
                  <RelatedNationalLink key={other.href} href={other.href} title={other.title} detail={`${formatCount(other.programCount)} programs by pay and debt`} />
                ))}
              </div>
            </Section>
          ) : null}

          <Section name="about-data" title="About this data">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              <li>Earnings and debt only include students who received federal financial aid, and earnings only count graduates who were working and not enrolled in more school.</li>
              <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
              <li>Medians are across programs, not students: each program counts once, however many graduates it has.</li>
              <li>National medians include every program in the 50 states, DC, and US territories, including schools that have since closed. Schools with several campuses that report one combined figure are counted once.</li>
              <li>Programs are ranked by College Scorecard median pay one year after graduation. Pay after cost of living uses the price level of the school's state.</li>
              <li>Scorecard figures describe graduating classes from several years ago. BLS wages are from May 2025. Price levels are the Bureau of Economic Analysis Regional Price Parities for 2024.</li>
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
              <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
              <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
              <li>NCES, CIP 2020 to SOC 2018 crosswalk</li>
              <li>Bureau of Economic Analysis, Regional Price Parities, 2024</li>
            </ol>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function QuickPick({ title, picks, value }: { title: string; picks: NationalPick[]; value: (pick: NationalPick) => string }) {
  return (
    <Card size="sm" className="gap-2.5 px-4">
      <h3 className="text-[15px] font-bold">{title}</h3>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        {picks.map((pick) => (
          <li key={pick.href}>
            <span data-name="" className="block">
              <ProgramLink href={pick.href} className="text-primary underline underline-offset-3">
                {pick.schoolName}
              </ProgramLink>
              <span className="text-muted-foreground">, {pick.stateCode}</span>
            </span>
            <span className="block text-[13px] text-muted-foreground tabular-nums">{value(pick)}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
