// Turns a program record into the numbers we calculate and the sentences we show.
// Wording changes with the data so that pages with different results read
// differently, and every claim in a sentence is checked against the record first.

import type { ProgramPage } from '@/data/program-page'
import { formatCount, formatMoney, formatShare, formatShareRange, roundedPercent } from '@/lib/format'

export type ProgramMetrics = ReturnType<typeof computeMetrics>

export function computeMetrics(page: ProgramPage) {
  const { earnings, debt, priceLevels, matchingOccupation, benchmarks } = page
  const hasYear5 = earnings.year5 !== undefined
  return {
    debtToEarnings: debt.median / earnings.year1,
    year5Growth: hasYear5 ? earnings.year5! / earnings.year1 - 1 : undefined,
    paymentShareOfPay:
      debt.monthlyPayment !== undefined ? debt.monthlyPayment / (earnings.year1 / 12) : undefined,
    adjustedYear1: priceLevels ? earnings.year1 / (priceLevels.areaIndex / 100) : undefined,
    areaPriceGap: priceLevels ? 1 - priceLevels.areaIndex / 100 : undefined,
    adjustedStateOccupationPay:
      matchingOccupation && priceLevels
        ? matchingOccupation.stateMedianPay / (priceLevels.stateIndex / 100)
        : undefined,
    inStateShare:
      earnings.workingCount && earnings.workingInStateCount !== undefined
        ? earnings.workingInStateCount / earnings.workingCount
        : undefined,
    year5GapToState:
      hasYear5 && benchmarks.state.earningsYear5 !== undefined
        ? earnings.year5! - benchmarks.state.earningsYear5
        : undefined,
    year5GapToNational:
      hasYear5 && benchmarks.national.earningsYear5 !== undefined
        ? earnings.year5! - benchmarks.national.earningsYear5
        : undefined,
  }
}

export function programLabel(page: ProgramPage) {
  return page.program.sentenceName
}

// "nursing bachelor's programs", "cosmetology certificate programs".
export function programKindPlural(page: ProgramPage) {
  return `${page.program.sentenceName} ${page.program.credential.toLowerCase()} programs`
}

// Bachelor's and associate's are degrees; certificates are not.
function degreeWord(page: ProgramPage) {
  return page.program.credentialLevel === 1 ? 'programs' : 'degrees'
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function ordinal(position: number) {
  const lastTwo = position % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
  return `${position}${suffixes[position % 10] ?? 'th'}`
}

// "4th lowest of 44" or "the lowest of 44".
export function rankLowest(rank: number, total: number) {
  return rank === 1 ? `the lowest of ${total}` : `${ordinal(rank)} lowest of ${total}`
}

// Context line under first-year earnings. The percentile is the share of programs
// nationally with lower pay, rounded to a whole number.
export function nationalPercentileLabel(page: ProgramPage) {
  const { nationalEarningsPercentile } = page.ranks
  const count = formatCount(page.benchmarks.national.earningsYear1Count)
  if (nationalEarningsPercentile < 1) return `Bottom 1% of ${count} programs nationally`
  if (nationalEarningsPercentile >= 100) return `Top 1% of ${count} programs nationally`
  return `${ordinal(nationalEarningsPercentile)} percentile of ${count} programs nationally`
}

// "90%", or "more than 99%" when the share rounds to 100% but isn't all of them.
export function shareOfPrograms(share: number) {
  return roundedPercent(share) === 100 && share < 1 ? 'more than 99%' : formatShare(share)
}

export function year5ChangeLabel(year5Growth: number) {
  const percent = roundedPercent(Math.abs(year5Growth))
  if (percent === 0) return 'About the same as year one'
  return year5Growth > 0 ? `${percent}% more than year one` : `${percent}% less than year one`
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
      `Where this program stands out is debt. The typical graduate leaves with ${formatMoney(debt.median)} in federal loans, less than at ${shareOfPrograms(ranks.debtLowerThanShare)} of ${program} programs in the country.`,
    )
  } else if (ranks.debtHigherThanShare >= 0.75) {
    sentences.push(
      `Debt is high. The typical graduate leaves with ${formatMoney(debt.median)} in federal loans, more than at ${shareOfPrograms(ranks.debtHigherThanShare)} of ${program} programs in the country.`,
    )
  } else {
    sentences.push(
      `The typical graduate leaves with ${formatMoney(debt.median)} in federal loans, close to the national median of ${formatMoney(benchmarks.national.medianDebt)}.`,
    )
  }

  const higherPayingInState = ranks.stateEarningsRank - 1
  const topQuarterInState = ranks.stateEarningsRank <= benchmarks.state.earningsYear1Count / 4
  if (topQuarterInState) {
    sentences.push(`It is one of the higher-paying ${program} ${degreeWord(page)} in ${school.stateName}.`)
  } else if (lowDebt && ranks.nationalEarningsPercentile <= 25 && earnings.year1 < benchmarks.state.earningsYear1) {
    sentences.push(
      `Debt is low, but pay is also below the ${school.stateName} median of ${formatMoney(benchmarks.state.earningsYear1)}.`,
    )
  } else if (lowDebt) {
    sentences.push(
      `Strong value, but not one of the highest-paying ${program} ${degreeWord(page)} in ${school.stateName}.`,
    )
  } else if (higherPayingInState >= 3) {
    sentences.push(`Several ${school.stateName} programs report higher pay.`)
  } else if (higherPayingInState === 2) {
    sentences.push(`Two other ${school.stateName} programs report higher pay.`)
  } else if (higherPayingInState === 1) {
    sentences.push(`One other ${school.stateName} program reports higher pay.`)
  }

  return sentences.join(' ')
}

