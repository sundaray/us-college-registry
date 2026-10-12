import { useMemo, useState } from 'react'
import { NationalProgramLink } from '@/components/national/national-program-link'
import { Pager, ROWS_PER_PAGE } from '@/components/page-blocks'
import { NoMatch, SearchBox, SearchCount } from '@/components/site/search-box'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { RankedListedProgram } from '@/data/site-pages'
import { formatCount, formatMoney } from '@/lib/format'
import { matchesName, searchText } from '@/lib/name-search'
import { cn } from '@/lib/utils'

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
// prerendered HTML, the first page of ten showing. Every row is in the HTML; rows
// on other pages are hidden. Buttons re-sort by debt or by number of programs and
// go back to the first page. Ranks come from the record.
// The box above the table searches it by name, so a reader need not page through
// it. A program the search leaves out is hidden, the pager counts only the ones
// found, and each keeps its own rank. `searchLabel` names the box ("Search
// bachelor's programs").
export function ListedProgramTable({ programs, searchLabel }: { programs: RankedListedProgram[]; searchLabel: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const names = useMemo(() => new Map(programs.map((program) => [program.href, searchText(program.label)])), [programs])
  const typed = searchText(query)
  const isSearching = typed.words.length > 0
  // Name ties are broken in a fixed locale, so the server and every browser sort alike.
  const sorted = [...programs].sort(
    (first, second) => rankFor(first, sortKey) - rankFor(second, sortKey) || first.payRank - second.payRank || first.label.localeCompare(second.label, 'en'),
  )
  const found = sorted.filter((program) => matchesName(typed, names.get(program.href)!))
  const pageCount = Math.ceil(found.length / ROWS_PER_PAGE)
  const shownHrefs = new Set(found.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE).map((program) => program.href))
  const searchedText = query.trim()
  const figureCell = (key: SortKey) => cn('px-4 py-2.5 text-right align-top', key === sortKey && 'font-bold')
  const sortBy = (key: SortKey) => {
    setSortKey(key)
    setPage(1)
  }
  const search = (text: string) => {
    setQuery(text)
    setPage(1)
  }
  return (
    <>
      <SearchBox label={searchLabel} query={query} onQueryChange={search}>
        {isSearching && found.length > 0 ? <SearchCount count={found.length} singular="program" plural="programs" searchedText={searchedText} /> : null}
        {/* The empty state is inside the table, so here it is words for a screen reader only. */}
        {isSearching && found.length === 0 ? <p className="sr-only">No program matches "{searchedText}".</p> : null}
      </SearchBox>
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
              {/* The spare width goes to this column, so the headings stay in place when no row is left. */}
              <TableHead className="w-full px-4">Program</TableHead>
              <TableHead className="px-4 text-right">Programs</TableHead>
              <TableHead className="px-4 text-right">Year 1 pay</TableHead>
              <TableHead className="px-4 text-right">Debt</TableHead>
            </TableRow>
          </TableHeader>
          {/* The card's edge closes the table, so the last row on screen has no line of its own. */}
          <TableBody className="tabular-nums [&_tr:nth-last-child(1_of_:not([hidden]))]:border-0">
            {sorted.map((program) => (
              // data-href lets scripts/verify check each row against the raw data.
              <TableRow key={program.href} data-href={program.href} hidden={!shownHrefs.has(program.href)}>
                <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(program, sortKey)}</TableCell>
                <TableCell className="min-w-48 px-4 py-2.5 align-top whitespace-normal">
                  <span data-name="">
                    <NationalProgramLink href={program.href} className="font-semibold text-primary underline underline-offset-3">
                      {program.label}
                    </NationalProgramLink>
                  </span>
                </TableCell>
                <TableCell className={figureCell('programs')}>{formatCount(program.programCount)}</TableCell>
                <TableCell className={figureCell('pay')}>{formatMoney(program.earningsYear1)}</TableCell>
                <TableCell className={figureCell('debt')}>{formatMoney(program.medianDebt)}</TableCell>
              </TableRow>
            ))}
            {isSearching && found.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0 whitespace-normal">
                  <NoMatch thing="program" searchedText={searchedText} />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  )
}
