import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { OccupationOutlook } from '@/data/program-page'
import { formatCount, formatMoney, roundedPercent } from '@/lib/format'

// Building blocks shared by program pages and hub pages, so both render the same
// markup for sections, key figures, and job pay.

// One scale for every pay range on the page, so the bars compare with each other.
export function payRangeScale(occupations: OccupationOutlook[]) {
  const lows = occupations.flatMap((occupation) => (occupation.stateP10Pay !== undefined && occupation.stateP90Pay !== undefined ? [occupation.stateP10Pay] : []))
  const highs = occupations.flatMap((occupation) => (occupation.stateP10Pay !== undefined && occupation.stateP90Pay !== undefined ? [occupation.stateP90Pay] : []))
  if (lows.length === 0) return { scaleMin: 0, scaleMax: 1 }
  return {
    scaleMin: Math.floor(Math.min(...lows) / 10000) * 10000,
    scaleMax: Math.ceil(Math.max(...highs) / 10000) * 10000,
  }
}

export function occupationDetail(occupation: OccupationOutlook, stateName: string) {
  const parts: string[] = [occupation.stateMedianPay !== undefined ? `Median pay in ${stateName}.` : 'Median pay nationwide.']
  if (occupation.stateEmployment !== undefined) {
    parts.push(`${formatCount(occupation.stateEmployment)} people work in this job in ${stateName}.`)
  }
  if (occupation.growthShare !== undefined && occupation.openingsPerYear !== undefined) {
    const percent = roundedPercent(Math.abs(occupation.growthShare))
    const change =
      percent === 0
        ? 'projected to stay about the same in number'
        : occupation.growthShare > 0
          ? `projected to grow ${percent}%`
          : `projected to shrink ${percent}%`
    parts.push(`Nationally, jobs are ${change} from 2025 to 2035, with about ${formatCount(occupation.openingsPerYear)} openings a year.`)
  }
  if (occupation.typicalEducation) {
    parts.push(
      `Typical education to start: ${occupation.typicalEducation.charAt(0).toLowerCase()}${occupation.typicalEducation.slice(1)}${occupation.workExperience ? `, plus ${occupation.workExperience.toLowerCase()} of related work experience` : ''}.`,
    )
  }
  return parts.join(' ')
}

export function OccupationRow({
  occupation,
  stateName,
  scale,
}: {
  occupation: OccupationOutlook
  stateName: string
  scale: { scaleMin: number; scaleMax: number }
}) {
  const pay = occupation.stateMedianPay ?? occupation.nationalMedianPay!
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b px-4 py-4 last:border-b-0">
      <h3 data-name="" className="text-base font-bold">
        {occupation.careerSlug ? (
          <Link to="/careers/$careerSlug" params={{ careerSlug: occupation.careerSlug }} className="text-primary underline underline-offset-3">
            {occupation.title}
          </Link>
        ) : (
          occupation.title
        )}
      </h3>
      <span className="text-right text-xl font-extrabold tabular-nums">{formatMoney(pay)}</span>
      <p className="col-span-2 text-sm text-muted-foreground">{occupationDetail(occupation, stateName)}</p>
      {occupation.stateMedianPay !== undefined && occupation.stateP10Pay !== undefined && occupation.stateP90Pay !== undefined ? (
        <PayRange low={occupation.stateP10Pay} middle={occupation.stateMedianPay} high={occupation.stateP90Pay} scale={scale} />
      ) : null}
    </div>
  )
}

export function Section({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <section data-section={name} className="mt-13 flex flex-col gap-3.5 [&>p]:max-w-[66ch]">
      <h2 className="text-[23px] leading-tight font-bold tracking-tight text-balance">{title}</h2>
      {children}
    </section>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-[66ch] text-sm text-muted-foreground">{children}</p>
}

// Grid classes for a row of key figures. Tailwind only finds class names written
// out in full. With three figures, the third spans the phone row instead of
// leaving an empty cell beside it.
const KEY_FIGURE_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3 [&>:last-child]:col-span-2 md:[&>:last-child]:col-span-1',
  4: 'grid-cols-2 md:grid-cols-4',
}

export function keyFigureColumns(count: number) {
  return KEY_FIGURE_COLUMNS[count]
}

export function KeyFigure({ label, value, context }: { label: string; value: string; context: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 pt-4 pb-4.5">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <span className="text-[28px] leading-tight font-extrabold tracking-tight tabular-nums">{value}</span>
      <span className="text-[13px] leading-snug text-muted-foreground">{context}</span>
    </div>
  )
}

export function PayRange({
  low,
  middle,
  high,
  scale,
}: {
  low: number
  middle: number
  high: number
  scale: { scaleMin: number; scaleMax: number }
}) {
  const position = (amount: number) => ((amount - scale.scaleMin) / (scale.scaleMax - scale.scaleMin)) * 100
  return (
    <div className="col-span-2 mt-2" aria-label={`Pay range: bottom 10% ${formatMoney(low)}, median ${formatMoney(middle)}, top 10% ${formatMoney(high)}`}>
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 rounded-full border border-primary bg-primary/15"
          style={{ left: `${position(low)}%`, right: `${100 - position(high)}%` }}
        />
        <div className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full bg-primary" style={{ left: `${position(middle)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>Bottom 10%: {formatMoney(low)}</span>
        <span>Top 10%: {formatMoney(high)}</span>
      </div>
    </div>
  )
}
