import { createFileRoute } from '@tanstack/react-router'
import { KeyFigure, keyFigureColumns, Note, Section } from '@/components/page-sections'
import { ProgramLink } from '@/components/program/program-link'
import { SchoolHeader } from '@/components/school/school-header'
import { SchoolProgramTable } from '@/components/school/school-program-table'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { getSchoolPage } from '@/data/get-school-page'
import type { SchoolLevel, SchoolProgram } from '@/data/school-page'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount, formatMoney } from '@/lib/format'
import {
  QUICK_PICK_MINIMUM,
  buildSchoolDescription,
  buildSchoolFaq,
  buildSchoolKeyFigures,
  buildSchoolSummary,
  buildSchoolTitle,
  credentialLower,
  debtOnlyNote,
  levelSectionTitle,
  primaryLevel,
  quickPicks,
} from '@/lib/school-copy'
import { canonicalLink } from '@/lib/site'
import { cn } from '@/lib/utils'

// The index route matches /schools/{school} exactly; program pages are its
// siblings at /schools/{school}/{program}.
export const Route = createFileRoute('/schools/$schoolSlug/')({
  loader: async ({ params }) => {
    const page = await getSchoolPage({ data: params })
    return { page, faq: buildSchoolFaq(page) }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { page, faq } = loaderData
    return {
      links: [canonicalLink(`/schools/${params.schoolSlug}`)],
      meta: [
        { title: buildSchoolTitle(page) },
        { name: 'description', content: buildSchoolDescription(page) },
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
  component: SchoolPageView,
})

function SchoolPageView() {
  const { page, faq } = Route.useLoaderData()
  const { school } = page
  const figures = buildSchoolKeyFigures(school)
  const primary = primaryLevel(page)

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      {/* data-* attributes let scripts/verify find the school and skip its name when reading numbers. */}
      <main data-unit-id={school.unitId} data-school-name={school.shortName}>
        <SchoolHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Card className="mt-7" data-section="summary">
            <CardContent className="gap-2.5">
              <p className="text-xs font-bold tracking-widest text-primary uppercase">The short answer</p>
              <p className="max-w-[64ch] text-lg leading-relaxed">{buildSchoolSummary(page)}</p>
            </CardContent>
          </Card>

          {figures.length > 0 ? (
            <div
              data-section="key-figures"
              className={cn('mt-5 grid gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border', keyFigureColumns(figures.length))}
            >
              {figures.map((figure) => (
                <KeyFigure key={figure.label} label={figure.label} value={figure.value} context={figure.context} />
              ))}
            </div>
          ) : null}

          {page.levels.map((level) => (
            <LevelSection key={level.credentialLevel} level={level} stateName={school.stateName} />
          ))}

          {primary.programs.length >= QUICK_PICK_MINIMUM ? (
            <QuickPicks level={primary} title={page.levels.length > 1 ? `Quick picks: ${credentialLower(primary)} programs` : 'Quick picks'} />
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
              <li>Earnings and debt only include students who received federal financial aid, and earnings only count graduates who were working and not enrolled in more school.</li>
              <li>Debt only includes federal loans. Private loans and credit cards are not counted.</li>
              <li>Tuition, net price, graduation rate, and admission rate are for the whole school, not one program.</li>
              <li>Some schools with several campuses report one combined figure for all of them. We count each of those schools once, and leave them out of {school.stateName} rankings when their main campus is in another state.</li>
              <li>Scorecard figures describe graduating classes from several years ago.</li>
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
              <li>NCES, IPEDS tuition and fees, 2023-24, for in-district tuition labels</li>
            </ol>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function LevelSection({ level, stateName }: { level: SchoolLevel; stateName: string }) {
  const credential = credentialLower(level)
  const hasProgramLinks = level.programs.some((program) => program.href)
  const hasUnlinkedPrograms = level.programs.some((program) => !program.href)
  const fieldNotes = [...new Set(level.programs.flatMap((program) => comparisonNote(program.cipCode, level.credentialLevel) ?? []))]
  const debtOnly = debtOnlyNote(level)
  return (
    <Section name={`ranking-${level.credentialLevel}`} title={levelSectionTitle(level)}>
      <p>
        Each figure is the median for the program's graduates. "Rank in {stateName}" compares first-year pay with the
        same field's {credential} programs across {stateName}.
        {level.programs.length >= 3 ? " Programs that don't report a figure are listed last when you sort by it." : ''}
      </p>
      <SchoolProgramTable programs={level.programs} stateName={stateName} />
      {hasProgramLinks ? (
        <Note>
          Program names link to the program's own page, and {stateName} ranks link to the full ranking for the field.
          {hasUnlinkedPrograms
            ? ` A program gets its own page when it reports both pay and debt and at least five ${stateName} programs in the field do too.`
            : ''}
        </Note>
      ) : null}
      {fieldNotes.map((note) => (
        <Note key={note}>{note}</Note>
      ))}
      {debtOnly ? <Note>{debtOnly}</Note> : null}
    </Section>
  )
}

function QuickPicks({ level, title }: { level: SchoolLevel; title: string }) {
  const { byPay, byDebt, bySize } = quickPicks(level)
  const lists = [
    { title: 'Highest first-year pay', programs: byPay, value: (program: SchoolProgram) => formatMoney(program.earningsYear1) },
    { title: 'Lowest median debt', programs: byDebt, value: (program: SchoolProgram) => formatMoney(program.medianDebt!) },
    { title: 'Largest programs', programs: bySize, value: (program: SchoolProgram) => `About ${formatCount(program.graduatesPerYear!)} graduates a year` },
  ].filter((list) => list.programs.length > 0)
  return (
    <Section name="quick-picks" title={title}>
      <div className={cn('grid gap-3', lists.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {lists.map((list) => (
          <Card key={list.title} size="sm" className="gap-2.5 px-4">
            <h3 className="text-[15px] font-bold">{list.title}</h3>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
              {list.programs.map((program) => (
                <li key={program.cipCode}>
                  <span data-name="" className="block">
                    {program.href ? (
                      <ProgramLink href={program.href} className="text-primary underline underline-offset-3">
                        {program.name}
                      </ProgramLink>
                    ) : (
                      program.name
                    )}
                  </span>
                  <span className="block text-[13px] text-muted-foreground tabular-nums">{list.value(program)}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </Section>
  )
}
