import { useState, type PointerEvent } from 'react'
import type { ComparisonProgram } from '@/data/programs'
import { formatMoney, formatThousands } from '@/lib/format'

type DebtEarningsScatterProps = {
  programs: ComparisonProgram[]
  medianDebt: number
  medianEarnings: number
  stateName: string
}

const width = 680
const height = 380
const margin = { top: 14, right: 18, bottom: 46, left: 60 }

function range(start: number, end: number, step: number) {
  const values: number[] = []
  for (let value = start; value <= end; value += step) values.push(value)
  return values
}

export function DebtEarningsScatter({
  programs,
  medianDebt,
  medianEarnings,
  stateName,
}: DebtEarningsScatterProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const debts = programs.map((program) => program.medianDebt)
  const earnings = programs.map((program) => program.earningsYear1)
  const debtMin = Math.floor(Math.min(...debts) / 10000) * 10000
  const debtMax = Math.ceil(Math.max(...debts) / 5000) * 5000
  const payMin = Math.floor((Math.min(...earnings) - 2000) / 5000) * 5000
  const payMax = Math.ceil((Math.max(...earnings) + 2000) / 5000) * 5000

  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const xPosition = (debt: number) => margin.left + ((debt - debtMin) / (debtMax - debtMin)) * plotWidth
  const yPosition = (pay: number) => margin.top + ((payMax - pay) / (payMax - payMin)) * plotHeight

  // Draw the current school last so it sits on top.
  const ordered = programs
    .map((program, index) => ({ program, index }))
    .sort((first, second) => Number(!!first.program.isCurrent) - Number(!!second.program.isCurrent))
  const current = programs.find((program) => program.isCurrent)
  const active = activeIndex === null ? null : programs[activeIndex]

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
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Scatter chart of median debt against first-year earnings for ${programs.length} ${stateName} programs.`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        {range(payMin + 5000, payMax, 5000).map((pay) => (
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
              className="fill-muted-foreground text-[12px] tabular-nums"
            >
              {formatThousands(pay)}
            </text>
          </g>
        ))}
        {range(debtMin, debtMax, 10000).map((debt) => (
          <text
            key={debt}
            x={xPosition(debt)}
            y={height - margin.bottom + 18}
            textAnchor="middle"
            className="fill-muted-foreground text-[12px] tabular-nums"
          >
            {formatThousands(debt)}
          </text>
        ))}
        <text
          x={margin.left + plotWidth / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-muted-foreground text-[12px]"
        >
          Median federal debt at graduation
        </text>
        <text
          x={14}
          y={margin.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${margin.top + plotHeight / 2})`}
          className="fill-muted-foreground text-[12px]"
        >
          First-year earnings
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
        <text x={margin.left + 8} y={margin.top + 14} className="fill-muted-foreground text-[12px]">
          Less debt, more pay
        </text>
        <text
          x={width - margin.right - 8}
          y={height - margin.bottom - 8}
          textAnchor="end"
          className="fill-muted-foreground text-[12px]"
        >
          More debt, less pay
        </text>

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
            x={xPosition(current.medianDebt) - 12}
            y={yPosition(current.earningsYear1) + 4}
            textAnchor="end"
            className="fill-primary text-[13px] font-semibold"
          >
            {current.schoolName}
          </text>
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute z-10 max-w-60 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md bg-foreground px-2.5 py-2 text-xs leading-snug text-background shadow-md"
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
