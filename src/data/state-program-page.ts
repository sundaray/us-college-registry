// The record behind one ranking hub page: every program of one field and
// credential in one state, for example nursing bachelor's programs in Texas.
// Written by scripts/build-data.ts from the files in data/raw.

import type { Benchmark, CredentialLevel, OccupationOutlook, SchoolControl } from '@/data/program-page'

// One program in the state that reports first-year pay. Ranks use the same rules
// as program pages, so a program shows the same rank on both: 1 plus the number
// of programs with higher pay (or lower debt, or a lower debt-to-pay ratio).
export type RankedProgram = {
  schoolName: string
  city: string
  control: SchoolControl
  // False for schools that have since closed. They stay in the list because the
  // state medians include them.
  isOpen: boolean
  earningsYear1: number
  earningsYear5?: number
  medianDebt?: number
  // Set only when the program has its own page (it reports debt and the school is open).
  href?: string
  payRank: number
  // Only for programs that report both pay and debt.
  debtRank?: number
  ratioRank?: number
}

export type StateProgramPage = {
  stateSlug: string
  programSlug: string
  state: {
    code: string
    name: string
  }
  program: {
    cipCode: string
    credentialLevel: CredentialLevel
    name: string
    sentenceName: string
    fullTitle: string
    credential: string
    degreeAbbreviation?: string
  }
  benchmarks: {
    state: Benchmark
    national: Benchmark
  }
  // Highest first-year pay first.
  programs: RankedProgram[]
  // Programs in the state that report debt but not pay. They count toward the
  // debt median but can't be ranked by pay, so they aren't listed.
  debtOnlyCount: number
  // For fields that train for one licensed job: that job's pay in the state.
  matchingJob?: OccupationOutlook & { pluralName: string }
  // Otherwise: the jobs the crosswalk links to the field, as on program pages.
  occupations: OccupationOutlook[]
  // Ranking pages for the same field at other credential levels in the state.
  otherCredentials: { href: string; title: string; programCount: number }[]
}

export type StateProgramIndexEntry = {
  stateSlug: string
  programSlug: string
  cipCode: string
  credentialLevel: CredentialLevel
  state: string
  programCount: number
}
