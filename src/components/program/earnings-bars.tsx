import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'

type EarningsBar = {
  label: string
  detail?: string
  amount: number
  highlight?: boolean
}

export function EarningsBars({ bars }: { bars: EarningsBar[] }) {
  const scaleMax = Math.ceil(Math.max(...bars.map((bar) => bar.amount)) / 10000) * 10000

  return (
    <div className="flex flex-col gap-3">
      {bars.map((bar) => (
        <div
          key={`${bar.label}-${bar.detail ?? ''}`}
          className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[15rem_minmax(0,1fr)_5.5rem]"
        >
          <span className="text-muted-foreground">
            <span className={cn(bar.highlight && 'font-semibold text-foreground')}>{bar.label}</span>
            {bar.detail ? `, ${bar.detail}` : null}
          </span>
          <span className="relative col-span-2 row-start-2 h-3.5 sm:col-span-1 sm:row-start-auto">
            <span
              className={cn(
                'absolute inset-y-0 left-0 rounded-r-sm',
                bar.highlight ? 'bg-primary' : 'bg-muted-foreground/35',
              )}
              style={{ width: `${(bar.amount / scaleMax) * 100}%` }}
            />
          </span>
          <span className="col-start-2 row-start-1 text-right font-semibold tabular-nums sm:col-start-auto sm:row-start-auto">
            {formatMoney(bar.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}
