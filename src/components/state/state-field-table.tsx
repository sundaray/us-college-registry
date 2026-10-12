import { useState } from 'react'
import { StateProgramLink } from '@/components/hub/state-program-link'
import { Pager, ROWS_PER_PAGE } from '@/components/page-blocks'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { StateField } from '@/data/state-page'
import { formatCount, formatMoney } from '@/lib/format'
import { fieldLabel } from '@/lib/state-copy'
import { cn } from '@/lib/utils'

type SortKey = 'pay' | 'debt' | 'programs'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest first-year pay' },
  { key: 'debt', label: 'Lowest debt' },
  { key: 'programs', label: 'Most programs' },
]

function rankFor(field: StateField, sortKey: SortKey) {
  if (sortKey === 'pay') return field.payRank
  return sortKey === 'debt' ? field.debtRank : field.programCountRank
}

// A state's fields at one credential level, ranked by median first-year pay in the
// prerendered HTML, the first page of ten showing. Every row is in the HTML; rows
// on other pages are hidden. With three or more fields, buttons re-sort by debt
// or by number of programs and go back to the first page. Ranks come from the
// record.
export function StateFieldTable({ fields }: { fields: StateField[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const [page, setPage] = useState(1)
  const sortable = fields.length >= 3
  const pageCount = Math.ceil(fields.length / ROWS_PER_PAGE)
  // Name ties are broken in a fixed locale, so the server and every browser sort alike.
  const sorted = [...fields].sort(
    (first, second) => rankFor(first, sortKey) - rankFor(second, sortKey) || first.payRank - second.payRank || first.name.localeCompare(second.name, 'en'),
  )
  const figureCell = (key: SortKey) => cn('px-4 py-2.5 text-right align-top', key === sortKey && 'font-bold')
  const sortBy = (key: SortKey) => {
    setSortKey(key)
    setPage(1)
  }
  return (
    <>
      {sortable ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sort fields">
          {SORT_OPTIONS.map((option) => (
            <Button
              key={option.key}
              size="sm"
              variant={option.key === sortKey ? 'default' : 'outline'}
              aria-pressed={option.key === sortKey}
              className="rounded-full px-3.5"
              onClick={() => sortBy(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      <Card size="sm" className="py-0">
        <Table containerClassName="**:data-[slot=scroll-area-viewport]:fade-scroll-edges">
          <TableHeader>
            <TableRow>
              {sortable ? <TableHead className="px-4">#</TableHead> : null}
              <TableHead className="px-4">Field</TableHead>
              <TableHead className="px-4 text-right">Programs</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
            </TableRow>
          </TableHeader>
          {/* The card's edge closes the table, so the last row on screen has no line of its own. */}
          <TableBody className="tabular-nums [&_tr:nth-last-child(1_of_:not([hidden]))]:border-0">
            {sorted.map((field, position) => (
              // data-cip lets scripts/verify check each row against the raw data.
              <TableRow key={field.cipCode} data-cip={field.cipCode} hidden={Math.floor(position / ROWS_PER_PAGE) !== page - 1}>
                {sortable ? <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(field, sortKey)}</TableCell> : null}
                <TableCell className="min-w-48 px-4 py-2.5 align-top whitespace-normal">
                  <span data-name="">
                    <StateProgramLink href={field.href} className="font-semibold text-primary underline underline-offset-3">
                      {fieldLabel(field)}
                    </StateProgramLink>
                  </span>
                </TableCell>
                <TableCell className={figureCell('programs')}>{formatCount(field.programCount)}</TableCell>
                <TableCell className={figureCell('pay')}>{formatMoney(field.earningsYear1)}</TableCell>
                <TableCell className={figureCell('debt')}>{formatMoney(field.medianDebt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  )
}
