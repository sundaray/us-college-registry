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

export function formatShare(share: number) {
  return `${Math.round(share * 100)}%`
}

export function formatThousands(amount: number) {
  return `$${Math.round(amount / 1000)}k`
}