// State programs with more debt than this one that also report higher five-year pay.
function higherDebtHigherYear5Count(page: ProgramPage) {
  const year5 = page.earnings.year5
  if (year5 === undefined) return 0
  return page.stateComparison.filter(
    (other) =>
      !other.isCurrent &&
      other.medianDebt > page.debt.median &&
      other.earningsYear5 !== undefined &&
      other.earningsYear5 > year5,
  ).length
}

// Needs 5-year earnings for the program, the state, and the nation.
export function buildFiveYearSentence(page: ProgramPage, metrics: ProgramMetrics) {
  const { school, benchmarks } = page
  if (
    metrics.year5GapToNational === undefined ||
    metrics.year5GapToState === undefined ||
    benchmarks.national.earningsYear5 === undefined ||
    benchmarks.state.earningsYear5 === undefined
  ) {
    return undefined
  }
  const nationalGapShare = metrics.year5GapToNational / benchmarks.national.earningsYear5
  const nationalDirection = Math.abs(nationalGapShare) < 0.03 ? 'same' : nationalGapShare > 0 ? 'more' : 'less'
  const nationalPhrase =
    nationalDirection === 'same'
      ? 'about the national figure'
      : nationalDirection === 'more'
        ? 'more than the national figure'
        : 'less than the national figure'
  const stateGapShare = metrics.year5GapToState / benchmarks.state.earningsYear5

  if (stateGapShare <= -0.03) {
    const connector = nationalDirection === 'less' ? 'and' : 'but'
    const higherDebtPrograms = higherDebtHigherYear5Count(page)
    const followUp =
      higherDebtPrograms >= 3
        ? ` Several ${school.stateName} programs with higher debt show higher pay by the five-year mark.`
        : ''
    return `Five years out, ${school.shortName} graduates earn ${nationalPhrase} ${connector} about ${formatMoney(Math.abs(metrics.year5GapToState))} less than the ${school.stateName} median.${followUp}`
  }
  if (stateGapShare >= 0.03) {
    const connector = nationalDirection === 'less' ? 'but' : 'and'
    return `Five years out, ${school.shortName} graduates earn ${nationalPhrase} ${connector} about ${formatMoney(metrics.year5GapToState)} more than the ${school.stateName} median.`
  }
  return `Five years out, ${school.shortName} graduates earn ${nationalPhrase} and about the same as the ${school.stateName} median.`
}

