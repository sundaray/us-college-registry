import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Pager, ROWS_PER_PAGE } from '@/components/page-blocks'
import { NoMatch, SearchBox, SearchCount } from '@/components/site/search-box'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CareersListPage } from '@/data/site-pages'
import { formatCount, formatMoney, roundedPercent } from '@/lib/format'
import { matchesName, searchText } from '@/lib/name-search'
import { cn } from '@/lib/utils'

type Career = CareersListPage['careers'][number]
type SortKey = 'pay' | 'jobs' | 'growth'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pay', label: 'Highest pay' },
  { key: 'jobs', label: 'Most jobs' },
  { key: 'growth', label: 'Fastest growth' },
]

function rankFor(career: Career, sortKey: SortKey) {
  if (sortKey === 'pay') return career.payRank
  return sortKey === 'jobs' ? career.employmentRank : career.growthRank
}

// "+6%", "−3%", or "0%": the projected change in jobs from 2025 to 2035.
export function growthLabel(growthShare: number) {
  const percent = roundedPercent(Math.abs(growthShare))
  if (percent === 0) return '0%'
  return growthShare > 0 ? `+${percent}%` : `−${percent}%`
}

// Every career, highest median pay first in the prerendered HTML, the first page
// of ten showing. Every row is in the HTML; rows on other pages are hidden.
// Buttons re-sort by jobs or by projected growth and go back to the first page;
// careers without the figure go last without a rank. Ranks come from the record.
// The box above the buttons searches the careers by name, as on the programs
// list. A career the search leaves out is hidden. The pager counts only the
// ones found, and each career keeps its own rank.
export function CareersTable({ careers }: { careers: Career[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const names = useMemo(() => new Map(careers.map((career) => [career.href, searchText(career.name)])), [careers])
  const typed = searchText(query)
  const isSearching = typed.words.length > 0
  const figureCell = (key: SortKey) => cn('px-4 py-2.5 text-right align-top', key === sortKey && 'font-bold')
  const sortBy = (key: SortKey) => {
    setSortKey(key)
    setPage(1)
  }
  const search = (text: string) => {
    setQuery(text)
    setPage(1)
  }
  // Name ties are broken in a fixed locale, so the server and every browser sort alike.
  const sorted = [...careers].sort((first, second) => {
    const firstRank = rankFor(first, sortKey)
    const secondRank = rankFor(second, sortKey)
    if (firstRank === undefined && secondRank === undefined) return first.payRank - second.payRank
    if (firstRank === undefined) return 1
    if (secondRank === undefined) return -1
    return firstRank - secondRank || first.payRank - second.payRank || first.name.localeCompare(second.name, 'en')
  })
  const found = sorted.filter((career) => matchesName(typed, names.get(career.href)!))
  const pageCount = Math.ceil(found.length / ROWS_PER_PAGE)
  const shownHrefs = new Set(found.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE).map((career) => career.href))
  const searchedText = query.trim()
  return (
    <>
      <SearchBox label="Search careers" query={query} onQueryChange={search}>
        {isSearching && found.length > 0 ? <SearchCount count={found.length} singular="career" plural="careers" searchedText={searchedText} /> : null}
        {/* The empty state is inside the table. Here it is words for a screen reader only. */}
        {isSearching && found.length === 0 ? <p className="sr-only">No career matches "{searchedText}".</p> : null}
      </SearchBox>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sort careers">
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
              {/* The spare width goes to this column. The headings then stay in place when no row is left. */}
              <TableHead className="w-full px-4">Career</TableHead>
              <TableHead className="px-4 text-right">Median pay</TableHead>
              <TableHead className="px-4 text-right">Jobs</TableHead>
              <TableHead className="px-4 text-right">Growth</TableHead>
            </TableRow>
          </TableHeader>
          {/* The card's edge closes the table, so the last row on screen has no line of its own. */}
          <TableBody className="tabular-nums [&_tr:nth-last-child(1_of_:not([hidden]))]:border-0">
            {sorted.map((career) => (
              // data-soc lets scripts/verify check each row against the raw data.
              <TableRow key={career.href} data-soc={career.socCode} hidden={!shownHrefs.has(career.href)}>
                <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(career, sortKey) ?? ''}</TableCell>
                <TableCell className="min-w-48 px-4 py-2.5 align-top whitespace-normal">
                  <span data-name="">
                    <Link to="/careers/$careerSlug" params={{ careerSlug: career.href.split('/')[2] }} className="font-semibold text-primary underline underline-offset-3">
                      {career.name}
                    </Link>
                  </span>
                </TableCell>
                <TableCell className={figureCell('pay')}>{formatMoney(career.medianPay)}</TableCell>
                <TableCell className={figureCell('jobs')}>
                  {career.employment !== undefined ? formatCount(career.employment) : <span className="text-sm font-normal text-muted-foreground">Not reported</span>}
                </TableCell>
                <TableCell className={figureCell('growth')}>
                  {career.growthShare !== undefined ? growthLabel(career.growthShare) : <span className="text-sm font-normal text-muted-foreground">Not reported</span>}
                </TableCell>
              </TableRow>
            ))}
            {isSearching && found.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0 whitespace-normal">
                  <NoMatch thing="career" searchedText={searchedText} />
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
