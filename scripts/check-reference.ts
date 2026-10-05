// Regression check: the generated UT Austin nursing bachelor's record must match the
// figures the user approved on the hand-built reference page (HANDOVER.md,
// "Reference numbers"). Run after `pnpm build-data`:
//
//   pnpm check-reference
//
// The expected values below are test expectations only. Pages never read them.

import { readFile } from 'node:fs/promises'
import type { ProgramPage } from '../src/data/program-page'

const RECORD_PATH = 'data/generated/programs/university-of-texas-at-austin/nursing-bachelors.json'

const page = JSON.parse(await readFile(RECORD_PATH, 'utf8')) as ProgramPage
const failures: string[] = []

function expectEqual(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function expectClose(label: string, actual: number | undefined, expected: number, decimals: number) {
  if (actual === undefined || actual.toFixed(decimals) !== expected.toFixed(decimals)) {
    failures.push(`${label}: expected ${expected.toFixed(decimals)}, got ${actual?.toFixed(decimals)}`)
  }
}

// Program
expectEqual('first-year earnings', page.earnings.year1, 75095)
expectEqual('5-year earnings', page.earnings.year5, 82838)
expectEqual('median federal debt', page.debt.median, 19651)
expectEqual('monthly payment', page.debt.monthlyPayment, 208)
expectEqual('Pell first-year pay', page.earnings.pellYear1, 76134)
expectEqual('Pell debt', page.debt.pellMedian, 17481)
expectEqual('other first-year pay', page.earnings.otherYear1, 72913)
expectEqual('other debt', page.debt.otherMedian, 23374)
expectEqual('Parent PLUS borrowers', page.debt.parentPlusBorrowers, 53)
expectEqual('Parent PLUS median', page.debt.parentPlusMedian, 20508)
expectEqual('working', page.earnings.workingCount, 139)
expectEqual('working in Texas', page.earnings.workingInStateCount, 121)
expectEqual('repayment borrowers', page.repayment?.borrowers, 121)
expectEqual('repayment rows', page.repayment?.rows, [
  { status: 'paidInFull', share: { kind: 'between', low: 0.3, high: 0.39 } },
  { status: 'makingProgress', share: { kind: 'between', low: 0.4, high: 0.49 } },
  { status: 'forbearance', share: { kind: 'between', low: 0.1, high: 0.19 } },
  { status: 'default', share: { kind: 'atMost', high: 0.1 } },
])
expectEqual('graduates a year', page.program.graduatesPerYear, 118)

// National
const national = page.benchmarks.national
expectEqual('national programs with first-year pay', national.earningsYear1Count, 895)
expectEqual('national first-year median', national.earningsYear1, 74438)
expectEqual('national 5-year median', national.earningsYear5, 81525)
expectEqual('national debt median', national.medianDebt, 27000)
expectClose('national debt-to-earnings', national.debtToEarnings, 0.364, 3)
expectEqual('national pay percentile', page.ranks.nationalEarningsPercentile, 54)
expectClose('debt lower than share', page.ranks.debtLowerThanShare, 0.899, 3)

// Texas. The reference page showed the 5-year and debt medians as $86,500 and
// $25,160. Both are means of two middle values (86,499.5 and 25,160.5); pages
// round half up, so the debt median displays as $25,161.
const state = page.benchmarks.state
expectEqual('Texas programs with first-year pay', state.earningsYear1Count, 48)
expectEqual('Texas programs with pay and debt', page.ranks.stateProgramsWithBoth, 44)
expectEqual('Texas first-year median', state.earningsYear1, 76677)
expectEqual('Texas 5-year median', state.earningsYear5, 86499.5)
expectEqual('Texas debt median', state.medianDebt, 25160.5)
expectClose('Texas debt-to-earnings', state.debtToEarnings, 0.337, 3)
expectEqual('Texas pay rank', page.ranks.stateEarningsRank, 29)
expectEqual('Texas debt rank', page.ranks.stateDebtRank, 4)
expectEqual('Texas debt-to-earnings rank', page.ranks.stateDebtToEarningsRank, 7)

// School
const school = page.school
expectEqual('in-state tuition', school.inStateTuition, 11688)
expectEqual('out-of-state tuition', school.outOfStateTuition, 44908)
expectEqual('average net price', school.averageNetPrice, 19857)
expectEqual('admission rate', school.admissionRate, 0.2664)
expectEqual('graduation rate', school.graduationRate, { rate: 0.889, basis: 'fourYear' })
expectEqual('undergraduates', school.undergraduates, 42855)
expectEqual('school rank', page.ranks.schoolEarningsRank, 11)
expectEqual('school program count', page.ranks.schoolProgramCount, 61)
expectEqual(
  'top school programs pay',
  page.topSchoolPrograms.map((program) => program.earningsYear1),
  [111587, 96997, 94041],
)

// BEA price levels, 2024
expectEqual('Austin price level', page.priceLevels?.areaIndex, 98.066)
expectEqual('Texas price level', page.priceLevels?.stateIndex, 97.057)

// BLS OEWS May 2025 and Employment Projections 2025 to 2035
const registeredNurses = page.occupations.find((occupation) => occupation.socCode === '29-1141')
expectEqual('Texas RN median', registeredNurses?.stateMedianPay, 95970)
expectEqual('Texas RN employment', registeredNurses?.stateEmployment, 271380)
expectEqual('Texas RN 10th percentile', registeredNurses?.stateP10Pay, 67120)
expectEqual('Texas RN 90th percentile', registeredNurses?.stateP90Pay, 127950)
expectEqual('national RN median', registeredNurses?.nationalMedianPay, 97550)
expectEqual('RN growth', registeredNurses?.growthShare, 0.056)
expectEqual('RN openings a year', registeredNurses?.openingsPerYear, 180800)
expectEqual('Austin metro RN median', page.matchingOccupation?.metroMedianPay, 97890)
expectEqual('matching occupation Texas median', page.matchingOccupation?.stateMedianPay, 95970)
expectEqual(
  'Texas nurse practitioner median',
  page.occupations.find((occupation) => occupation.socCode === '29-1171')?.stateMedianPay,
  131670,
)
expectEqual(
  'Texas nurse anesthetist median',
  page.occupations.find((occupation) => occupation.socCode === '29-1151')?.stateMedianPay,
  244990,
)

if (failures.length > 0) {
  console.error(`Reference check failed (${failures.length}):\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('Reference check passed: UT Austin nursing matches every approved Scorecard, BEA, and BLS figure.')