// Needs Pell and non-Pell first-year earnings.
export function buildFamilyIncomeSentence(page: ProgramPage) {
  const { earnings, debt } = page
  if (earnings.pellYear1 === undefined || earnings.otherYear1 === undefined) return undefined
  const payGapShare = (earnings.pellYear1 - earnings.otherYear1) / earnings.otherYear1
  const hasBothDebts = debt.pellMedian !== undefined && debt.otherMedian !== undefined
  // "Borrowed more" only when the gap is at least 10%, so rounding noise doesn't count.
  // Whole-number arithmetic: 25,000 * 1.1 is 27,500.000000000004 in floating point.
  const borrowedMore = hasBothDebts && debt.pellMedian! * 10 >= debt.otherMedian! * 11
  const borrowedLess = hasBothDebts && debt.pellMedian! < debt.otherMedian!
  const lead = 'Graduates who received Pell Grants, which go to students from lower-income families,'

  if (payGapShare <= -0.03) {
    return `${lead} earned ${formatMoney(Math.abs(earnings.pellYear1 - earnings.otherYear1))} less in their first year than other graduates.${borrowedMore ? ' They also borrowed more.' : ''} Students who expect to rely on grants should weigh this gap.`
  }
  const payPhrase =
    payGapShare >= 0.1
      ? 'earned more in their first year than other graduates'
      : payGapShare >= 0.02
        ? 'earned slightly more in their first year than other graduates'
        : 'earned about the same in their first year as other graduates'
  if (borrowedMore) {
    return `${lead} ${payPhrase}, but borrowed more: a median of ${formatMoney(debt.pellMedian!)} against ${formatMoney(debt.otherMedian!)}.`
  }
  return `${lead} ${payPhrase}.${borrowedLess ? ' They also borrowed less.' : ''} At this program, the outcome does not look worse for students with less money.`
}

// "Pay rises about 10% between the first and fifth year." Needs 5-year earnings.
export function buildGrowthSentence(page: ProgramPage, metrics: ProgramMetrics) {
  if (metrics.year5Growth === undefined) return undefined
  const percent = roundedPercent(Math.abs(metrics.year5Growth))
  let sentence =
    percent === 0
      ? 'Pay is about the same in the first and fifth year.'
      : metrics.year5Growth > 0
        ? `Pay rises about ${percent}% between the first and fifth year.`
        : `Pay falls about ${percent}% between the first and fifth year.`
  const matching = page.matchingOccupation
  if (matching) {
    const occupationPay = `${capitalize(matching.pluralName)} in ${page.school.stateName} earn a median of ${formatMoney(matching.stateMedianPay)} across all experience levels`
    sentence +=
      matching.stateMedianPay > page.earnings.year5!
        ? ` ${occupationPay}, which shows how much room there is to grow after the first few years.`
        : ` ${occupationPay}.`
  }
  return sentence
}

// The price sentence for "Where graduates work". Needs price levels.
export function buildPriceSentence(page: ProgramPage, metrics: ProgramMetrics) {
  const { priceLevels, earnings } = page
  if (!priceLevels || metrics.areaPriceGap === undefined || metrics.adjustedYear1 === undefined) {
    return undefined
  }
  const place =
    priceLevels.areaKind === 'metro'
      ? `the ${priceLevels.areaName}`
      : `the parts of ${priceLevels.areaName} outside metro areas`
  const percent = roundedPercent(Math.abs(metrics.areaPriceGap))
  if (percent === 0) {
    return { lead: `Prices in ${place} are about the same as the national average.` }
  }
  const direction = metrics.areaPriceGap > 0 ? 'below' : 'above'
  return {
    lead: `Prices in ${place} are about ${percent}% ${direction} the national average, so a ${formatMoney(earnings.year1)} salary here buys what about `,
    adjustedPay: formatMoney(metrics.adjustedYear1),
    tail: ' buys in a typical US city.',
  }
}

