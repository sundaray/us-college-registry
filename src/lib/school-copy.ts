// Sentences for school hub pages (every program at one school that reports
// graduate pay). Each claim is checked against the record before it is made.

import type { ProgramPage } from '@/data/program-page'
import type { SchoolLevel, SchoolPage, SchoolProgram } from '@/data/school-page'
import { formatCount, formatMoney, formatShare } from '@/lib/format'

type School = ProgramPage['school']

// "bachelor's", "associate's", "certificate".
export function credentialLower(level: SchoolLevel) {
  return level.credential.toLowerCase()
}

// "61 bachelor's programs", "one certificate program".
export function levelCountPhrase(level: SchoolLevel) {
  const count = level.programs.length
  return count === 1 ? `one ${credentialLower(level)} program` : `${formatCount(count)} ${credentialLower(level)} programs`
}

export function totalPrograms(page: SchoolPage) {
  return page.levels.reduce((total, level) => total + level.programs.length, 0)
}

// The level with the most programs, which the summary, quick picks, and most
// questions are about. Ties go to the higher credential (levels are stored
// bachelor's first).
export function primaryLevel(page: SchoolPage) {
  return page.levels.reduce((best, level) => (level.programs.length > best.programs.length ? level : best))
}

// "A", "A and B", "A, B, and C".
export function joinWords(words: string[]) {
  if (words.length <= 2) return words.join(' and ')
  return `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`
}

// "Public university", "Public college", "Private for-profit school", going by the
// school's own name.
export function institutionKind(school: School) {
  const kind = /universit/i.test(school.name) ? 'university' : /college/i.test(school.name) ? 'college' : 'school'
  return `${school.control} ${kind}`
}

function programsWithDebt(level: SchoolLevel) {
  return level.programs.filter((program) => program.medianDebt !== undefined)
}

// Programs that share the highest (or lowest) value. Pay ties are rare, debt
// ties are not ($5,500 is a common median), so sentences name every tied program.
function sharingFirst(programs: SchoolProgram[], value: (program: SchoolProgram) => number) {
  return programs.filter((program) => value(program) === value(programs[0]))
}

function lowestDebtGroup(level: SchoolLevel) {
  const sorted = [...programsWithDebt(level)].sort((first, second) => first.medianDebt! - second.medianDebt!)
  return sharingFirst(sorted, (program) => program.medianDebt!)
}

// Exact median of the programs' first-year pay.
function medianPay(level: SchoolLevel) {
  const pays = level.programs.map((program) => program.earningsYear1).sort((first, second) => first - second)
  const middle = Math.floor(pays.length / 2)
  return pays.length % 2 === 1 ? pays[middle] : (pays[middle - 1] + pays[middle]) / 2
}

