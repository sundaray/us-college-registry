import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { keyFigureColumns, PayRange } from '@/components/page-sections'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import type { NamedOccupation } from '@/data/program-page'
import { formatMoney } from '@/lib/format'
import { jobDetail } from '@/lib/job-copy'
import { cn } from '@/lib/utils'

// The revised building blocks for pages. National program pages use them. The
// other page types still use page-sections.tsx and move here one at a time.

const SECTION_TITLE = 'text-2xl leading-tight font-bold tracking-tight text-balance'

// Paragraphs that introduce a section keep a reading width. Notes run the full
// width of the page column.
export function PageSection({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <section data-section={name} className="mt-13 flex flex-col gap-3.5 [&>p:not([data-slot=note])]:max-w-[66ch]">
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
