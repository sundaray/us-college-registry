// The record behind one occupation page: pay for one job in every state and the
// programs that lead there. Written by scripts/build-data.ts from the files in
// data/raw. Pay is BLS OEWS May 2025 (all experience levels), projections are
// BLS Employment Projections 2025 to 2035, and price levels are BEA Regional
// Price Parities 2024.

import type { CredentialLevel } from '@/data/program-page'

// One state (or DC, or Puerto Rico) where BLS publishes the job's median pay.
// Ranks follow the site's rule: 1 plus the number of states with higher pay (or
// higher pay after prices, or more jobs), counted among states with the figure.
export type OccupationStateRow = {
  stateCode: string
  stateName: string
  // Set only when the state has a state page.
  stateSlug?: string
  medianPay: number
  // Median pay divided by the state's price level (US = 100), rounded to whole
  // dollars. Missing for Puerto Rico, which has no BEA price level.
  adjustedPay?: number
  employment?: number
  p10Pay?: number
  p90Pay?: number
  payRank: number
  adjustedRank?: number
  employmentRank?: number
}

// A national program page whose field the crosswalk links to this job (or whose
// matching job this is). Figures are that page's national medians.
export type OccupationProgram = {
  href: string
  label: string
  credentialLevel: CredentialLevel
  programCount: number
  earningsYear1: number
  medianDebt: number
}

export type OccupationPage = {
  careerSlug: string
  socCode: string
  // The official BLS title, such as "Cooks, Restaurant".
  title: string
  // The plain name used in headings, such as "Restaurant Cooks"
  // (scripts/reference/occupation-names.ts), and its form inside sentences.
  name: string
  sentenceName: string
  national: {
    medianPay: number
    employment?: number
    p10Pay?: number
    p90Pay?: number
  }
  // 0.056 means 5.6% growth from 2025 to 2035.
  growthShare?: number
  openingsPerYear?: number
  typicalEducation?: string
  workExperience?: string
  // Highest median pay first.
  states: OccupationStateRow[]
  // Places in scripts/reference/states.ts (50 states, DC, Puerto Rico) where BLS
  // publishes no median pay for the job.
  statesWithoutPay: string[]
  // Highest first-year pay first.
  programs: OccupationProgram[]
}

export type OccupationIndexEntry = {
  careerSlug: string
  socCode: string
  employment: number
}
