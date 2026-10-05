// The record behind one national program page: every program of one field and
// credential in the US, for example nursing bachelor's programs. Written by
// scripts/build-data.ts from the files in data/raw.

import type { Benchmark, CredentialLevel, OccupationOutlook } from '@/data/program-page'

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
  picks: {
    byPay: NationalPick[]
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
