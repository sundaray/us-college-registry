// Sentences for national program pages (every program of one field and credential
// in the US). Each claim is checked against the record before it is made. As on
// state pages, every figure is a median across programs, and sentences say "the
// median program pays its graduates" so they don't read as a typical graduate's pay.

import type { NationalPick, NationalProgramPage, NationalStateRow } from '@/data/national-program-page'
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
  return `${programLabel(page)} Programs in the US, Ranked by Graduate Pay and Debt`
}

export function buildNationalDescription(page: NationalProgramPage) {
  return `${formatCount(page.national.earningsYear1Count)} ${programKind(page)} programs ranked by graduate pay and debt, with every state's median. Median first-year pay: ${formatMoney(page.national.earningsYear1)}.`
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

// The first pick's program and any that tie with it on the value.
function sharingFirst(picks: NationalPick[], value: (pick: NationalPick) => number) {
  return picks.filter((pick) => value(pick) === value(picks[0]))
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

  const top = sharingFirst(page.picks.byPay, (pick) => pick.earningsYear1)
  const topNames = joinWords(top.map((pick) => `${pick.schoolName} in ${pick.stateName}`))
  faq.push({
    question: `Which ${kind} program pays the most?`,
    answer:
      top.length === 1
        ? `${topNames} reports the highest first-year pay among the ${formatCount(page.programPageCount)} programs with their own page here, ${formatMoney(top[0].earningsYear1)}. Its median federal debt is ${formatMoney(top[0].medianDebt)}.`
        : `${topNames} report the highest first-year pay among the ${formatCount(page.programPageCount)} programs with their own page here, ${formatMoney(top[0].earningsYear1)}.`,
  })

  faq.push({
    question: `How much debt do ${kind} graduates have?`,
    answer: `The median program leaves its graduates with ${formatMoney(page.national.medianDebt)} in federal debt. Across programs, the median debt is ${formatShare(page.national.debtToEarnings)} of first-year pay.`,
  })
  return faq
}
