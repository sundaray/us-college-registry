import { useState } from 'react'
import { Pager, ROWS_PER_PAGE } from '@/components/page-blocks'
import { ProgramLink } from '@/components/program/program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { RankedProgram } from '@/data/state-program-page'
import { formatMoney, formatShare } from '@/lib/format'
import { cn } from '@/lib/utils'

type SortKey = 'pay' | 'debt' | 'ratio'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest first-year pay' },
  { key: 'debt', label: 'Lowest debt' },
  { key: 'ratio', label: 'Lowest debt-to-earnings' },
]

function rankFor(program: RankedProgram, sortKey: SortKey) {
  if (sortKey === 'pay') return program.payRank
  return sortKey === 'debt' ? program.debtRank : program.ratioRank
}

// Programs ranked by first-year pay in the prerendered HTML, the first page of
// ten showing. Every row is in the HTML; rows on other pages are hidden. The
// buttons re-sort by debt or by debt-to-earnings and go back to the first page;
// programs that don't report debt go last without a rank. Ranks come from the
// record, so they match the program pages.
export function RankingTable({ programs }: { programs: RankedProgram[] }) {
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
      <Card size="sm" className="py-0">
        <Table containerClassName="**:data-[slot=scroll-area-viewport]:fade-scroll-edges">
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">#</TableHead>
              <TableHead className="px-4">School</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
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
                <TableRow key={`${program.schoolName}-${program.city}`} hidden={Math.floor(position / ROWS_PER_PAGE) !== page - 1}>
                  <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rank ?? ''}</TableCell>
                  {/* A little narrower than on the national table, so all six columns fit the page column. */}
                  <TableCell className="min-w-48 px-4 py-2.5 align-top whitespace-normal">
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
                      {program.city} · {program.control.toLowerCase()}
                      {program.isOpen ? '' : ' · closed'}
                    </span>
                  </TableCell>
                  <TableCell className={figureCell('pay')}>{formatMoney(program.earningsYear1)}</TableCell>
                  <TableCell className="px-4 py-2.5 text-right align-top">
                    {program.earningsYear5 !== undefined ? formatMoney(program.earningsYear5) : <NotReported />}
                  </TableCell>
                  <TableCell className={figureCell('debt')}>
                    {program.medianDebt !== undefined ? formatMoney(program.medianDebt) : <NotReported />}
                  </TableCell>
                  <TableCell className={figureCell('ratio')}>
                    {program.medianDebt !== undefined ? formatShare(program.medianDebt / program.earningsYear1) : <NotReported />}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  )
}

function NotReported() {
  return <span className="text-sm text-muted-foreground">Not reported</span>
}