function capitalizeFirst(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function names(programs: SchoolProgram[]) {
  return joinWords(programs.map((program) => program.name))
}

export function buildSchoolTitle(page: SchoolPage) {
  return `${page.school.shortName} Programs, Ranked by Graduate Pay and Debt`
}

export function buildSchoolDescription(page: SchoolPage) {
  const pays = page.levels.flatMap((level) => level.programs.map((program) => program.earningsYear1))
  const lowest = Math.min(...pays)
  const highest = Math.max(...pays)
  const range =
    lowest === highest ? `First-year pay: ${formatMoney(highest)}.` : `First-year pay ranges from ${formatMoney(lowest)} to ${formatMoney(highest)}.`
  return `Graduate pay and federal debt for ${joinWords(page.levels.map(levelCountPhrase))} at ${page.school.shortName}. ${range}`
}

export function buildSchoolSummary(page: SchoolPage) {
  const { shortName } = page.school
  const level = primaryLevel(page)
  const credential = credentialLower(level)
  const programs = level.programs
  const sentences: string[] = []
  if (programs.length === 1) {
    sentences.push(
      `${shortName} has one ${credential} program that reports what graduates earn: ${programs[0].name}, which pays ${formatMoney(programs[0].earningsYear1)} in the first year.`,
    )
  } else if (programs.length === 2) {
    const [first, second] = programs
    sentences.push(`${shortName} has two ${credential} programs that report what graduates earn.`)
    sentences.push(
      first.earningsYear1 === second.earningsYear1
        ? `${first.name} and ${second.name} both pay ${formatMoney(first.earningsYear1)} in the first year.`
        : `${first.name} pays more in the first year (${formatMoney(first.earningsYear1)}) than ${second.name} (${formatMoney(second.earningsYear1)}).`,
    )
  } else {
    const top = sharingFirst(programs, (program) => program.earningsYear1)
    const bottom = sharingFirst([...programs].reverse(), (program) => program.earningsYear1)
    sentences.push(`${formatCount(programs.length)} ${shortName} ${credential} programs report what graduates earn.`)
    sentences.push(
      `${names(top)} ${top.length === 1 ? 'pays' : 'pay'} the most in the first year (${formatMoney(top[0].earningsYear1)}), and ${names(bottom)} the least (${formatMoney(bottom[0].earningsYear1)}).`,
    )
    sentences.push(`The median program pays ${formatMoney(medianPay(level))}.`)
  }
  const otherLevels = page.levels.filter((other) => other !== level)
  if (otherLevels.length > 0) {
    const otherCount = otherLevels.reduce((total, other) => total + other.programs.length, 0)
    sentences.push(`${shortName} also has ${joinWords(otherLevels.map(levelCountPhrase))} that ${otherCount === 1 ? 'reports' : 'report'} pay.`)
  }
  return sentences.join(' ')
}

export type KeyFigureContent = { label: string; value: string; context: string }

// School-wide figures: cost, graduation rate, admission rate. Labels follow the
// program pages: schools that report by program show their largest program's
// whole-program cost, and Scorecard's in-state figure is the in-district rate at
// schools with district pricing.
export function buildSchoolKeyFigures(school: School) {
  const figures: KeyFigureContent[] = []
  if (school.reportsByProgram) {
    if (school.programTuition !== undefined) {
      figures.push({ label: 'Tuition for the largest program', value: formatMoney(school.programTuition), context: 'Tuition and fees for the whole program' })
    }
    if (school.averageNetPrice !== undefined) {
      figures.push({ label: 'Net price, largest program', value: formatMoney(school.averageNetPrice), context: 'After aid, for the whole program' })
    }
  } else {
    if (school.inStateTuition !== undefined && school.inStateTuition === school.outOfStateTuition) {
      figures.push({ label: 'Tuition and fees', value: formatMoney(school.inStateTuition), context: 'Per year, for all students' })
    } else if (school.inStateTuition !== undefined) {
      figures.push({
        label: school.hasDistrictTuition ? 'In-district tuition and fees' : 'In-state tuition and fees',
        value: formatMoney(school.inStateTuition),
        context: school.outOfStateTuition !== undefined ? `Per year. Out-of-state ${formatMoney(school.outOfStateTuition)}` : 'Per year',
      })
    } else if (school.outOfStateTuition !== undefined) {
      figures.push({ label: 'Out-of-state tuition and fees', value: formatMoney(school.outOfStateTuition), context: 'Per year' })
    }
    if (school.averageNetPrice !== undefined) {
      figures.push({ label: 'Average net price after aid', value: formatMoney(school.averageNetPrice), context: 'Per year' })
    }
  }
  if (school.graduationRate !== undefined) {
    figures.push({
      label: 'Graduation rate',
      value: formatShare(school.graduationRate.rate),
      context: school.graduationRate.basis === 'fourYear' ? 'Within 6 years' : 'Within 1.5 times the normal program length',
    })
  }
  if (school.admissionRate !== undefined) {
    figures.push({ label: 'Admission rate', value: formatShare(school.admissionRate), context: 'Of applicants' })
  }
  return figures
}

// "All 61 bachelor's programs, ranked", "Both associate's programs", "One certificate program".
export function levelSectionTitle(level: SchoolLevel) {
  const count = level.programs.length
  if (count === 1) return `One ${credentialLower(level)} program`
  if (count === 2) return `Both ${credentialLower(level)} programs`
  return `All ${formatCount(count)} ${credentialLower(level)} programs, ranked`
}

export function debtOnlyNote(level: SchoolLevel) {
  const credential = credentialLower(level)
  if (level.debtOnlyCount === 1) return `One more ${credential} program reports debt but not pay, so it isn't listed.`
  if (level.debtOnlyCount > 1) return `${formatCount(level.debtOnlyCount)} more ${credential} programs report debt but not pay, so they aren't listed.`
  return undefined
}

function costAnswer(school: School) {
  const parts: string[] = []
  if (school.reportsByProgram) {
    if (school.programTuition !== undefined) {
      parts.push(`Tuition and fees for the school's largest program are ${formatMoney(school.programTuition)} for the whole program.`)
    }
    if (school.averageNetPrice !== undefined) {
      parts.push(`After grants and scholarships, the average net price for that program is ${formatMoney(school.averageNetPrice)}.`)
    }
    return parts.join(' ')
  }
  if (school.inStateTuition !== undefined && school.inStateTuition === school.outOfStateTuition) {
    parts.push(`Tuition and fees are ${formatMoney(school.inStateTuition)} a year for all students.`)
  } else if (school.inStateTuition !== undefined) {
    const local = school.hasDistrictTuition ? 'In-district' : 'In-state'
    parts.push(
      school.outOfStateTuition !== undefined
        ? `${local} tuition and fees are ${formatMoney(school.inStateTuition)} a year, and ${formatMoney(school.outOfStateTuition)} for out-of-state students.`
        : `${local} tuition and fees are ${formatMoney(school.inStateTuition)} a year.`,
    )
  } else if (school.outOfStateTuition !== undefined) {
    parts.push(`Out-of-state tuition and fees are ${formatMoney(school.outOfStateTuition)} a year.`)
  }
  if (school.averageNetPrice !== undefined) {
    parts.push(`After grants and scholarships, the average net price is ${formatMoney(school.averageNetPrice)} a year.`)
  }
  return parts.join(' ')
}

export function buildSchoolFaq(page: SchoolPage) {
  const { school } = page
  const { shortName } = school
  const level = primaryLevel(page)
  const credential = credentialLower(level)
  // "major" reads naturally only at schools that offer nothing but bachelor's degrees.
  const programWord = page.levels.length === 1 && level.credentialLevel === 3 ? 'major' : `${credential} program`
  const faq: { question: string; answer: string }[] = []

  if (level.programs.length >= 2) {
    const top = sharingFirst(level.programs, (program) => program.earningsYear1)
    faq.push({
      question: `Which ${shortName} ${programWord} pays the most?`,
      answer:
        top.length <= 3
          ? `${names(top)} graduates earn a median of ${formatMoney(top[0].earningsYear1)} in their first year, the most of ${formatCount(level.programs.length)} ${shortName} ${credential} programs that report pay.`
          : `${formatCount(top.length)} of the ${formatCount(level.programs.length)} ${shortName} ${credential} programs that report pay tie for the most, a median of ${formatMoney(top[0].earningsYear1)} in the first year.`,
    })
  }

  const withDebt = programsWithDebt(level)
  if (withDebt.length >= 2) {
    const lowest = lowestDebtGroup(level)
    faq.push({
      question: `Which ${shortName} ${programWord} has the lowest debt?`,
      answer:
        lowest.length <= 3
          ? `${names(lowest)} graduates leave with a median of ${formatMoney(lowest[0].medianDebt!)} in federal loans, the lowest among ${formatCount(withDebt.length)} ${shortName} ${credential} programs that report debt.`
          : `${formatCount(lowest.length)} of the ${formatCount(withDebt.length)} ${shortName} ${credential} programs that report debt tie for the lowest, a median of ${formatMoney(lowest[0].medianDebt!)} in federal loans.`,
    })
  }

  const cost = costAnswer(school)
  if (cost) faq.push({ question: `How much does ${shortName} cost?`, answer: cost })

  const total = totalPrograms(page)
  const totalWithDebt = page.levels.reduce((sum, other) => sum + programsWithDebt(other).length, 0)
  const counts = joinWords(page.levels.map(levelCountPhrase))
  // School pages exist only for schools with at least two programs.
  faq.push({
    question: `How many ${shortName} programs report graduate pay?`,
    answer:
      totalWithDebt === total
        ? `${capitalizeFirst(counts)} at ${shortName} report first-year pay, and all of them also report federal debt.`
        : `${capitalizeFirst(counts)} at ${shortName} report first-year pay, and ${formatCount(totalWithDebt)} of them also report federal debt.`,
  })
  return faq
}

// Quick picks need enough programs to pick from.
export const QUICK_PICK_MINIMUM = 6
export const QUICK_PICK_COUNT = 5

export function quickPicks(level: SchoolLevel) {
  const byPay = level.programs.slice(0, QUICK_PICK_COUNT)
  const byDebt = [...programsWithDebt(level)]
    .sort((first, second) => first.medianDebt! - second.medianDebt! || second.earningsYear1 - first.earningsYear1)
    .slice(0, QUICK_PICK_COUNT)
  const bySize = level.programs
    .filter((program) => program.graduatesPerYear !== undefined)
    .sort((first, second) => second.graduatesPerYear! - first.graduatesPerYear! || second.earningsYear1 - first.earningsYear1)
    .slice(0, QUICK_PICK_COUNT)
  return { byPay, byDebt, bySize }
}
