import { useState, type PointerEvent } from 'react'
import type { ComparisonProgram } from '@/data/program-page'
import { formatMoney, formatThousands } from '@/lib/format'
import { cn } from '@/lib/utils'

type DebtEarningsScatterProps = {
  programs: ComparisonProgram[]
  medianDebt: number
  medianEarnings: number
  stateName: string
  // The title under the debt axis. A graduate page names what its figure counts.
  debtTitle?: string
}

const width = 680
const height = 380
// The left margin leaves room for the pay title to clear the widest pay label by
// the same gap the debt title has under its labels.
const margin = { top: 14, right: 18, bottom: 46, left: 72 }
// Space between an axis's numbers and its title, on both axes.
const TITLE_GAP = 13
// The width of one character of an axis label at text-xs with tabular digits.
const LABEL_CHARACTER_WIDTH = 7.5

// The steps an axis can take between labels. An axis starts from the step that
// suits its range and takes the next one while it would carry more labels than
// stay apart: two text heights on the pay axis, and a label's width and a gap on
// the debt axis. Without this, a state whose programs range from $55,000 to
// $230,000 gets 36 pay labels, each printed over the next.
const AXIS_STEPS = [2000, 5000, 10000, 20000, 50000]
const MAX_PAY_LABELS = 14
const MAX_DEBT_LABELS = 12

function range(start: number, end: number, step: number) {
  const values: number[] = []
  for (let value = start; value <= end; value += step) values.push(value)
  return values
}

// The debt axis: its step and the values at its two ends. Certificate programs
// often have debt under $10,000, and the step shrinks with the range. The axis
// always spans at least one step, and it has a label at each end.
function debtAxis(debts: number[]) {
  const lowest = Math.min(...debts)
  const highest = Math.max(...debts)
  const firstStep = highest - lowest > 30000 ? 10000 : 2000
  let axis = { step: firstStep, axisMin: 0, axisMax: 0 }
  for (const step of AXIS_STEPS.filter((candidate) => candidate >= firstStep)) {
    const axisMin = Math.floor(lowest / step) * step
    axis = { step, axisMin, axisMax: Math.max(Math.ceil(highest / step) * step, axisMin + step) }
    if ((axis.axisMax - axis.axisMin) / step + 1 <= MAX_DEBT_LABELS) break
  }
  return axis
}

// The pay axis. It leaves half a step clear above the highest dot and below the
// lowest, and it has no label at its lower end.
function payAxis(earnings: number[]) {
  const lowest = Math.min(...earnings)
  const highest = Math.max(...earnings)
  const firstStep = highest - lowest > 20000 ? 5000 : 2000
  let axis = { step: firstStep, axisMin: 0, axisMax: 0 }
  for (const step of AXIS_STEPS.filter((candidate) => candidate >= firstStep)) {
    axis = { step, axisMin: Math.floor((lowest - step / 2) / step) * step, axisMax: Math.ceil((highest + step / 2) / step) * step }
    if ((axis.axisMax - axis.axisMin) / step <= MAX_PAY_LABELS) break
  }
  return axis
}

