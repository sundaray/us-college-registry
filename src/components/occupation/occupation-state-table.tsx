import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Pager, ROWS_PER_PAGE } from '@/components/page-blocks'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OccupationStateRow } from '@/data/occupation-page'
import { formatCount, formatMoney } from '@/lib/format'
import { rankAmongStates } from '@/lib/place-names'
import { cn } from '@/lib/utils'

type SortKey = 'pay' | 'adjusted' | 'jobs'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest pay' },
  { key: 'adjusted', label: 'Highest after prices' },
  { key: 'jobs', label: 'Most jobs' },
]

// On large screens the table and its pager are wider than the page column, so
// all seven columns fit without scrolling sideways.
const WIDER_THAN_COLUMN = 'lg:-mx-12'

function rankFor(state: OccupationStateRow, sortKey: SortKey) {
  if (sortKey === 'pay') return state.payRank
  return sortKey === 'adjusted' ? state.adjustedRank : state.employmentRank
}

// One job's pay in every state, highest median pay first in the prerendered HTML,
// the first page of ten showing. Every row is in the HTML; rows on other pages
// are hidden. Buttons re-sort by pay after prices or by number of jobs and go
// back to the first page; states without the figure go last without a rank.
// The number beside a state is its place among the states only; a place that is
// not a state has none.
export function OccupationStateTable({ states }: { states: OccupationStateRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const [page, setPage] = useState(1)
  const sortable = states.length >= 3
  const pageCount = Math.ceil(states.length / ROWS_PER_PAGE)
  // Name ties are broken in a fixed locale, so the server and every browser sort alike.
  const sorted = [...states].sort((first, second) => {
    const firstRank = rankFor(first, sortKey)
    const secondRank = rankFor(second, sortKey)
    if (firstRank === undefined && secondRank === undefined) return first.payRank - second.payRank
    if (firstRank === undefined) return 1
    if (secondRank === undefined) return -1
    return firstRank - secondRank || first.payRank - second.payRank || first.stateName.localeCompare(second.stateName, 'en')
  })
  const figureCell = (key: SortKey) => cn('px-4 py-2.5 text-right align-top', key === sortKey && 'font-bold')
  const sortBy = (key: SortKey) => {
    setSortKey(key)
    setPage(1)
  }
  return (
    <>
      {sortable ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sort states">
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
      <Card size="sm" className={cn('py-0', WIDER_THAN_COLUMN)}>
        <Table containerClassName="**:data-[slot=scroll-area-viewport]:fade-scroll-edges">
          <TableHeader>
            <TableRow>
              {sortable ? <TableHead className="px-4">#</TableHead> : null}
              <TableHead className="px-4">State</TableHead>
              <TableHead className="px-4 text-right">Median pay</TableHead>
              <TableHead className="px-4 text-right">After prices</TableHead>
              <TableHead className="px-4 text-right">Jobs</TableHead>
              <TableHead className="px-4 text-right">Bottom 10%</TableHead>
              <TableHead className="px-4 text-right">Top 10%</TableHead>
            </TableRow>
          </TableHeader>
          {/* The card's edge closes the table, so the last row on screen has no line of its own. */}
          <TableBody className="tabular-nums [&_tr:nth-last-child(1_of_:not([hidden]))]:border-0">
            {sorted.map((state, position) => (
              // data-state lets scripts/verify check each row against the raw data.
              <TableRow key={state.stateCode} data-state={state.stateCode} hidden={Math.floor(position / ROWS_PER_PAGE) !== page - 1}>
                {sortable ? <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankAmongStates(states, state, (row) => rankFor(row, sortKey)) ?? ''}</TableCell> : null}
                <TableCell className="min-w-40 px-4 py-2.5 align-top whitespace-normal">
                  {state.stateSlug ? (
                    <Link to="/states/$stateSlug" params={{ stateSlug: state.stateSlug }} className="font-semibold text-primary underline underline-offset-3">
                      {state.stateName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{state.stateName}</span>
                  )}
                </TableCell>
                <TableCell className={figureCell('pay')}>{formatMoney(state.medianPay)}</TableCell>
                <TableCell className={figureCell('adjusted')}>{state.adjustedPay !== undefined ? formatMoney(state.adjustedPay) : <Missing>Not available</Missing>}</TableCell>
                <TableCell className={figureCell('jobs')}>{state.employment !== undefined ? formatCount(state.employment) : <Missing>Not reported</Missing>}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{state.p10Pay !== undefined ? formatMoney(state.p10Pay) : <Missing>Not reported</Missing>}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{state.p90Pay !== undefined ? formatMoney(state.p90Pay) : <Missing>Not reported</Missing>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} className={WIDER_THAN_COLUMN} />
    </>
  )
}

function Missing({ children }: { children: string }) {
  return <span className="text-sm font-normal text-muted-foreground">{children}</span>
}
