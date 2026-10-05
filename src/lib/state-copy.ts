// Sentences for state hub pages. Each claim is checked against the record before
// it is made.
//
// Every state and national figure is a median across programs (each program's own
// median, one value per program), not across graduates: College Scorecard
// publishes no pay for single graduates. Sentences say "the median program pays
// its graduates" so they don't read as the pay of a typical graduate.

import type { StateCredentialSummary, StateField, StateFieldLevel, StatePage } from '@/data/state-page'
import { formatCount, formatMoney } from '@/lib/format'
import { joinWords } from '@/lib/school-copy'

export function credentialLower(credential: string) {
  return credential.toLowerCase()
}

function capitalizeFirst(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

// Every state page has bachelor's programs that report pay (scripts/build-data.ts
// stops otherwise), so the headline figures are for bachelor's programs.
export function bachelors(page: StatePage): StateCredentialSummary {
  return page.credentials.find((credential) => credential.credentialLevel === 3)!
}

function bachelorsFields(page: StatePage): StateField[] {
  return page.fieldLevels.find((level) => level.credentialLevel === 3)?.fields ?? []
}

export function fieldLabel(field: StateField) {
  return field.degreeAbbreviation ? `${field.name} (${field.degreeAbbreviation})` : field.name
}

// Fields that share the highest (or lowest) median pay.
function sharingValue(fields: StateField[], value: number) {
  return fields.filter((field) => field.earningsYear1 === value)
}

function sentenceNames(fields: StateField[]) {
  return joinWords(fields.map((field) => field.sentenceName))
}

export function fieldCount(page: StatePage) {
  return page.fieldLevels.reduce((total, level) => total + level.fields.length, 0)
}

// BEA price parity compared with the US average of 100, as a whole percent
// rounded half up. Worked in thousandths (the BEA figure has three decimals) so
// that floating-point noise can't change the rounding.
export function priceComparison(priceIndex: number) {
  const thousandths = Math.round(priceIndex * 1000)
  const gap = thousandths - 100000
  const percent = Math.floor((Math.abs(gap) + 500) / 1000)
  const tenths = Math.floor((thousandths + 50) / 100)
  return {
    label: percent === 0 ? 'About the same' : `${percent}% ${gap > 0 ? 'higher' : 'lower'}`,
    index: `${Math.floor(tenths / 10)}.${tenths % 10}`,
  }
}

export function buildStateTitle(page: StatePage) {
  return `${page.state.name} Colleges and Majors, Ranked by Graduate Pay and Debt`
}

export function buildStateDescription(page: StatePage) {
  return `Graduate pay and federal debt for ${formatCount(page.programCount)} programs at ${page.state.name} colleges, ranked by field and school. Median first-year pay for a bachelor's: ${formatMoney(bachelors(page).state.earningsYear1)}.`
}

export function buildStateSummary(page: StatePage) {
  const { state, national } = bachelors(page)
  const stateName = page.state.name
  const gap = state.earningsYear1 - national.earningsYear1
  const comparison =
    gap > 0
      ? `${formatMoney(gap)} more than the national median`
      : gap < 0
        ? `${formatMoney(Math.abs(gap))} less than the national median`
        : 'the same as the national median'
  const sentences = [`The median ${stateName} bachelor's program pays its graduates ${formatMoney(state.earningsYear1)} in their first year, ${comparison}.`]
  const fields = bachelorsFields(page)
  if (fields.length >= 2) {
    const top = sharingValue(fields, fields[0].earningsYear1)
    const bottom = sharingValue(fields, fields[fields.length - 1].earningsYear1)
    sentences.push(
      `Of the ${formatCount(fields.length)} bachelor's fields ranked in ${stateName}, ${sentenceNames(top)} ${top.length === 1 ? 'pays' : 'pay'} the most (${formatMoney(top[0].earningsYear1)}) and ${sentenceNames(bottom)} the least (${formatMoney(bottom[0].earningsYear1)}).`,
    )
  } else if (fields.length === 1) {
    sentences.push(
      `${capitalizeFirst(fields[0].sentenceName)} is the only bachelor's field ranked in ${stateName}, with a median of ${formatMoney(fields[0].earningsYear1)}.`,
    )
  }
  sentences.push(`The median bachelor's program leaves its graduates with ${formatMoney(state.medianDebt)} in federal debt, compared with ${formatMoney(national.medianDebt)} nationally.`)
  return sentences.join(' ')
}

// "Bachelor's fields in Texas, ranked", "One certificate field in Nevada".
export function fieldSectionTitle(level: StateFieldLevel, stateName: string) {
  if (level.fields.length === 1) return `One ${credentialLower(level.credential)} field in ${stateName}`
  return `${level.credential} fields in ${stateName}, ranked`
}

// "211 Texas schools", "One Wyoming school".
export function schoolSectionTitle(page: StatePage) {
  return page.schools.length === 1 ? `One ${page.state.name} school` : `${formatCount(page.schools.length)} ${page.state.name} schools`
}

export function buildStateFaq(page: StatePage) {
  const stateName = page.state.name
  const faq: { question: string; answer: string }[] = []

  const fields = bachelorsFields(page)
  if (fields.length >= 2) {
    const top = sharingValue(fields, fields[0].earningsYear1)
    const rest = fields.filter((field) => !top.includes(field))
    const answer = [
      `The median ${sentenceNames(top)} bachelor's program in ${stateName} pays its graduates ${formatMoney(top[0].earningsYear1)} in their first year, the most of ${formatCount(fields.length)} bachelor's fields ranked here.`,
    ]
    if (rest.length > 0) {
      const next = sharingValue(rest, rest[0].earningsYear1)
      answer.push(`${capitalizeFirst(sentenceNames(next))} ${next.length === 1 ? 'is' : 'are'} next, at ${formatMoney(next[0].earningsYear1)}.`)
    }
    faq.push({ question: `What college major pays the most in ${stateName}?`, answer: answer.join(' ') })
  }

  // "The median bachelor's program in Texas pays its graduates $40,503 in their
  // first year, the median associate's program $36,567, and ..."
  const [firstLevel, ...otherLevels] = page.credentials
  const payParts = [
    `The median ${credentialLower(firstLevel.credential)} program in ${stateName} pays its graduates ${formatMoney(firstLevel.state.earningsYear1)} in their first year`,
    ...otherLevels.map((credential) => `the median ${credentialLower(credential.credential)} program ${formatMoney(credential.state.earningsYear1)}`),
  ]
  faq.push({ question: `How much do ${stateName} college graduates earn?`, answer: `${joinWords(payParts)}.` })

  const allLower = page.credentials.every((credential) => credential.state.medianDebt < credential.national.medianDebt)
  const allHigher = page.credentials.every((credential) => credential.state.medianDebt > credential.national.medianDebt)
  const debtParts = page.credentials.map((credential, position) => {
    const amount = formatMoney(credential.state.medianDebt)
    const part =
      position === 0
        ? `The median ${credentialLower(credential.credential)} program in ${stateName} leaves its graduates with ${amount} in federal debt`
        : `the median ${credentialLower(credential.credential)} program ${amount}`
    return allLower || allHigher ? part : `${part} (national ${formatMoney(credential.national.medianDebt)})`
  })
  const several = page.credentials.length > 1
  const comparison = allLower
    ? several ? ', all lower than the national medians' : ', lower than the national median'
    : allHigher
      ? several ? ', all higher than the national medians' : ', higher than the national median'
      : ''
  faq.push({
    question: `How much student debt do ${stateName} graduates have?`,
    answer: `${joinWords(debtParts)}${comparison}.`,
  })

  faq.push({
    question: `How many ${stateName} colleges report graduate pay?`,
    answer: `${formatCount(page.schoolsWithPayCount)} ${stateName} schools report first-year pay for at least one program, ${formatCount(page.programCount)} programs in all. ${capitalizeFirst(page.schools.length === 1 ? 'one' : formatCount(page.schools.length))} of them ${page.schools.length === 1 ? 'has' : 'have'} at least one program with its own page here.`,
  })
  return faq
}
