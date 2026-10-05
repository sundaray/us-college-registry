// Sentences for ranking hub pages (every program of one field in one state).
// Each claim is checked against the record before it is made.

import type { RankedProgram, StateProgramPage } from '@/data/state-program-page'
import { formatCount, formatMoney } from '@/lib/format'

// "nursing bachelor's", "cosmetology certificate".
export function programKind(page: StateProgramPage) {
  return `${page.program.sentenceName} ${page.program.credential.toLowerCase()}`
}

export function degreeLabel(page: StateProgramPage) {
  return page.program.degreeAbbreviation ?? page.program.credential
}

// "West Coast University-Texas", or "Example College (now closed)".
export function schoolLabel(program: RankedProgram) {
  return program.isOpen ? program.schoolName : `${program.schoolName} (now closed)`
}

export function programsWithDebt(page: StateProgramPage) {
  return page.programs.filter((program) => program.medianDebt !== undefined)
}

export function highestPay(page: StateProgramPage) {
  return page.programs[0]
}

// Lowest median debt; ties go to the higher-paying program.
export function lowestDebt(page: StateProgramPage) {
  return [...programsWithDebt(page)].sort(
    (first, second) => first.medianDebt! - second.medianDebt! || second.earningsYear1 - first.earningsYear1,
  )[0]
}

export function buildStateProgramTitle(page: StateProgramPage) {
  return `${page.program.name} (${degreeLabel(page)}) Programs in ${page.state.name}, Ranked by Graduate Pay and Debt`
}

export function buildStateProgramDescription(page: StateProgramPage) {
  const top = highestPay(page)
  return `${page.programs.length} ${page.state.name} ${programKind(page)} programs ranked by graduate pay and debt. Median first-year pay: ${formatMoney(page.benchmarks.state.earningsYear1)}. Highest: ${schoolLabel(top)}, ${formatMoney(top.earningsYear1)}.`
}

export function buildStateProgramSummary(page: StateProgramPage) {
  const { state, national } = page.benchmarks
  const gap = state.earningsYear1 - national.earningsYear1
  const comparison =
    gap > 0
      ? `${formatMoney(gap)} more than the national median`
      : gap < 0
        ? `${formatMoney(Math.abs(gap))} less than the national median`
        : 'the same as the national median'
  const top = highestPay(page)
  const lowest = lowestDebt(page)
  return `The median ${page.state.name} ${programKind(page)} program pays its graduates ${formatMoney(state.earningsYear1)} in their first year, ${comparison}. ${schoolLabel(top)} reports the highest first-year pay (${formatMoney(top.earningsYear1)}), and ${schoolLabel(lowest)} the lowest median debt (${formatMoney(lowest.medianDebt!)}).`
}

// Notes under the ranking table about programs it can't fully rank. Returned as
// pieces so the page can mark school names (data-name), which scripts/verify
// skips when it reads numbers: some school names contain digits.
export type NotePiece = { text: string } | { name: string }

function joinNames(names: string[]): NotePiece[] {
  const pieces: NotePiece[] = []
  names.forEach((name, position) => {
    if (position > 0) pieces.push({ text: names.length === 2 ? ' and ' : position === names.length - 1 ? ', and ' : ', ' })
    pieces.push({ name })
  })
  return pieces
}

export function buildRankingNotes(page: StateProgramPage): NotePiece[] {
  const pieces: NotePiece[] = []
  const add = (...next: NotePiece[]) => {
    if (pieces.length > 0) pieces.push({ text: ' ' })
    pieces.push(...next)
  }
  const payOnly = page.programs.filter((program) => program.medianDebt === undefined)
  if (payOnly.length === 1) {
    add({ name: payOnly[0].schoolName }, { text: ' reports pay but not debt, so it is ranked only by pay.' })
  } else if (payOnly.length > 1 && payOnly.length <= 4) {
    add(...joinNames(payOnly.map((program) => program.schoolName)), { text: ' report pay but not debt, so they are ranked only by pay.' })
  } else if (payOnly.length > 4) {
    add({ text: `${payOnly.length} programs report pay but not debt, so they are ranked only by pay.` })
  }
  const closed = page.programs.filter((program) => !program.isOpen).length
  if (closed === 1) add({ text: 'One of these schools has since closed.' })
  else if (closed > 1) add({ text: `${closed} of these schools have since closed.` })
  if (page.debtOnlyCount === 1) add({ text: "One more program reports debt but not pay, so it isn't listed." })
  else if (page.debtOnlyCount > 1) add({ text: `${page.debtOnlyCount} more programs report debt but not pay, so they aren't listed.` })
  return pieces
}

export function buildStateProgramFaq(page: StateProgramPage) {
  const { state } = page.benchmarks
  const kind = programKind(page)
  const top = highestPay(page)
  const lowest = lowestDebt(page)
  const withDebt = programsWithDebt(page)

  const topAnswer = [`${top.schoolName} in ${top.city} reports the highest median first-year pay, ${formatMoney(top.earningsYear1)}.`]
  if (top.medianDebt !== undefined) topAnswer.push(`Its median federal debt is ${formatMoney(top.medianDebt)}.`)
  if (!top.isOpen) topAnswer.push('The school has since closed.')

  const lowestAnswer = [
    `${lowest.schoolName} reports the lowest median federal debt, ${formatMoney(lowest.medianDebt!)}, with first-year pay of ${formatMoney(lowest.earningsYear1)}.`,
  ]
  if (!lowest.isOpen) lowestAnswer.push('The school has since closed.')

  const payAnswer = [
    state.earningsYear5 !== undefined
      ? `The median across ${page.programs.length} ${page.state.name} ${kind} programs is ${formatMoney(state.earningsYear1)} in the first year after graduating and ${formatMoney(state.earningsYear5)} five years after.`
      : `The median across ${page.programs.length} ${page.state.name} ${kind} programs is ${formatMoney(state.earningsYear1)} in the first year after graduating.`,
  ]
  if (page.matchingJob?.stateMedianPay !== undefined) {
    const plural = page.matchingJob.pluralName
    payAnswer.push(`${plural.charAt(0).toUpperCase()}${plural.slice(1)} in ${page.state.name} earn a median of ${formatMoney(page.matchingJob.stateMedianPay)} across all experience levels.`)
  }

  return [
    { question: `Which ${page.state.name} ${kind} program pays graduates the most?`, answer: topAnswer.join(' ') },
    { question: `Which ${page.state.name} ${page.program.sentenceName} program has the lowest debt?`, answer: lowestAnswer.join(' ') },
    { question: `How much do ${page.program.sentenceName} graduates earn in ${page.state.name}?`, answer: payAnswer.join(' ') },
    {
      question: `How many ${kind} programs are in ${page.state.name}?`,
      answer: `${formatCount(page.programs.length)} ${page.state.name} programs report first-year pay for their graduates, and ${formatCount(withDebt.length)} of them also report federal debt.`,
    },
  ]
}
