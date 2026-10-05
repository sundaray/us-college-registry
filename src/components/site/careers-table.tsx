import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CareersListPage } from '@/data/site-pages'
import { formatCount, formatMoney, roundedPercent } from '@/lib/format'

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

// Every career, highest median pay first in the prerendered HTML. Buttons re-sort
// by jobs or by projected growth; careers without the figure go last without a
// rank. Ranks come from the record.
export function CareersTable({ careers }: { careers: Career[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pay')
  const sorted = [...careers].sort((first, second) => {
    const firstRank = rankFor(first, sortKey)
    const secondRank = rankFor(second, sortKey)
    if (firstRank === undefined && secondRank === undefined) return first.payRank - second.payRank
    if (firstRank === undefined) return 1
    if (secondRank === undefined) return -1
    return firstRank - secondRank || first.payRank - second.payRank || first.name.localeCompare(second.name)
  })
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sort careers">
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
              <TableHead className="px-4">Career</TableHead>
              <TableHead className="px-4 text-right">Median pay</TableHead>
              <TableHead className="px-4 text-right">Jobs</TableHead>
              <TableHead className="px-4 text-right">Growth</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {sorted.map((career) => (
              // data-soc lets scripts/verify check each row against the raw data.
              <TableRow key={career.href} data-soc={career.socCode}>
                <TableCell className="px-4 py-2.5 align-top text-muted-foreground">{rankFor(career, sortKey) ?? ''}</TableCell>
                <TableCell className="min-w-52 px-4 py-2.5 align-top whitespace-normal">
                  <span data-name="">
                    <Link to="/careers/$careerSlug" params={{ careerSlug: career.href.split('/')[2] }} className="font-semibold text-primary underline underline-offset-3">
                      {career.name}
                    </Link>
                  </span>
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top font-bold">{formatMoney(career.medianPay)}</TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">
                  {career.employment !== undefined ? formatCount(career.employment) : <span className="text-[13px] text-muted-foreground">Not reported</span>}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right align-top">
                  {career.growthShare !== undefined ? growthLabel(career.growthShare) : <span className="text-[13px] text-muted-foreground">Not reported</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
