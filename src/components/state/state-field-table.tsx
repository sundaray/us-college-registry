import { useState } from 'react'
import { StateProgramLink } from '@/components/hub/state-program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { StateField } from '@/data/state-page'
import { formatCount, formatMoney } from '@/lib/format'
import { fieldLabel } from '@/lib/state-copy'

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
// prerendered HTML. With three or more fields, buttons re-sort by debt or by
// number of programs. Ranks come from the record.
export function StateFieldTable({ fields }: { fields: StateField[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const sortable = fields.length >= 3
  const sorted = [...fields].sort(
    (first, second) => rankFor(first, sortKey) - rankFor(second, sortKey) || first.payRank - second.payRank || first.name.localeCompare(second.name),
  )
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
              <TableHead className="px-4">Field</TableHead>
              <TableHead className="px-4 text-right">Programs</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {sorted.map((field) => (
              // data-cip lets scripts/verify check each row against the raw data.
              <TableRow key={field.cipCode} data-cip={field.cipCode}>
                {sortable ? <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(field, sortKey)}</TableCell> : null}
                <TableCell className="min-w-52 px-4 py-2.5 align-top whitespace-normal">
                  <span data-name="">
                    <StateProgramLink href={field.href} className="font-semibold text-primary underline underline-offset-3">
                      {fieldLabel(field)}
                    </StateProgramLink>
                  </span>
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{formatCount(field.programCount)}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top font-bold">{formatMoney(field.earningsYear1)}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{formatMoney(field.medianDebt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
