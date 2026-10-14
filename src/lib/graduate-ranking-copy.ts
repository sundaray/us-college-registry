// Wording that a ranking page of a graduate degree shares with the page of one
// graduate program: its debt figure counts only federal loans taken for graduate
// study at the school itself, and it has its own name.

import { isGraduateLevel, type CredentialLevel } from '@/data/program-page'
import { classYearsNote } from '@/lib/data-notes'

export function isGraduateRanking(page: { program: { credentialLevel: CredentialLevel } }) {
  return isGraduateLevel(page.program.credentialLevel)
}

// "Median federal debt", or what a graduate figure counts.
export function debtName(graduate: boolean) {
  return graduate ? 'median federal debt for graduate study' : 'median federal debt'
}

export function debtTileLabel(graduate: boolean) {
  return graduate ? 'Median federal debt for graduate study' : 'Median federal debt'
}

// Under a ranking table of graduate programs, whose "Debt" column has no room
// for the full name.
export const GRADUATE_DEBT_COLUMN_NOTE =
  "Debt is the median amount a program's graduates borrowed in federal loans for graduate study at that school. It only counts graduates who took such loans. Undergraduate loans and loans taken at other schools are not counted."

// Under the lists of the programs with the lowest debt. A graduate debt figure
// can rest on few people: the median program page counts 47 borrowers, and
// Harvard's business administration figure counts 46 of about 877 graduates a year.
export const GRADUATE_LOWEST_DEBT_CAUTION =
  "A debt figure only counts the graduates who took federal loans for graduate study at the school. At some programs that is a small part of the class, and each program's own page says how many."

export const GRADUATE_DEBT_LIMIT = 'Undergraduate loans and loans taken at other schools are not counted.'

// The first lines of "About this data" on a graduate ranking page, after the
// line that names the field.
export const GRADUATE_DATA_NOTES = [
  'Pay only includes graduates who received federal financial aid. Debt only includes graduates who took federal loans.',
  'Pay only counts graduates who were working and not enrolled in more school. Graduates who went straight to further study are not included.',
  "Debt only includes federal loans taken for graduate study at each program's own school. Undergraduate loans, loans taken at other schools, private loans and credit cards are not counted.",
]

// Which graduating classes the figures describe. `hasFiveYearPay` is false on a
// page that shows no pay after five years.
export function graduateClassYears(hasFiveYearPay: boolean) {
  return classYearsNote(hasFiveYearPay)
}
