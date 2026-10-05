// Turns a program record into the numbers we calculate and the sentences we show.
// Wording changes with the data so that pages with different results read differently.

import type { ProgramPage } from '@/data/programs'
import { formatCount, formatMoney, formatShare } from '@/lib/format'

export type ProgramMetrics = ReturnType<typeof computeMetrics>

export function computeMetrics(page: ProgramPage) {
  const { earnings, debt, priceLevels, occupationPay, benchmarks } = page
  return {
    debtToEarnings: debt.median / earnings.year1,
    year5Growth: earnings.year5 / earnings.year1 - 1,
    paymentShareOfPay: debt.monthlyPayment / (earnings.year1 / 12),
    adjustedYear1: earnings.year1 / (priceLevels.areaIndex / 100),
    adjustedStateOccupationPay: occupationPay.stateMedian / (priceLevels.stateIndex / 100),
    areaPriceGap: 1 - priceLevels.areaIndex / 100,
    inStateShare: earnings.workingInStateCount / earnings.workingCount,
    year5GapToState: earnings.year5 - benchmarks.state.earningsYear5,
    year5GapToNational: earnings.year5 - benchmarks.national.earningsYear5,
  }
}

function programLabel(page: ProgramPage) {
  return page.program.name.toLowerCase()
}

export function buildSummary(page: ProgramPage) {
  const { school, earnings, debt, ranks, benchmarks } = page
  const program = programLabel(page)
  const sentences: string[] = []

  if (ranks.nationalEarningsPercentile >= 75) {
    sentences.push(
      `${school.shortName} ${program} graduates earn more than graduates of most ${program} programs nationally, ${formatMoney(earnings.year1)} in their first year.`,
    )
  } else if (ranks.nationalEarningsPercentile <= 25) {
    sentences.push(
      `${school.shortName} ${program} graduates earn less than graduates of most ${program} programs nationally, ${formatMoney(earnings.year1)} in their first year.`,
    )
  } else {
    sentences.push(
      `${school.shortName} ${program} graduates earn about what ${program} graduates earn nationally, ${formatMoney(earnings.year1)} in their first year.`,
    )
  }

  const lowDebt = ranks.debtLowerThanShare >= 0.75
  if (lowDebt) {
    sentences.push(
      `Where this program stands out is debt. The typical graduate leaves with ${formatMoney(debt.median)} in federal loans, less than at ${formatShare(ranks.debtLowerThanShare)} of ${program} programs in the country.`,
    )
  } else if (ranks.debtLowerThanShare <= 0.25) {
    sentences.push(
      `Debt is high. The typical graduate leaves with ${formatMoney(debt.median)} in federal loans, more than at ${formatShare(1 - ranks.debtLowerThanShare)} of ${program} programs in the country.`,
    )
  } else {
    sentences.push(
      `The typical graduate leaves with ${formatMoney(debt.median)} in federal loans, close to the national median of ${formatMoney(benchmarks.national.medianDebt)}.`,
    )
  }

  const topQuarterInState = ranks.stateEarningsRank <= benchmarks.state.programCount / 4
  if (topQuarterInState) {
    sentences.push(`It is one of the higher-paying ${program} degrees in ${school.stateName}.`)
  } else if (lowDebt) {
    sentences.push(
      `Strong value, but not one of the highest-paying ${program} degrees in ${school.stateName}.`,
    )
  } else {
    sentences.push(`Several ${school.stateName} programs report higher pay.`)
  }

  return sentences.join(' ')
}

export function buildFiveYearSentence(page: ProgramPage, metrics: ProgramMetrics) {
  const { school, benchmarks } = page
  const nationalGapShare = metrics.year5GapToNational / benchmarks.national.earningsYear5
  const nationalPhrase =
    Math.abs(nationalGapShare) < 0.03
      ? 'about the national figure'
      : nationalGapShare > 0
        ? 'more than the national figure'
        : 'less than the national figure'
  const stateGapShare = metrics.year5GapToState / benchmarks.state.earningsYear5

  if (stateGapShare <= -0.03) {
    return `Five years out, ${school.shortName} graduates earn ${nationalPhrase} but about ${formatMoney(Math.abs(metrics.year5GapToState))} less than the ${school.stateName} median. Several ${school.stateName} programs with higher debt show higher pay by the five-year mark.`
  }
  if (stateGapShare >= 0.03) {
    return `Five years out, ${school.shortName} graduates earn ${nationalPhrase} and about ${formatMoney(metrics.year5GapToState)} more than the ${school.stateName} median.`
  }
  return `Five years out, ${school.shortName} graduates earn ${nationalPhrase} and about the same as the ${school.stateName} median.`
}

