import { useState } from 'react'
import { StateProgramLink } from '@/components/hub/state-program-link'
import { ProgramLink } from '@/components/program/program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SchoolProgram } from '@/data/school-page'
import { formatCount, formatMoney } from '@/lib/format'
import { ordinal } from '@/lib/program-copy'

type SortKey = 'pay' | 'debt' | 'graduates'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest first-year pay' },
  { key: 'debt', label: 'Lowest debt' },
  { key: 'graduates', label: 'Most graduates' },
]

function rankFor(program: SchoolProgram, sortKey: SortKey) {
  if (sortKey === 'pay') return program.payRank
  return sortKey === 'debt' ? program.debtRank : program.graduatesRank
}

// One school's programs at one credential level, ranked by first-year pay in the
// prerendered HTML. With three or more programs, buttons re-sort by debt or by
// graduates; programs that don't report the figure go last without a rank.
export function SchoolProgramTable({ programs, stateName }: { programs: SchoolProgram[]; stateName: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const sortable = programs.length >= 3
  const sorted = [...programs].sort((first, second) => {
    const firstRank = rankFor(first, sortKey)
    const secondRank = rankFor(second, sortKey)
    if (firstRank === undefined && secondRank === undefined) return first.payRank - second.payRank
    if (firstRank === undefined) return 1
    if (secondRank === undefined) return -1
    return firstRank - secondRank || first.payRank - second.payRank || first.name.localeCompare(second.name)
  })

  return (
    <>
      {sortable ? (
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
      ) : null}
      <Card size="sm" className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {sortable ? <TableHead className="px-4">#</TableHead> : null}
              <TableHead className="px-4">Program</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">Year 5 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
              <TableHead className="px-4 text-right">Rank in {stateName}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {sorted.map((program) => {
              const stateRank = `${ordinal(program.stateRank)} of ${formatCount(program.stateProgramCount)}`
              return (
                // data-cip lets scripts/verify check each row against the raw data.
                <TableRow key={program.cipCode} data-cip={program.cipCode}>
                  {sortable ? <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(program, sortKey) ?? ''}</TableCell> : null}
                  <TableCell className="min-w-52 px-4 py-2.5 align-top whitespace-normal">
                    <span data-name="">
                      {program.href ? (
                        <ProgramLink href={program.href} className="font-semibold text-primary underline underline-offset-3">
                          {program.name}
                        </ProgramLink>
                      ) : (
                        <span className="font-semibold">{program.name}</span>
                      )}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {program.graduatesPerYear !== undefined
                        ? `About ${formatCount(program.graduatesPerYear)} graduates a year`
                        : 'Graduates a year not reported'}
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
                    {program.stateRankingHref ? (
                      <StateProgramLink href={program.stateRankingHref} className="text-primary underline underline-offset-3">
                        {stateRank}
                      </StateProgramLink>
                    ) : (
                      stateRank
                    )}
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
