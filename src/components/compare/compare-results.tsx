import { useEffect, useRef, useState } from 'react'
import { ProgramLink } from '@/components/program/program-link'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { CredentialLevel } from '@/data/program-page'
import type { CompareCell, ComparedProgram, CompareRow, CompareSection } from '@/lib/compare-copy'
import { compareSections } from '@/lib/compare-copy'
import type { CompareSchool } from '@/lib/compare-options'
import { cn } from '@/lib/utils'

// One of the four columns: the school chosen in that box, and its figures once
// they have arrived. An empty box keeps its column, so every column stays
// under its box.
export type CompareColumn =
  | { status: 'empty' }
  | { status: 'loading'; school: CompareSchool }
  | { status: 'failed'; school: CompareSchool }
  | { status: 'ready'; school: CompareSchool; program: ComparedProgram }

// On a phone the four columns do not fit. There each figure becomes a short
// list: a line for each school, its name on the left and the figure on the
// right. From sm up the figures sit in four columns under the boxes.
const COLUMNS = 'grid grid-cols-1 sm:grid-cols-4 sm:gap-x-6'

// The band behind each group's name, mixed opaque: content scrolls under the
// band when it stays in view on a phone.
const BAND = 'bg-[color-mix(in_oklab,var(--primary)_6%,var(--card))]'

// The site header stays at the top of the window, and the row of school names
// stops under it. Its height changes with the window's width, so it is measured.
// `stuck` is true while the top of the table has gone under the header.
function useStickyTop(tableRef: React.RefObject<HTMLElement | null>) {
  const [headerHeight, setHeaderHeight] = useState(0)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const header = document.querySelector('header')
    const table = tableRef.current
    if (!header || !table) return
    const update = () => {
      const headerBox = header.getBoundingClientRect()
      setHeaderHeight(headerBox.height)
      setStuck(table.getBoundingClientRect().top < headerBox.bottom - 0.5)
    }
    const observer = new ResizeObserver(update)
    observer.observe(header)
    // Scroll events do not bubble. Listening on the document while they are
    // captured hears the page's scrolling, whichever element scrolls.
    document.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      document.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
    }
  }, [tableRef])
  return { headerHeight, stuck }
}

// The comparison as one table: the school names on top, then each group of
// figures as a tinted band with its rows under it, with no gaps between groups.
export function CompareResults({ columns, credentialLevel }: { columns: CompareColumn[]; credentialLevel: CredentialLevel }) {
  const sections = compareSections(credentialLevel)
  const tableRef = useRef<HTMLDivElement>(null)
  const { headerHeight, stuck } = useStickyTop(tableRef)
  return (
    <Card ref={tableRef} data-section="comparison" className="mt-10 gap-0 overflow-visible py-0">
      {/* The programs being compared, each linked to its own page. From sm up the
          names sit over their columns and stay in view while the figures scroll
          under them. Its corners round with the table's and square off while it
          is stuck. A phone names the school on every line instead, and the list
          scrolls away. */}
      <div
        data-section="compare-names"
        data-stuck={stuck || undefined}
        className={cn(COLUMNS, 'z-10 gap-y-3 rounded-t-xl bg-card px-5 py-3.5 sm:sticky sm:data-stuck:rounded-none sm:data-stuck:border-b sm:data-stuck:shadow-sm')}
        style={{ top: headerHeight }}
      >
        <h2 className="text-xl leading-tight font-bold tracking-tight sm:sr-only">Programs compared</h2>
        {columns.map((column, slot) =>
          column.status === 'empty' ? (
            <div key={slot} aria-hidden className="max-sm:hidden" />
          ) : (
            <div key={slot} data-name="" className="min-w-0 text-base">
              {column.status === 'ready' ? (
                <ProgramLink href={column.program.href} className="block font-semibold text-primary underline underline-offset-3 sm:truncate">
                  {column.school.shortName}
                </ProgramLink>
              ) : (
                <span className="block font-semibold sm:truncate">{column.school.shortName}</span>
              )}
              {/* Where the school is and its type, as the program pages' table of
                  nearby programs gives them: "Cambridge, MA · private nonprofit". */}
              <span className="block text-muted-foreground">
                {column.school.place}
                {column.status === 'ready' ? ` · ${column.program.control.toLowerCase()}` : ''}
              </span>
            </div>
          ),
        )}
      </div>

      {sections.map((section) => (
        <SectionRows key={section.key} section={section} columns={columns} headerHeight={headerHeight} />
      ))}
    </Card>
  )
}

// One group of figures: a tinted band with its name across the table, then a
// row for each figure. On a phone, where the figures run long, the band stays
// under the site header while its group scrolls.
function SectionRows({ section, columns, headerHeight }: { section: CompareSection; columns: CompareColumn[]; headerHeight: number }) {
  const titleId = `compare-${section.key}-title`
  return (
    <section data-section={`compare-${section.key}`} aria-labelledby={titleId}>
      <div data-slot="compare-band" className={cn(BAND, 'z-[5] border-y border-primary/12 px-5 py-3 max-sm:sticky')} style={{ top: headerHeight }}>
        <h2 id={titleId} className="text-lg leading-tight font-bold tracking-tight">
          {section.title}
        </h2>
      </div>
      <div className="divide-y px-5">
        {section.rows.map((row) => (
          <FigureRow key={row.key} row={row} columns={columns} />
        ))}
        {section.note ? <p className="py-3 text-base text-muted-foreground">{section.note}</p> : null}
      </div>
    </section>
  )
}

function FigureRow({ row, columns }: { row: CompareRow; columns: CompareColumn[] }) {
  return (
    <div data-row={row.key} className={cn(COLUMNS, 'gap-y-2 py-4')}>
      <div className="text-base font-semibold text-neutral-700 sm:col-span-4">{row.label}</div>
      {columns.map((column, slot) =>
        column.status === 'empty' ? (
          // Keeps the column under its box. A phone shows nothing for it.
          <div key={slot} aria-hidden className="max-sm:hidden" />
        ) : (
          // The school's name is on every line on a phone. From sm up the names
          // row names the columns, and screen readers still hear the name here.
          <div key={slot} data-cell="" className="flex min-w-0 items-baseline justify-between gap-4 sm:block">
            <span className="min-w-0 text-base sm:sr-only">{column.school.shortName}</span>
            <span className="shrink-0 text-right sm:block sm:text-left">
              <FigureCell column={column} cell={column.status === 'ready' ? row.cell(column.program) : undefined} />
            </span>
          </div>
        ),
      )}
    </div>
  )
}

function FigureCell({ column, cell }: { column: Exclude<CompareColumn, { status: 'empty' }>; cell: CompareCell | undefined }) {
  if (column.status === 'loading') return <Skeleton className="inline-block h-7 w-24 align-middle" />
  if (column.status === 'failed') return <span className="text-base text-muted-foreground">Figures did not load</span>
  if (!cell) return <span className="text-base text-muted-foreground">Not reported</span>
  // Two lines of figures print smaller than one.
  const size = cell.lines.length > 1 ? 'text-lg font-semibold sm:text-xl' : 'text-xl font-semibold sm:text-2xl'
  return (
    <>
      {cell.lines.map((line) => (
        <span key={`${line.figure} ${line.words ?? ''}`} className="block text-base">
          <span className={cn('tracking-tight tabular-nums', size)}>{line.figure}</span>
          {line.words ? <> {line.words}</> : null}
        </span>
      ))}
      {cell.note ? <span className="block text-base text-muted-foreground">{cell.note}</span> : null}
    </>
  )
}
