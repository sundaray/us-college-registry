import { useState } from 'react'
import { NationalProgramLink } from '@/components/national/national-program-link'
import { Pager, ROWS_PER_PAGE } from '@/components/page-blocks'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OccupationProgram } from '@/data/occupation-page'
import { formatCount, formatMoney } from '@/lib/format'

// The programs that lead to a job, highest first-year pay first, the first page
// of ten showing. Every row is in the HTML; rows on other pages are hidden.
export function OccupationProgramTable({ programs }: { programs: OccupationProgram[] }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.ceil(programs.length / ROWS_PER_PAGE)
  return (
    <>
      <Card size="sm" className="py-0">
        <Table containerClassName="**:data-[slot=scroll-area-viewport]:fade-scroll-edges">
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Program</TableHead>
              <TableHead className="px-4 text-right">Programs</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
            </TableRow>
          </TableHeader>
          {/* The card's edge closes the table, so the last row on screen has no line of its own. */}
          <TableBody className="tabular-nums [&_tr:nth-last-child(1_of_:not([hidden]))]:border-0">
            {programs.map((program, position) => (
              // data-href lets scripts/verify check each row against the raw data.
              <TableRow key={program.href} data-href={program.href} hidden={Math.floor(position / ROWS_PER_PAGE) !== page - 1}>
                <TableCell className="min-w-48 px-4 py-2.5 align-top whitespace-normal">
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
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  )
}
