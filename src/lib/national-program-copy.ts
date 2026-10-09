// Sentences for national program pages (every program of one field and credential
// in the US). Each claim is checked against the record before it is made. As on
// state pages, every figure is a median across programs, and sentences say "the
// median program pays its graduates" so they don't read as a typical graduate's pay.

import type { NationalProgramPage, NationalStateRow } from '@/data/national-program-page'
import { formatCount, formatMoney, formatShare } from '@/lib/format'
import { joinWords } from '@/lib/school-copy'

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

function stateNames(states: NationalStateRow[]) {
  return joinWords(states.map((state) => state.stateName))
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
  if (payOnly === 1) counts.push('One program reports pay but not debt, so it is ranked only by pay.')
  else if (payOnly > 1) counts.push(`${formatCount(payOnly)} programs report pay but not debt, so they are ranked only by pay.`)
  const closed = page.ranking.filter((program) => !program.isOpen).length
  if (closed === 1) counts.push('One of these schools has since closed.')
  else if (closed > 1) counts.push(`${formatCount(closed)} of these schools have since closed.`)
  if (counts.length > 0) notes.push(counts.join(' '))

  const withheld = ['College Scorecard withholds pay for programs with too few graduates, to protect their privacy, so those programs can\'t be ranked.']
  const withoutSchool = page.withoutSchoolCount
  const combined = page.unlistedCount - withoutSchool
  if (withoutSchool === 1) withheld.push("One more program reports pay but isn't listed, because College Scorecard's school file doesn't name its school.")
  else if (withoutSchool > 1) withheld.push(`${formatCount(withoutSchool)} more programs report pay but aren't listed, because College Scorecard's school file doesn't name their schools.`)
  if (combined === 1) withheld.push("One more reports one combined figure for campuses in several states, so it isn't listed.")
  else if (combined > 1) withheld.push(`${formatCount(combined)} more report one combined figure for campuses in several states, so they aren't listed.`)
  if (page.unlistedCount > 0) withheld.push('The national medians above still count them.')
  notes.push(withheld.join(' '))
  return notes
}

function paySentence(page: NationalProgramPage) {
  const { national } = page
  const year5 = national.earningsYear5 !== undefined ? ` and ${formatMoney(national.earningsYear5)} five years after` : ''
  return `The median ${programKind(page)} program in the US pays its graduates ${formatMoney(national.earningsYear1)} in their first year${year5}.`
}

export function buildNationalSummary(page: NationalProgramPage) {
  const sentences = [paySentence(page)]
  const { states } = page
  if (states.length >= 2) {
    const top = sharingPay(states)
    const bottom = sharingPay([...states].reverse())
    sentences.push(
      `${stateNames(top)} ${top.length === 1 ? 'has' : 'have'} the highest state median (${formatMoney(top[0].earningsYear1)}), and ${stateNames(bottom)} the lowest (${formatMoney(bottom[0].earningsYear1)}).`,
    )
  } else if (states.length === 1) {
    sentences.push(`${states[0].stateName} is the only state with enough programs to rank, with a median of ${formatMoney(states[0].earningsYear1)}.`)
  }
  sentences.push(`The median program leaves its graduates with ${formatMoney(page.national.medianDebt)} in federal debt.`)
  return sentences.join(' ')
}

// "Programs in 8 more states and territories report pay, but too few to rank. ..."
export function unrankedNote(page: NationalProgramPage) {
  const count = page.unrankedPlaceCount
  if (count === 0) return undefined
  const places = count === 1 ? 'one more state or territory' : `${formatCount(count)} more states and territories`
  return `Programs in ${places} report pay, but too few to rank. A state ranking needs at least five programs that report both pay and debt.`
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

  if (page.states.length >= 2) {
    const top = sharingPay(page.states)
    const rest = page.states.filter((state) => !top.includes(state))
    const answer = [
      `${stateNames(top)}, where the median program pays its graduates ${formatMoney(top[0].earningsYear1)} in their first year, the highest of ${formatCount(page.states.length)} state rankings.`,
    ]
    if (rest.length > 0) {
      const next = sharingPay(rest)
      answer.push(`${stateNames(next)} ${next.length === 1 ? 'is' : 'are'} next, at ${formatMoney(next[0].earningsYear1)}.`)
    }
    faq.push({ question: `Which state pays ${kind} graduates the most?`, answer: answer.join(' ') })
  }

  const top = page.ranking.filter((program) => program.payRank === 1)
  const topNames = joinWords(top.map((program) => `${program.schoolName} in ${program.stateName}`))
  const topAnswer = [
    top.length === 1
      ? `${topNames} reports the highest first-year pay of the ${formatCount(page.ranking.length)} programs ranked here, ${formatMoney(top[0].earningsYear1)}.`
      : `${topNames} report the highest first-year pay of the ${formatCount(page.ranking.length)} programs ranked here, ${formatMoney(top[0].earningsYear1)}.`,
  ]
  if (top.length === 1 && top[0].medianDebt !== undefined) topAnswer.push(`Its median federal debt is ${formatMoney(top[0].medianDebt)}.`)
  if (top.length === 1 && !top[0].isOpen) topAnswer.push('The school has since closed.')
  faq.push({ question: `Which ${kind} program pays the most?`, answer: topAnswer.join(' ') })

  faq.push({
    question: `How much debt do ${kind} graduates have?`,
    answer: `The median program leaves its graduates with ${formatMoney(page.national.medianDebt)} in federal debt. Across programs, the median debt is ${formatShare(page.national.debtToEarnings)} of first-year pay.`,
  })
  return faq
}
