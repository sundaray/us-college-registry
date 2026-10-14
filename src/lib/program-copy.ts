// Turns a program record into the numbers we calculate and the sentences we show.
// Wording changes with the data so that pages with different results read
// differently, and every claim in a sentence is checked against the record first.

import type { PageQuestion } from '@/components/page-blocks'
import { isGraduateLevel, type ProgramPage } from '@/data/program-page'
import { classYearsNote, combinedCampusesNotes, payPrivacyNote, reportedFiguresNote } from '@/lib/data-notes'
import { formatCount, formatMoney, formatShare, roundedPercent } from '@/lib/format'
import { stateCareersIntro, stateCareersTitle } from '@/lib/job-copy'
import { officialProgramFieldSentence, programKeyFigureQuestions } from '@/lib/key-figure-copy'
import { isState, placeInSentence } from '@/lib/place-names'
import { summaryParagraphs } from '@/lib/summary'

export type ProgramMetrics = ReturnType<typeof computeMetrics>

export function computeMetrics(page: ProgramPage) {
  const { earnings, debt, priceLevels, matchingOccupation, benchmarks } = page
  const hasYear5 = earnings.year5 !== undefined
  return {
    debtToEarnings: debt.median / earnings.year1,
    year5Growth: hasYear5 ? earnings.year5! / earnings.year1 - 1 : undefined,
    paymentShareOfPay:
      debt.monthlyPayment !== undefined ? debt.monthlyPayment / (earnings.year1 / 12) : undefined,
    adjustedYear1: priceLevels?.area ? earnings.year1 / (priceLevels.area.index / 100) : undefined,
    areaPriceGap: priceLevels?.area ? 1 - priceLevels.area.index / 100 : undefined,
    adjustedStateOccupationPay:
      matchingOccupation && priceLevels
        ? matchingOccupation.stateMedianPay / (priceLevels.stateIndex / 100)
        : undefined,
    // The share of working graduates who work in the school's state. The federal
    // counts carry a little random noise to protect privacy, and the in-state
    // count can come out above the total. No share is given then.
    inStateShare:
      earnings.workingCount && earnings.workingInStateCount !== undefined && earnings.workingInStateCount <= earnings.workingCount
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

export function isGraduateProgram(page: ProgramPage) {
  return isGraduateLevel(page.program.credentialLevel)
}

// The program as sentences name it. A school can have a bachelor's and a
// master's program in one field. A graduate page names the degree too:
// "business administration master's".
export function programLabel(page: ProgramPage) {
  return isGraduateProgram(page) ? `${page.program.sentenceName} ${page.program.credential.toLowerCase()}` : page.program.sentenceName
}

// A school's name as it reads when it stands alone in a sentence: "at the
// University of Missouri", "at Harvard University". A name that opens with a
// general word and "of" takes "the", and a name that opens with "The" keeps it
// in lower case.
export function schoolInSentence(shortName: string) {
  if (shortName.startsWith('The ')) return `the ${shortName.slice(4)}`
  return /^(University|College|Institute|School|Academy) of /.test(shortName) ? `the ${shortName}` : shortName
}

// The name of the debt figure. A graduate program's figure counts only loans
// taken for graduate study at the school, and its name says so wherever it shows.
export function debtFigureLabel(page: ProgramPage) {
  return isGraduateProgram(page) ? 'Median federal debt for graduate study' : 'Median federal debt'
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

// "an accounting", "a nursing": a phrase with the article it takes. The choice
// goes by the first letter, which is right for every field name on the site. A
// name that starts with a vowel letter and a consonant sound ("European") would
// need a rule of its own.
export function withArticle(phrase: string) {
  return `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`
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

// Context line under first-year pay: the share of programs nationally with lower
// pay, rounded to a whole number.
export function nationalPayStandingLabel(page: ProgramPage) {
  const { nationalEarningsPercentile } = page.ranks
  const count = formatCount(page.benchmarks.national.earningsYear1Count)
  if (nationalEarningsPercentile < 1) return `Bottom 1% of ${count} programs nationally`
  if (nationalEarningsPercentile >= 100) return `Top 1% of ${count} programs nationally`
  return `Higher than ${nationalEarningsPercentile}% of ${count} programs nationally`
}

// "90% of nursing programs", or "nearly all nursing programs" when the share
// rounds to 100% but isn't all of them. `programs` names what is counted. The
// words used to be "more than 99% of", which after "more than" made a reader
// trip; the user chose "nearly all" on 2026-10-13. "Those programs" keeps its
// "of": "nearly all of those programs".
export function shareOfPrograms(share: number, programs: string) {
  if (roundedPercent(share) !== 100 || share >= 1) return `${formatShare(share)} of ${programs}`
  return programs.startsWith('those ') ? `nearly all of ${programs}` : `nearly all ${programs}`
}

export function year5ChangeLabel(year5Growth: number) {
  const percent = roundedPercent(Math.abs(year5Growth))
  if (percent === 0) return 'About the same as year one'
  return year5Growth > 0 ? `${percent}% more than year one` : `${percent}% less than year one`
}

// A figure within this many percent of a median is "about the same" as it. The
// limit is wider for pay: to protect privacy the Department of Education changes
// each pay figure slightly before publishing it (94% of first-year figures by
// less than 5%), so a smaller gap in pay may not be real. Debt figures are not
// changed. The five-year pay sentence uses the pay limit too.
const PAY_ABOUT_THE_SAME_PERCENT = 5
const DEBT_ABOUT_THE_SAME_PERCENT = 3

// How a figure compares with the national median, with the median named: "about
// the same as the national median of $74,438", or "$1,963 less than the national
// median of $20,576". The gap is taken from the median as the page shows it, so
// the three numbers in the sentence always add up.
function comparedWithNationalMedian(amount: number, nationalMedian: number, aboutTheSamePercent: number) {
  const median = formatMoney(nationalMedian)
  // Whole-number arithmetic, so a gap of exactly the limit is not lost to floating point.
  if (Math.abs(amount - nationalMedian) * 100 < nationalMedian * aboutTheSamePercent) return `about the same as the national median of ${median}`
  const gap = amount - Math.round(nationalMedian)
  return `${formatMoney(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than the national median of ${median}`
}

// The summary's paragraphs. It has two subjects: what graduates earn, then what
// they owe. A program in the top or bottom quarter nationally is compared with
// most programs; any other is compared with the national median in dollars. The
// closing remark goes with the subject it is about. See summaryParagraphs for
// when the two subjects share one paragraph.
export function buildSummary(page: ProgramPage) {
  const { school, earnings, debt, ranks, benchmarks } = page
  const program = programLabel(page)
  const earned = `${school.shortName} ${program} graduates earn a median of ${formatMoney(earnings.year1)} in their first year`
  const pay = [
    ranks.nationalEarningsPercentile >= 75
      ? `${earned}, more than graduates of most ${program} programs nationally.`
      : ranks.nationalEarningsPercentile <= 25
        ? `${earned}, less than graduates of most ${program} programs nationally.`
        : `${earned}, ${comparedWithNationalMedian(earnings.year1, benchmarks.national.earningsYear1, PAY_ABOUT_THE_SAME_PERCENT)}.`,
  ]

  const lowDebt = ranks.debtLowerThanShare >= 0.75
  const borrowed = isGraduateProgram(page)
    ? `The typical graduate borrowed ${formatMoney(debt.median)} in federal loans for graduate study at ${schoolInSentence(school.shortName)}`
    : `The typical graduate leaves with ${formatMoney(debt.median)} in federal loans`
  // A graduate page gives the comparison and no verdict on it. Its debt figure
  // counts only the graduates who took federal loans for graduate study at the
  // school, who can be a small part of a class (46 borrowers at a program with
  // about 877 graduates a year). "Stands out" or "is high" would say more
  // than the figure can. The user decided this on 2026-10-13.
  const graduate = isGraduateProgram(page)
  // "Less than graduates of 91% of business programs", as the pay sentence says
  // "more than graduates of most business programs". It used to read "less than
  // at 91% of", which the user found stiff (2026-10-13).
  const owed = lowDebt
    ? [...(graduate ? [] : ['Where this program stands out is debt.']), `${borrowed}, less than graduates of ${shareOfPrograms(ranks.debtLowerThanShare, `${program} programs`)} in the country.`]
    : ranks.debtHigherThanShare >= 0.75
      ? [...(graduate ? [] : ['Debt is high.']), `${borrowed}, more than graduates of ${shareOfPrograms(ranks.debtHigherThanShare, `${program} programs`)} in the country.`]
      : [`${borrowed}, ${comparedWithNationalMedian(debt.median, benchmarks.national.medianDebt, DEBT_ABOUT_THE_SAME_PERCENT)}.`]

  const higherPayingInState = ranks.stateEarningsRank - 1
  const topQuarterInState = ranks.stateEarningsRank <= benchmarks.state.earningsYear1Count / 4
  if (topQuarterInState) {
    pay.push(`This is one of the higher-paying ${program} ${degreeWord(page)} in ${placeInSentence(school.stateName)}.`)
  } else if (lowDebt && ranks.nationalEarningsPercentile <= 25 && earnings.year1 < benchmarks.state.earningsYear1) {
    // On a graduate page the same fact goes with the pay sentences, without "Debt is low".
    if (graduate) pay.push(`That is also below the ${school.stateName} median of ${formatMoney(benchmarks.state.earningsYear1)}.`)
    else owed.push(`Debt is low, but pay is also below the ${school.stateName} median of ${formatMoney(benchmarks.state.earningsYear1)}.`)
  } else if (higherPayingInState >= 3) {
    pay.push(`Several ${school.stateName} programs report higher pay.`)
  } else if (higherPayingInState === 2) {
    pay.push(`Two other ${school.stateName} programs report higher pay.`)
  } else if (higherPayingInState === 1) {
    pay.push(`One other ${school.stateName} program reports higher pay.`)
  }

  // A graduate page has no section about the school. Its summary says where
  // the program stands among the school's programs of the same degree. A school
  // with one such program has nothing to rank it against. The count is of the
  // programs that report pay, and the sentence says so: most programs do not.
  if (graduate && ranks.schoolProgramCount > 1) {
    pay.push(
      `At ${schoolInSentence(school.shortName)} the program ranks ${ordinal(ranks.schoolEarningsRank)} by first-year pay among the ${ranks.schoolProgramCount} ${page.program.credential.toLowerCase()} programs that report it.`,
    )
  }

  return summaryParagraphs([pay, owed])
}

// The questions under the key figures, about this program's own graduates.
export function buildKeyFigureQuestions(page: ProgramPage) {
  const { school, program, earnings, debt, benchmarks } = page
  return programKeyFigureQuestions({
    graduates: `${school.shortName} ${programLabel(page)} graduates`,
    graduateDebt: isGraduateProgram(page),
    programs: `${program.sentenceName} ${program.credential.toLowerCase()}`,
    stateName: school.stateName,
    earningsYear1: earnings.year1,
    earningsYear5: earnings.year5,
    medianDebt: debt.median,
    stateDebtToEarnings: benchmarks.state.debtToEarnings,
    nationalDebtToEarnings: benchmarks.national.debtToEarnings,
  })
}

// "How this program compares with other nursing programs".
export function compareTitle(page: ProgramPage) {
  return `How this program compares with other ${programLabel(page)} programs`
}

// Jobs are linked to the field, whatever the degree. The careers section
// names the field alone.
export function careersTitle(page: ProgramPage) {
  return stateCareersTitle(page.program.sentenceName, page.school.stateName)
}

// `everyJobHasStatePay` is false when a listed job has no pay figure for the
// state and shows the national one.
export function careersIntro(page: ProgramPage, everyJobHasStatePay: boolean) {
  return stateCareersIntro(page.program.sentenceName, page.school.stateName, everyJobHasStatePay)
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
  // Whole-number arithmetic, as in comparedWithNationalMedian.
  const nationalLimit = benchmarks.national.earningsYear5 * PAY_ABOUT_THE_SAME_PERCENT
  const stateLimit = benchmarks.state.earningsYear5 * PAY_ABOUT_THE_SAME_PERCENT
  const nationalDirection = Math.abs(metrics.year5GapToNational) * 100 < nationalLimit ? 'same' : metrics.year5GapToNational > 0 ? 'more' : 'less'
  const nationalPhrase =
    nationalDirection === 'same'
      ? 'about the national median'
      : nationalDirection === 'more'
        ? 'more than the national median'
        : 'less than the national median'

  if (metrics.year5GapToState * 100 <= -stateLimit) {
    const connector = nationalDirection === 'less' ? 'and' : 'but'
    const higherDebtPrograms = higherDebtHigherYear5Count(page)
    const followUp =
      higherDebtPrograms >= 3
        ? ` Several ${school.stateName} programs with higher debt show higher pay by the five-year mark.`
        : ''
    return `Five years out, ${school.shortName} graduates earn ${nationalPhrase} ${connector} about ${formatMoney(Math.abs(metrics.year5GapToState))} less than the ${school.stateName} median.${followUp}`
  }
  if (metrics.year5GapToState * 100 >= stateLimit) {
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
    return `${lead} ${payPhrase}, but they borrowed more: a median of ${formatMoney(debt.pellMedian!)} against ${formatMoney(debt.otherMedian!)}.`
  }
  return `${lead} ${payPhrase}.${borrowedLess ? ' They also borrowed less.' : ''}`
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
    const occupationPay = `${capitalize(matching.pluralName)} in ${placeInSentence(page.school.stateName)} earn a median of ${formatMoney(matching.stateMedianPay)} across all experience levels`
    sentence +=
      matching.stateMedianPay > page.earnings.year5!
        ? ` ${occupationPay}, which shows how much room there is to grow after the first few years.`
        : ` ${occupationPay}.`
  }
  return sentence
}

// The price sentence for "Where graduates work". Needs the price level of the
// school's own area, which a school without a trusted location doesn't have.
export function buildPriceSentence(page: ProgramPage, metrics: ProgramMetrics) {
  const { earnings } = page
  const area = page.priceLevels?.area
  if (!area || metrics.areaPriceGap === undefined || metrics.adjustedYear1 === undefined) {
    return undefined
  }
  const place = area.kind === 'metro' ? `the ${area.name}` : `the parts of ${area.name} outside metro areas`
  const percent = roundedPercent(Math.abs(metrics.areaPriceGap))
  if (percent === 0) {
    return { lead: `Prices in ${place} are about the same as the national average.` }
  }
  const direction = metrics.areaPriceGap > 0 ? 'below' : 'above'
  return {
    lead: `Prices in ${place} are about ${percent}% ${direction} the national average. A salary of ${formatMoney(earnings.year1)} here buys what about `,
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
      ? `, which puts ${placeInSentence(stateName)} ahead.`
      : adjustedSide > nationalSide(0)
        ? `, which puts ${placeInSentence(stateName)} slightly ahead.`
        : adjustedSide < nationalSide(-5)
          ? `, which puts ${placeInSentence(stateName)} behind.`
          : adjustedSide < nationalSide(0)
            ? `, which puts ${placeInSentence(stateName)} slightly behind.`
            : '.'
  return {
    lead: `The median ${matching.shortName} in ${placeInSentence(stateName)} earns ${formatMoney(matching.stateMedianPay)}, compared with a national median of ${formatMoney(matching.nationalMedianPay)}. After adjusting for ${stateName} prices, that pay is worth about `,
    adjustedPay: formatMoney(metrics.adjustedStateOccupationPay),
    tail: comparison,
  }
}

// "Nursing ranks 11th by first-year pay among the 61 bachelor's programs at UT
// Austin that report it." The count is of the school's programs that report pay,
// which can be far fewer than the programs it offers. The sentence says so.
export function buildSchoolRankSentence(page: ProgramPage) {
  const { ranks, program, school } = page
  const credential = program.credential.toLowerCase()
  if (ranks.schoolProgramCount === 1) {
    return `${program.name} is the only ${credential} program at ${school.shortName} that reports first-year pay.`
  }
  return `${program.name} ranks ${ordinal(ranks.schoolEarningsRank)} by first-year pay among the ${ranks.schoolProgramCount} ${credential} programs at ${school.shortName} that report it.`
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

// "3.3%": the monthly loan payment as a share of first-year monthly pay.
export function paymentShareLabel(paymentShareOfPay: number) {
  return `${(paymentShareOfPay * 100).toFixed(1)}%`
}

// The school's graduation rate as a sentence. It is the whole school's rate, and
// it counts first-time, full-time students who finish within 150% of the normal
// time. That is six years only where the school mostly awards bachelor's degrees.
function graduationSentence(page: ProgramPage) {
  const graduationRate = page.school.graduationRate
  if (!graduationRate) return undefined
  const finish = graduationRate.withinSixYears ? 'graduate within six years' : 'finish within one and a half times the normal length of their program'
  return `Across ${page.school.shortName}, ${formatShare(graduationRate.rate)} of first-time, full-time students ${finish}.`
}

// The answer to "Is it worth it?", in three paragraphs: what we cannot know, how
// past graduates did, and what those figures leave out. It gives no verdict. The
// user decided on 2026-10-12 that a page states the figures and leaves the
// judgment to the reader.
function worthAnswer(page: ProgramPage, metrics: ProgramMetrics) {
  const { school, earnings, debt, ranks, benchmarks } = page
  const programs = programKindPlural(page)
  const percentile = ranks.nationalEarningsPercentile
  const payStanding =
    percentile < 1
      ? `which is in the bottom 1% of ${programs} nationally`
      : percentile >= 100
        ? `which is in the top 1% of ${programs} nationally`
        : `more than graduates of ${percentile}% of ${programs} nationally`
  // The summary's rule: a program in the top or bottom quarter for debt is
  // compared with most programs, and any other with the national median in
  // dollars. Many programs report exactly the same debt and count on neither
  // side, so a smaller share would read as if the rest were on the other side.
  const debtStanding =
    ranks.debtLowerThanShare >= 0.75
      ? `less than graduates of ${shareOfPrograms(ranks.debtLowerThanShare, 'those programs')}`
      : ranks.debtHigherThanShare >= 0.75
        ? `more than graduates of ${shareOfPrograms(ranks.debtHigherThanShare, 'those programs')}`
        : comparedWithNationalMedian(debt.median, benchmarks.national.medianDebt, DEBT_ABOUT_THE_SAME_PERCENT)
  const figures = [
    `${school.shortName} ${programLabel(page)} graduates earn a median of ${formatMoney(earnings.year1)} in their first year, ${payStanding}.`,
    isGraduateProgram(page)
      ? `They borrowed a median of ${formatMoney(debt.median)} in federal loans for graduate study at ${schoolInSentence(school.shortName)}, ${debtStanding}.`
      : `They leave with a median of ${formatMoney(debt.median)} in federal loans, ${debtStanding}.`,
  ]
  if (debt.monthlyPayment !== undefined && metrics.paymentShareOfPay !== undefined) {
    figures.push(
      `On a standard 10-year plan that is about ${formatMoney(debt.monthlyPayment)} a month, or ${paymentShareLabel(metrics.paymentShareOfPay)} of first-year pay.`,
    )
  }
  const limits = ['These figures count only students who finished, and we have no completion rate for this program alone.']
  // The school's graduation rate describes its undergraduates.
  const graduation = isGraduateProgram(page) ? undefined : graduationSentence(page)
  if (graduation) limits.push(graduation)
  return [
    'That depends on things we cannot know: what you would pay after grants and scholarships, how much you would borrow and what work you want. What this page shows is how past graduates did.',
    figures.join(' '),
    limits.join(' '),
  ]
}

// The common questions. Each answer is one paragraph, except the one about
// whether the program is worth it.
export function buildFaq(page: ProgramPage, metrics: ProgramMetrics): PageQuestion[] {
  const { school, earnings, debt, ranks, benchmarks } = page
  const program = programLabel(page)
  const graduate = isGraduateProgram(page)
  const items: PageQuestion[] = []

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
      `${capitalize(matching.pluralName)} in ${placeInSentence(school.stateName)} earn a median of ${formatMoney(matching.stateMedianPay)} across all experience levels.`,
    )
  } else {
    payParts.push(
      `The median across ${programKindPlural(page)} in ${placeInSentence(school.stateName)} is ${formatMoney(benchmarks.state.earningsYear1)}.`,
    )
  }
  items.push({ question: `How much do ${school.shortName} ${program} graduates make?`, answer: [payParts.join(' ')] })

  const debtLead = graduate
    ? `The median graduate borrowed ${formatMoney(debt.median)} in federal loans for graduate study at ${schoolInSentence(school.shortName)}`
    : `The median federal loan balance is ${formatMoney(debt.median)}`
  const debtParts = [
    `${debtLead}, which ranks ${rankLowest(ranks.stateDebtRank, ranks.stateProgramsWithBoth)} ${programKindPlural(page)} in ${placeInSentence(school.stateName)}.`,
  ]
  if (debt.monthlyPayment !== undefined) {
    debtParts.push(`That works out to about ${formatMoney(debt.monthlyPayment)} a month over 10 years.`)
  }
  if (graduate) debtParts.push('Undergraduate loans and loans taken at other schools are not counted.')
  items.push({ question: `How much debt do ${school.shortName} ${program} graduates have?`, answer: [debtParts.join(' ')] })

  // A field name that starts with "other" goes after the noun: "an other health
  // professions degree" reads badly, and "a degree in other health professions"
  // does not.
  // On a graduate page the label ends with the degree ("other health professions
  // master's"). The degree moves in front of the noun.
  const degreeQuestion = program.startsWith('other ')
    ? graduate
      ? `Is ${withArticle(page.program.credential.toLowerCase())} degree in ${page.program.sentenceName} from ${school.shortName} worth it?`
      : `Is a degree in ${program} from ${school.shortName} worth it?`
    : `Is ${withArticle(program)} degree from ${school.shortName} worth it?`
  items.push({
    question: page.program.credentialLevel === 1 ? `Is the ${program} program at ${school.shortName} worth it?` : degreeQuestion,
    answer: worthAnswer(page, metrics),
  })

  // The question and its answer give the share and say nothing of staying or
  // leaving: the file does not say where a graduate lived before, and a student
  // who studied online may never have lived in the school's state. The user
  // decided this on 2026-10-13.
  if (metrics.inStateShare !== undefined) {
    items.push({
      question: `What share of ${school.shortName} ${program} graduates work in ${placeInSentence(school.stateName)}?`,
      answer: [
        [
          `${formatShare(metrics.inStateShare)} (${formatCount(earnings.workingInStateCount!)} of ${formatCount(earnings.workingCount!)}) were working in ${placeInSentence(school.stateName)} one year after graduating.`,
          ...onlineStudySentences(page),
        ].join(' '),
      ],
    })
  }
  return items
}

// What the school reports about studying online, for the answer about where
// graduates work. The federal marker covers all of the school's programs of
// this credential in the field. The sentence speaks of those and not of one
// program.
function onlineStudySentences(page: ProgramPage) {
  const { school, program } = page
  if (!program.online) return []
  const programs = `${program.credential.toLowerCase()} programs in this field`
  const reported = program.online === 'all' ? `its ${programs} can all be completed fully online` : `at least one of its ${programs} can be completed fully online`
  return [
    `${capitalize(schoolInSentence(school.shortName))} reports that ${reported}.`,
    `Online students may live ${isState(school.stateName) ? 'in other states' : 'elsewhere'}.`,
  ]
}

// Kept near 60 characters where the names allow, so Google shows it in full on most
// screens. The same text is the H1. A graduate page shows no tuition, and its
// title does not promise any: the files give only the school's average charge to
// graduate students, which is not the price of one program. The user decided
// this on 2026-10-13.
export function buildPageTitle(page: ProgramPage) {
  const { school, program } = page
  const degree = program.degreeAbbreviation ?? program.credential
  const subject = isGraduateProgram(page) ? 'Graduate Salary and Debt' : 'Tuition, Graduate Salary, and Debt'
  return `${school.shortName} ${program.name} (${degree}): ${subject}`
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

  const debtFigure = debtFigureLabel(page)
  // "Lower than at" stays here: the subject is the debt figure, not a graduate.
  if (ranks.debtLowerThanShare >= 0.75) {
    return `${opening} ${debtFigure}: ${formatMoney(debt.median)}, lower than at ${shareOfPrograms(ranks.debtLowerThanShare, 'similar programs')}.`
  }
  if (ranks.debtHigherThanShare >= 0.75) {
    return `${opening} ${debtFigure}: ${formatMoney(debt.median)}, higher than at ${shareOfPrograms(ranks.debtHigherThanShare, 'similar programs')}.`
  }
  // Between the two quarters the description gives both figures and no verdict:
  // such a program's debt can be a third below the national median or half above it.
  return `${opening} ${debtFigure}: ${formatMoney(debt.median)}. National median: ${formatMoney(benchmarks.national.medianDebt)}.`
}

// The note under the key figures of a graduate page: how many people the pay
// figure and the debt figure each count. Both counts are for the two graduating
// classes the figures describe (EARN_COUNT_WNE_1YR and DEBT_ALL_STGP_EVAL_N).
// The header gives the graduates a year. A reader can see how much of a
// class the figures cover. Some programs have no count of borrowers.
export function buildCountedNote(page: ProgramPage) {
  const { workingCount } = page.earnings
  const { borrowers } = page.debt
  if (!isGraduateProgram(page) || !workingCount) return undefined
  const pay = `Pay is based on ${formatCount(workingCount)} working graduates`
  return borrowers ? `${pay} and debt on ${formatCount(borrowers)} borrowers, from two graduating classes.` : `${pay}, from two graduating classes.`
}

// The paragraph over the comparison table on a graduate page. It names the
// graduates the first column is about.
export function buildGraduateCompareIntro(page: ProgramPage) {
  const { school } = page
  return `The first column shows the median pay and debt of ${school.shortName} ${programLabel(page)} graduates. The other two columns show the median of the same figures across all ${programKindPlural(page)} that report them, in ${placeInSentence(school.stateName)} and in the country as a whole.`
}

// The paragraph over the chart on a graduate page: what the chart shows and how
// to read a dot. It does not say which corner of the chart is better.
export function buildGraduateChartIntro(page: ProgramPage) {
  const { school } = page
  return `The chart below shows ${formatCount(page.stateComparison.length)} ${programKindPlural(page)} in ${placeInSentence(school.stateName)}. Each dot is one program. A dot higher up means its graduates earn more in their first year, and a dot further right means they borrowed more in federal loans for graduate study. The highlighted dot shows where ${schoolInSentence(school.shortName)} sits among them. Dashed lines mark the ${school.stateName} medians.`
}

// "About this data" on a graduate page, one string for each item in the list.
// It says who each figure counts and which classes the figures describe, and it
// has no line about school-level numbers, because the page shows none.
// `hasFiveYearPay` is true when the page shows pay after five years.
export function buildGraduateDataNotes(page: ProgramPage, hasFiveYearPay: boolean) {
  const { school, program } = page
  return [
    officialProgramFieldSentence(program),
    'Pay only includes graduates who received federal financial aid. Debt only includes graduates who took federal loans.',
    'Pay only counts graduates who were working and not enrolled in more school. Graduates who went straight to further study are not included.',
    `Debt only includes federal loans taken for graduate study at ${schoolInSentence(school.shortName)}. Undergraduate loans, loans taken at other schools, private loans and credit cards are not counted.`,
    payPrivacyNote(),
    reportedFiguresNote(),
    ...combinedCampusesNotes(school.stateName),
    `${classYearsNote(hasFiveYearPay)} Bureau of Labor Statistics wages are from May 2025.`,
  ]
}