export function DebtEarningsScatter({
  programs,
  medianDebt,
  medianEarnings,
  stateName,
  debtTitle = 'Median federal debt at graduation',
}: DebtEarningsScatterProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const { step: debtStep, axisMin: debtMin, axisMax: debtMax } = debtAxis(programs.map((program) => program.medianDebt))
  const { step: payStep, axisMin: payMin, axisMax: payMax } = payAxis(programs.map((program) => program.earningsYear1))

  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const xPosition = (debt: number) => margin.left + ((debt - debtMin) / (debtMax - debtMin)) * plotWidth
  const yPosition = (pay: number) => margin.top + ((payMax - pay) / (payMax - payMin)) * plotHeight

  // Draw the current school last so it sits on top.
  const ordered = programs
    .map((program, index) => ({ program, index }))
    .sort((first, second) => Number(!!first.program.isCurrent) - Number(!!second.program.isCurrent))
  const current = programs.find((program) => program.isCurrent)
  const currentIsLeftHalf = current ? xPosition(current.medianDebt) < margin.left + plotWidth / 2 : false
  const active = activeIndex === null ? null : programs[activeIndex]
  const payTicks = range(payMin + payStep, payMax, payStep)
  // The pay title's baseline: left of the widest pay label by the title gap.
  const widestPayLabel = Math.max(...payTicks.map((pay) => formatThousands(pay).length)) * LABEL_CHARACTER_WIDTH
  const payTitleX = margin.left - 8 - widestPayLabel - TITLE_GAP
  const axisTitle = 'fill-muted-foreground text-xs font-semibold'

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const scale = width / box.width
    const pointerX = (event.clientX - box.left) * scale
    const pointerY = (event.clientY - box.top) * scale
    let nearestIndex: number | null = null
    let nearestDistance = Infinity
    programs.forEach((program, index) => {
      const distance =
        (xPosition(program.medianDebt) - pointerX) ** 2 + (yPosition(program.earningsYear1) - pointerY) ** 2
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })
    setActiveIndex(nearestDistance < 30 * 30 ? nearestIndex : null)
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Scatter chart of median federal debt against median first-year pay for ${programs.length} ${stateName} programs.`}
        onPointerMove={handlePointerMove}
        // A tap picks a dot on phones, which have no hover.
        onPointerDown={handlePointerMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        {payTicks.map((pay) => (
          <g key={pay}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={yPosition(pay)}
              y2={yPosition(pay)}
              className="stroke-border"
            />
            <text
              x={margin.left - 8}
              y={yPosition(pay) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-xs tabular-nums"
            >
              {formatThousands(pay)}
            </text>
          </g>
        ))}
        {range(debtMin, debtMax, debtStep).map((debt) => (
          <text
            key={debt}
            x={xPosition(debt)}
            y={height - margin.bottom + 18}
            textAnchor="middle"
            className="fill-muted-foreground text-xs tabular-nums"
          >
            {formatThousands(debt)}
          </text>
        ))}
        <text
          x={margin.left + plotWidth / 2}
          y={height - 6}
          textAnchor="middle"
          className={axisTitle}
        >
          {debtTitle}
        </text>
        <text
          x={payTitleX}
          y={margin.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${payTitleX} ${margin.top + plotHeight / 2})`}
          className={axisTitle}
        >
          Median first-year pay
        </text>

        <line
          x1={xPosition(medianDebt)}
          x2={xPosition(medianDebt)}
          y1={margin.top}
          y2={height - margin.bottom}
          strokeDasharray="4 4"
          className="stroke-muted-foreground/60"
        />
        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={yPosition(medianEarnings)}
          y2={yPosition(medianEarnings)}
          strokeDasharray="4 4"
          className="stroke-muted-foreground/60"
        />
        {ordered.map(({ program, index }) => {
          const isActive = index === activeIndex
          const radius = (program.isCurrent ? 7 : 5) + (isActive ? 2 : 0)
          return (
            <circle
              key={`${program.schoolName}-${index}`}
              cx={xPosition(program.medianDebt)}
              cy={yPosition(program.earningsYear1)}
              r={radius}
              strokeWidth={2}
              className={program.isCurrent ? 'fill-primary stroke-card' : 'fill-muted-foreground/45 stroke-card'}
            />
          )
        })}
        {current ? (
          <text
            // Label on the side of the dot with more room, so long names stay inside the chart.
            x={xPosition(current.medianDebt) + (currentIsLeftHalf ? 12 : -12)}
            y={yPosition(current.earningsYear1) + 4}
            textAnchor={currentIsLeftHalf ? 'start' : 'end'}
            className="fill-primary text-sm font-semibold"
          >
            {current.schoolName}
          </text>
        ) : null}
      </svg>

      {active ? (
        <div
          // Dots near the top show the tooltip below them, so the chart's scroll
          // box doesn't cut it off.
          className={cn(
            'pointer-events-none absolute z-10 max-w-60 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-2 text-xs leading-snug text-background shadow-md',
            yPosition(active.earningsYear1) < height * 0.3 ? 'translate-y-3' : '-translate-y-[calc(100%+12px)]',
          )}
          style={{
            left: `${Math.min(Math.max((xPosition(active.medianDebt) / width) * 100, 18), 82)}%`,
            top: `${(yPosition(active.earningsYear1) / height) * 100}%`,
          }}
        >
          <div className="font-semibold">{active.schoolName}</div>
          <div className="tabular-nums">
            {active.city} · Pay {formatMoney(active.earningsYear1)} · Debt {formatMoney(active.medianDebt)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
