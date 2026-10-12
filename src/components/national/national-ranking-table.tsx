import { useState } from 'react'
import { Pager, ROWS_PER_PAGE } from '@/components/page-blocks'
import { ProgramLink } from '@/components/program/program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { NationalRankedProgram } from '@/data/national-program-page'
import { formatMoney, formatShare } from '@/lib/format'
import { cn } from '@/lib/utils'

type SortKey = 'pay' | 'afterPrices' | 'debt' | 'ratio'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest first-year pay' },
  { key: 'afterPrices', label: 'Highest pay after cost of living' },
  { key: 'debt', label: 'Lowest debt' },
  { key: 'ratio', label: 'Lowest debt-to-earnings' },
]

// On large screens the table and its pager are wider than the page column, so
// all seven columns fit without scrolling sideways.
const WIDER_THAN_COLUMN = 'lg:-mx-24'

function rankFor(program: NationalRankedProgram, sortKey: SortKey) {
  if (sortKey === 'pay') return program.payRank
  if (sortKey === 'afterPrices') return program.afterPricesRank
  return sortKey === 'debt' ? program.debtRank : program.ratioRank
}

// Programs ranked by first-year pay in the prerendered HTML, the first page of
// ten showing. The sort buttons re-sort and go back to the first page; programs
// without the figure go last without a rank. Ranks come from the record, as on
// the state ranking tables. Each row carries the school's unit ID so
// scripts/verify can check it against its Scorecard record.
export function NationalRankingTable({ programs }: { programs: NationalRankedProgram[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const [page, setPage] = useState(1)
  const pageCount = Math.ceil(programs.length / ROWS_PER_PAGE)
  // Name ties are broken in a fixed locale, so the server and every browser sort alike.
  const sorted = [...programs].sort((first, second) => {
    const firstRank = rankFor(first, sortKey)
    const secondRank = rankFor(second, sortKey)
    if (firstRank === undefined && secondRank === undefined) return first.payRank - second.payRank
    if (firstRank === undefined) return 1
    if (secondRank === undefined) return -1
    return firstRank - secondRank || first.payRank - second.payRank || first.schoolName.localeCompare(second.schoolName, 'en')
  })
  const figureCell = (key: SortKey) => cn('px-4 py-2.5 text-right align-top', key === sortKey && 'font-bold')
  const sortBy = (key: SortKey) => {
    setSortKey(key)
    setPage(1)
  }

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
            onClick={() => sortBy(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Card size="sm" className={cn('py-0', WIDER_THAN_COLUMN)}>
        <Table containerClassName="**:data-[slot=scroll-area-viewport]:fade-scroll-edges">
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">#</TableHead>
              <TableHead className="px-4">School</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">After cost of living</TableHead>
              <TableHead className="px-4 text-right">Year 5 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
              <TableHead className="px-4 text-right">Debt-to-earnings</TableHead>
            </TableRow>
          </TableHeader>
          {/* The card's edge closes the table, so the last row on screen has no line of its own. */}
          <TableBody className="tabular-nums [&_tr:nth-last-child(1_of_:not([hidden]))]:border-0">
            {sorted.map((program, position) => {
              const rank = rankFor(program, sortKey)
              return (
                <TableRow key={program.unitId} data-unit={program.unitId} hidden={Math.floor(position / ROWS_PER_PAGE) !== page - 1}>
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
                    <span data-name="" className="block text-sm text-muted-foreground">
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
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} className={WIDER_THAN_COLUMN} />
    </>
  )
}

function Missing({ children }: { children: string }) {
  return <span className="text-sm text-muted-foreground">{children}</span>
}
