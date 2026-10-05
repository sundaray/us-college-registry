import type { ShareRange } from '@/data/program-page'

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const countFormatter = new Intl.NumberFormat('en-US')

export function formatMoney(amount: number) {
  return moneyFormatter.format(Math.round(amount))
}

export function formatCount(count: number) {
  return countFormatter.format(count)
}

// Whole percent, rounded half up. toFixed removes floating-point noise first, so
// 0.145 becomes 15% rather than 14% (0.145 * 100 is 14.499999... in JavaScript).
export function roundedPercent(share: number) {
  return Math.round(Number((share * 100).toFixed(6)))
}

export function formatShare(share: number) {
  return `${roundedPercent(share)}%`
}

export function formatThousands(amount: number) {
  return `$${Math.round(amount / 1000)}k`
}

// Scorecard publishes repayment shares as ranges: "30–39%", "10% or less".
export function formatShareRange(share: ShareRange) {
  const percent = roundedPercent
  switch (share.kind) {
    case 'atMost':
      return `${percent(share.high)}% or less`
    case 'atLeast':
      return `${percent(share.low)}% or more`
    case 'between':
      return `${percent(share.low)}–${percent(share.high)}%`
    case 'exact':
      return `${percent(share.value)}%`
  }
}

export function formatMiles(miles: number) {
  return miles < 1 ? 'Under 1 mi' : `${Math.round(miles)} mi`
}
