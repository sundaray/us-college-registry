// The record behind one state hub page: pay and debt medians by credential, every
// field with a ranking page in the state, and every school with program pages.
// Written by scripts/build-data.ts from the files in data/raw.

import type { Benchmark, CredentialLevel, SchoolControl } from '@/data/program-page'

// Medians across every program in the state (and nationwide) at one credential
// level, all fields together.
export type StateCredentialSummary = {
  credentialLevel: CredentialLevel
  credential: string
  state: Benchmark
  national: Benchmark
}

// One field with a ranking page in the state. Figures are the state medians shown
// on that ranking page. Ranks follow the site's rule: 1 plus the number of fields
// with higher pay (or lower debt, or more programs).
export type StateField = {
  cipCode: string
  name: string
  sentenceName: string
  degreeAbbreviation?: string
  href: string
  programCount: number
  earningsYear1: number
  medianDebt: number
  payRank: number
  debtRank: number
  programCountRank: number
}

export type StateFieldLevel = {
  credentialLevel: CredentialLevel
  credential: string
  // Highest median first-year pay first.
  fields: StateField[]
}

// A school in the state with at least one program page. Schools with a school
// page link to it; schools with one program link to that program's page.
export type StateSchool = {
  unitId: string
  name: string
  city: string
  control: SchoolControl
  // Programs at the school that report first-year pay.
  programCount: number
  href: string
  // Only for schools with one program: "Cosmetology (Certificate)".
  programName?: string
}

export type StatePage = {
  stateSlug: string
  state: {
    code: string
    name: string
  }
  // Bachelor's first. Only levels with programs in the state that report pay.
  credentials: StateCredentialSummary[]
  // Only levels with at least one ranking page in the state.
  fieldLevels: StateFieldLevel[]
  // Sorted by name.
  schools: StateSchool[]
  // Programs in the state that report first-year pay, all levels.
  programCount: number
  // Schools in the state with at least one program that reports first-year pay.
  schoolsWithPayCount: number
  // BEA Regional Price Parity for the state (US = 100). Missing for Puerto Rico.
  priceIndex?: number
}

export type StateIndexEntry = {
  stateSlug: string
  state: string
  programCount: number
}
