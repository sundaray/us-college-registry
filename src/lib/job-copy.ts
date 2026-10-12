// Sentences for one job in a careers section: what people in it earn, how many
// work in it, how it is projected to grow, and what people need to start. Each
// claim is made only when the record has the figure.

import type { NamedOccupation } from '@/data/program-page'
import { formatCount, formatMoney, roundedPercent } from '@/lib/format'
import { placeInSentence } from '@/lib/place-names'

// BLS "typical education needed for entry", as it reads after "people typically need".
const EDUCATION_NEEDED: Record<string, string> = {
  "Bachelor's degree": "a bachelor's degree",
  "Master's degree": "a master's degree",
  "Associate's degree": "an associate's degree",
  'Doctoral or professional degree': 'a doctoral or professional degree',
  'High school diploma or equivalent': 'a high school diploma or equivalent',
  'Postsecondary nondegree award': 'a certificate from a program after high school',
  'Some college, no degree': 'some college but no degree',
  'No formal educational credential': 'no diploma or degree',
}

// BLS "work experience in a related occupation". Jobs that need none have no entry.
const EXPERIENCE_NEEDED: Record<string, string> = {
  '5 years or more': ' and at least 5 years of experience in a related job',
  'Less than 5 years': ' and some experience in a related job (less than 5 years)',
}

function capitalizeFirst(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function lowercaseFirst(text: string) {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`
}

// "a bachelor's degree", as it reads after "people typically need".
export function educationNeeded(education: string) {
  return EDUCATION_NEEDED[education] ?? lowercaseFirst(education)
}

// "a bachelor's degree and at least 5 years of experience in a related job".
export function neededToStart(education: string, experience: string | undefined) {
  return `${educationNeeded(education)}${experience ? (EXPERIENCE_NEEDED[experience] ?? '') : ''}`
}

// "To start in this job, people typically need a bachelor's degree and at least
// 5 years of experience in a related job."
function startSentence(education: string, experience: string | undefined) {
  return `To start in this job, people typically need ${neededToStart(education, experience)}.`
}

// The title of a careers section whose pay figures are for one state: "Nursing
// careers in Texas". `fieldName` is the field as it reads inside a sentence.
export function stateCareersTitle(fieldName: string, stateName: string) {
  return `${capitalizeFirst(fieldName)} careers in ${placeInSentence(stateName)}`
}

// `everyJobHasStatePay` is false when a listed job has no pay figure for the
// state and shows the national one.
export function stateCareersIntro(fieldName: string, stateName: string, everyJobHasStatePay: boolean) {
  const sentences = [
    `These are the largest jobs that the U.S. Department of Education and the Bureau of Labor Statistics link to ${fieldName}, by number of people employed in the US.`,
    `Pay is the ${stateName} median for the job, at all experience levels.`,
  ]
  if (!everyJobHasStatePay) sentences.push(`Where ${placeInSentence(stateName)} has no figure, the national median is shown.`)
  return sentences.join(' ')
}

export function jobDetail(job: NamedOccupation, areaName: string) {
  const name = capitalizeFirst(job.sentenceName)
  const parts: string[] = [
    job.stateMedianPay !== undefined
      ? `${name} earn a median of ${formatMoney(job.stateMedianPay)} a year in ${placeInSentence(areaName)}.`
      : `${name} earn a median of ${formatMoney(job.nationalMedianPay!)} a year nationwide.`,
  ]
  if (job.stateEmployment !== undefined) {
    parts.push(`${formatCount(job.stateEmployment)} people work in this job in ${placeInSentence(areaName)}.`)
  }
  if (job.growthShare !== undefined && job.openingsPerYear !== undefined) {
    const percent = roundedPercent(Math.abs(job.growthShare))
    const change =
      percent === 0
        ? 'projected to stay about the same in number'
        : job.growthShare > 0
          ? `projected to grow ${percent}%`
          : `projected to shrink ${percent}%`
    parts.push(`Nationally, jobs are ${change} from 2025 to 2035, with about ${formatCount(job.openingsPerYear)} openings a year.`)
  }
  if (job.typicalEducation) parts.push(startSentence(job.typicalEducation, job.workExperience))
  return parts.join(' ')
}