// The second paragraph of "Where graduates work". Needs a matching occupation and
// price levels.
export function buildOccupationPriceSentence(page: ProgramPage, metrics: ProgramMetrics) {
  const matching = page.matchingOccupation
  if (!matching || !page.priceLevels || metrics.adjustedStateOccupationPay === undefined) return undefined
  const { stateName } = page.school
  // Compares price-adjusted state pay with national pay plus or minus a percent,
  // in whole numbers so thresholds are exact. BEA indexes have three decimals.
  const indexThousandths = Math.round(page.priceLevels.stateIndex * 1000)
  const adjustedSide = matching.stateMedianPay * 100 * 100 * 1000
  const nationalSide = (percentChange: number) => matching.nationalMedianPay * (100 + percentChange) * indexThousandths
  const comparison =
    adjustedSide > nationalSide(5)
      ? `, which puts ${stateName} ahead.`
      : adjustedSide > nationalSide(0)
        ? `, which puts ${stateName} slightly ahead.`
        : adjustedSide < nationalSide(-5)
          ? `, which puts ${stateName} behind.`
          : adjustedSide < nationalSide(0)
            ? `, which puts ${stateName} slightly behind.`
            : '.'
  return {
    lead: `The median ${stateName} ${matching.shortName} earns ${formatMoney(matching.stateMedianPay)}, compared with a national median of ${formatMoney(matching.nationalMedianPay)}. After adjusting for ${stateName} prices, that pay is worth about `,
    adjustedPay: formatMoney(metrics.adjustedStateOccupationPay),
    tail: comparison,
  }
}

// "Nursing ranks 11th of 61 bachelor's programs at UT Austin by first-year earnings."
export function buildSchoolRankSentence(page: ProgramPage) {
  const { ranks, program, school } = page
  const credential = program.credential.toLowerCase()
  if (ranks.schoolProgramCount === 1) {
    return `${program.name} is the only ${credential} program at ${school.shortName} that reports first-year earnings.`
  }
  return `${program.name} ranks ${ordinal(ranks.schoolEarningsRank)} of ${ranks.schoolProgramCount} ${credential} programs at ${school.shortName} by first-year earnings.`
}

// With four or more programs, name the top three. With two or three, name the
// others, since a "top three" list would just repeat this program.
export function schoolProgramsToList(page: ProgramPage) {
  const count = page.ranks.schoolProgramCount
  if (count >= 4) return { lead: 'The top three are', programs: page.topSchoolPrograms }
  const others = page.topSchoolPrograms.filter((topProgram) => topProgram.name !== page.program.name)
  if (others.length === 0) return undefined
  return { lead: others.length === 1 ? 'The other is' : 'The others are', programs: others }
}

// State programs that pay more in the first year, and how many of them carry more debt.
function higherPayingStatePrograms(page: ProgramPage) {
  const higherPaying = page.stateComparison.filter(
    (other) => !other.isCurrent && other.earningsYear1 > page.earnings.year1,
  )
  const withMoreDebt = higherPaying.filter((other) => other.medianDebt > page.debt.median)
  return { count: higherPaying.length, withMoreDebtCount: withMoreDebt.length }
}

