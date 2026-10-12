// Sentences for ranking hub pages (every program of one field in one state).
// Each claim is checked against the record before it is made.

import type { RankedProgram, StateProgramPage } from '@/data/state-program-page'
import { studiedElsewhereNote } from '@/lib/data-notes'
import { formatCount, formatMoney } from '@/lib/format'
import { stateCareersIntro, stateCareersTitle } from '@/lib/job-copy'
import { keyFigureQuestions } from '@/lib/key-figure-copy'
import { placeInSentence } from '@/lib/place-names'
import { summaryParagraphs } from '@/lib/summary'

// Programs in each list of the lowest-debt section.
const LOWEST_DEBT_COUNT = 5
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five']

function capitalizeFirst(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

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
  return `${page.program.name} (${degreeLabel(page)}) Programs in ${placeInSentence(page.state.name)}, Ranked by Graduate Pay and Debt`
}

export function buildStateProgramDescription(page: StateProgramPage) {
  const top = highestPay(page)
  return `${page.programs.length} ${page.state.name} ${programKind(page)} programs ranked by graduate pay and debt. Median first-year pay: ${formatMoney(page.benchmarks.state.earningsYear1)}. Highest: ${schoolLabel(top)}, ${formatMoney(top.earningsYear1)}.`
}

// The summary's paragraphs. See summaryParagraphs for when it breaks in two.
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
  // The summary has two subjects: how the state compares with the country, then
  // the schools that stand out. One school can hold both places.
  const stateFigure = `The median ${page.state.name} ${programKind(page)} program pays its graduates ${formatMoney(state.earningsYear1)} in their first year, ${comparison}.`
  const schools =
    top === lowest
      ? `${schoolLabel(top)} reports both the highest first-year pay (${formatMoney(top.earningsYear1)}) and the lowest median debt (${formatMoney(lowest.medianDebt!)}).`
      : `${schoolLabel(top)} reports the highest first-year pay (${formatMoney(top.earningsYear1)}) and ${schoolLabel(lowest)} the lowest median debt (${formatMoney(lowest.medianDebt!)}).`
  return summaryParagraphs([[stateFigure], [schools]])
}

// The questions under the key figures, about the state's medians.
export function buildKeyFigureQuestions(page: StateProgramPage) {
  const { state, national } = page.benchmarks
  return keyFigureQuestions({
    benchmark: state,
    programs: `${page.state.name} ${programKind(page)}`,
    showYear5: state.earningsYear5 !== undefined && national.earningsYear5 !== undefined,
  })
}

// "53 Texas nursing bachelor's programs, ranked by graduate pay".
export function rankingTitle(page: StateProgramPage) {
  return `${formatCount(page.programs.length)} ${page.state.name} ${programKind(page)} programs, ranked by graduate pay`
}

// The programs with the lowest debt and the lowest debt-to-earnings, in the
// ranking table's own order when it is sorted the same way.
export function lowestDebtPrograms(page: StateProgramPage) {
  const lowest = (rankOf: (program: RankedProgram) => number) =>
    [...programsWithDebt(page)]
      .sort((first, second) => rankOf(first) - rankOf(second) || first.payRank - second.payRank || first.schoolName.localeCompare(second.schoolName, 'en'))
      .slice(0, LOWEST_DEBT_COUNT)
  return {
    byDebt: lowest((program) => program.debtRank!),
    byDebtToEarnings: lowest((program) => program.ratioRank!),
  }
}

export function lowestDebtTitle(page: StateProgramPage) {
  return `${capitalizeFirst(programKind(page))} programs in ${placeInSentence(page.state.name)} with the lowest debt`
}

// `listed` is the number of programs in each list: five, or fewer when fewer report debt.
export function lowestDebtIntro(listed: number) {
  const explanation = 'Debt-to-earnings is median federal debt divided by first-year pay.'
  if (listed < LOWEST_DEBT_COUNT) {
    return `These two lists order the ${COUNT_WORDS[listed]} programs that report debt, first by median federal debt and then by debt-to-earnings. ${explanation}`
  }
  return `These two lists show the five programs with the lowest median federal debt and the five with the lowest debt-to-earnings. ${explanation}`
}

export function careersTitle(page: StateProgramPage) {
  return stateCareersTitle(page.program.sentenceName, page.state.name)
}

// `everyJobHasStatePay` is false when a listed job has no pay figure for the
// state and shows the national one.
export function careersIntro(page: StateProgramPage, everyJobHasStatePay: boolean) {
  return stateCareersIntro(page.program.sentenceName, page.state.name, everyJobHasStatePay)
}

// The line above the pay of a field's one matching job.
export function matchingJobIntro(pluralName: string, stateName: string) {
  return `These figures are for all ${pluralName} in ${placeInSentence(stateName)}, at all experience levels. They come from the Bureau of Labor Statistics.`
}

// Notes under the ranking table about programs it can't fully rank. Returned as
// pieces so the page can mark school names (data-name), which scripts/verify
// skips when it reads numbers: some school names contain digits.
export type NotePiece = { text: string } | { name: string }

function joinNames(names: string[]): NotePiece[] {
  const pieces: NotePiece[] = []
  names.forEach((name, position) => {
    if (position > 0) pieces.push({ text: position === names.length - 1 ? ' and ' : ', ' })
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
    add({ name: payOnly[0].schoolName }, { text: ' is ranked only by pay, because it reports pay but not debt.' })
  } else if (payOnly.length > 1 && payOnly.length <= 4) {
    add(...joinNames(payOnly.map((program) => program.schoolName)), { text: ' are ranked only by pay, because they report pay but not debt.' })
  } else if (payOnly.length > 4) {
    add({ text: `${payOnly.length} programs are ranked only by pay, because they report pay but not debt.` })
  }
  const closed = page.programs.filter((program) => !program.isOpen).length
  if (closed === 1) add({ text: 'One of these schools has since closed.' })
  else if (closed > 1) add({ text: `${closed} of these schools have since closed.` })
  if (page.debtOnlyCount === 1) add({ text: "One more program isn't listed, because it reports debt but not pay." })
  else if (page.debtOnlyCount > 1) add({ text: `${page.debtOnlyCount} more programs aren't listed, because they report debt but not pay.` })
  const studiedElsewhere = studiedElsewhereNote(page.studiedElsewhereCount)
  if (studiedElsewhere) add({ text: studiedElsewhere })
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
    payAnswer.push(`${plural.charAt(0).toUpperCase()}${plural.slice(1)} in ${placeInSentence(page.state.name)} earn a median of ${formatMoney(page.matchingJob.stateMedianPay)} across all experience levels.`)
  }

  return [
    { question: `Which ${page.state.name} ${kind} program pays graduates the most?`, answer: topAnswer.join(' ') },
    { question: `Which ${page.state.name} ${page.program.sentenceName} program has the lowest debt?`, answer: lowestAnswer.join(' ') },
    { question: `How much do ${page.program.sentenceName} graduates earn in ${placeInSentence(page.state.name)}?`, answer: payAnswer.join(' ') },
    {
      question: `How many ${kind} programs are in ${placeInSentence(page.state.name)}?`,
      answer: `${formatCount(page.programs.length)} ${page.state.name} programs report first-year pay for their graduates, and ${formatCount(withDebt.length)} of them also report federal debt.`,
    },
  ]
}
