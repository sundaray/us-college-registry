import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, ChevronsLeftIcon, ChevronsRightIcon, DatabaseIcon } from 'lucide-react'
import { ProgramLink } from '@/components/program/program-link'
import { SlashIcon } from '@/components/slash-icon'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { NamedOccupation, OccupationOutlook } from '@/data/program-page'
import { formatCount, formatMoney } from '@/lib/format'
import { jobDetail } from '@/lib/job-copy'
import { SCORECARD_SOURCE_LINE } from '@/lib/site-copy'
import { cn } from '@/lib/utils'

// The building blocks every page type shares.

const SECTION_TITLE = 'text-2xl leading-tight font-bold tracking-tight text-balance'

// One step of the breadcrumb. The last step is the page itself and has no link.
// An earlier step has no link when the page it names does not exist.
export type TrailStep = { label: string; link?: ReactElement }

// One short fact under the title, such as the school's city, with its icon.
export type HeaderFact = { icon: ReactElement; text: string }

// The tinted band at the top of a page: breadcrumb, title, any facts that say
// what the page is about, and where the figures come from, on a faint grid. The
// source is College Scorecard unless the page names another. On a page laid out
// with PageColumns, `wide` lines the band's contents up with the main column.
export function PageHeader({
  trail,
  title,
  facts,
  source = SCORECARD_SOURCE_LINE,
  wide = false,
}: {
  trail: TrailStep[]
  title: string
  facts?: HeaderFact[]
  source?: string
  wide?: boolean
}) {
  return (
    <div data-section="header" className="hero-grid border-b border-primary/12 bg-primary/6">
      <div className={cn('mx-auto flex max-w-3xl flex-col gap-3 px-5 pt-6.5 pb-7.5', wide && 'xl:grid xl:max-w-6xl xl:grid-cols-3 xl:gap-x-12 xl:*:col-span-2')}>
        <Breadcrumb>
          <BreadcrumbList className="gap-1 text-sm sm:gap-1.5">
            {trail.map((step, position) => (
              <Fragment key={`${position}-${step.label}`}>
                {position > 0 ? (
                  <BreadcrumbSeparator>
                    <SlashIcon />
                  </BreadcrumbSeparator>
                ) : null}
                <BreadcrumbItem>
                  {step.link ? (
                    <BreadcrumbLink render={step.link} className="underline underline-offset-3 hover:text-foreground">
                      {step.label}
                    </BreadcrumbLink>
                  ) : position === trail.length - 1 ? (
                    <BreadcrumbPage className="text-muted-foreground">{step.label}</BreadcrumbPage>
                  ) : (
                    step.label
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-balance md:text-4xl">{title}</h1>

        {facts && facts.length > 0 ? (
          <ul data-slot="header-facts" className="flex flex-wrap gap-x-5.5 gap-y-1.5 text-base text-muted-foreground tabular-nums">
            {facts.map((fact) => (
              <li key={fact.text} className="inline-flex items-start gap-2 [&>svg]:h-lh [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-primary">
                {fact.icon}
                <span>{fact.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* The icon's box is one text line tall, so it sits beside the first line when the text wraps. */}
        <p className="inline-flex items-start gap-1.5 text-sm text-muted-foreground [&>svg]:h-lh [&>svg]:w-3.5 [&>svg]:shrink-0">
          <DatabaseIcon aria-hidden />
          {source}
        </p>
      </div>
    </div>
  )
}

// The frame of a page whose related links get a column of their own. From xl up
// the page has three equal columns: MainColumn takes two and RelatedPages the
// third. On narrower screens the page is one column. A page puts a MainColumn
// before RelatedPages and another after it. That keeps the links where they
// were in the HTML, between the sections around them.
export function PageColumns({ children }: { children: ReactNode }) {
  return <div className="xl:mx-auto xl:grid xl:max-w-6xl xl:grid-cols-3 xl:gap-x-12 xl:px-5">{children}</div>
}

export function MainColumn({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-5 xl:col-span-2 xl:mx-0 xl:max-w-none xl:px-0">{children}</div>
}

// The links to related pages, on a tinted band across the page with the
// header's faint grid. Inside PageColumns, `side` turns the band into a panel in
// the right column from xl up, and the panel stays in view while the page
// scrolls.
export function RelatedPages({ side = false, children }: { side?: boolean; children: ReactNode }) {
  return (
    <aside
      data-section="related"
      className={cn(
        'hero-grid mt-13 border-y border-primary/12 bg-primary/6 py-10',
        side && 'xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:mt-9 xl:border-0 xl:bg-transparent xl:bg-none xl:py-0',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-3xl flex-col gap-3.5 px-5',
          side && 'xl:hero-grid xl:sticky xl:top-20 xl:max-w-none xl:rounded-xl xl:border xl:border-primary/12 xl:bg-primary/6 xl:pt-4.5 xl:pb-5.5',
        )}
      >
        <h2 className={cn(SECTION_TITLE, side && 'xl:text-lg xl:leading-snug')}>Related pages</h2>
        {/* In the band the links sit side by side when there is room for them. */}
        <div className={cn('grid gap-4.5 md:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] md:gap-x-8', side && 'xl:grid-cols-1')}>{children}</div>
      </div>
    </aside>
  )
}

// The classes of a link in RelatedPages. Each kind of page has its own link
// component, which wraps RelatedLinkText in a link with these classes.
export const RELATED_LINK = 'group/related block'

// What a link in RelatedPages shows: its title with an arrow, and a line of
// detail under it.
export function RelatedLinkText({ title, detail }: { title: string; detail: string }) {
  return (
    <>
      <span className="text-base leading-snug font-semibold text-primary underline-offset-3 group-hover/related:underline">
        {title}
        {/* A no-break space keeps the arrow on the line of the title's last word. */}
        {'\u00A0'}
        <ArrowRightIcon aria-hidden className="inline size-4 align-[-0.125em] transition-transform group-hover/related:translate-x-0.75 motion-reduce:transition-none" />
      </span>
      <span className="mt-0.5 block text-sm text-muted-foreground">{detail}</span>
    </>
  )
}

// Paragraphs that introduce a section keep a reading width. Notes run the full
// width of the page column.
// `hidden` keeps a section in the page without showing it, for a list that a search narrows.
export function PageSection({ name, title, hidden, children }: { name: string; title: string; hidden?: boolean; children: ReactNode }) {
  return (
    <section data-section={name} hidden={hidden} className="mt-13 flex flex-col gap-3.5 [&>p:not([data-slot=note])]:max-w-[66ch]">
      <h2 className={SECTION_TITLE}>{title}</h2>
      {children}
    </section>
  )
}

// The first section under the page header. Each string is one paragraph.
export function Summary({ paragraphs }: { paragraphs: string[] }) {
  return (
    <section data-section="summary" className="mt-9 flex flex-col gap-3.5">
      <h2 className={SECTION_TITLE}>Summary</h2>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="max-w-[64ch] text-lg leading-relaxed">
          {paragraph}
        </p>
      ))}
    </section>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p data-slot="note" className="text-sm text-muted-foreground">
      {children}
    </p>
  )
}

export type KeyFigureTile = { label: string; value: string; context: string }

// A row of key figures. Each tile's three lines sit on rows shared with the
// other tiles (subgrid), so the figures stay level when a label takes two lines.
export function KeyFigures({ figures }: { figures: KeyFigureTile[] }) {
  return (
    <div data-section="key-figures" className={cn('mt-5 grid gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border', keyFigureColumns(figures.length))}>
      {figures.map((figure) => (
        <div key={figure.label} className="row-span-3 grid min-w-0 grid-rows-subgrid gap-y-1 bg-card px-4 pt-4 pb-4.5">
          <span className="text-sm leading-snug font-semibold text-neutral-700">{figure.label}</span>
          <span className="text-3xl leading-tight font-extrabold tracking-tight tabular-nums">{figure.value}</span>
          <span className="text-sm leading-snug text-muted-foreground">{figure.context}</span>
        </div>
      ))}
    </div>
  )
}

// One question with its answer. Each string in `answer` is one paragraph. A
// `source` adds a last paragraph that says what a named government source is.
export type PageQuestion = { question: string; answer: string[]; source?: { name: string; text: string } }

// An answer as one string, as the page shows it, for FAQPage structured data.
export function answerText(item: PageQuestion) {
  return [...item.answer, ...(item.source ? [`${item.source.name}: ${item.source.text}`] : [])].join(' ')
}

// Questions in the shadcn Accordion. hiddenUntilFound keeps closed answers in the
// server HTML. `name` makes the item values unique when a page has two lists.
export function QuestionList({
  name,
  questions,
  section,
  openFirst = false,
  className,
}: {
  name: string
  questions: PageQuestion[]
  section?: string
  openFirst?: boolean
  className?: string
}) {
  return (
    <Accordion
      data-section={section}
      defaultValue={openFirst ? [`${name}-0`] : []}
      hiddenUntilFound
      className={cn('rounded-xl bg-card px-4 ring-1 ring-foreground/10', className)}
    >
      {questions.map((item, index) => (
        <AccordionItem key={item.question} value={`${name}-${index}`}>
          <AccordionTrigger className="text-base font-semibold **:data-[slot=accordion-trigger-icon]:size-6">{item.question}</AccordionTrigger>
          <AccordionContent className="text-base leading-relaxed text-neutral-700">
            {item.answer.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {item.source ? (
              <p>
                <span className="font-semibold text-foreground">{item.source.name}:</span> {item.source.text}
              </p>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

// One job in a careers section, with its pay written as a sentence.
export function JobRow({ job, areaName, scale }: { job: NamedOccupation; areaName: string; scale: { scaleMin: number; scaleMax: number } }) {
  const pay = job.stateMedianPay ?? job.nationalMedianPay!
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b px-4 py-4 last:border-b-0">
      <h3 data-name="" className="text-base font-bold">
        {job.careerSlug ? (
          <Link to="/careers/$careerSlug" params={{ careerSlug: job.careerSlug }} className="text-primary underline underline-offset-3">
            {job.title}
          </Link>
        ) : (
          job.title
        )}
      </h3>
      <span className="text-right text-xl font-extrabold tabular-nums">{formatMoney(pay)}</span>
      <p className="col-span-2 text-sm text-muted-foreground">{jobDetail(job, areaName)}</p>
      {job.stateMedianPay !== undefined && job.stateP10Pay !== undefined && job.stateP90Pay !== undefined ? (
        <PayRange low={job.stateP10Pay} middle={job.stateMedianPay} high={job.stateP90Pay} scale={scale} />
      ) : null}
    </div>
  )
}

// Rows on one page of a ranking table. Every row is in the HTML; rows on other
// pages are hidden.
export const ROWS_PER_PAGE = 10

// "Page 1 of 17" with buttons for the first, previous, next and last page. It
// sits under a table and shows only when there is more than one page.
export function Pager({ page, pageCount, onPageChange, className }: { page: number; pageCount: number; onPageChange: (page: number) => void; className?: string }) {
  if (pageCount <= 1) return null
  return (
    <div data-slot="pager" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-muted-foreground tabular-nums">
        Page {formatCount(page)} of {formatCount(pageCount)}
      </p>
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="outline" className="rounded-full" aria-label="First page" disabled={page === 1} onClick={() => onPageChange(1)}>
          <ChevronsLeftIcon aria-hidden />
        </Button>
        <Button size="sm" variant="outline" className="rounded-full px-3.5" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="outline" className="rounded-full px-3.5" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
        <Button size="icon-sm" variant="outline" className="rounded-full" aria-label="Last page" disabled={page === pageCount} onClick={() => onPageChange(pageCount)}>
          <ChevronsRightIcon aria-hidden />
        </Button>
      </div>
    </div>
  )
}

// One entry of a short ranked list. `place` follows the name ("CA"). `unit` is
// the school's unit ID where the record has one, so scripts/verify can check
// the entry.
export type RankedEntry = { key: string; name: string; href?: string; place?: string; value: string; unit?: string }

// A short ranked list in a card, such as the programs with the lowest debt. A
// program with its own page is a link; one without is a plain name, as in the
// ranking table.
export function RankedList({ title, entries }: { title: string; entries: RankedEntry[] }) {
  return (
    <Card size="sm" className="gap-2.5 px-4">
      <h3 className="text-base font-bold">{title}</h3>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        {entries.map((entry) => (
          <li key={entry.key} data-unit={entry.unit}>
            <span data-name="" className="block">
              {entry.href ? (
                <ProgramLink href={entry.href} className="text-primary underline underline-offset-3">
                  {entry.name}
                </ProgramLink>
              ) : (
                entry.name
              )}
              {entry.place ? <span className="text-muted-foreground">, {entry.place}</span> : null}
            </span>
            <span className="block text-sm text-muted-foreground tabular-nums">{entry.value}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

// Grid classes for a row of key figures. Tailwind only finds class names written
// out in full. With three figures, the third spans the phone row instead of
// leaving an empty cell beside it.
const KEY_FIGURE_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3 [&>:last-child]:col-span-2 md:[&>:last-child]:col-span-1',
  4: 'grid-cols-2 md:grid-cols-4',
}

function keyFigureColumns(count: number) {
  return KEY_FIGURE_COLUMNS[count]
}

// One scale for every pay range on the page, so the bars compare with each other.
export function payRangeScale(occupations: OccupationOutlook[]) {
  const lows = occupations.flatMap((occupation) => (occupation.stateP10Pay !== undefined && occupation.stateP90Pay !== undefined ? [occupation.stateP10Pay] : []))
  const highs = occupations.flatMap((occupation) => (occupation.stateP10Pay !== undefined && occupation.stateP90Pay !== undefined ? [occupation.stateP90Pay] : []))
  if (lows.length === 0) return { scaleMin: 0, scaleMax: 1 }
  return {
    scaleMin: Math.floor(Math.min(...lows) / 10000) * 10000,
    scaleMax: Math.ceil(Math.max(...highs) / 10000) * 10000,
  }
}

function PayRange({
  low,
  middle,
  high,
  scale,
}: {
  low: number
  middle: number
  high: number
  scale: { scaleMin: number; scaleMax: number }
}) {
  const position = (amount: number) => ((amount - scale.scaleMin) / (scale.scaleMax - scale.scaleMin)) * 100
  return (
    <div className="col-span-2 mt-2" aria-label={`Pay range: bottom 10% ${formatMoney(low)}, median ${formatMoney(middle)}, top 10% ${formatMoney(high)}`}>
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 rounded-full border border-primary bg-primary/15"
          style={{ left: `${position(low)}%`, right: `${100 - position(high)}%` }}
        />
        <div className="absolute -top-1 h-4 w-0.75 -translate-x-1/2 rounded-full bg-primary" style={{ left: `${position(middle)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>Bottom 10%: {formatMoney(low)}</span>
        <span>Top 10%: {formatMoney(high)}</span>
      </div>
    </div>
  )
}
