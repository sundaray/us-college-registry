// Sentences for occupation pages. Each claim is checked against the record before
// it is made.

import type { KeyFigureTile, PageQuestion } from '@/components/page-blocks'
import type { OccupationPage, OccupationStateRow } from '@/data/occupation-page'
import { formatCount, formatMoney, listWords, roundedPercent } from '@/lib/format'
import { neededToStart } from '@/lib/job-copy'
import { occupationKeyFigureQuestions } from '@/lib/key-figure-copy'
import { isState, notStatesNote, outsideStatesRange, placeInSentence, whatPlaceIs } from '@/lib/place-names'
import { summaryParagraphs } from '@/lib/summary'

function capitalizeFirst(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

export function buildOccupationTitle(page: OccupationPage) {
  return `${page.name}: Pay by State and the Programs That Lead There`
}

function programsPhrase(page: OccupationPage) {
  return page.programs.length === 1 ? 'the one program that leads there' : `the ${formatCount(page.programs.length)} programs that lead there`
}

export function buildOccupationDescription(page: OccupationPage) {
  return `${page.name} earn a median of ${formatMoney(page.national.medianPay)} in the US. Pay in every state, adjusted for prices, and ${programsPhrase(page)}.`
}

// States that share the first state's value.
function sharing(states: OccupationStateRow[], value: (state: OccupationStateRow) => number) {
  return states.filter((state) => value(state) === value(states[0]))
}

function stateNames(states: OccupationStateRow[]) {
  return listWords(states.map((state) => placeInSentence(state.stateName)))
}

// The states in the table, highest pay first. Sentences that compare states rank
// these only: the District of Columbia and Puerto Rico are not states.
function statesOnly(page: OccupationPage) {
  return page.states.filter((state) => isState(state.stateName))
}

// The states with the highest and the lowest pay after prices. Ranks are exact
// (scripts/build-data.ts), and tied states share one.
function adjustedExtremes(page: OccupationPage) {
  const adjusted = statesOnly(page).filter((state) => state.adjustedRank !== undefined)
  if (adjusted.length < 2) return undefined
  const ranks = adjusted.map((state) => state.adjustedRank!)
  const [best, worst] = [Math.min(...ranks), Math.max(...ranks)]
  return { top: adjusted.filter((state) => state.adjustedRank === best), bottom: adjusted.filter((state) => state.adjustedRank === worst) }
}

// "Among the 50 states" when the table has every state, and "Among the 43 states
// with a figure" when the Bureau of Labor Statistics publishes pay for fewer.
function amongStates(stateCount: number) {
  return stateCount === 50 ? 'Among the 50 states' : `Among the ${stateCount} states with a figure`
}

// "grow 6%", "shrink 3%" or "stay about the same in number".
function expectedChange(growthShare: number) {
  const percent = roundedPercent(Math.abs(growthShare))
  if (percent === 0) return 'stay about the same in number'
  return growthShare > 0 ? `grow ${percent}%` : `shrink ${percent}%`
}

function growthSentence(page: OccupationPage) {
  if (page.growthShare === undefined || page.openingsPerYear === undefined) return undefined
  return `Jobs are projected to ${expectedChange(page.growthShare)} from 2025 to 2035, with about ${formatCount(page.openingsPerYear)} openings a year across the US.`
}

// The summary's paragraphs. It has two subjects: the job in the whole country
// (its pay and its outlook), then how its pay differs by state. See
// summaryParagraphs for when they share a paragraph.
export function buildOccupationSummary(page: OccupationPage) {
  const country = [
    `${capitalizeFirst(page.sentenceName)} earn a median of ${formatMoney(page.national.medianPay)} a year in the US, across all experience levels.`,
  ]
  const growth = growthSentence(page)
  if (growth) country.push(growth)

  const byState: string[] = []
  const states = statesOnly(page)
  if (states.length >= 2) {
    const top = sharing(states, (state) => state.medianPay)
    const bottom = sharing([...states].reverse(), (state) => state.medianPay)
    byState.push(
      `${amongStates(states.length)}, pay is highest in ${stateNames(top)} (${formatMoney(top[0].medianPay)}) and lowest in ${stateNames(bottom)} (${formatMoney(bottom[0].medianPay)}).`,
    )
    const beyond = outsideStatesRange(
      page.states.map((state) => ({ placeName: state.stateName, amount: state.medianPay })),
      top[0].medianPay,
      bottom[0].medianPay,
      formatMoney,
    )
    if (beyond) byState.push(`It is ${beyond}.`)
  }
  const extremes = adjustedExtremes(page)
  if (extremes) {
    const { top, bottom } = extremes
    byState.push(
      `After adjusting for prices, ${stateNames(top)} ${top.length === 1 ? 'is' : 'are'} highest (${formatMoney(top[0].adjustedPay!)}) and ${stateNames(bottom)} lowest (${formatMoney(bottom[0].adjustedPay!)}).`,
    )
  }
  return summaryParagraphs([country, byState])
}

// National median pay, the bottom and top 10%, and projected growth.
export function buildOccupationKeyFigures(page: OccupationPage) {
  const { national } = page
  const figures: KeyFigureTile[] = [{ label: 'Median pay', value: formatMoney(national.medianPay), context: 'US, all experience levels' }]
  if (national.p10Pay !== undefined) figures.push({ label: 'Bottom 10% earn under', value: formatMoney(national.p10Pay), context: 'US' })
  if (national.p90Pay !== undefined) figures.push({ label: 'Top 10% earn over', value: formatMoney(national.p90Pay), context: 'US' })
  if (page.growthShare !== undefined && page.openingsPerYear !== undefined) {
    figures.push({
      label: projectionLabel(page.growthShare),
      value: roundedPercent(Math.abs(page.growthShare)) === 0 ? 'About the same' : `${roundedPercent(Math.abs(page.growthShare))}%`,
      context: `2025 to 2035, about ${formatCount(page.openingsPerYear)} openings a year`,
    })
  }
  return figures
}

// "Projected job growth", "Projected job decline" or "Projected job change".
function projectionLabel(growthShare: number) {
  if (roundedPercent(Math.abs(growthShare)) === 0) return 'Projected job change'
  return growthShare > 0 ? 'Projected job growth' : 'Projected job decline'
}

// The questions under the key figures.
export function buildKeyFigureQuestions(page: OccupationPage) {
  const { national } = page
  return occupationKeyFigureQuestions({
    name: page.sentenceName,
    medianPay: formatMoney(national.medianPay),
    bottomPay: national.p10Pay !== undefined ? formatMoney(national.p10Pay) : undefined,
    topPay: national.p90Pay !== undefined ? formatMoney(national.p90Pay) : undefined,
    yearlyPayOnly: national.yearlyPayOnly === true,
    projection:
      page.growthShare !== undefined && page.openingsPerYear !== undefined
        ? { label: projectionLabel(page.growthShare), expected: expectedChange(page.growthShare), openings: formatCount(page.openingsPerYear) }
        : undefined,
  })
}

// The notes under the table of states, one sentence each.
export function buildStateNotes(page: OccupationPage) {
  const notes: string[] = []
  if (page.states.some((state) => state.stateSlug)) notes.push("State names link to the state's college page.")
  const unadjusted = page.states.filter((state) => state.adjustedPay === undefined).map((state) => placeInSentence(state.stateName))
  if (unadjusted.length > 0) {
    notes.push(
      `${capitalizeFirst(listWords(unadjusted))} ${unadjusted.length === 1 ? 'has' : 'have'} no price level from the Bureau of Economic Analysis, which is why ${unadjusted.length === 1 ? 'its' : 'their'} pay is not adjusted.`,
    )
  }
  if (page.statesWithoutPay.length > 5) {
    notes.push(`The Bureau of Labor Statistics publishes no median pay for ${page.sentenceName} in ${formatCount(page.statesWithoutPay.length)} other states and territories.`)
  } else if (page.statesWithoutPay.length > 0) {
    notes.push(
      `The Bureau of Labor Statistics publishes no median pay for ${page.sentenceName} in ${listWords(page.statesWithoutPay.map((stateName) => placeInSentence(stateName)))}.`,
    )
  }
  const notStates = notStatesNote(page.states.map((state) => state.stateName))
  if (notStates) notes.push(notStates)
  return notes
}

// The common questions. Each answer is one paragraph.
export function buildOccupationFaq(page: OccupationPage): PageQuestion[] {
  const name = page.sentenceName
  const { national } = page
  const faq: { question: string; answer: string }[] = []

  const payAnswer = [`${capitalizeFirst(name)} earn a median of ${formatMoney(national.medianPay)} a year in the US, across all experience levels (May 2025).`]
  if (national.p10Pay !== undefined && national.p90Pay !== undefined) {
    payAnswer.push(`The bottom 10% earn less than ${formatMoney(national.p10Pay)} and the top 10% earn more than ${formatMoney(national.p90Pay)}.`)
  }
  faq.push({ question: `How much do ${name} make?`, answer: payAnswer.join(' ') })

  // The question asks about states, so the answer names a state. A place that is
  // not a state and pays more is mentioned after it.
  const states = statesOnly(page)
  if (states.length >= 2) {
    const top = sharing(states, (state) => state.medianPay)
    const answer = [`${capitalizeFirst(stateNames(top))}, at a median of ${formatMoney(top[0].medianPay)}.`]
    const extremes = adjustedExtremes(page)
    if (extremes) {
      answer.push(
        `After adjusting for prices, ${stateNames(extremes.top)} ${extremes.top.length === 1 ? 'is' : 'are'} highest, at ${formatMoney(extremes.top[0].adjustedPay!)} in US-average prices.`,
      )
    }
    for (const place of page.states) {
      if (!isState(place.stateName) && Math.round(place.medianPay) > Math.round(top[0].medianPay)) {
        answer.push(`${capitalizeFirst(placeInSentence(place.stateName))} pays more (${formatMoney(place.medianPay)}), but it is ${whatPlaceIs(place.stateName)} and not a state.`)
      }
    }
    faq.push({ question: `Which state pays ${name} the most?`, answer: answer.join(' ') })
  }

  const educationAnswer: string[] = []
  if (page.typicalEducation) {
    educationAnswer.push(`The Bureau of Labor Statistics says people typically need ${neededToStart(page.typicalEducation, page.workExperience)} to start in this job.`)
  }
  const labels = page.programs.map((program) => program.label)
  if (labels.length === 1) {
    educationAnswer.push(`The U.S. Department of Education and the Bureau of Labor Statistics link one program on this site to ${name}: ${labels[0]}.`)
  } else if (labels.length <= 5) {
    educationAnswer.push(`The U.S. Department of Education and the Bureau of Labor Statistics link ${formatCount(labels.length)} programs on this site to ${name}: ${listWords(labels)}.`)
  } else {
    const largest = [...page.programs]
      .sort((first, second) => second.programCount - first.programCount || first.label.localeCompare(second.label, 'en'))
      .slice(0, 3)
      .map((program) => program.label)
    educationAnswer.push(
      `The U.S. Department of Education and the Bureau of Labor Statistics link ${formatCount(labels.length)} programs on this site to ${name}. The ones offered at the most schools are ${listWords(largest)}.`,
    )
  }
  faq.push({ question: `What education do ${name} need?`, answer: educationAnswer.join(' ') })

  const growth = growthSentence(page)
  if (growth) faq.push({ question: `Are jobs for ${name} growing?`, answer: growth })
  return faq.map((item) => ({ question: item.question, answer: [item.answer] }))
}
