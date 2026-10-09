import { useState } from 'react'
import { ProgramLink } from '@/components/program/program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { NationalRankedProgram } from '@/data/national-program-page'
import { formatCount, formatMoney, formatShare } from '@/lib/format'
import { cn } from '@/lib/utils'

type SortKey = 'pay' | 'afterPrices' | 'debt' | 'ratio'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest first-year pay' },
  { key: 'afterPrices', label: 'Highest pay after cost of living' },
  { key: 'debt', label: 'Lowest debt' },
  { key: 'ratio', label: 'Lowest debt for the pay' },
]

// Rows shown before "Show all". The rest are in the HTML too, hidden.
const VISIBLE_ROWS = 10

function rankFor(program: NationalRankedProgram, sortKey: SortKey) {
  if (sortKey === 'pay') return program.payRank
  if (sortKey === 'afterPrices') return program.afterPricesRank
  return sortKey === 'debt' ? program.debtRank : program.ratioRank
}

// Programs ranked by first-year pay in the prerendered HTML, top 10 first. The
// buttons re-sort; programs without the figure go last without a rank. Ranks
// come from the record, as on the state ranking tables. Each row carries the
// school's unit ID so scripts/verify can check it against its Scorecard record.
export function NationalRankingTable({ programs }: { programs: NationalRankedProgram[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const [showAll, setShowAll] = useState(false)
  const sorted = [...programs].sort((first, second) => {
    const firstRank = rankFor(first, sortKey)
    const secondRank = rankFor(second, sortKey)
    if (firstRank === undefined && secondRank === undefined) return first.payRank - second.payRank
    if (firstRank === undefined) return 1
    if (secondRank === undefined) return -1
    return firstRank - secondRank || first.payRank - second.payRank || first.schoolName.localeCompare(second.schoolName)
  })
  const figureCell = (key: SortKey) => cn('px-4 py-2.5 text-right align-top', key === sortKey && 'font-bold')

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
              <TableHead className="px-4 text-right">After cost of living</TableHead>
              <TableHead className="px-4 text-right">Year 5 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
              <TableHead className="px-4 text-right">Debt to pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {sorted.map((program, position) => {
              const rank = rankFor(program, sortKey)
              return (
                <TableRow key={program.unitId} data-unit={program.unitId} hidden={!showAll && position >= VISIBLE_ROWS}>
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
                      {program.city}, {program.stateCode} · {program.control.toLowerCase()}
                      {program.isOpen ? '' : ' · closed'}
                    </span>
                  </TableCell>
                  <TableCell className={figureCell('pay')}>{formatMoney(program.earningsYear1)}</TableCell>
                  <TableCell className={figureCell('afterPrices')}>
                    {program.earningsYear1AfterPrices !== undefined ? formatMoney(program.earningsYear1AfterPrices) : <Missing>Not adjusted</Missing>}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top">
                    {program.earningsYear5 !== undefined ? formatMoney(program.earningsYear5) : <Missing>Not reported</Missing>}
                  </TableCell>
                  <TableCell className={figureCell('debt')}>
                    {program.medianDebt !== undefined ? formatMoney(program.medianDebt) : <Missing>Not reported</Missing>}
                  </TableCell>
                  <TableCell className={figureCell('ratio')}>
                    {program.medianDebt !== undefined ? formatShare(program.medianDebt / program.earningsYear1) : <Missing>Not reported</Missing>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      {programs.length > VISIBLE_ROWS ? (
        <div>
          <Button size="sm" variant="outline" className="rounded-full px-3.5" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? `Show the top ${VISIBLE_ROWS}` : `Show all ${formatCount(programs.length)} programs`}
          </Button>
        </div>
      ) : null}
    </>
  )
}

function Missing({ children }: { children: string }) {
  return <span className="text-[13px] text-muted-foreground">{children}</span>
}
