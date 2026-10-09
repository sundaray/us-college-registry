// Titles and sentences for the home page and the navbar's list pages. The home
// page heading is the site name. Browser tab titles name US colleges on their
// own, because they say more in search results than the name does.

import type { CareersListPage, HomePage, ProgramsListPage, SchoolsListPage } from '@/data/site-pages'
import { formatCount } from '@/lib/format'

// The name in the top bar, the footer, the home page heading, and the default
// browser tab title.
export const SITE_NAME = { start: 'US College', end: 'Programs' }

export function buildHomeTitle() {
  return 'Compare US College Programs by Graduate Pay, Debt, and Careers'
}

export function buildHomeSubtitle() {
  return 'Compare programs, graduate salaries, and student debt.'
}

export function buildHomeDescription(page: HomePage) {
  const { counts } = page
  return `Graduate pay and federal debt for ${formatCount(counts.programPages)} programs at ${formatCount(counts.schools)} US colleges, ranked by state, school, and field, with pay for ${formatCount(counts.careers)} careers.`
}

export function programsListCount(page: ProgramsListPage) {
  return page.levels.reduce((total, level) => total + level.programs.length, 0)
}

export function buildProgramsListTitle() {
  return 'US College Programs by Field, Ranked by Graduate Pay and Debt'
}

export function buildProgramsListDescription(page: ProgramsListPage) {
  return `Graduate pay and federal debt for ${formatCount(programsListCount(page))} kinds of US college programs, from bachelor's degrees to certificates, each with a national and state ranking.`
}

export function schoolsListCount(page: SchoolsListPage) {
  return page.states.reduce((total, state) => total + state.schools.length, 0)
}

export function buildSchoolsListTitle() {
  return 'US Colleges and Trade Schools by State, With Graduate Pay and Debt'
}

export function buildSchoolsListDescription(page: SchoolsListPage) {
  return `${formatCount(schoolsListCount(page))} US colleges, universities, and trade schools with graduate pay and debt for their programs, listed by state.`
}

export function buildCareersListTitle() {
  return 'Careers That US College Programs Lead To, by Pay and Job Growth'
}

export function buildCareersListDescription(page: CareersListPage) {
  return `Median pay, number of jobs, and projected growth for ${formatCount(page.careers.length)} careers that US college programs lead to, with pay in every state.`
}
