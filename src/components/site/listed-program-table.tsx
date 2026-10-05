import { useState } from 'react'
import { NationalProgramLink } from '@/components/national/national-program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { RankedListedProgram } from '@/data/site-pages'
import { formatCount, formatMoney } from '@/lib/format'

type SortKey = 'pay' | 'debt' | 'programs'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest first-year pay' },
  { key: 'debt', label: 'Lowest debt' },
  { key: 'programs', label: 'Most programs' },
]

function rankFor(program: RankedListedProgram, sortKey: SortKey) {
  if (sortKey === 'pay') return program.payRank
  return sortKey === 'debt' ? program.debtRank : program.programCountRank
}

// Fields at one credential level, ranked by national median first-year pay in the
// prerendered HTML. Buttons re-sort by debt or by number of programs. Ranks come
// from the record.
export function ListedProgramTable({ programs }: { programs: RankedListedProgram[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const sorted = [...programs].sort(
    (first, second) => rankFor(first, sortKey) - rankFor(second, sortKey) || first.payRank - second.payRank || first.label.localeCompare(second.label),
  )
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sort programs">
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
      <Card size="sm" className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">#</TableHead>
              <TableHead className="px-4">Program</TableHead>
              <TableHead className="px-4 text-right">Programs</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {sorted.map((program) => (
              // data-href lets scripts/verify check each row against the raw data.
              <TableRow key={program.href} data-href={program.href}>
                <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(program, sortKey)}</TableCell>
                <TableCell className="min-w-52 px-4 py-2.5 align-top whitespace-normal">
                  <span data-name="">
                    <NationalProgramLink href={program.href} className="font-semibold text-primary underline underline-offset-3">
                      {program.label}
                    </NationalProgramLink>
                  </span>
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{formatCount(program.programCount)}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top font-bold">{formatMoney(program.earningsYear1)}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">{formatMoney(program.medianDebt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
