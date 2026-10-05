import { useState } from 'react'
import { StateProgramLink } from '@/components/hub/state-program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { NationalStateRow } from '@/data/national-program-page'
import { formatCount, formatMoney } from '@/lib/format'

type SortKey = 'pay' | 'debt' | 'programs'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest first-year pay' },
  { key: 'debt', label: 'Lowest debt' },
  { key: 'programs', label: 'Most programs' },
]

function rankFor(state: NationalStateRow, sortKey: SortKey) {
  if (sortKey === 'pay') return state.payRank
  return sortKey === 'debt' ? state.debtRank : state.programCountRank
}

// Every state ranking for one field, ranked by the state's median first-year pay
// in the prerendered HTML. With three or more states, buttons re-sort by debt or
// by number of programs. Ranks come from the record.
export function NationalStateTable({ states }: { states: NationalStateRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const sortable = states.length >= 3
  const sorted = [...states].sort(
    (first, second) => rankFor(first, sortKey) - rankFor(second, sortKey) || first.payRank - second.payRank || first.stateName.localeCompare(second.stateName),
  )
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
              <TableHead className="px-4 text-right">Programs</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {sorted.map((state) => (
              // data-state lets scripts/verify check each row against the raw data.
              <TableRow key={state.stateCode} data-state={state.stateCode}>
                {sortable ? <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(state, sortKey)}</TableCell> : null}
                <TableCell className="min-w-44 px-4 py-2.5 align-top whitespace-normal">
                  <StateProgramLink href={state.href} className="font-semibold text-primary underline underline-offset-3">
                    {state.stateName}
                  </StateProgramLink>
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{formatCount(state.programCount)}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top font-bold">{formatMoney(state.earningsYear1)}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{formatMoney(state.medianDebt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
