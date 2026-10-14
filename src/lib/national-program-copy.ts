// Sentences for national program pages (every program of one field and credential
// in the US). Each claim is checked against the record before it is made. As on
// state pages, every figure is a median across programs, and sentences say "the
// median program pays its graduates" so they don't read as a typical graduate's pay.

import type { NationalProgramPage, NationalRankedProgram, NationalStateRow } from '@/data/national-program-page'
import { formatCount, formatMoney, formatShare } from '@/lib/format'
import { debtName, GRADUATE_DEBT_LIMIT, isGraduateRanking } from '@/lib/graduate-ranking-copy'
import { keyFigureQuestions } from '@/lib/key-figure-copy'
import { isState, outsideStatesRange, placeInSentence, whatPlaceIs } from '@/lib/place-names'
import { summaryParagraphs } from '@/lib/summary'

// Programs in each list of the lowest-debt section.
const LOWEST_DEBT_COUNT = 10
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

// "nursing bachelor's", "cosmetology certificate".
export function programKind(page: NationalProgramPage) {
  return `${page.program.sentenceName} ${page.program.credential.toLowerCase()}`
}

// "Nursing (BSN)", "Cosmetology (Certificate)".
export function programLabel(page: NationalProgramPage) {
  return `${page.program.name} (${page.program.degreeAbbreviation ?? page.program.credential})`
}

