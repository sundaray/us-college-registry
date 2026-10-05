import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OccupationStateRow } from '@/data/occupation-page'
import { formatCount, formatMoney } from '@/lib/format'

type SortKey = 'pay' | 'adjusted' | 'jobs'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest pay' },
  { key: 'adjusted', label: 'Highest after prices' },
  { key: 'jobs', label: 'Most jobs' },
]

function rankFor(state: OccupationStateRow, sortKey: SortKey) {
  if (sortKey === 'pay') return state.payRank
  return sortKey === 'adjusted' ? state.adjustedRank : state.employmentRank
}

// One job's pay in every state, highest median pay first in the prerendered HTML.
// Buttons re-sort by pay after prices or by number of jobs; states without the
// figure go last without a rank. Ranks come from the record.
export function OccupationStateTable({ states }: { states: OccupationStateRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const sortable = states.length >= 3
  const sorted = [...states].sort((first, second) => {
    const firstRank = rankFor(first, sortKey)
    const secondRank = rankFor(second, sortKey)
    if (firstRank === undefined && secondRank === undefined) return first.payRank - second.payRank
    if (firstRank === undefined) return 1
    if (secondRank === undefined) return -1
    return firstRank - secondRank || first.payRank - second.payRank || first.stateName.localeCompare(second.stateName)
  })
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
              onClick={() => setSortKey(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      <Card size="sm" className="py-0">
        <Table>
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
          <TableBody className="tabular-nums">
            {sorted.map((state) => (
              // data-state lets scripts/verify check each row against the raw data.
              <TableRow key={state.stateCode} data-state={state.stateCode}>
                {sortable ? <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(state, sortKey) ?? ''}</TableCell> : null}
                <TableCell className="min-w-40 px-4 py-2.5 align-top whitespace-normal">
                  {state.stateSlug ? (
                    <Link to="/states/$stateSlug" params={{ stateSlug: state.stateSlug }} className="font-semibold text-primary underline underline-offset-3">
                      {state.stateName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{state.stateName}</span>
                  )}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top font-bold">{formatMoney(state.medianPay)}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{state.adjustedPay !== undefined ? formatMoney(state.adjustedPay) : <Missing>Not available</Missing>}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{state.employment !== undefined ? formatCount(state.employment) : <Missing>Not reported</Missing>}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{state.p10Pay !== undefined ? formatMoney(state.p10Pay) : <Missing>Not reported</Missing>}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{state.p90Pay !== undefined ? formatMoney(state.p90Pay) : <Missing>Not reported</Missing>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}

function Missing({ children }: { children: string }) {
  return <span className="text-[13px] text-muted-foreground">{children}</span>
}
