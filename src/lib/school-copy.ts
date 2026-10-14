// Sentences for school hub pages (every program at one school that reports
// graduate pay). Each claim is checked against the record before it is made.

import type { PageQuestion } from '@/components/page-blocks'
import type { ProgramPage } from '@/data/program-page'
import { isGraduateLevel } from '@/data/program-page'
import type { SchoolLevel, SchoolPage, SchoolProgram } from '@/data/school-page'
import { studiedElsewhereNote } from '@/lib/data-notes'
import { formatCount, formatMoney, formatShare, listWords } from '@/lib/format'
import { summaryParagraphs } from '@/lib/summary'

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

// The bachelor's, associate's and certificate levels. Every school page has one.
function undergraduateLevels(page: SchoolPage) {
  return page.levels.filter((level) => !isGraduateLevel(level.credentialLevel))
}

// The undergraduate level with the most programs, which the summary, the two
// short lists and most questions are about. Ties go to the higher credential
// (levels are stored bachelor's first after master's).
export function primaryLevel(page: SchoolPage) {
  return undergraduateLevels(page).reduce((best, level) => (level.programs.length > best.programs.length ? level : best))
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
  return listWords(programs.map((program) => program.name))
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
  return `Graduate pay and federal debt for ${listWords(page.levels.map(levelCountPhrase))} at ${page.school.shortName}. ${range}`
}

// The summary's paragraphs. It has two subjects: the programs at the school's
// main credential level and what they pay, then what else the school has and
// what the page leaves out. See summaryParagraphs for when they share a paragraph.
export function buildSchoolSummary(page: SchoolPage) {
  const { shortName } = page.school
  const level = primaryLevel(page)
  const credential = credentialLower(level)
  const programs = level.programs
  const main: string[] = []
  if (programs.length === 1) {
    main.push(
      `${shortName} has one ${credential} program that reports what graduates earn: ${programs[0].name}, which pays ${formatMoney(programs[0].earningsYear1)} in the first year.`,
    )
  } else if (programs.length === 2) {
    const [first, second] = programs
    main.push(`${shortName} has two ${credential} programs that report what graduates earn.`)
    main.push(
      first.earningsYear1 === second.earningsYear1
        ? `${first.name} and ${second.name} both pay ${formatMoney(first.earningsYear1)} in the first year.`
        : `${first.name} pays more in the first year (${formatMoney(first.earningsYear1)}) than ${second.name} (${formatMoney(second.earningsYear1)}).`,
    )
  } else {
    const top = sharingFirst(programs, (program) => program.earningsYear1)
    const bottom = sharingFirst([...programs].reverse(), (program) => program.earningsYear1)
    main.push(`${formatCount(programs.length)} ${shortName} ${credential} programs report what graduates earn.`)
    main.push(
      `${names(top)} ${top.length === 1 ? 'pays' : 'pay'} the most in the first year (${formatMoney(top[0].earningsYear1)}) and ${names(bottom)} ${bottom.length === 1 ? 'pays' : 'pay'} the least (${formatMoney(bottom[0].earningsYear1)}).`,
    )
    main.push(`The median program pays ${formatMoney(medianPay(level))}.`)
  }
  const rest: string[] = []
  const otherLevels = page.levels.filter((other) => other !== level)
  if (otherLevels.length > 0) {
    const otherCount = otherLevels.reduce((total, other) => total + other.programs.length, 0)
    rest.push(`${shortName} also has ${listWords(otherLevels.map(levelCountPhrase))} that ${otherCount === 1 ? 'reports' : 'report'} pay.`)
  }
  // The counts above leave these programs out, so the summary says so.
  const studiedElsewhere = studiedElsewhereNote(page.studiedElsewhereCount)
  if (studiedElsewhere) rest.push(studiedElsewhere)
  return summaryParagraphs([main, rest])
}

export type KeyFigureContent = { label: string; value: string; context: string }

// School-wide figures: cost, graduation rate, admission rate. Labels follow the
// program pages: schools that report by program show their largest program's
// whole-program cost, and Scorecard's in-state figure is the in-district rate at
// schools with district pricing.
// Tuition, net price, the graduation rate and the admission rate are for
// undergraduates (docs/InstitutionDataDocumentation.pdf, pages 11, 13 and 14, in
// data/raw). School pages list master's programs too, so each figure says whom
// it is for.
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
      figures.push({ label: 'Tuition and fees', value: formatMoney(school.inStateTuition), context: 'Per year, for all undergraduates' })
    } else if (school.inStateTuition !== undefined) {
      figures.push({
        label: school.hasDistrictTuition ? 'In-district tuition and fees' : 'In-state tuition and fees',
        value: formatMoney(school.inStateTuition),
        context: school.outOfStateTuition !== undefined ? `Per year, for undergraduates. Out-of-state ${formatMoney(school.outOfStateTuition)}` : 'Per year, for undergraduates',
      })
    } else if (school.outOfStateTuition !== undefined) {
      figures.push({ label: 'Out-of-state tuition and fees', value: formatMoney(school.outOfStateTuition), context: 'Per year, for undergraduates' })
    }
    if (school.averageNetPrice !== undefined) {
      figures.push({ label: 'Average net price after aid', value: formatMoney(school.averageNetPrice), context: 'Per year, for undergraduates' })
    }
  }
  if (school.graduationRate !== undefined) {
    figures.push({
      label: 'Graduation rate',
      value: formatShare(school.graduationRate.rate),
      // The rate counts first-time, full-time undergraduates only. Six years is
      // right only at schools that mainly award bachelor's degrees.
      context: `First-time, full-time undergraduates, within ${school.graduationRate.withinSixYears ? '6 years' : '1.5 times the normal program length'}`,
    })
  }
  if (school.admissionRate !== undefined) {
    figures.push({ label: 'Admission rate', value: formatShare(school.admissionRate), context: 'Of undergraduate applicants' })
  }
  return figures
}