export function buildFamilyIncomeSentence(page: ProgramPage) {
  const { earnings, debt } = page
  const payGapShare = (earnings.pellYear1 - earnings.otherYear1) / earnings.otherYear1
  const borrowedLess = debt.pellMedian < debt.otherMedian ? ' They also borrowed less.' : ''

  if (payGapShare >= 0.02) {
    return `Graduates who received Pell Grants, which go to students from lower-income families, earned slightly more in their first year than other graduates.${borrowedLess} At this program, the outcome does not look worse for students with less money.`
  }
  if (payGapShare > -0.03) {
    return `Graduates who received Pell Grants, which go to students from lower-income families, earned about the same in their first year as other graduates.${borrowedLess} At this program, the outcome does not look worse for students with less money.`
  }
  return `Graduates who received Pell Grants, which go to students from lower-income families, earned ${formatMoney(Math.abs(earnings.pellYear1 - earnings.otherYear1))} less in their first year than other graduates. Students who expect to rely on grants should weigh this gap.`
}

export function buildFaq(page: ProgramPage, metrics: ProgramMetrics) {
  const { school, earnings, debt, ranks, benchmarks, occupationPay, repayment } = page
  const program = programLabel(page)
  const defaultRow = repayment.rows.find((row) => row.label === 'In default')
  const lowDebtRatio = metrics.debtToEarnings < benchmarks.national.debtToEarnings

  return [
    {
      question: `How much do ${school.shortName} ${program} graduates make?`,
      answer: `The median graduate earns ${formatMoney(earnings.year1)} one year after graduating and ${formatMoney(earnings.year5)} five years after. Registered nurses in the ${occupationPay.metroName} area earn a median of ${formatMoney(occupationPay.metroMedian)} across all experience levels.`,
    },
    {
      question: `How much debt do ${school.shortName} ${program} graduates have?`,
      answer: `The median federal loan balance is ${formatMoney(debt.median)}, which ranks ${ordinal(ranks.stateDebtRank)} lowest of ${ranks.stateProgramsWithBoth} ${program} bachelor's programs in ${school.stateName}. That works out to about ${formatMoney(debt.monthlyPayment)} a month over 10 years.`,
    },
    {
      question: `Is a ${program} degree from ${school.shortName} worth it?`,
      answer: lowDebtRatio
        ? `On the numbers, yes for most students. Debt equals ${formatShare(metrics.debtToEarnings)} of first-year earnings, against a national median of ${formatShare(benchmarks.national.debtToEarnings)}${defaultRow ? `, and the share of borrowers in default two years out is ${defaultRow.share}` : ''}. If the highest possible early salary is the main goal, several ${school.stateName} programs report higher pay, usually with more debt.`
        : `It depends on your other options. Debt equals ${formatShare(metrics.debtToEarnings)} of first-year earnings, against a national median of ${formatShare(benchmarks.national.debtToEarnings)}. Compare the cost with other ${school.stateName} programs before deciding.`,
    },
    {
      question: `Do ${school.shortName} ${program} graduates stay in ${school.stateName}?`,
      answer: `${metrics.inStateShare >= 0.5 ? 'Most do.' : 'Many leave.'} ${formatShare(metrics.inStateShare)} (${formatCount(earnings.workingInStateCount)} of ${formatCount(earnings.workingCount)}) were working in ${school.stateName} one year after graduating.`,
    },
  ]
}

// Kept near 60 characters so Google shows it in full on most screens.
export function buildPageTitle(page: ProgramPage) {
  const { school, program } = page
  const degree = program.degreeAbbreviation ?? program.credential
  return `${school.shortName} ${program.name} (${degree}): Tuition, Graduate Salary, and Debt`
}

// Kept near 160 characters. Leads with the numbers people search for, then the
// debt comparison, worded to match the data.
export function buildMetaDescription(page: ProgramPage) {
  const { school, earnings, debt, ranks, benchmarks } = page
  const program = programLabel(page)
  const opening = `${school.shortName} ${program} graduates earn ${formatMoney(earnings.year1)} a year after graduating and ${formatMoney(earnings.year5)} after five.`

  if (ranks.debtLowerThanShare >= 0.75) {
    return `${opening} Median federal debt is ${formatMoney(debt.median)}, lower than at ${formatShare(ranks.debtLowerThanShare)} of ${program} programs.`
  }
  if (ranks.debtLowerThanShare <= 0.25) {
    return `${opening} Median federal debt is ${formatMoney(debt.median)}, higher than at ${formatShare(1 - ranks.debtLowerThanShare)} of ${program} programs.`
  }
  return `${opening} Median federal debt is ${formatMoney(debt.median)}, near the national median of ${formatMoney(benchmarks.national.medianDebt)}.`
}

export function ordinal(position: number) {
  const lastTwo = position % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
  return `${position}${suffixes[position % 10] ?? 'th'}`
}
