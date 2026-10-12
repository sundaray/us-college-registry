import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Pager, ROWS_PER_PAGE } from '@/components/page-blocks'
import { ProgramLink } from '@/components/program/program-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SchoolControl } from '@/data/program-page'
import type { StateSchool } from '@/data/state-page'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type SortKey = 'name' | 'programs'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'A to Z' },
  { key: 'programs', label: 'Most programs' },
]

const CONTROL_LABELS: Record<SchoolControl, string> = {
  Public: 'Public',
  'Private nonprofit': 'Private nonprofit',
  'Private for-profit': 'For-profit',
}

const LINK_CLASS_NAME = 'font-semibold text-primary underline underline-offset-3'

// Every school in the state with a program page, A to Z in the prerendered HTML,
// the first page of ten showing. Every row is in the HTML; rows on other pages
// are hidden. Schools with a school page link to it; schools with one program
// link to that program's page.
export function StateSchoolTable({ schools }: { schools: StateSchool[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [page, setPage] = useState(1)
  const pageCount = Math.ceil(schools.length / ROWS_PER_PAGE)
  // Name ties are broken in a fixed locale, so the server and every browser sort alike.
  const sorted =
    sortKey === 'name'
      ? schools
      : [...schools].sort((first, second) => second.programCount - first.programCount || first.name.localeCompare(second.name, 'en'))
  const sortBy = (key: SortKey) => {
    setSortKey(key)
    setPage(1)
  }
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sort schools">
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
              <TableHead className="px-4">School</TableHead>
              <TableHead className="px-4">City</TableHead>
              <TableHead className="px-4">Type</TableHead>
              <TableHead className="px-4 text-right">Programs</TableHead>
            </TableRow>
          </TableHeader>
          {/* The card's edge closes the table, so the last row on screen has no line of its own. */}
          <TableBody className="tabular-nums [&_tr:nth-last-child(1_of_:not([hidden]))]:border-0">
            {sorted.map((school, position) => (
              // data-unit-id lets scripts/verify check each row against the raw data.
              <TableRow key={school.unitId} data-unit-id={school.unitId} hidden={Math.floor(position / ROWS_PER_PAGE) !== page - 1}>
                <TableCell className="min-w-48 px-4 py-2.5 align-top whitespace-normal">
                  <span data-name="">
                    {school.programName ? (
                      <ProgramLink href={school.href} className={LINK_CLASS_NAME}>
                        {school.name}
                      </ProgramLink>
                    ) : (
                      <Link to="/schools/$schoolSlug" params={{ schoolSlug: school.href.split('/')[2] }} className={LINK_CLASS_NAME}>
                        {school.name}
                      </Link>
                    )}
                  </span>
                  {school.programName ? (
                    <span data-name="" className="block text-sm text-muted-foreground">
                      {school.programName}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-2.5 align-top whitespace-normal">
                  <span data-name="">{school.city}</span>
                </TableCell>
                <TableCell className="px-4 py-2.5 align-top">{CONTROL_LABELS[school.control]}</TableCell>
                <TableCell className={cn('px-4 py-2.5 text-right align-top', sortKey === 'programs' && 'font-bold')}>{formatCount(school.programCount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  )
}
