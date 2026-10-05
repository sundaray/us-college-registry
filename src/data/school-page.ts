// The record behind one school hub page: every program at one school that
// reports graduate pay, by credential level. Written by scripts/build-data.ts
// from the files in data/raw.

import type { CredentialLevel, ProgramPage } from '@/data/program-page'

// A school gets a page only when it has at least this many programs that report
// pay. With one program, the school page would repeat the program page.
export const MINIMUM_SCHOOL_PAGE_PROGRAMS = 2

export function hasSchoolPage(programTotal: number) {
  return programTotal >= MINIMUM_SCHOOL_PAGE_PROGRAMS
}

// One program at the school that reports first-year pay.
export type SchoolProgram = {
  cipCode: string
  name: string
  earningsYear1: number
  earningsYear5?: number
  medianDebt?: number
  graduatesPerYear?: number
  // Set only when the program has its own page.
  href?: string
  // Ranks within the school's programs at this credential level, by the same rule
  // as program pages: 1 plus the number of programs with higher pay (or lower
  // debt, or more graduates). Debt and graduate ranks only when reported.
  payRank: number
  debtRank?: number
  graduatesRank?: number
  // First-year pay rank among programs with the same field and credential in the
  // school's state, as on the program and ranking pages.
  stateRank: number
  stateProgramCount: number
  // Set only when the state ranking page for the field exists.
  stateRankingHref?: string
}

export type SchoolLevel = {
  credentialLevel: CredentialLevel
  credential: string
  // Highest first-year pay first.
  programs: SchoolProgram[]
  // Programs at this level that report debt but not pay, so they aren't listed.
  debtOnlyCount: number
}

export type SchoolPage = {
  schoolSlug: string
  school: ProgramPage['school']
  // Bachelor's first, then associate's, then certificates. Only levels with at
  // least one program that reports pay.
  levels: SchoolLevel[]
}

export type SchoolIndexEntry = {
  schoolSlug: string
  unitId: string
  state: string
  programCount: number
}
