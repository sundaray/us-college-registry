// Records behind the home page and the three list pages in the navbar
// (/programs, /schools, /careers). Written by scripts/build-data.ts from the
// other page records, so every figure matches the page it links to.

import type { CredentialLevel } from '@/data/program-page'

// A national program page, as listed on the home page and on /programs.
export type ListedProgram = {
  href: string
  label: string
  cipCode: string
  credentialLevel: CredentialLevel
  programCount: number
  earningsYear1: number
  medianDebt: number
}

export type ListedCareer = {
  href: string
  name: string
  socCode: string
  medianPay: number
  employment?: number
  // 0.056 means 5.6% growth from 2025 to 2035.
  growthShare?: number
}

export type HomePage = {
  counts: {
    programPages: number
    schools: number
    schoolPages: number
    stateRankings: number
    nationalPrograms: number
    careers: number
  }
  states: { name: string; href: string }[]
  // Most programs nationwide first.
  commonPrograms: ListedProgram[]
  // Bachelor's fields, highest median first-year pay first.
  topPayingBachelors: ListedProgram[]
  // Most jobs nationwide first.
  largestCareers: ListedCareer[]
}

// Ranks follow the site's rule: 1 plus the number of rows with higher pay (or
// lower debt, or more programs).
export type RankedListedProgram = ListedProgram & {
  payRank: number
  debtRank: number
  programCountRank: number
}

export type ProgramsListPage = {
  // Bachelor's first. Highest median first-year pay first within each level.
  levels: { credentialLevel: CredentialLevel; credential: string; programs: RankedListedProgram[] }[]
}

export type SchoolsListPage = {
  // States A to Z, schools A to Z within each state.
  states: {
    name: string
    href: string
    // Schools with one program that reports pay link straight to that program's page.
    schools: { unitId: string; name: string; href: string; programCount: number }[]
  }[]
}

// The four pages, in build order, with their URLs.
export type SiteIndexEntry = { path: string; name: 'home' | 'programs' | 'schools' | 'careers' }

export type CareersListPage = {
  // Highest median pay first. Ranks count only careers with the figure.
  careers: (ListedCareer & { payRank: number; employmentRank?: number; growthRank?: number })[]
}