// "61 UT Austin bachelor's programs, ranked by graduate pay", "Two UT Austin
// associate's programs", "One UT Austin certificate program".
export function levelSectionTitle(level: SchoolLevel, shortName: string) {
  const count = level.programs.length
  if (count === 1) return `One ${shortName} ${credentialLower(level)} program`
  if (count === 2) return `Two ${shortName} ${credentialLower(level)} programs`
  return `${formatCount(count)} ${shortName} ${credentialLower(level)} programs, ranked by graduate pay`
}

export function debtOnlyNote(level: SchoolLevel) {
  const credential = credentialLower(level)
  if (level.debtOnlyCount === 1) return `One more ${credential} program is not listed, because it reports debt but not pay.`
  if (level.debtOnlyCount > 1) {
    return `${formatCount(level.debtOnlyCount)} more ${credential} programs are not listed, because they report debt but not pay.`
  }
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
  // The figures are for undergraduates, and the answer says so first.
  if (school.inStateTuition !== undefined && school.inStateTuition === school.outOfStateTuition) {
    parts.push(`For undergraduates, tuition and fees are ${formatMoney(school.inStateTuition)} a year, the same for in-state and out-of-state students.`)
  } else if (school.inStateTuition !== undefined) {
    const local = school.hasDistrictTuition ? 'in-district' : 'in-state'
    parts.push(
      school.outOfStateTuition !== undefined
        ? `For undergraduates, ${local} tuition and fees are ${formatMoney(school.inStateTuition)} a year and ${formatMoney(school.outOfStateTuition)} for out-of-state students.`
        : `For undergraduates, ${local} tuition and fees are ${formatMoney(school.inStateTuition)} a year.`,
    )
  } else if (school.outOfStateTuition !== undefined) {
    parts.push(`For undergraduates, out-of-state tuition and fees are ${formatMoney(school.outOfStateTuition)} a year.`)
  }
  if (school.averageNetPrice !== undefined) {
    parts.push(
      parts.length > 0
        ? `After grants and scholarships, their average net price is ${formatMoney(school.averageNetPrice)} a year.`
        : `After grants and scholarships, the average net price for undergraduates is ${formatMoney(school.averageNetPrice)} a year.`,
    )
  }
  return parts.join(' ')
}

// The common questions. Each answer is one paragraph.
export function buildSchoolFaq(page: SchoolPage): PageQuestion[] {
  const { school } = page
  const { shortName } = school
  const level = primaryLevel(page)
  const credential = credentialLower(level)
  // "major" reads naturally only at schools that offer nothing but bachelor's degrees.
  const programWord = undergraduateLevels(page).length === 1 && level.credentialLevel === 3 ? 'major' : `${credential} program`
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
  const counts = listWords(page.levels.map(levelCountPhrase))
  const studiedElsewhere = studiedElsewhereNote(page.studiedElsewhereCount)
  // School pages exist only for schools with at least two programs.
  faq.push({
    question: `How many ${shortName} programs report graduate pay?`,
    answer: [
      totalWithDebt === total
        ? `${capitalizeFirst(counts)} at ${shortName} report first-year pay, and all of them also report federal debt.`
        : `${capitalizeFirst(counts)} at ${shortName} report first-year pay, and ${formatCount(totalWithDebt)} of them also report federal debt.`,
      ...(studiedElsewhere ? [studiedElsewhere] : []),
    ].join(' '),
  })
  return faq.map((item) => ({ question: item.question, answer: [item.answer] }))
}

// The two short lists need enough programs to pick from.
export const SHORT_LIST_MINIMUM = 6
export const SHORT_LIST_COUNT = 5

// The programs with the lowest debt and with the most graduates, up to five of
// each. There is no list of the highest pay: it would repeat the first rows of
// the table above it.
export function shortLists(level: SchoolLevel) {
  const byDebt = [...programsWithDebt(level)]
    .sort((first, second) => first.medianDebt! - second.medianDebt! || second.earningsYear1 - first.earningsYear1)
    .slice(0, SHORT_LIST_COUNT)
  const bySize = level.programs
    .filter((program) => program.graduatesPerYear !== undefined)
    .sort((first, second) => second.graduatesPerYear! - first.graduatesPerYear! || second.earningsYear1 - first.earningsYear1)
    .slice(0, SHORT_LIST_COUNT)
  return { byDebt, bySize }
}

// The title and introduction of the section with the short lists. Either list
// can be empty when no program reports the figure.
export function shortListsTitle(level: SchoolLevel, shortName: string, lists: ReturnType<typeof shortLists>) {
  const subject = `${shortName} ${credentialLower(level)} programs with`
  if (lists.byDebt.length > 0 && lists.bySize.length > 0) return `${subject} the lowest debt and the most graduates`
  return lists.byDebt.length > 0 ? `${subject} the lowest debt` : `${subject} the most graduates`
}

export function shortListsIntro(lists: ReturnType<typeof shortLists>) {
  if (lists.byDebt.length > 0 && lists.bySize.length > 0) {
    return 'The first list orders the programs by median federal debt, lowest first. The second orders them by graduates a year, most first. Each list shows up to five programs.'
  }
  return lists.byDebt.length > 0
    ? 'This list orders the programs by median federal debt, lowest first, and shows up to five.'
    : 'This list orders the programs by graduates a year, most first, and shows up to five.'
}
