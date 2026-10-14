// Sentences that say how the data is handled, shared by the page types that
// compare programs inside one state.

import { formatCount, formatShare, roundedPercent } from '@/lib/format'
import { placeInSentence } from '@/lib/place-names'

// "About this data": two points, each its own item in the list. The first says
// how schools with several campuses are counted, the second when a program is
// left out of a state's figures. The rule itself is in scripts/build-data.ts.
export function combinedCampusesNotes(stateName: string) {
  return [
    'For some schools with several campuses, College Scorecard gives one pay figure and one debt figure for all the campuses together. We count each of those programs once.',
    `We leave a program out of the ${stateName} medians and rankings when the school's main campus is outside ${placeInSentence(stateName)} or when more than half of the program's graduates studied outside ${placeInSentence(stateName)}. It still counts in the national medians.`,
  ]
}

// "About this data": the Department of Education changes pay figures slightly
// before it publishes them. The shares are from its Technical Documentation:
// College Scorecard Data by Field of Study (privacy protection). `figures` says
// whose pay is meant: "each pay figure" on pages about programs, and "each
// program's pay figure" on career pages, where the job's own pay has another source.
export function payPrivacyNote(figures = 'each pay figure') {
  return `To protect privacy, the U.S. Department of Education changes ${figures} slightly before publishing it. About half of first-year figures are within 1% of the true figure, most of the rest are within 4% and about 6% are off by 5% to 9%. Small gaps in pay, and ranks next to each other, may not be real differences. Debt figures are not changed.`
}

// "About this data" on a graduate page: which graduating classes the figures
// describe. The years are from the cohort map in College Scorecard's data
// dictionary for the June 2026 release (sheet FieldOfStudy_Cohort_Map, column
// FieldOfStudyMostRecent). First-year pay, debt and the monthly payment are for
// the classes of 2018-19 and 2019-20. Five-year pay is for the classes of
// 2014-15 and 2015-16. Both pay figures were measured in 2020 and 2021 and
// adjusted to 2022 dollars. Change the years when the data release changes.
// `hasFiveYearPay` is false on a page that shows no pay after five years.
export function classYearsNote(hasFiveYearPay: boolean) {
  if (!hasFiveYearPay) {
    return 'Pay and debt are for students who graduated in 2018-19 and 2019-20. Pay was measured in 2020 and 2021 and is shown in 2022 dollars.'
  }
  return 'First-year pay and debt are for students who graduated in 2018-19 and 2019-20. Pay after 5 years is for students who graduated in 2014-15 and 2015-16. Both pay figures were measured in 2020 and 2021 and are shown in 2022 dollars.'
}

// "About this data" on a program page: a rank, a median or a count of programs
// covers only the programs that report the figure, which can be far fewer than
// the programs there are ("10th lowest of 23" in a state with 42). The government
// withholds the rest to protect privacy (College Scorecard's field of study
// documentation, privacy protection). The user decided on 2026-10-13 to say this
// once here, and not in every sentence that gives a rank or a count.
export function reportedFiguresNote() {
  return "Ranks, medians and counts only include programs that report the figure. The government withholds many programs' figures to protect privacy."
}

// Programs that report pay but are left out of a state, because more than half
// of their graduates studied at campuses in other states.
export function studiedElsewhereNote(programCount: number) {
  if (programCount === 1) return 'One program is not listed, because most of its graduates studied at campuses in other states.'
  if (programCount > 1) {
    return `${formatCount(programCount)} programs are not listed, because most of their graduates studied at campuses in other states.`
  }
  return undefined
}

// On the page of a program whose figures also cover campuses in other states.
// The share comes from the awards each campus gave in 2022-23 (IPEDSCOUNT2), a
// later year than the classes whose pay is shown, so the sentence names the year.
// Change it when the data release changes.
// `programName` is the field as it reads inside a sentence ("nursing"). The share
// reads "More than 99%" when it rounds to 100% but is not all of the graduates.
export function campusesNote(inStateShare: number, programName: string, stateName: string) {
  const share = roundedPercent(inStateShare) === 100 && inStateShare < 1 ? 'More than 99%' : formatShare(inStateShare)
  return `These figures cover all of this school's campuses together. ${share} of its ${programName} graduates in 2022-23 studied in ${placeInSentence(stateName)}.`
}
