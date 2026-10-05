import { createFileRoute } from '@tanstack/react-router'
import { NationalProgramLink } from '@/components/national/national-program-link'
import { OccupationHeader } from '@/components/occupation/occupation-header'
import { OccupationStateTable } from '@/components/occupation/occupation-state-table'
import { KeyFigure, keyFigureColumns, Note, Section } from '@/components/page-sections'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getOccupationPage } from '@/data/get-occupation-page'
import type { OccupationPage } from '@/data/occupation-page'
import { formatCount, formatMoney, roundedPercent } from '@/lib/format'
import { buildOccupationDescription, buildOccupationFaq, buildOccupationSummary, buildOccupationTitle } from '@/lib/occupation-copy'
import { joinWords } from '@/lib/school-copy'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/careers/$careerSlug')({
  loader: async ({ params }) => {
    const page = await getOccupationPage({ data: params })
    return { page, faq: buildOccupationFaq(page) }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { page, faq } = loaderData
    return {
      meta: [
        { title: buildOccupationTitle(page) },
        { name: 'description', content: buildOccupationDescription(page) },
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
  component: OccupationPageView,
})

function OccupationPageView() {
  const { page, faq } = Route.useLoaderData()
  const linkedStates = page.states.some((state) => state.stateSlug)
  const unadjusted = page.states.filter((state) => state.adjustedPay === undefined).map((state) => state.stateName)

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      {/* data-soc lets scripts/verify find the occupation. */}
      <main data-soc={page.socCode}>
        <OccupationHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Card className="mt-7" data-section="summary">
            <CardContent className="gap-2.5">
              <p className="text-xs font-bold tracking-widest text-primary uppercase">The short answer</p>
              <p className="max-w-[64ch] text-lg leading-relaxed">{buildOccupationSummary(page)}</p>
            </CardContent>
          </Card>

          <OccupationKeyFigures page={page} />

          {page.states.length > 0 ? (
            <Section name="states" title={`Pay for ${page.sentenceName} by state`}>
              <p>
                Median pay across all experience levels. "After prices" divides it by the state's price level (US average =
                100), so states can be compared by what the pay buys.
              </p>
              <OccupationStateTable states={page.states} />
              <Note>
                {[
                  linkedStates ? "State names link to the state's college page." : '',
                  unadjusted.length > 0 ? `${joinWords(unadjusted)} ${unadjusted.length === 1 ? 'has' : 'have'} no BEA price level, so ${unadjusted.length === 1 ? 'its' : 'their'} pay is not adjusted.` : '',
                  page.statesWithoutPay.length > 5
                    ? `BLS publishes no median pay for ${page.sentenceName} in ${formatCount(page.statesWithoutPay.length)} other states and territories.`
                    : page.statesWithoutPay.length > 0
                      ? `BLS publishes no median pay for ${page.sentenceName} in ${joinWords(page.statesWithoutPay)}.`
                      : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              </Note>
            </Section>
          ) : null}

          <Section name="programs" title="Programs that lead to this job">
            <p>
              The federal crosswalk from fields of study to jobs links these programs to {page.sentenceName}. Figures are
              medians across each program type's US programs. Program names link to the national ranking.
            </p>
            <Card size="sm" className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Program</TableHead>
                    <TableHead className="px-4 text-right">Programs</TableHead>
                    <TableHead className="px-4 text-right">Year 1 pay</TableHead>
                    <TableHead className="px-4 text-right">Debt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {page.programs.map((program) => (
                    <TableRow key={program.href} data-href={program.href}>
                      <TableCell className="min-w-48 px-4 py-2.5 align-top whitespace-normal">
                        <span data-name="">
                          <NationalProgramLink href={program.href} className="font-semibold text-primary underline underline-offset-3">
                            {program.label}
                          </NationalProgramLink>
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right align-top">{formatCount(program.programCount)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right align-top font-bold">{formatMoney(program.earningsYear1)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right align-top">{formatMoney(program.medianDebt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Note>Program figures are first-year pay for new graduates. The job's median pay covers every experience level.</Note>
          </Section>

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
              <li>Pay is from the Bureau of Labor Statistics Occupational Employment and Wage Statistics for May 2025. It covers all experience levels and all industries, and leaves out self-employed workers.</li>
              <li>Projections are the Bureau of Labor Statistics Employment Projections for 2025 to 2035, for the whole US.</li>
              <li>Price levels are the Bureau of Economic Analysis Regional Price Parities for 2024.</li>
              <li>Program figures are College Scorecard medians across programs, and only include students who received federal financial aid.</li>
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
              <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
              <li>Bureau of Economic Analysis, Regional Price Parities, 2024</li>
              <li>NCES, CIP 2020 to SOC 2018 crosswalk</li>
              <li>U.S. Department of Education, College Scorecard, field of study files, June 2026 release</li>
            </ol>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

// National median pay, the bottom and top 10%, and projected growth.
function OccupationKeyFigures({ page }: { page: OccupationPage }) {
  const { national } = page
  const figures = [{ label: 'Median pay', value: formatMoney(national.medianPay), context: 'US, all experience levels' }]
  if (national.p10Pay !== undefined) figures.push({ label: 'Bottom 10% earn under', value: formatMoney(national.p10Pay), context: 'US' })
  if (national.p90Pay !== undefined) figures.push({ label: 'Top 10% earn over', value: formatMoney(national.p90Pay), context: 'US' })
  if (page.growthShare !== undefined && page.openingsPerYear !== undefined) {
    // "Projected job growth 6%", "Projected job decline 3%", or "Projected job change About the same".
    const percent = roundedPercent(Math.abs(page.growthShare))
    figures.push({
      label: percent === 0 ? 'Projected job change' : page.growthShare > 0 ? 'Projected job growth' : 'Projected job decline',
      value: percent === 0 ? 'About the same' : `${percent}%`,
      context: `2025 to 2035, about ${formatCount(page.openingsPerYear)} openings a year`,
    })
  }
  return (
    <div data-section="key-figures" className={cn('mt-5 grid gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border', keyFigureColumns(figures.length))}>
      {figures.map((figure) => (
        <KeyFigure key={figure.label} label={figure.label} value={figure.value} context={figure.context} />
      ))}
    </div>
  )
}
