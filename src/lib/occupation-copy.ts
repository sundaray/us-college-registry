// Sentences for occupation pages. Each claim is checked against the record before
// it is made.

import type { OccupationPage, OccupationStateRow } from '@/data/occupation-page'
import { formatCount, formatMoney, roundedPercent } from '@/lib/format'
import { joinWords } from '@/lib/school-copy'

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
  return joinWords(states.map((state) => state.stateName))
}

// States with pay after prices, highest first. Ranks are exact (scripts/build-data.ts).
export function byAdjustedPay(page: OccupationPage) {
  return page.states
    .filter((state) => state.adjustedRank !== undefined)
    .sort((first, second) => first.adjustedRank! - second.adjustedRank! || first.stateName.localeCompare(second.stateName))
}

// "projected to grow 6%", "projected to shrink 3%", or "projected to stay about
// the same in number", as in the careers sections on other pages.
export function growthPhrase(growthShare: number) {
  const percent = roundedPercent(Math.abs(growthShare))
  if (percent === 0) return 'projected to stay about the same in number'
  return growthShare > 0 ? `projected to grow ${percent}%` : `projected to shrink ${percent}%`
}

function growthSentence(page: OccupationPage) {
  if (page.growthShare === undefined || page.openingsPerYear === undefined) return undefined
  return `Jobs are ${growthPhrase(page.growthShare)} from 2025 to 2035, with about ${formatCount(page.openingsPerYear)} openings a year across the US.`
}

export function buildOccupationSummary(page: OccupationPage) {
  const sentences = [
    `${capitalizeFirst(page.sentenceName)} earn a median of ${formatMoney(page.national.medianPay)} a year in the US, across all experience levels.`,
  ]
  if (page.states.length >= 2) {
    const top = sharing(page.states, (state) => state.medianPay)
    const bottom = sharing([...page.states].reverse(), (state) => state.medianPay)
    sentences.push(`Pay is highest in ${stateNames(top)} (${formatMoney(top[0].medianPay)}) and lowest in ${stateNames(bottom)} (${formatMoney(bottom[0].medianPay)}).`)
  }
  const adjusted = byAdjustedPay(page)
  if (adjusted.length >= 2) {
    const top = adjusted.filter((state) => state.adjustedRank === 1)
    const lowestRank = adjusted[adjusted.length - 1].adjustedRank!
    const bottom = adjusted.filter((state) => state.adjustedRank === lowestRank)
    sentences.push(
      `After adjusting for prices, ${stateNames(top)} ${top.length === 1 ? 'is' : 'are'} highest (${formatMoney(top[0].adjustedPay!)}) and ${stateNames(bottom)} lowest (${formatMoney(bottom[0].adjustedPay!)}).`,
    )
  }
  const growth = growthSentence(page)
  if (growth) sentences.push(growth)
  return sentences.join(' ')
}

export function buildOccupationFaq(page: OccupationPage) {
  const name = page.sentenceName
  const { national } = page
  const faq: { question: string; answer: string }[] = []

  const payAnswer = [`${capitalizeFirst(name)} earn a median of ${formatMoney(national.medianPay)} a year in the US, across all experience levels (May 2025).`]
  if (national.p10Pay !== undefined && national.p90Pay !== undefined) {
    payAnswer.push(`The bottom 10% earn less than ${formatMoney(national.p10Pay)}, and the top 10% more than ${formatMoney(national.p90Pay)}.`)
  }
  faq.push({ question: `How much do ${name} make?`, answer: payAnswer.join(' ') })

  if (page.states.length >= 2) {
    const top = sharing(page.states, (state) => state.medianPay)
    const answer = [`${stateNames(top)}, at a median of ${formatMoney(top[0].medianPay)}.`]
    const adjusted = byAdjustedPay(page)
    if (adjusted.length >= 2) {
      const adjustedTop = adjusted.filter((state) => state.adjustedRank === 1)
      answer.push(
        `After adjusting for prices, ${stateNames(adjustedTop)} ${adjustedTop.length === 1 ? 'is' : 'are'} highest, at ${formatMoney(adjustedTop[0].adjustedPay!)} in US-average prices.`,
      )
    }
    faq.push({ question: `Which state pays ${name} the most?`, answer: answer.join(' ') })
  }

  const educationAnswer: string[] = []
  if (page.typicalEducation) {
    const education = `${page.typicalEducation.charAt(0).toLowerCase()}${page.typicalEducation.slice(1)}`
    const experience = page.workExperience ? `, plus ${page.workExperience.toLowerCase()} of related work experience` : ''
    educationAnswer.push(`The Bureau of Labor Statistics lists ${education} as the typical education to start${experience}.`)
  }
  const labels = page.programs.map((program) => program.label)
  if (labels.length === 1) {
    educationAnswer.push(`The federal crosswalk from fields of study to jobs links one program here to ${name}: ${labels[0]}.`)
  } else if (labels.length <= 5) {
    educationAnswer.push(`The federal crosswalk from fields of study to jobs links ${formatCount(labels.length)} programs here to ${name}: ${joinWords(labels)}.`)
  } else {
    const largest = [...page.programs]
      .sort((first, second) => second.programCount - first.programCount || first.label.localeCompare(second.label))
      .slice(0, 3)
      .map((program) => program.label)
    educationAnswer.push(
      `The federal crosswalk from fields of study to jobs links ${formatCount(labels.length)} programs here to ${name}. The ones with the most schools are ${joinWords(largest)}.`,
    )
  }
  faq.push({ question: `What education do ${name} need?`, answer: educationAnswer.join(' ') })

  const growth = growthSentence(page)
  if (growth) faq.push({ question: `Are jobs for ${name} growing?`, answer: growth })
  return faq
}
