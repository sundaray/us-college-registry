import { createFileRoute } from '@tanstack/react-router'
import { KeyFigure, keyFigureColumns, Note, Section } from '@/components/page-sections'
import { StateFieldTable } from '@/components/state/state-field-table'
import { StateHeader } from '@/components/state/state-header'
import { StateSchoolTable } from '@/components/state/state-school-table'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getStatePage } from '@/data/get-state-page'
import type { StatePage } from '@/data/state-page'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount, formatMoney } from '@/lib/format'
import {
  bachelors,
  buildStateDescription,
  buildStateFaq,
  buildStateSummary,
  buildStateTitle,
  credentialLower,
  fieldSectionTitle,
  priceComparison,
  schoolSectionTitle,
} from '@/lib/state-copy'
import { canonicalLink } from '@/lib/site'
import { cn } from '@/lib/utils'

// The index route matches /states/{state} exactly; ranking pages are its siblings
// at /states/{state}/{program}.
export const Route = createFileRoute('/states/$stateSlug/')({
  loader: async ({ params }) => {
    const page = await getStatePage({ data: params })
    return { page, faq: buildStateFaq(page) }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { page, faq } = loaderData
    return {
      links: [canonicalLink(`/states/${params.stateSlug}`)],
      meta: [
        { title: buildStateTitle(page) },
        { name: 'description', content: buildStateDescription(page) },
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
  component: StatePageView,
})

function StatePageView() {
  const { page, faq } = Route.useLoaderData()
  const stateName = page.state.name
  const singleProgramSchools = page.schools.filter((school) => school.programName).length

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      {/* data-state lets scripts/verify find the state. */}
      <main data-state={page.state.code}>
        <StateHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Card className="mt-7" data-section="summary">
            <CardContent className="gap-2.5">
              <p className="text-xs font-bold tracking-widest text-primary uppercase">The short answer</p>
              <p className="max-w-[64ch] text-lg leading-relaxed">{buildStateSummary(page)}</p>
            </CardContent>
          </Card>

          <StateKeyFigures page={page} />

          <Section name="credentials" title="Pay and debt by credential">
            <p>
              Medians across every {stateName} program at each credential that reports the figure, next to the national
              median.
            </p>
            <Card size="sm" className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Credential</TableHead>
                    <TableHead className="px-4 text-right">Programs</TableHead>
                    <TableHead className="px-4 text-right">Year 1 pay</TableHead>
                    <TableHead className="px-4 text-right">National</TableHead>
                    <TableHead className="px-4 text-right">Debt</TableHead>
                    <TableHead className="px-4 text-right">National</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {page.credentials.map((credential) => (
                    <TableRow key={credential.credentialLevel}>
                      <TableCell className="px-4 py-2.5">{credential.credential}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right">{formatCount(credential.state.earningsYear1Count)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right font-bold">{formatMoney(credential.state.earningsYear1)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right">{formatMoney(credential.national.earningsYear1)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right font-bold">{formatMoney(credential.state.medianDebt)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right">{formatMoney(credential.national.medianDebt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Section>

          {page.fieldLevels.map((level) => {
            const notes = [...new Set(level.fields.flatMap((field) => comparisonNote(field.cipCode, level.credentialLevel) ?? []))]
            return (
              <Section key={level.credentialLevel} name={`fields-${level.credentialLevel}`} title={fieldSectionTitle(level, stateName)}>
                <p>
                  Each row is one field's median across its {stateName} {credentialLower(level.credential)} programs. Field
                  names link to the full ranking of those programs.
                </p>
                <StateFieldTable fields={level.fields} />
                {notes.map((note) => (
                  <Note key={note}>{note}</Note>
                ))}
              </Section>
            )
          })}

          <Section name="schools" title={schoolSectionTitle(page)}>
            <p>
              Every {stateName} school with at least one program page.
              {page.schools.length > singleProgramSchools ? " School names link to the school's page, which ranks all its programs." : ''}
              {singleProgramSchools > 0 ? ' Schools with one program link straight to that program.' : ''}
            </p>
            <StateSchoolTable schools={page.schools} />
            <Note>"Programs" counts the school's programs that report first-year pay.</Note>
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
              <li>Earnings and debt only include students who received federal financial aid, and earnings only count graduates who were working and not enrolled in more school.</li>
              <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
              <li>Medians are across programs, not students: each program counts once, however many graduates it has.</li>
              <li>Some schools with several campuses report one combined figure for all of them. We count each of those schools once, and leave them out of {stateName} figures when their main campus is in another state.</li>
              {page.priceIndex !== undefined ? <li>Price levels are the Bureau of Economic Analysis Regional Price Parities for 2024.</li> : null}
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
              {page.priceIndex !== undefined ? <li>Bureau of Economic Analysis, Regional Price Parities, 2024</li> : null}
            </ol>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

// Bachelor's pay and debt next to the national medians, and the state's price level.
function StateKeyFigures({ page }: { page: StatePage }) {
  const { state, national } = bachelors(page)
  // The program count shows that each figure is a median across programs.
  const context = (programCount: number, nationalValue: number) =>
    `Across ${formatCount(programCount)} programs. National ${formatMoney(nationalValue)}`
  const figures = [
    { label: "Median first-year pay, bachelor's", value: formatMoney(state.earningsYear1), context: context(state.earningsYear1Count, national.earningsYear1) },
  ]
  if (state.earningsYear5 !== undefined && national.earningsYear5 !== undefined) {
    figures.push({ label: "Median pay after 5 years, bachelor's", value: formatMoney(state.earningsYear5), context: context(state.earningsYear5Count, national.earningsYear5) })
  }
  figures.push({ label: "Median federal debt, bachelor's", value: formatMoney(state.medianDebt), context: context(state.medianDebtCount, national.medianDebt) })
  if (page.priceIndex !== undefined) {
    const price = priceComparison(page.priceIndex)
    figures.push({ label: 'Prices compared with the US', value: price.label, context: `BEA price level ${price.index}, US average 100` })
  }
  return (
    <div data-section="key-figures" className={cn('mt-5 grid gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border', keyFigureColumns(figures.length))}>
      {figures.map((figure) => (
        <KeyFigure key={figure.label} label={figure.label} value={figure.value} context={figure.context} />
      ))}
    </div>
  )
}
