import { useState } from 'react'
import { ProgramLink } from '@/components/program/program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { RankedProgram } from '@/data/state-program-page'
import { formatMoney, formatShare } from '@/lib/format'

type SortKey = 'pay' | 'debt' | 'ratio'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest first-year pay' },
  { key: 'debt', label: 'Lowest debt' },
  { key: 'ratio', label: 'Lowest debt for the pay' },
]

function rankFor(program: RankedProgram, sortKey: SortKey) {
  if (sortKey === 'pay') return program.payRank
  return sortKey === 'debt' ? program.debtRank : program.ratioRank
}

// Programs ranked by first-year pay in the prerendered HTML. The buttons re-sort
// by debt or by debt for the pay; programs that don't report debt go last
// without a rank. Ranks come from the record, so they match the program pages.
export function RankingTable({ programs }: { programs: RankedProgram[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const sorted = [...programs].sort((first, second) => {
    const firstRank = rankFor(first, sortKey)
    const secondRank = rankFor(second, sortKey)
    if (firstRank === undefined && secondRank === undefined) return first.payRank - second.payRank
    if (firstRank === undefined) return 1
    if (secondRank === undefined) return -1
    return firstRank - secondRank || first.payRank - second.payRank || first.schoolName.localeCompare(second.schoolName)
  })

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
              <TableHead className="px-4">School</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">Year 5 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
              <TableHead className="px-4 text-right">Debt to pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {sorted.map((program) => {
              const rank = rankFor(program, sortKey)
              return (
                <TableRow key={`${program.schoolName}-${program.city}`}>
                  <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rank ?? ''}</TableCell>
                  <TableCell className="min-w-52 px-4 py-2.5 align-top whitespace-normal">
                    <span data-name="">
                      {program.href ? (
                        <ProgramLink href={program.href} className="font-semibold text-primary underline underline-offset-3">
                          {program.schoolName}
                        </ProgramLink>
                      ) : (
                        <span className="font-semibold">{program.schoolName}</span>
                      )}
                    </span>
                    <span data-name="" className="block text-[13px] text-muted-foreground">
                      {program.city} · {program.control.toLowerCase()}
                      {program.isOpen ? '' : ' · closed'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top font-bold">{formatMoney(program.earningsYear1)}</TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top">
                    {program.earningsYear5 !== undefined ? formatMoney(program.earningsYear5) : <NotReported />}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top">
                    {program.medianDebt !== undefined ? formatMoney(program.medianDebt) : <NotReported />}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top">
                    {program.medianDebt !== undefined ? formatShare(program.medianDebt / program.earningsYear1) : <NotReported />}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}

function NotReported() {
  return <span className="text-[13px] text-muted-foreground">Not reported</span>
}