function capitalizeFirst(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

// States that share the first state's median pay.
function sharingPay(states: NationalStateRow[]) {
  return states.filter((state) => state.earningsYear1 === states[0].earningsYear1)
}

// "Ohio", "Ohio and Texas", "Ohio, Texas and Utah".
function listWords(words: string[]) {
  if (words.length <= 2) return words.join(' and ')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

function stateNames(states: NationalStateRow[]) {
  return listWords(states.map((state) => placeInSentence(state.stateName)))
}

export function buildNationalTitle(page: NationalProgramPage) {
  return `Highest-Paying ${programLabel(page)} Programs in the US`
}

export function buildNationalDescription(page: NationalProgramPage) {
  return `${formatCount(page.ranking.length)} ${programKind(page)} programs ranked by graduate pay and debt, with every state's median. Median first-year pay: ${formatMoney(page.national.earningsYear1)}.`
}

// Notes under the national ranking table, in the order they appear.
export function buildNationalRankingNotes(page: NationalProgramPage) {
  const notes: string[] = []
  const unadjusted = page.ranking.filter((program) => program.earningsYear1AfterPrices === undefined).length
  const adjusted = page.ranking.length - unadjusted
  const afterPrices = [
    `Pay after cost of living divides first-year pay by the Bureau of Economic Analysis price level of the school's state, where the US average is 100.`,
    `It is shown for ${formatCount(adjusted)} ${adjusted === 1 ? 'program' : 'programs'} where at least half of the graduates who work are working in the school's state.`,
  ]
  if (unadjusted > 0) {
    afterPrices.push(
      unadjusted === 1
        ? `The other program, whose graduates mostly work in other states or whose state has no price level, is listed last when you sort by it.`
        : `The other ${formatCount(unadjusted)}, whose graduates mostly work in other states or whose state has no price level, are listed last when you sort by it.`,
    )
  }
  notes.push(afterPrices.join(' '))

  const counts: string[] = []
  const payOnly = page.ranking.filter((program) => program.medianDebt === undefined).length
  if (payOnly === 1) counts.push('One program is ranked only by pay, because it reports pay but not debt.')
  else if (payOnly > 1) counts.push(`${formatCount(payOnly)} programs are ranked only by pay, because they report pay but not debt.`)
  const closed = page.ranking.filter((program) => !program.isOpen).length
  if (closed === 1) counts.push('One of these schools has since closed.')
  else if (closed > 1) counts.push(`${formatCount(closed)} of these schools have since closed.`)
  if (counts.length > 0) notes.push(counts.join(' '))

  const withheld = ['College Scorecard withholds pay for programs with too few graduates, to protect their privacy.', "Those programs can't be ranked."]
  const withoutSchool = page.withoutSchoolCount
  const combined = page.unlistedCount - withoutSchool
  if (withoutSchool === 1) withheld.push("One more program reports pay but isn't listed, because College Scorecard's school file doesn't name its school.")
  else if (withoutSchool > 1) withheld.push(`${formatCount(withoutSchool)} more programs report pay but aren't listed, because College Scorecard's school file doesn't name their schools.`)
  if (combined === 1) withheld.push("One more isn't listed, because it reports one combined figure for campuses in several states.")
  else if (combined > 1) withheld.push(`${formatCount(combined)} more aren't listed, because they report one combined figure for campuses in several states.`)
  if (page.unlistedCount > 0) withheld.push('The national medians above still count them.')
  notes.push(withheld.join(' '))
  return notes
}

function paySentence(page: NationalProgramPage) {
  const { national } = page
  const year5 = national.earningsYear5 !== undefined ? ` and ${formatMoney(national.earningsYear5)} five years after` : ''
  return `The median ${programKind(page)} program in the US pays its graduates ${formatMoney(national.earningsYear1)} in their first year${year5}.`
}

// What the median program's graduates owe. A graduate figure counts only the
// loans taken for graduate study at the program's own school, and says so.
function debtSentence(page: NationalProgramPage) {
  return isGraduateRanking(page)
    ? `The median program's graduates borrowed ${formatMoney(page.national.medianDebt)} in federal loans for graduate study at their school.`
    : `The median program leaves its graduates with ${formatMoney(page.national.medianDebt)} in federal debt.`
}

// The summary has two subjects: the national pay and debt, then the states.
export function buildNationalSummary(page: NationalProgramPage) {
  const nation = [paySentence(page), debtSentence(page)]
  const byState: string[] = []
  // Only states are compared with each other. A place that is not a state is
  // mentioned after them when its median falls outside their range.
  const states = page.states.filter((state) => isState(state.stateName))
  if (states.length >= 2) {
    const top = sharingPay(states)
    const bottom = sharingPay([...states].reverse())
    byState.push(
      `${capitalizeFirst(stateNames(top))} ${top.length === 1 ? 'has' : 'have'} the highest state median pay (${formatMoney(top[0].earningsYear1)}) and ${stateNames(bottom)} the lowest (${formatMoney(bottom[0].earningsYear1)}).`,
    )
  } else if (states.length === 1) {
    byState.push(`${capitalizeFirst(placeInSentence(states[0].stateName))} is the only state with enough programs to rank, with a median of ${formatMoney(states[0].earningsYear1)}.`)
  }
  if (states.length > 0) {
    const beyond = outsideStatesRange(
      page.states.map((state) => ({ placeName: state.stateName, amount: state.earningsYear1 })),
      states[0].earningsYear1,
      states[states.length - 1].earningsYear1,
      formatMoney,
    )
    if (beyond) byState.push(`The median is ${beyond}.`)
  }
  return summaryParagraphs([nation, byState])
}

// The questions under the key figures, about the national medians.
export function buildKeyFigureQuestions(page: NationalProgramPage) {
  return keyFigureQuestions({ benchmark: page.national, programs: programKind(page), showYear5: page.national.earningsYear5 !== undefined, graduateDebt: isGraduateRanking(page) })
}

// "165 computer engineering bachelor's programs, ranked by graduate pay".
export function rankingTitle(page: NationalProgramPage) {
  return `${formatCount(page.ranking.length)} ${programKind(page)} programs, ranked by graduate pay`
}

// The programs with the lowest debt and the lowest debt-to-earnings, from every
// ranked program that reports debt. The order is the ranking table's own when it
// is sorted the same way, so the lists and the table always agree.
export function lowestDebtPrograms(page: NationalProgramPage) {
  const withDebt = page.ranking.filter((program) => program.medianDebt !== undefined)
  const lowest = (rankOf: (program: NationalRankedProgram) => number) =>
    [...withDebt]
      .sort((first, second) => rankOf(first) - rankOf(second) || first.payRank - second.payRank || first.schoolName.localeCompare(second.schoolName, 'en'))
      .slice(0, LOWEST_DEBT_COUNT)
  return {
    byDebt: lowest((program) => program.debtRank!),
    byDebtToEarnings: lowest((program) => program.ratioRank!),
  }
}

export function lowestDebtTitle(page: NationalProgramPage) {
  return `${capitalizeFirst(programKind(page))} programs with the lowest debt`
}

// `listed` is the number of programs in each list: ten, or fewer when fewer report debt.
export function lowestDebtIntro(listed: number, graduate = false) {
  const debt = debtName(graduate)
  const explanation = `Debt-to-earnings is ${debt} divided by first-year pay.`
  if (listed < LOWEST_DEBT_COUNT) {
    return `These two lists order the ${COUNT_WORDS[listed]} programs that report debt, first by ${debt} and then by debt-to-earnings. ${explanation}`
  }
  return `These two lists show the ten programs with the lowest ${debt} and the ten with the lowest debt-to-earnings. ${explanation}`
}

export function careersTitle(page: NationalProgramPage) {
  return `${capitalizeFirst(page.program.sentenceName)} careers`
}

export function careersIntro(page: NationalProgramPage) {
  return `These are the largest jobs that the U.S. Department of Education and the Bureau of Labor Statistics link to ${page.program.sentenceName}, by number of people employed in the US. Pay is the national median for the job, at all experience levels.`
}


// The paragraph above the table of states. It explains the two columns a reader
// may not know and what a median across programs is; the user worded it on
// 2026-10-14. A graduate debt figure counts only the loans for graduate study
// at the school, and the sentence about debt says so.
export function statesIntro(page: NationalProgramPage) {
  const borrowed = isGraduateRanking(page) ? 'borrowed in federal loans for graduate study at the school' : 'borrowed in federal loans'
  return `In the table below, we show pay and debt for each state's ${programKind(page)} programs. Year 1 pay is what a program's typical graduate earned in the first year after finishing. Debt is what a program's typical graduate ${borrowed}. Each state's figure is the median across its programs: half of them are higher, and half are lower.`
}

// "The table leaves out 8 more states and territories, because each has fewer
// than five programs that report both pay and debt." A reader from one of those
// places looks for it in the table. The note says why it is missing as a plain
// fact, and not as a rule of the site.
export function unrankedNote(page: NationalProgramPage) {
  const count = page.unrankedPlaceCount
  if (count === 0) return undefined
  const places = count === 1 ? 'one more state or territory' : `${formatCount(count)} more states and territories`
  return `The table leaves out ${places}, because ${count === 1 ? 'it has' : 'each has'} fewer than five programs that report both pay and debt.`
}

// The line above the pay of a field's one matching job.
export function matchingJobIntro(pluralName: string) {
  return `These figures are for all ${pluralName} in the US, at all experience levels. They come from the Bureau of Labor Statistics.`
}

export function buildNationalFaq(page: NationalProgramPage) {
  const kind = programKind(page)
  const faq: { question: string; answer: string }[] = []

  const earnAnswer = [paySentence(page)]
  if (page.matchingJob) {
    earnAnswer.push(
      `${capitalizeFirst(page.matchingJob.pluralName)} earn a median of ${formatMoney(page.matchingJob.stateMedianPay!)} across all experience levels.`,
    )
  }
  faq.push({ question: `How much do ${kind} graduates earn?`, answer: earnAnswer.join(' ') })

  // The answer names a state. A place that is not a state and pays more is
  // mentioned after it.
  const states = page.states.filter((state) => isState(state.stateName))
  if (states.length >= 2) {
    const top = sharingPay(states)
    const rest = states.filter((state) => !top.includes(state))
    const answer = [
      `${capitalizeFirst(stateNames(top))} ${top.length === 1 ? 'does' : 'do'}. The median program ${top.length === 1 ? 'there' : 'in each'} pays its graduates ${formatMoney(top[0].earningsYear1)} in their first year, the highest of the ${formatCount(states.length)} states ranked.`,
    ]
    if (rest.length > 0) {
      const next = sharingPay(rest)
      answer.push(`${capitalizeFirst(stateNames(next))} ${next.length === 1 ? 'is' : 'are'} next, at ${formatMoney(next[0].earningsYear1)}.`)
    }
    for (const place of page.states) {
      if (!isState(place.stateName) && Math.round(place.earningsYear1) > Math.round(top[0].earningsYear1)) {
        answer.push(`${capitalizeFirst(placeInSentence(place.stateName))} is higher, at ${formatMoney(place.earningsYear1)}, but it is ${whatPlaceIs(place.stateName)} and not a state.`)
      }
    }
    faq.push({ question: `Which state pays ${kind} graduates the most?`, answer: answer.join(' ') })
  }

  const top = page.ranking.filter((program) => program.payRank === 1)
  const topNames = listWords(top.map((program) => `${program.schoolName} in ${placeInSentence(program.stateName)}`))
  const topAnswer = [
    top.length === 1
      ? `${topNames} reports the highest first-year pay of the ${formatCount(page.ranking.length)} programs ranked here, ${formatMoney(top[0].earningsYear1)}.`
      : `${topNames} report the highest first-year pay of the ${formatCount(page.ranking.length)} programs ranked here, ${formatMoney(top[0].earningsYear1)}.`,
  ]
  if (top.length === 1 && top[0].medianDebt !== undefined) topAnswer.push(`Its ${debtName(isGraduateRanking(page))} is ${formatMoney(top[0].medianDebt)}.`)
  if (top.length === 1 && !top[0].isOpen) topAnswer.push('The school has since closed.')
  faq.push({ question: `Which ${kind} program pays the most?`, answer: topAnswer.join(' ') })

  faq.push({
    question: `How much debt do ${kind} graduates have?`,
    answer: isGraduateRanking(page)
      ? `${debtSentence(page)} Across programs, the median debt for graduate study is ${formatShare(page.national.debtToEarnings)} of first-year pay. ${GRADUATE_DEBT_LIMIT}`
      : `${debtSentence(page)} Across programs, the median debt is ${formatShare(page.national.debtToEarnings)} of first-year pay.`,
  })
  return faq
}
