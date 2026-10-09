// The record behind one national program page: every program of one field and
// credential in the US, for example nursing bachelor's programs. Written by
// scripts/build-data.ts from the files in data/raw.

import type { Benchmark, CredentialLevel, OccupationOutlook, SchoolControl } from '@/data/program-page'

// One state's ranking page for the field. Figures are the state medians shown on
// that page. Ranks follow the site's rule: 1 plus the number of states with
// higher pay (or lower debt, or more programs).
export type NationalStateRow = {
  stateCode: string
  stateName: string
  href: string
  programCount: number
  earningsYear1: number
  medianDebt: number
  payRank: number
  debtRank: number
  programCountRank: number
}

// One program in the national ranking. Ranks follow the site's rule: 1 plus the
// number of listed programs with higher pay (or lower debt, or lower debt for the
// pay, or higher pay after prices).
export type NationalRankedProgram = {
  // IPEDS unit ID, so scripts/verify can match each row to its Scorecard record.
  unitId: string
  schoolName: string
  city: string
  stateCode: string
  stateName: string
  control: SchoolControl
  // False for schools that have since closed. They stay in the list because the
  // national medians include them.
  isOpen: boolean
  earningsYear1: number
  earningsYear5?: number
  medianDebt?: number
  // First-year pay divided by the BEA price level of the school's state (US =
  // 100). Only where at least half of the graduates who work are working in the
  // school's state, and the state has a price level.
  earningsYear1AfterPrices?: number
  // Set only when the program has its own page (it reports debt and the school is open).
  href?: string
  payRank: number
  afterPricesRank?: number
  // Only for programs that report both pay and debt.
  debtRank?: number
  ratioRank?: number
}

// A program with its own page, for the quick picks.
export type NationalPick = {
  schoolName: string
  stateCode: string
  stateName: string
  href: string
  earningsYear1: number
  medianDebt: number
}

export type NationalProgramPage = {
  programSlug: string
  program: {
    cipCode: string
    credentialLevel: CredentialLevel
    name: string
    sentenceName: string
    fullTitle: string
    credential: string
    degreeAbbreviation?: string
  }
  // Medians across every program of the field and credential in the US.
  national: Benchmark
  // Highest median first-year pay first.
  states: NationalStateRow[]
  // States and territories with programs that report pay but no ranking page,
  // because fewer than five programs there report both pay and debt.
  unrankedPlaceCount: number
  // Programs of the field and credential with their own page.
  programPageCount: number
  // Highest first-year pay first.
  ranking: NationalRankedProgram[]
  // Programs that report pay but aren't in the ranking: Scorecard's institution
  // file has no school for them (withoutSchoolCount), or their school's main
  // campus is in another state. The national medians still count them.
  unlistedCount: number
  withoutSchoolCount: number
  picks: {
    byDebt: NationalPick[]
    byDebtForPay: NationalPick[]
  }
  // BLS figures for the whole US. They use the OccupationOutlook shape so the
  // shared OccupationRow can show them: its "state" fields hold the US values.
  matchingJob?: OccupationOutlook & { pluralName: string }
  occupations: OccupationOutlook[]
  // National pages for the same field at other credential levels.
  otherCredentials: { href: string; title: string; programCount: number }[]
}

export type NationalProgramIndexEntry = {
  programSlug: string
  cipCode: string
  credentialLevel: CredentialLevel
  programCount: number
}