export function buildFaq(page: ProgramPage, metrics: ProgramMetrics) {
  const { school, earnings, debt, ranks, benchmarks, repayment } = page
  const program = programLabel(page)
  const items: { question: string; answer: string }[] = []

  const payParts = [
    earnings.year5 !== undefined
      ? `The median graduate earns ${formatMoney(earnings.year1)} one year after graduating and ${formatMoney(earnings.year5)} five years after.`
      : `The median graduate earns ${formatMoney(earnings.year1)} one year after graduating.`,
  ]
  const matching = page.matchingOccupation
  if (matching?.metroMedianPay !== undefined && matching.metroName) {
    payParts.push(
      `${capitalize(matching.pluralName)} in the ${matching.metroName} area earn a median of ${formatMoney(matching.metroMedianPay)} across all experience levels.`,
    )
  } else if (matching) {
    payParts.push(
      `${capitalize(matching.pluralName)} in ${school.stateName} earn a median of ${formatMoney(matching.stateMedianPay)} across all experience levels.`,
    )
  } else {
    payParts.push(
      `The median across ${programKindPlural(page)} in ${school.stateName} is ${formatMoney(benchmarks.state.earningsYear1)}.`,
    )
  }
  items.push({ question: `How much do ${school.shortName} ${program} graduates make?`, answer: payParts.join(' ') })

  const debtParts = [
    `The median federal loan balance is ${formatMoney(debt.median)}, which ranks ${rankLowest(ranks.stateDebtRank, ranks.stateProgramsWithBoth)} ${programKindPlural(page)} in ${school.stateName}.`,
  ]
  if (debt.monthlyPayment !== undefined) {
    debtParts.push(`That works out to about ${formatMoney(debt.monthlyPayment)} a month over 10 years.`)
  }
  items.push({ question: `How much debt do ${school.shortName} ${program} graduates have?`, answer: debtParts.join(' ') })

  const defaultRow = repayment?.rows.find((row) => row.status === 'default')
  const lowDebtRatio = metrics.debtToEarnings < benchmarks.national.debtToEarnings
  let worthAnswer: string
  if (lowDebtRatio) {
    worthAnswer = `On the numbers, yes for most students. Debt equals ${formatShare(metrics.debtToEarnings)} of first-year earnings, against a national median of ${formatShare(benchmarks.national.debtToEarnings)}${defaultRow ? `, and the share of borrowers in default two years into repayment is ${formatShareRange(defaultRow.share)}` : ''}.`
    const higherPaying = higherPayingStatePrograms(page)
    if (higherPaying.count >= 3) {
      const usuallyMoreDebt = higherPaying.withMoreDebtCount * 2 > higherPaying.count ? ', usually with more debt' : ''
      worthAnswer += ` If the highest possible early salary is the main goal, several ${school.stateName} programs report higher pay${usuallyMoreDebt}.`
    }
  } else {
    worthAnswer = `It depends on your other options. Debt equals ${formatShare(metrics.debtToEarnings)} of first-year earnings, against a national median of ${formatShare(benchmarks.national.debtToEarnings)}. Compare the cost with other ${school.stateName} programs before deciding.`
  }
  items.push({
    question:
      page.program.credentialLevel === 1
        ? `Is the ${program} program at ${school.shortName} worth it?`
        : `Is a ${program} degree from ${school.shortName} worth it?`,
    answer: worthAnswer,
  })

  if (metrics.inStateShare !== undefined) {
    items.push({
      question: `Do ${school.shortName} ${program} graduates stay in ${school.stateName}?`,
      answer: `${metrics.inStateShare >= 0.5 ? 'Most do.' : 'Many leave.'} ${formatShare(metrics.inStateShare)} (${formatCount(earnings.workingInStateCount!)} of ${formatCount(earnings.workingCount!)}) were working in ${school.stateName} one year after graduating.`,
    })
  }
  return items
}

// Kept near 60 characters where the names allow, so Google shows it in full on most
// screens. The same text is the H1.
export function buildPageTitle(page: ProgramPage) {
  const { school, program } = page
  const degree = program.degreeAbbreviation ?? program.credential
  return `${school.shortName} ${program.name} (${degree}): Tuition, Graduate Salary, and Debt`
}

// Kept near 160 characters where the names allow. Leads with the numbers people
// search for, then the debt comparison, worded to match the data. "Similar
// programs" are programs in the same field with the same credential nationwide.
export function buildMetaDescription(page: ProgramPage) {
  const { school, earnings, debt, ranks, benchmarks } = page
  const program = programLabel(page)
  const opening =
    earnings.year5 !== undefined
      ? `${school.shortName} ${program} graduates earn ${formatMoney(earnings.year1)} in year one and ${formatMoney(earnings.year5)} by year five.`
      : `${school.shortName} ${program} graduates earn ${formatMoney(earnings.year1)} in year one.`

  if (ranks.debtLowerThanShare >= 0.75) {
    return `${opening} Median federal debt: ${formatMoney(debt.median)}, lower than at ${shareOfPrograms(ranks.debtLowerThanShare)} of similar programs.`
  }
  if (ranks.debtHigherThanShare >= 0.75) {
    return `${opening} Median federal debt: ${formatMoney(debt.median)}, higher than at ${shareOfPrograms(ranks.debtHigherThanShare)} of similar programs.`
  }
  return `${opening} Median federal debt: ${formatMoney(debt.median)}, near the national median of ${formatMoney(benchmarks.national.medianDebt)}.`
}
