// Builds one JSON record per page (program, ranking, school, state, national
// program, and occupation pages, plus the home page and the three list pages)
// from the public files in data/raw.
//
//   pnpm build-data
//
// Every number on a page comes from this script, which reads only the downloaded
// government files listed in data/raw/SOURCES.md. Output goes to data/generated
// (not committed): one file per page plus an index per page type in build order.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { NationalPick, NationalProgramIndexEntry, NationalProgramPage, NationalRankedProgram, NationalStateRow } from '../src/data/national-program-page'
import type { OccupationIndexEntry, OccupationPage, OccupationProgram, OccupationStateRow } from '../src/data/occupation-page'
import type {
  CareersListPage,
  HomePage,
  ListedCareer,
  ListedProgram,
  ProgramsListPage,
  SchoolsListPage,
  SiteIndexEntry,
} from '../src/data/site-pages'
import type {
  Benchmark,
  ComparisonProgram,
  CredentialLevel,
  GraduationRate,
  MatchingOccupationPay,
  NearbyProgram,
  OccupationOutlook,
  PriceLevels,
  ProgramIndexEntry,
  ProgramPage,
  RepaymentRow,
  RepaymentStatus,
  SchoolControl,
  ShareRange,
} from '../src/data/program-page'
import { isGraduateLevel } from '../src/data/program-page'
import { hasSchoolPage, type SchoolIndexEntry, type SchoolLevel, type SchoolPage, type SchoolProgram } from '../src/data/school-page'
import type { StateField, StateFieldLevel, StateIndexEntry, StatePage, StateSchool } from '../src/data/state-page'
import type { RankedProgram, StateProgramIndexEntry, StateProgramPage } from '../src/data/state-program-page'
import { placeInSentence } from '../src/lib/place-names'
import { parseNumber, readCsv } from './lib/csv'
import { slugify } from './lib/slug'
import { countWhere, median, milesBetween } from './lib/stats'
import { readSheet } from './lib/xlsx'
import { DEGREE_ABBREVIATIONS, FIELD_NAMES } from './reference/field-names'
import { applyShortNameRules, SCHOOL_SHORT_NAMES } from './reference/school-short-names'
import { MATCHING_OCCUPATIONS } from './reference/matching-occupations'
import { OCCUPATION_NAMES } from './reference/occupation-names'
import { STATES } from './reference/states'

const RAW_DIRECTORY = 'data/raw'
const OUTPUT_DIRECTORY = 'data/generated'

// A program gets a page only when at least this many programs with the same field
// and credential in its state report both first-year pay and debt.
const MINIMUM_STATE_PROGRAMS = 5
const NEARBY_MILES = 60
const NEARBY_LIMIT = 8
const PRICE_LEVEL_YEAR = '2024'
const OCCUPATION_LIMIT = 4
// A career page lists a field whose own pages leave the job out when the
// field's general program is linked to the job, or at least this share of its
// narrow programs are.
const STRONG_LINK_SHARE = 0.25
// Programs in each quick-pick list on national program pages.
const NATIONAL_PICK_COUNT = 10
// Rows in each list on the home page.
const HOME_LIST_COUNT = 8

const CREDENTIALS: Record<CredentialLevel, { label: string; slug: string }> = {
  1: { label: 'Certificate', slug: 'certificate' },
  2: { label: "Associate's", slug: 'associate' },
  3: { label: "Bachelor's", slug: 'bachelors' },
  5: { label: "Master's", slug: 'masters' },
}

const REPAYMENT_COLUMNS: Record<RepaymentStatus, string> = {
  paidInFull: 'BBRR2_FED_COMP_PAIDINFULL',
  makingProgress: 'BBRR2_FED_COMP_MAKEPROG',
  forbearance: 'BBRR2_FED_COMP_FBR',
  default: 'BBRR2_FED_COMP_DFLT',
}

// BEA metro names shortened by the first-city rule that would read wrong.
const METRO_NAME_OVERRIDES: Record<string, string> = {
  '49180': 'Winston-Salem',
  '46520': 'Honolulu',
}

// ---------------------------------------------------------------------------
// Loading

type ProgramRow = {
  unitId?: string
  opeId6: string
  isForeign: boolean
  isMainCampus: boolean
  cipCode: string
  cipTitle: string
  credentialLevel: CredentialLevel
  online?: 'all' | 'some'
  awardsLaterYear?: number
  earningsYear1?: number
  earningsYear5?: number
  debtMedian?: number
  // Graduate rows only: the number of borrowers the median debt is of.
  debtBorrowers?: number
  monthlyPayment?: number
  pellEarningsYear1?: number
  otherEarningsYear1?: number
  pellDebtMedian?: number
  otherDebtMedian?: number
  parentPlusBorrowers?: number
  parentPlusMedian?: number
  workingCount?: number
  workingInStateCount?: number
  repaymentBorrowers?: number
  repaymentShares: Partial<Record<RepaymentStatus, ShareRange>>
}

async function loadProgramRows() {
  const records = await readCsv(path.join(RAW_DIRECTORY, 'Most-Recent-Cohorts-Field-of-Study.csv'), {
    columns: [
      'UNITID', 'OPEID6', 'CONTROL', 'MAIN', 'CIPCODE', 'CIPDESC', 'CREDLEV', 'DISTANCE', 'IPEDSCOUNT2',
      'EARN_MDN_1YR', 'EARN_MDN_5YR', 'DEBT_ALL_STGP_ANY_MDN', 'DEBT_ALL_STGP_ANY_MDN10YRPAY',
      'EARN_PELL_WNE_MDN_1YR', 'EARN_NOPELL_WNE_MDN_1YR', 'DEBT_PELL_STGP_ANY_MDN', 'DEBT_NOPELL_STGP_ANY_MDN',
      'DEBT_ALL_PP_ANY_N', 'DEBT_ALL_PP_ANY_MDN', 'EARN_COUNT_WNE_1YR', 'EARN_IN_STATE_1YR',
      'BBRR2_FED_COMP_N', ...Object.values(REPAYMENT_COLUMNS),
      'DEBT_ALL_STGP_EVAL_MDN', 'DEBT_ALL_STGP_EVAL_MDN10YRPAY', 'DEBT_ALL_STGP_EVAL_N',
    ],
  })

  const rows: ProgramRow[] = []
  for (const record of records) {
    const credentialLevel = Number(record.CREDLEV)
    if (credentialLevel !== 1 && credentialLevel !== 2 && credentialLevel !== 3 && credentialLevel !== 5) continue
    // A graduate row reports debt only for loans taken at this school for
    // graduate study (the EVAL columns). Its columns for loans from any school
    // are withheld on every row. Its Pell split is left out, because the file
    // does not say when a graduate student received the grant.
    const isGraduate = isGraduateLevel(credentialLevel)
    const repaymentShares: ProgramRow['repaymentShares'] = {}
    for (const [status, column] of Object.entries(REPAYMENT_COLUMNS) as [RepaymentStatus, string][]) {
      const share = parseShareRange(record[column])
      if (share) repaymentShares[status] = share
    }
    rows.push({
      unitId: /^\d+$/.test(record.UNITID) ? record.UNITID : undefined,
      opeId6: record.OPEID6,
      isForeign: record.CONTROL === 'Foreign',
      isMainCampus: record.MAIN === '1',
      cipCode: record.CIPCODE,
      // A few official titles contain double spaces.
      cipTitle: record.CIPDESC.replace(/\s+/g, ' ').trim().replace(/\.$/, ''),
      credentialLevel,
      // DISTANCE: 3 when every credential in the field can be completed fully
      // online, 2 when at least one can, 1 when none can, 0 when not reported.
      online: record.DISTANCE === '3' ? 'all' : record.DISTANCE === '2' ? 'some' : undefined,
      awardsLaterYear: parseNumber(record.IPEDSCOUNT2),
      earningsYear1: parseNumber(record.EARN_MDN_1YR),
      earningsYear5: parseNumber(record.EARN_MDN_5YR),
      debtMedian: parseNumber(isGraduate ? record.DEBT_ALL_STGP_EVAL_MDN : record.DEBT_ALL_STGP_ANY_MDN),
      debtBorrowers: isGraduate ? parseNumber(record.DEBT_ALL_STGP_EVAL_N) : undefined,
      monthlyPayment: parseNumber(isGraduate ? record.DEBT_ALL_STGP_EVAL_MDN10YRPAY : record.DEBT_ALL_STGP_ANY_MDN10YRPAY),
      pellEarningsYear1: isGraduate ? undefined : parseNumber(record.EARN_PELL_WNE_MDN_1YR),
      otherEarningsYear1: isGraduate ? undefined : parseNumber(record.EARN_NOPELL_WNE_MDN_1YR),
      pellDebtMedian: isGraduate ? undefined : parseNumber(record.DEBT_PELL_STGP_ANY_MDN),
      otherDebtMedian: isGraduate ? undefined : parseNumber(record.DEBT_NOPELL_STGP_ANY_MDN),
      parentPlusBorrowers: parseNumber(record.DEBT_ALL_PP_ANY_N),
      parentPlusMedian: parseNumber(record.DEBT_ALL_PP_ANY_MDN),
      workingCount: parseNumber(record.EARN_COUNT_WNE_1YR),
      workingInStateCount: parseNumber(record.EARN_IN_STATE_1YR),
      repaymentBorrowers: parseNumber(record.BBRR2_FED_COMP_N),
      repaymentShares,
    })
  }
  return rows
}

// "<=0.10", ">=0.80", "0.30 - 0.39" or "0.03". Anything else is a format we
// haven't seen, so stop rather than guess.
function parseShareRange(value: string): ShareRange | undefined {
  const trimmed = value.trim()
  if (trimmed === 'PS' || trimmed === 'NA' || trimmed === '') return undefined
  const atMost = trimmed.match(/^<=\s*(\d*\.?\d+)$/)
  if (atMost) return { kind: 'atMost', high: Number(atMost[1]) }
  const atLeast = trimmed.match(/^>=\s*(\d*\.?\d+)$/)
  if (atLeast) return { kind: 'atLeast', low: Number(atLeast[1]) }
  const between = trimmed.match(/^(\d*\.?\d+)\s*-\s*(\d*\.?\d+)$/)
  if (between) return { kind: 'between', low: Number(between[1]), high: Number(between[2]) }
  if (/^\d*\.?\d+$/.test(trimmed)) return { kind: 'exact', value: Number(trimmed) }
  throw new Error(`Unexpected repayment share "${value}"`)
}

type Institution = {
  unitId: string
  opeId6: string
  name: string
  city: string
  state: string
  isMainCampus: boolean
  isOperating: boolean
  control: SchoolControl
  level: 'fourYear' | 'twoYear' | 'lessThanTwoYear'
  latitude: number
  longitude: number
  inStateTuition?: number
  outOfStateTuition?: number
  reportsByProgram: boolean
  programTuition?: number
  averageNetPrice?: number
  admissionRate?: number
  graduationRate?: GraduationRate
  undergraduates?: number
}

function positiveOrMissing(value: number | undefined) {
  return value === undefined || value <= 0 ? undefined : value
}

const LEVEL_CODES: Record<string, Institution['level']> = {
  '1': 'fourYear',
  '2': 'twoYear',
  '3': 'lessThanTwoYear',
}

const CONTROL_CODES: Record<string, SchoolControl> = {
  '1': 'Public',
  '2': 'Private nonprofit',
  '3': 'Private for-profit',
}

async function loadInstitutions() {
  const records = await readCsv(path.join(RAW_DIRECTORY, 'Most-Recent-Cohorts-Institution.csv'), {
    columns: [
      'UNITID', 'OPEID6', 'INSTNM', 'CITY', 'STABBR', 'MAIN', 'CURROPER', 'CONTROL', 'ICLEVEL',
      'LATITUDE', 'LONGITUDE', 'TUITIONFEE_IN', 'TUITIONFEE_OUT', 'TUITIONFEE_PROG', 'NPT4_PUB', 'NPT4_PRIV',
      'ADM_RATE', 'C150_4', 'C150_L4', 'UGDS', 'PREDDEG',
    ],
  })
  const institutions = new Map<string, Institution>()
  // Main campus state for every OPEID6, from all records, including schools left
  // out below for missing coordinates.
  const mainCampusState = new Map<string, string>()
  // The state of every campus in the file, for counting where graduates studied.
  const stateByUnitId = new Map<string, string>()
  for (const record of records) {
    if (record.MAIN === '1') mainCampusState.set(record.OPEID6, record.STABBR)
    stateByUnitId.set(record.UNITID, record.STABBR)
    const control = CONTROL_CODES[record.CONTROL]
    const level = LEVEL_CODES[record.ICLEVEL]
    const inStateTuition = parseNumber(record.TUITIONFEE_IN)
    const programTuition = parseNumber(record.TUITIONFEE_PROG)
    // A tuition, net price, or enrollment of 0 is treated as not reported: pages
    // never show "$0" (IPEDS lists $1,490 for the one school whose Scorecard
    // tuition is 0), and no school with programs has 0 undergraduates.
    const latitude = parseNumber(record.LATITUDE)
    const longitude = parseNumber(record.LONGITUDE)
    if (!control || !level || latitude === undefined || longitude === undefined) continue
    const isFourYear = record.ICLEVEL === '1'
    const graduationRateValue = parseNumber(isFourYear ? record.C150_4 : record.C150_L4)
    institutions.set(record.UNITID, {
      unitId: record.UNITID,
      opeId6: record.OPEID6,
      // A few official names contain double spaces.
      name: record.INSTNM.replace(/\s+/g, ' ').trim(),
      city: record.CITY.replace(/\s+/g, ' ').trim(),
      state: record.STABBR,
      isMainCampus: record.MAIN === '1',
      isOperating: record.CURROPER === '1',
      control,
      level,
      latitude,
      longitude,
      inStateTuition: positiveOrMissing(inStateTuition),
      outOfStateTuition: positiveOrMissing(parseNumber(record.TUITIONFEE_OUT)),
      reportsByProgram: inStateTuition === undefined && programTuition !== undefined,
      programTuition: positiveOrMissing(programTuition),
      averageNetPrice: positiveOrMissing(parseNumber(control === 'Public' ? record.NPT4_PUB : record.NPT4_PRIV)),
      admissionRate: parseNumber(record.ADM_RATE),
      graduationRate:
        graduationRateValue === undefined
          ? undefined
          : { rate: graduationRateValue, basis: isFourYear ? 'fourYear' : 'lessThanFourYear', withinSixYears: isFourYear && record.PREDDEG === '3' },
      undergraduates: positiveOrMissing(parseNumber(record.UGDS)),
    })
  }
  return { institutions, mainCampusState, stateByUnitId }
}

// IPEDS directory: which metro area (CBSA) each school is in. CBSATYPE 1 is a
// metropolitan area, 2 a micropolitan area, -2 neither.
async function loadMetroAreas() {
  const records = await readCsv(path.join(RAW_DIRECTORY, 'ipeds/HD2024.csv'), {
    columns: ['UNITID', 'CBSA', 'CBSATYPE'],
  })
  const metroCodeByUnitId = new Map<string, string>()
  for (const record of records) {
    if (record.CBSATYPE === '1') metroCodeByUnitId.set(record.UNITID, record.CBSA)
  }
  return metroCodeByUnitId
}

// IPEDS 2023-24 charges: schools whose in-district tuition and fees (TUITION1 +
// FEE1) differ from their in-state ones (TUITION2 + FEE2). Only used to label the
// Scorecard tuition figure; the 2024-25 charges file isn't published yet.
async function loadDistrictTuitionSchools() {
  const records = await readCsv(path.join(RAW_DIRECTORY, 'ipeds/ic2023_ay.csv'), {
    columns: ['UNITID', 'TUITION1', 'FEE1', 'TUITION2', 'FEE2'],
  })
  const ipedsNumber = (value: string) => (value === '.' ? undefined : parseNumber(value))
  const unitIds = new Set<string>()
  for (const record of records) {
    const districtTuition = ipedsNumber(record.TUITION1)
    const stateTuition = ipedsNumber(record.TUITION2)
    if (districtTuition === undefined || stateTuition === undefined) continue
    const districtTotal = districtTuition + (ipedsNumber(record.FEE1) ?? 0)
    const stateTotal = stateTuition + (ipedsNumber(record.FEE2) ?? 0)
    if (districtTotal !== stateTotal) unitIds.add(record.UNITID)
  }
  return unitIds
}

// BEA Regional Price Parities, all items (line 1), for one year.
async function loadPriceParities() {
  async function readTable(fileName: string) {
    const records = await readCsv(path.join(RAW_DIRECTORY, 'bea', fileName), {
      columns: ['GeoFIPS', 'GeoName', 'LineCode', PRICE_LEVEL_YEAR],
      allowShortRows: true,
    })
    const table = new Map<string, { name: string; index: number }>()
    for (const record of records) {
      if (record.LineCode !== '1') continue
      const index = parseNumber(record[PRICE_LEVEL_YEAR])
      if (index !== undefined) table.set(record.GeoFIPS, { name: record.GeoName, index })
    }
    return table
  }
  return {
    states: await readTable('SARPP_STATE_2008_2024.csv'),
    metros: await readTable('MARPP_MSA_2008_2024.csv'),
    statePortions: await readTable('PARPP_PORT_2008_2024.csv'),
  }
}

type OccupationWage = {
  title: string
  areaTitle: string
  employment?: number
  median?: number
  p10?: number
  p90?: number
  // BLS publishes only yearly pay for the job (the ANNUAL column is "TRUE"), so
  // the yearly figure is not an hourly figure times 2,080 hours.
  yearlyPayOnly: boolean
}

// OEWS marks wages it doesn't publish with "*", employment with "**", and wages
// above its top code with "#". All of them count as missing.
function parseOewsNumber(value: string) {
  if (value === '' || value === '*' || value === '**' || value === '#' || value === '~') return undefined
  return parseNumber(value)
}

// BLS OEWS May 2025, all industries and all ownerships. Keyed by area and SOC code:
// "US|29-1141", "S48|29-1141" (state FIPS), "M12420|29-1141" (metro CBSA code).
async function loadOccupationWages() {
  const records = await readSheet(path.join(RAW_DIRECTORY, 'bls/all_data_M_2025.xlsx'), {
    sheetName: 'All May 2025 data',
    headerRow: 1,
    columns: [
      'AREA', 'AREA_TITLE', 'AREA_TYPE', 'I_GROUP', 'OWN_CODE', 'OCC_CODE', 'OCC_TITLE', 'O_GROUP',
      'TOT_EMP', 'A_MEDIAN', 'A_PCT10', 'A_PCT90', 'ANNUAL',
    ],
  })
  const wages = new Map<string, OccupationWage>()
  // Area types: 1 the US, 2 states, 3 territories (Puerto Rico, Guam, Virgin
  // Islands, keyed like states by FIPS code), 4 metro areas.
  const areaPrefixes: Record<string, (area: string) => string> = {
    '1': () => 'US',
    '2': (area) => `S${area.padStart(2, '0')}`,
    '3': (area) => `S${area.padStart(2, '0')}`,
    '4': (area) => `M${area}`,
  }
  for (const record of records) {
    if (record.I_GROUP !== 'cross-industry' || record.OWN_CODE !== '1235' || record.O_GROUP !== 'detailed') continue
    const areaKey = areaPrefixes[record.AREA_TYPE]?.(record.AREA)
    if (!areaKey) continue
    wages.set(`${areaKey}|${record.OCC_CODE}`, {
      title: record.OCC_TITLE,
      areaTitle: record.AREA_TITLE,
      employment: parseOewsNumber(record.TOT_EMP),
      median: parseOewsNumber(record.A_MEDIAN),
      p10: parseOewsNumber(record.A_PCT10),
      p90: parseOewsNumber(record.A_PCT90),
      yearlyPayOnly: record.ANNUAL === 'TRUE',
    })
  }
  return wages
}

type Projection = {
  // Everyone in the job in 2025, including people who work for themselves. The
  // pay survey's count leaves them out.
  employment?: number
  growthShare?: number
  openingsPerYear?: number
  typicalEducation?: string
  workExperience?: string
}

// BLS Employment Projections 2025 to 2035, table 1.2. Employment and openings
// are published in thousands; growth as a percent.
async function loadProjections() {
  const employmentColumn = 'Employment, 2025'
  const growthColumn = 'Employment change, percent, 2025–35'
  const openingsColumn = 'Occupational openings, 2025–35 annual average'
  const records = await readSheet(path.join(RAW_DIRECTORY, 'bls-ep-occupation.xlsx'), {
    sheetName: 'Table 1.2',
    headerRow: 2,
    columns: [
      '2025 National Employment Matrix code', 'Occupation type', employmentColumn, growthColumn, openingsColumn,
      'Typical education needed for entry', 'Work experience in a related occupation',
    ],
  })
  const projections = new Map<string, Projection>()
  for (const record of records) {
    if (record['Occupation type'] !== 'Line item') continue
    const employmentThousands = parseNumber(record[employmentColumn])
    const growthPercent = parseNumber(record[growthColumn])
    const openingsThousands = parseNumber(record[openingsColumn])
    const education = record['Typical education needed for entry']
    const experience = record['Work experience in a related occupation']
    projections.set(record['2025 National Employment Matrix code'], {
      employment: employmentThousands === undefined ? undefined : Math.round(employmentThousands * 1000),
      growthShare: growthPercent === undefined ? undefined : Number((growthPercent / 100).toFixed(4)),
      openingsPerYear: openingsThousands === undefined ? undefined : Math.round(openingsThousands * 1000),
      typicalEducation: education && education !== '—' ? education : undefined,
      workExperience: experience && experience !== 'None' && experience !== '—' ? experience : undefined,
    })
  }
  return projections
}

// NCES CIP 2020 to SOC 2018 crosswalk. It links narrow 6-digit program codes to
// jobs. Scorecard uses 4-digit field codes, and `socCodesByField` rolls the links
// up to those. `programsByField` keeps each field's 6-digit programs with the
// jobs of each, including programs linked to no job, and marks the field's
// general program ("Business Administration and Management, General.").
// "99-9999" means no match.
async function loadCrosswalk() {
  const records = await readSheet(path.join(RAW_DIRECTORY, 'CIP2020_SOC2018_Crosswalk.xlsx'), {
    sheetName: 'CIP-SOC',
    headerRow: 1,
    columns: ['CIP2020Code', 'CIP2020Title', 'SOC2018Code'],
  })
  const socCodesByField = new Map<string, Set<string>>()
  const programsByField = new Map<string, Map<string, { isGeneral: boolean; socCodes: Set<string> }>>()
  for (const record of records) {
    const match = record.CIP2020Code.match(/^(\d{2})\.(\d{2})\d{2}$/)
    if (!match) throw new Error(`Unexpected CIP code "${record.CIP2020Code}" in the crosswalk`)
    const fieldCode = `${match[1]}${match[2]}`
    const programs = programsByField.get(fieldCode) ?? new Map<string, { isGeneral: boolean; socCodes: Set<string> }>()
    const program = programs.get(record.CIP2020Code) ?? { isGeneral: /,\s*General\.?$/.test(record.CIP2020Title.trim()), socCodes: new Set<string>() }
    programs.set(record.CIP2020Code, program)
    programsByField.set(fieldCode, programs)
    if (record.SOC2018Code === '99-9999') continue
    program.socCodes.add(record.SOC2018Code)
    const socCodes = socCodesByField.get(fieldCode) ?? new Set<string>()
    socCodes.add(record.SOC2018Code)
    socCodesByField.set(fieldCode, socCodes)
  }
  return { socCodesByField, programsByField }
}

// ---------------------------------------------------------------------------
// Rules

function poolKey(...parts: (string | number)[]) {
  return parts.join('|')
}

// Schools with several campuses under one OPEID6 report one combined figure,
// copied onto every campus row. Keep one row per OPEID6, field, and credential,
// preferring the main campus, then the lowest UNITID, so each figure counts once.
function keepOneRowPerSchool(rows: ProgramRow[]) {
  const groups = new Map<string, ProgramRow[]>()
  for (const row of rows) {
    const key = poolKey(row.opeId6, row.cipCode, row.credentialLevel)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  const unitIdOrder = (row: ProgramRow) => (row.unitId ? Number(row.unitId) : Number.MAX_SAFE_INTEGER)
  return [...groups.values()].map(
    (group) =>
      [...group].sort(
        (first, second) =>
          Number(second.isMainCampus) - Number(first.isMainCampus) || unitIdOrder(first) - unitIdOrder(second),
      )[0],
  )
}

function computeBenchmark(rows: ProgramRow[]): Benchmark {
  const withPay = rows.filter((row) => row.earningsYear1 !== undefined)
  const withFiveYear = rows.filter((row) => row.earningsYear5 !== undefined)
  const withDebt = rows.filter((row) => row.debtMedian !== undefined)
  const withBoth = withDebt.filter((row) => row.earningsYear1 !== undefined)
  return {
    earningsYear1: median(withPay.map((row) => row.earningsYear1!)),
    earningsYear1Count: withPay.length,
    earningsYear5: withFiveYear.length > 0 ? median(withFiveYear.map((row) => row.earningsYear5!)) : undefined,
    earningsYear5Count: withFiveYear.length,
    medianDebt: median(withDebt.map((row) => row.debtMedian!)),
    medianDebtCount: withDebt.length,
    debtToEarnings: median(withBoth.map((row) => row.debtMedian! / row.earningsYear1!)),
    debtToEarningsCount: withBoth.length,
  }
}

// The states a metro area lies in, from its BEA name: "Kansas City, MO-KS
// (Metropolitan Statistical Area)" is in MO and KS.
function metroStates(officialName: string) {
  return /, ([A-Z]{2}(?:-[A-Z]{2})*)/.exec(officialName)?.[1].split('-') ?? []
}

// "Austin-Round Rock-San Marcos, TX" becomes "Austin". BEA and BLS use the same
// metro codes and names.
function metroFirstCity(metroCode: string, officialName: string) {
  return METRO_NAME_OVERRIDES[metroCode] ?? officialName.split(',')[0].split('-')[0].split('/')[0].trim()
}

// Short names must be unique, because titles must be unique. When two schools get
// the same short name, both use their official names; when official names also
// match ("Bethel University" in three states), the state is added, then the city.
function buildSchoolDisplayNames(unitIds: string[], institutions: Map<string, Institution>) {
  const candidateLevels = (unitId: string) => {
    const institution = institutions.get(unitId)!
    const shortName = SCHOOL_SHORT_NAMES[unitId] ?? applyShortNameRules(institution.name)
    const stateName = STATES[institution.state]?.name ?? institution.state
    return [
      shortName,
      institution.name,
      `${institution.name} (${stateName})`,
      `${institution.name} (${institution.city}, ${stateName})`,
    ]
  }
  const levelByUnitId = new Map(unitIds.map((unitId) => [unitId, 0]))
  for (let pass = 0; pass < 4; pass += 1) {
    const unitIdsByName = new Map<string, string[]>()
    for (const unitId of unitIds) {
      const name = candidateLevels(unitId)[levelByUnitId.get(unitId)!]
      unitIdsByName.set(name, [...(unitIdsByName.get(name) ?? []), unitId])
    }
    let changed = false
    for (const sharing of unitIdsByName.values()) {
      if (sharing.length < 2) continue
      for (const unitId of sharing) {
        const level = levelByUnitId.get(unitId)!
        if (level < 3) {
          levelByUnitId.set(unitId, level + 1)
          changed = true
        }
      }
    }
    if (!changed) break
  }
  const names = new Map(unitIds.map((unitId) => [unitId, candidateLevels(unitId)[levelByUnitId.get(unitId)!]]))
  const allNames = [...names.values()]
  if (new Set(allNames).size !== allNames.length) throw new Error('Two schools share a display name')
  return names
}

function stateSlug(stateCode: string) {
  return slugify(STATES[stateCode].name)
}

function fieldSentenceName(cipCode: string) {
  const field = FIELD_NAMES[cipCode]
  return field.sentenceName ?? lowercaseWords(field.name)
}

// "Registered Nurses" becomes "registered nurses"; words in capitals (HVAC) stay.
function lowercaseWords(name: string) {
  return name
    .split(' ')
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(' ')
}

// Median pay divided by a BEA price level (US = 100), rounded half up to whole
// dollars. Worked in integers (the price level has three decimals) so that
// floating-point noise can't change the rounding.
function payAfterPrices(pay: number, priceIndex: number) {
  const thousandths = Math.round(priceIndex * 1000)
  return Math.floor((pay * 100000 * 2 + thousandths) / (2 * thousandths))
}

// ---------------------------------------------------------------------------
// Build

async function main() {
  const startedAt = Date.now()
  const [
    allRows,
    { institutions, mainCampusState, stateByUnitId },
    metroCodeByUnitId,
    districtTuitionUnitIds,
    priceParities,
    occupationWages,
    projections,
    { socCodesByField, programsByField },
  ] = await Promise.all([
      loadProgramRows(),
      loadInstitutions(),
      loadMetroAreas(),
      loadDistrictTuitionSchools(),
      loadPriceParities(),
      loadOccupationWages(),
      loadProjections(),
      loadCrosswalk(),
    ])
  const keptRows = keepOneRowPerSchool(allRows)


  // National pools: every kept row except foreign schools. Closed schools stay in,
  // because their graduates are part of the measured cohorts.
  const nationalPools = new Map<string, ProgramRow[]>()
  // Where each program's graduates studied. The federal file repeats one pay and
  // debt figure on every campus of a school, but gives each campus its own count
  // of graduates. A campus missing from the institution file can't be placed in
  // a state and is not counted.
  const graduatesByState = new Map<string, Map<string, number>>()
  for (const row of allRows) {
    const campusState = row.unitId ? stateByUnitId.get(row.unitId) : undefined
    if (!campusState || !row.awardsLaterYear) continue
    const programKey = poolKey(row.opeId6, row.cipCode, row.credentialLevel)
    const byState = graduatesByState.get(programKey) ?? new Map<string, number>()
    byState.set(campusState, (byState.get(campusState) ?? 0) + row.awardsLaterYear)
    graduatesByState.set(programKey, byState)
  }
  // How many of a program's graduates studied in one state, and how many in all.
  function graduatesIn(row: ProgramRow, state: string) {
    const byState = graduatesByState.get(poolKey(row.opeId6, row.cipCode, row.credentialLevel))
    const total = [...(byState?.values() ?? [])].reduce((sum, count) => sum + count, 0)
    return { inState: byState?.get(state) ?? 0, total, stateCount: byState?.size ?? 0 }
  }

  // State pools: rows at schools with a known state. A school whose main campus
  // is in another state is left out. So is a program when more than half of its
  // graduates studied at campuses in other states: its combined figure says
  // little about the state. Such a program stays in the national pool.
  const statePools = new Map<string, ProgramRow[]>()
  // Programs left out for that reason that report pay, by state pool and by school.
  const studiedElsewhereByStatePool = new Map<string, number>()
  const studiedElsewhereBySchool = new Map<string, number>()
  // Each school's own programs at each credential level that report pay, for the
  // school rank and the school page.
  const schoolPools = new Map<string, ProgramRow[]>()
  // Programs at each school and credential level that report debt but not pay.
  const debtOnlyCountBySchool = new Map<string, number>()

  function addTo<Item>(groups: Map<string, Item[]>, key: string, item: Item) {
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }

  for (const row of keptRows) {
    if (!row.isForeign) addTo(nationalPools, poolKey(row.cipCode, row.credentialLevel), row)
    const institution = row.unitId ? institutions.get(row.unitId) : undefined
    if (!institution) continue
    const mainState = mainCampusState.get(row.opeId6)
    if (mainState && mainState !== institution.state) continue
    const studied = graduatesIn(row, institution.state)
    if (studied.inState * 2 < studied.total) {
      if (row.earningsYear1 !== undefined) {
        const statePoolKey = poolKey(row.cipCode, row.credentialLevel, institution.state)
        studiedElsewhereByStatePool.set(statePoolKey, (studiedElsewhereByStatePool.get(statePoolKey) ?? 0) + 1)
        // School pages give this count. They list master's programs too.
        studiedElsewhereBySchool.set(row.unitId!, (studiedElsewhereBySchool.get(row.unitId!) ?? 0) + 1)
      }
      continue
    }
    addTo(statePools, poolKey(row.cipCode, row.credentialLevel, institution.state), row)
    const schoolKey = poolKey(row.unitId!, row.credentialLevel)
    if (row.earningsYear1 !== undefined) addTo(schoolPools, schoolKey, row)
    else if (row.debtMedian !== undefined) debtOnlyCountBySchool.set(schoolKey, (debtOnlyCountBySchool.get(schoolKey) ?? 0) + 1)
  }

  const hasPayAndDebt = (row: ProgramRow) => row.earningsYear1 !== undefined && row.debtMedian !== undefined

  // The rule for a program page, at every credential level.
  function qualifiesForPage(row: ProgramRow) {
    const institution = row.unitId ? institutions.get(row.unitId) : undefined
    if (!institution || !institution.isOperating || !STATES[institution.state]) return false
    if (!hasPayAndDebt(row)) return false
    const statePool = statePools.get(poolKey(row.cipCode, row.credentialLevel, institution.state))
    if (!statePool?.includes(row)) return false
    return countWhere(statePool, hasPayAndDebt) >= MINIMUM_STATE_PROGRAMS
  }

  const pageRows = keptRows.filter((row) => !isGraduateLevel(row.credentialLevel) && qualifiesForPage(row))
  // Graduate programs that meet the rule. Each has a program page. They are kept
  // apart from pageRows, because no ranking, school, state or list page lists
  // graduate programs yet.
  const graduatePageRows = keptRows.filter((row) => isGraduateLevel(row.credentialLevel) && qualifiesForPage(row))

  // Slugs. School names repeat across states ("Columbia College"), so add the
  // state, then the city, when needed.
  const pageUnitIds = [...new Set(pageRows.map((row) => row.unitId!))]
  const schoolSlugByUnitId = new Map<string, string>()
  const unitIdsByBaseSlug = new Map<string, string[]>()
  for (const unitId of pageUnitIds) {
    const baseSlug = slugify(institutions.get(unitId)!.name.replace(/^The\s+/i, ''))
    unitIdsByBaseSlug.set(baseSlug, [...(unitIdsByBaseSlug.get(baseSlug) ?? []), unitId])
  }
  for (const [baseSlug, unitIds] of unitIdsByBaseSlug) {
    if (unitIds.length === 1) {
      schoolSlugByUnitId.set(unitIds[0], baseSlug)
      continue
    }
    const candidates = (unitId: string) => {
      const institution = institutions.get(unitId)!
      return [
        `${baseSlug}-${slugify(institution.state)}`,
        `${baseSlug}-${slugify(institution.city)}-${slugify(institution.state)}`,
        `${baseSlug}-${unitId}`,
      ]
    }
    for (let level = 0; level < 3; level += 1) {
      const slugs = unitIds.map((unitId) => candidates(unitId)[level])
      if (new Set(slugs).size === slugs.length || level === 2) {
        unitIds.forEach((unitId, position) => schoolSlugByUnitId.set(unitId, slugs[position]))
        break
      }
    }
  }

  // A school with graduate pages only takes the first address that no school
  // already has, by the same steps: the name, then the state, then the city.
  for (const row of graduatePageRows) {
    const unitId = row.unitId!
    if (schoolSlugByUnitId.has(unitId)) continue
    const institution = institutions.get(unitId)!
    const baseSlug = slugify(institution.name.replace(/^The\s+/i, ''))
    const takenSlugs = new Set(schoolSlugByUnitId.values())
    const freeSlug = [
      baseSlug,
      `${baseSlug}-${slugify(institution.state)}`,
      `${baseSlug}-${slugify(institution.city)}-${slugify(institution.state)}`,
      `${baseSlug}-${unitId}`,
    ].find((candidate) => !takenSlugs.has(candidate))!
    schoolSlugByUnitId.set(unitId, freeSlug)
  }

  const missingFieldNames = new Set<string>()
  function programSlug(row: ProgramRow) {
    if (!FIELD_NAMES[row.cipCode]) missingFieldNames.add(`${row.cipCode} ${row.cipTitle}`)
    return `${slugify(FIELD_NAMES[row.cipCode]?.name ?? row.cipCode)}-${CREDENTIALS[row.credentialLevel].slug}`
  }
  const hrefByRow = new Map<ProgramRow, string>()
  for (const row of [...pageRows, ...graduatePageRows]) {
    if (!schoolSlugByUnitId.has(row.unitId!)) throw new Error(`School ${row.unitId} has a program page but no address`)
    hrefByRow.set(row, `/schools/${schoolSlugByUnitId.get(row.unitId!)}/${programSlug(row)}`)
  }
  const allHrefs = [...hrefByRow.values()]
  if (new Set(allHrefs).size !== allHrefs.length) throw new Error('Two pages share a URL')

  // Every school named on any page: schools with pages, and every school in a
  // state pool that reports pay (scatter charts and ranking tables list them).
  const namedUnitIds = new Set(pageUnitIds)
  for (const [key, pool] of statePools) {
    // Graduate pools are named below, and only where a graduate page shows them.
    if (isGraduateLevel(Number(key.split('|')[1]) as CredentialLevel)) continue
    for (const row of pool) if (row.earningsYear1 !== undefined) namedUnitIds.add(row.unitId!)
  }
  // Schools a graduate page names: every school with a graduate page, which a
  // page can list as nearby, and every school in a page's state pool that
  // reports pay, which its scatter chart shows.
  const graduateNamedUnitIds = new Set(graduatePageRows.map((row) => row.unitId!))
  for (const row of graduatePageRows) {
    const statePool = statePools.get(poolKey(row.cipCode, row.credentialLevel, institutions.get(row.unitId!)!.state))!
    for (const other of statePool) if (other.earningsYear1 !== undefined) graduateNamedUnitIds.add(other.unitId!)
  }
  const graduateFieldKeys = new Set(graduatePageRows.map((row) => poolKey(row.cipCode, row.credentialLevel)))
  for (const [key, pool] of statePools) {
    const [cipCode, levelText] = key.split('|')
    if (!graduateFieldKeys.has(poolKey(cipCode, levelText))) continue
    for (const other of pool) if (other.earningsYear1 !== undefined) graduateNamedUnitIds.add(other.unitId!)
  }
  const displayNameByUnitId = buildSchoolDisplayNames([...new Set([...namedUnitIds, ...graduateNamedUnitIds])], institutions)
  // The schools that graduate pages add must not rename a school on any other
  // page. If one ever does, the titles of those pages change, and that is a
  // decision to take, not a side effect.
  for (const [unitId, nameWithoutGraduatePages] of buildSchoolDisplayNames([...namedUnitIds], institutions)) {
    if (displayNameByUnitId.get(unitId) !== nameWithoutGraduatePages) {
      throw new Error(`Graduate pages would rename "${nameWithoutGraduatePages}" to "${displayNameByUnitId.get(unitId)}" on the pages that list undergraduate programs`)
    }
  }
  function schoolDisplayName(unitId: string) {
    return displayNameByUnitId.get(unitId)!
  }

  const benchmarkCache = new Map<string, Benchmark>()
  function cachedBenchmark(pools: Map<string, ProgramRow[]>, key: string) {
    const cacheKey = `${pools === nationalPools ? 'national' : 'state'}|${key}`
    let benchmark = benchmarkCache.get(cacheKey)
    if (!benchmark) {
      benchmark = computeBenchmark(pools.get(key)!)
      benchmarkCache.set(cacheKey, benchmark)
    }
    return benchmark
  }

  // Occupations the crosswalk links to a field, as listed on pages in one state.
  // Postsecondary teaching jobs (SOC 25-1xxx, which need a doctorate) and "All
  // Other" catch-all groups are left out. Where OEWS publishes only a combined
  // code (13-1020 for 13-1021 to 13-1023), the combined code is used.
  const occupationCache = new Map<string, OccupationOutlook[]>()
  function occupationsFor(cipCode: string, stateFips: string) {
    const cacheKey = poolKey(cipCode, stateFips)
    const cached = occupationCache.get(cacheKey)
    if (cached) return cached
    const outlooks = occupationCodesFor(cipCode).map((socCode) => outlookFor(socCode, stateFips)!)
    occupationCache.set(cacheKey, outlooks)
    return outlooks
  }

  // The job a crosswalk code is shown as: the code itself, or the combined code
  // OEWS publishes in its place. Postsecondary teaching jobs and "All Other"
  // groups are not shown.
  function shownSocCode(crosswalkCode: string) {
    if (crosswalkCode.startsWith('25-1')) return undefined
    const combinedCode = `${crosswalkCode.slice(0, 6)}0`
    const socCode = occupationWages.has(`US|${crosswalkCode}`)
      ? crosswalkCode
      : occupationWages.has(`US|${combinedCode}`)
        ? combinedCode
        : undefined
    if (!socCode) return undefined
    const national = occupationWages.get(`US|${socCode}`)!
    return /all other/i.test(national.title) || national.employment === undefined ? undefined : socCode
  }

  // Every occupation the crosswalk links to a field, most national employment first.
  function linkedOccupationCodes(cipCode: string) {
    const candidates: { socCode: string; nationalEmployment: number; title: string }[] = []
    for (const crosswalkCode of socCodesByField.get(cipCode) ?? []) {
      const socCode = shownSocCode(crosswalkCode)
      if (!socCode || candidates.some((candidate) => candidate.socCode === socCode)) continue
      const national = occupationWages.get(`US|${socCode}`)!
      if (national.employment === undefined) continue
      // Ordered by everyone in the job (the projections' count), so that the list
      // agrees with the counts the national pages show. The pay survey's count
      // stands in for a job the projections don't list.
      candidates.push({ socCode, nationalEmployment: projections.get(socCode)?.employment ?? national.employment, title: national.title })
    }
    candidates.sort(
      (first, second) => second.nationalEmployment - first.nationalEmployment || first.socCode.localeCompare(second.socCode),
    )
    return candidates.map((candidate) => candidate.socCode)
  }

  // The occupations a field's pages list: its largest ones.
  function occupationCodesFor(cipCode: string) {
    return linkedOccupationCodes(cipCode).slice(0, OCCUPATION_LIMIT)
  }

  // Whether the crosswalk links a job to a field strongly: the field's general
  // program is linked to it, or at least a quarter of the narrow programs the
  // field groups are. Every program in Mathematics is linked to mathematicians,
  // and "Business Administration and Management, General." to chief executives.
  // One of the 24 in Health and Medical Administration is linked to information
  // security analysts, which is not enough.
  function isStronglyLinked(cipCode: string, socCode: string) {
    const programs = [...(programsByField.get(cipCode)?.values() ?? [])]
    const isLinked = (program: { socCodes: Set<string> }) => [...program.socCodes].some((crosswalkCode) => shownSocCode(crosswalkCode) === socCode)
    if (programs.some((program) => program.isGeneral && isLinked(program))) return true
    return programs.length > 0 && countWhere(programs, isLinked) >= STRONG_LINK_SHARE * programs.length
  }

  // BLS pay, employment, and projections for one occupation in the whole US, in
  // the OccupationOutlook shape: the "state" fields hold the US values, so the
  // shared OccupationRow can show them (src/data/national-program-page.ts).
  function nationalOutlookFor(socCode: string): OccupationOutlook | undefined {
    const national = occupationWages.get(`US|${socCode}`)
    if (!national) return undefined
    const projection = projections.get(socCode)
    return {
      socCode,
      title: national.title,
      ...careerSlugFor(socCode),
      stateMedianPay: national.median,
      // For the whole country the count is everyone in the job.
      stateEmployment: projection?.employment ?? national.employment,
      stateP10Pay: national.p10,
      stateP90Pay: national.p90,
      nationalMedianPay: national.median,
      growthShare: projection?.growthShare,
      openingsPerYear: projection?.openingsPerYear,
      typicalEducation: projection?.typicalEducation,
      workExperience: projection?.workExperience,
    }
  }

  // BLS pay, employment, and projections for one occupation in one state.
  function outlookFor(socCode: string, stateFips: string): OccupationOutlook | undefined {
    const national = occupationWages.get(`US|${socCode}`)
    if (!national) return undefined
    const state = occupationWages.get(`S${stateFips}|${socCode}`)
    const projection = projections.get(socCode)
    return {
      socCode,
      title: national.title,
      ...careerSlugFor(socCode),
      stateMedianPay: state?.median,
      stateEmployment: state?.employment,
      stateP10Pay: state?.p10,
      stateP90Pay: state?.p90,
      nationalMedianPay: national.median,
      growthShare: projection?.growthShare,
      openingsPerYear: projection?.openingsPerYear,
      typicalEducation: projection?.typicalEducation,
      workExperience: projection?.workExperience,
    }
  }

  // A school whose metro area lies in another state than its address has a row
  // that contradicts itself: the address says one place and the map position
  // another. Nothing can tell which is right, so nothing that depends on where
  // the school is gets shown for it: no nearby programs, no local price level and
  // no metro pay. It is also left out of other schools' nearby programs.
  function hasTrustedLocation(unitId: string, state: string) {
    const metroCode = metroCodeByUnitId.get(unitId)
    const metroPrice = metroCode ? priceParities.metros.get(metroCode) : undefined
    return !metroPrice || metroStates(metroPrice.name).includes(state)
  }

  function matchingOccupationFor(cipCode: string, stateFips: string, metroCode: string | undefined) {
    const matching = MATCHING_OCCUPATIONS[cipCode]
    if (!matching) return undefined
    const state = occupationWages.get(`S${stateFips}|${matching.socCode}`)
    const national = occupationWages.get(`US|${matching.socCode}`)
    const metro = metroCode ? occupationWages.get(`M${metroCode}|${matching.socCode}`) : undefined
    if (state?.median === undefined || national?.median === undefined) return undefined
    const pay: MatchingOccupationPay = {
      ...matching,
      stateMedianPay: state.median,
      nationalMedianPay: national.median,
    }
    if (metroCode && metro?.median !== undefined) {
      pay.metroMedianPay = metro.median
      pay.metroName = `${metroFirstCity(metroCode, metro.areaTitle)} metro`
    }
    return pay
  }

  const pageRowsByField = new Map<string, ProgramRow[]>()
  for (const row of pageRows) addTo(pageRowsByField, poolKey(row.cipCode, row.credentialLevel), row)
  const graduateRowsByField = new Map<string, ProgramRow[]>()
  for (const row of graduatePageRows) addTo(graduateRowsByField, poolKey(row.cipCode, row.credentialLevel), row)
  // Each program with a page, by school, field and credential. A graduate page
  // finds its school's bachelor's program in the same field here.
  const pageRowByProgram = new Map(pageRows.map((row) => [poolKey(row.unitId!, row.cipCode, row.credentialLevel), row]))
  // And the other way: a bachelor's page finds its school's master's program in the field here.
  const graduatePageRowByProgram = new Map(graduatePageRows.map((row) => [poolKey(row.unitId!, row.cipCode, row.credentialLevel), row]))

  // Occupation pages: every occupation a careers section can list (the crosswalk
  // occupations of each field with program pages, and the matching jobs) that has
  // a national median pay. Careers sections link to these pages.
  const careerFieldKeysBySoc = new Map<string, string[]>()
  for (const key of pageRowsByField.keys()) {
    const cipCode = key.split('|')[0]
    const socCodes = new Set(occupationCodesFor(cipCode))
    if (MATCHING_OCCUPATIONS[cipCode]) socCodes.add(MATCHING_OCCUPATIONS[cipCode].socCode)
    for (const socCode of socCodes) {
      if (occupationWages.get(`US|${socCode}`)?.median === undefined) continue
      addTo(careerFieldKeysBySoc, socCode, key)
    }
  }
  const occupationName = (socCode: string) => OCCUPATION_NAMES[socCode] ?? occupationWages.get(`US|${socCode}`)!.title
  const careerSlugBySoc = new Map([...careerFieldKeysBySoc.keys()].map((socCode) => [socCode, slugify(occupationName(socCode))]))
  if (new Set(careerSlugBySoc.values()).size !== careerSlugBySoc.size) throw new Error('Two occupations share a URL')
  // A career page also lists the fields the crosswalk links to the job strongly,
  // although their own pages name only their largest jobs. That leaves no field
  // out that trains for the job: mathematicians are the smallest of the five
  // jobs linked to Mathematics. A career page also lists the graduate programs
  // whose own pages list the career, or that are strongly linked to it. A
  // graduate field adds no career page: a job that only graduate fields list
  // keeps having none.
  for (const key of pageRowsByField.keys()) {
    const cipCode = key.split('|')[0]
    for (const socCode of linkedOccupationCodes(cipCode)) {
      const listed = careerFieldKeysBySoc.get(socCode)
      if (listed && !listed.includes(key) && isStronglyLinked(cipCode, socCode)) listed.push(key)
    }
  }
  for (const key of graduateRowsByField.keys()) {
    const cipCode = key.split('|')[0]
    const ownJobs = new Set(occupationCodesFor(cipCode))
    for (const socCode of linkedOccupationCodes(cipCode)) {
      if (careerSlugBySoc.has(socCode) && (ownJobs.has(socCode) || isStronglyLinked(cipCode, socCode))) addTo(careerFieldKeysBySoc, socCode, key)
    }
  }
  function careerSlugFor(socCode: string) {
    const careerSlug = careerSlugBySoc.get(socCode)
    return careerSlug ? { careerSlug } : {}
  }

  // One ranking page per field, credential, and state that has program pages.
  const stateRankingHrefByKey = new Map<string, string>()
  for (const row of [...pageRows, ...graduatePageRows]) {
    const state = institutions.get(row.unitId!)!.state
    const key = poolKey(row.cipCode, row.credentialLevel, state)
    if (!stateRankingHrefByKey.has(key)) {
      stateRankingHrefByKey.set(key, `/states/${stateSlug(state)}/${programSlug(row)}`)
    }
  }

  // The school facts shown on program pages and school pages.
  function schoolFacts(institution: Institution): ProgramPage['school'] {
    return {
      unitId: institution.unitId,
      name: institution.name,
      shortName: schoolDisplayName(institution.unitId),
      city: institution.city,
      state: institution.state,
      stateName: STATES[institution.state].name,
      stateSlug: stateSlug(institution.state),
      control: institution.control,
      level: institution.level,
      inStateTuition: institution.inStateTuition,
      hasDistrictTuition: districtTuitionUnitIds.has(institution.unitId),
      outOfStateTuition: institution.outOfStateTuition,
      reportsByProgram: institution.reportsByProgram,
      programTuition: institution.programTuition,
      averageNetPrice: institution.averageNetPrice,
      admissionRate: institution.admissionRate,
      graduationRate: institution.graduationRate,
      undergraduates: institution.undergraduates,
    }
  }

  // The programs a school's own page lists: every program at the school that
  // reports first-year pay, master's programs included. A school has its own
  // page when this is at least 2.
  function schoolProgramTotal(unitId: string) {
    return ([1, 2, 3, 5] as CredentialLevel[]).reduce(
      (total, level) => total + (schoolPools.get(poolKey(unitId, level))?.length ?? 0),
      0,
    )
  }

  const undergraduatePageUnitIds = new Set(pageUnitIds)
  const pages: ProgramPage[] = []
  // Graduate pages are built like any program page. They are kept apart from
  // `pages`, which the other page types and the home page's counts are made from.
  const graduatePages: ProgramPage[] = []
  for (const row of [...pageRows, ...graduatePageRows]) {
    const institution = institutions.get(row.unitId!)!
    const earningsYear1 = row.earningsYear1!
    const debtMedian = row.debtMedian!
    const nationalKey = poolKey(row.cipCode, row.credentialLevel)
    const stateKey = poolKey(row.cipCode, row.credentialLevel, institution.state)
    const nationalPool = nationalPools.get(nationalKey)!
    const statePool = statePools.get(stateKey)!

    const nationalWithPay = nationalPool.filter((other) => other.earningsYear1 !== undefined)
    const nationalWithDebt = nationalPool.filter((other) => other.debtMedian !== undefined)
    const stateWithPay = statePool.filter((other) => other.earningsYear1 !== undefined)
    const stateWithBoth = statePool.filter(hasPayAndDebt)
    const ratio = debtMedian / earningsYear1
    const schoolPool = schoolPools.get(poolKey(row.unitId!, row.credentialLevel))!
    const schoolRanked = [...schoolPool].sort(
      (first, second) => second.earningsYear1! - first.earningsYear1! || first.cipCode.localeCompare(second.cipCode),
    )

    const stateComparison: ComparisonProgram[] = stateWithBoth.map((other) => {
      const otherInstitution = institutions.get(other.unitId!)!
      return {
        schoolName: schoolDisplayName(other.unitId!),
        city: otherInstitution.city,
        state: otherInstitution.state,
        earningsYear1: other.earningsYear1!,
        ...(other.earningsYear5 !== undefined ? { earningsYear5: other.earningsYear5 } : {}),
        medianDebt: other.debtMedian!,
        ...(other === row ? { isCurrent: true } : {}),
        ...(hrefByRow.has(other) ? { href: hrefByRow.get(other) } : {}),
      }
    })
    stateComparison.sort((first, second) => first.schoolName.localeCompare(second.schoolName))

    const studiedHere = graduatesIn(row, institution.state)
    const locationTrusted = hasTrustedLocation(institution.unitId, institution.state)
    const nearby: NearbyProgram[] = []
    // A graduate page lists graduate programs with pages, and any other page the
    // programs with pages at its own level.
    const nearbyCandidates = (isGraduateLevel(row.credentialLevel) ? graduateRowsByField : pageRowsByField).get(nationalKey)!
    for (const other of nearbyCandidates) {
      const otherInstitution = institutions.get(other.unitId!)!
      if (other !== row && !(locationTrusted && hasTrustedLocation(otherInstitution.unitId, otherInstitution.state))) continue
      const milesAway = milesBetween(
        institution.latitude,
        institution.longitude,
        otherInstitution.latitude,
        otherInstitution.longitude,
      )
      if (other !== row && milesAway > NEARBY_MILES) continue
      nearby.push({
        schoolName: schoolDisplayName(other.unitId!),
        city: otherInstitution.city,
        state: otherInstitution.state,
        control: otherInstitution.control,
        milesAway: other === row ? 0 : milesAway,
        earningsYear1: other.earningsYear1!,
        medianDebt: other.debtMedian!,
        ...(other === row ? { isCurrent: true } : { href: hrefByRow.get(other) }),
      })
    }
    nearby.sort(
      (first, second) =>
        Number(!!second.isCurrent) - Number(!!first.isCurrent) || first.milesAway - second.milesAway,
    )
    nearby.splice(NEARBY_LIMIT + 1)

    const repaymentRows: RepaymentRow[] = (Object.keys(REPAYMENT_COLUMNS) as RepaymentStatus[])
      .filter((status) => row.repaymentShares[status])
      .map((status) => ({ status, share: row.repaymentShares[status]! }))

    let priceLevels: PriceLevels | undefined
    const stateInfo = STATES[institution.state]
    const statePrice = priceParities.states.get(`${stateInfo.fips}000`)
    const metroCode = metroCodeByUnitId.get(institution.unitId)
    const metroPrice = metroCode ? priceParities.metros.get(metroCode) : undefined
    const nonmetroPrice = priceParities.statePortions.get(`${stateInfo.fips}999`)
    if (!locationTrusted) {
      // The state's price level depends only on the address.
      if (statePrice) priceLevels = { stateIndex: statePrice.index }
    } else if (statePrice && metroCode && metroPrice) {
      priceLevels = {
        area: { kind: 'metro', name: `${metroFirstCity(metroCode, metroPrice.name)} area`, index: metroPrice.index },
        stateIndex: statePrice.index,
      }
    } else if (statePrice && !metroCode && nonmetroPrice) {
      priceLevels = {
        area: { kind: 'nonmetro', name: stateInfo.name, index: nonmetroPrice.index },
        stateIndex: statePrice.index,
      }
    }

    const fieldName = FIELD_NAMES[row.cipCode]?.name ?? row.cipTitle
    const bachelorsRow = isGraduateLevel(row.credentialLevel) ? pageRowByProgram.get(poolKey(row.unitId!, row.cipCode, 3)) : undefined
    const mastersRow = row.credentialLevel === 3 ? graduatePageRowByProgram.get(poolKey(row.unitId!, row.cipCode, 5)) : undefined
    const page: ProgramPage = {
      schoolSlug: schoolSlugByUnitId.get(row.unitId!)!,
      programSlug: programSlug(row),
      school: schoolFacts(institution),
      program: {
        cipCode: row.cipCode,
        credentialLevel: row.credentialLevel,
        name: fieldName,
        sentenceName: FIELD_NAMES[row.cipCode] ? fieldSentenceName(row.cipCode) : fieldName,
        fullTitle: row.cipTitle,
        credential: CREDENTIALS[row.credentialLevel].label,
        degreeAbbreviation: DEGREE_ABBREVIATIONS[row.cipCode]?.[row.credentialLevel],
        graduatesPerYear: row.awardsLaterYear ? row.awardsLaterYear : undefined,
        online: row.online,
      },
      earnings: {
        year1: earningsYear1,
        year5: row.earningsYear5,
        pellYear1: row.pellEarningsYear1,
        otherYear1: row.otherEarningsYear1,
        workingCount: row.workingCount,
        workingInStateCount: row.workingInStateCount,
      },
      debt: {
        median: debtMedian,
        borrowers: row.debtBorrowers,
        monthlyPayment: row.monthlyPayment,
        pellMedian: row.pellDebtMedian,
        otherMedian: row.otherDebtMedian,
        parentPlusBorrowers: row.parentPlusBorrowers,
        parentPlusMedian: row.parentPlusMedian,
      },
      repayment:
        row.repaymentBorrowers && repaymentRows.length > 0
          ? { borrowers: row.repaymentBorrowers, rows: repaymentRows }
          : undefined,
      ranks: {
        nationalEarningsPercentile: Math.round(
          (100 * countWhere(nationalWithPay, (other) => other.earningsYear1! < earningsYear1)) /
            nationalWithPay.length,
        ),
        debtLowerThanShare:
          countWhere(nationalWithDebt, (other) => other.debtMedian! > debtMedian) / nationalWithDebt.length,
        debtHigherThanShare:
          countWhere(nationalWithDebt, (other) => other.debtMedian! < debtMedian) / nationalWithDebt.length,
        stateEarningsRank: 1 + countWhere(stateWithPay, (other) => other.earningsYear1! > earningsYear1),
        stateDebtRank: 1 + countWhere(stateWithBoth, (other) => other.debtMedian! < debtMedian),
        stateDebtToEarningsRank:
          1 + countWhere(stateWithBoth, (other) => other.debtMedian! / other.earningsYear1! < ratio),
        stateProgramsWithBoth: stateWithBoth.length,
        schoolEarningsRank: 1 + countWhere(schoolPool, (other) => other.earningsYear1! > earningsYear1),
        schoolProgramCount: schoolPool.length,
      },
      benchmarks: {
        state: cachedBenchmark(statePools, stateKey),
        national: cachedBenchmark(nationalPools, nationalKey),
      },
      // A graduate page shows no list of the school's top programs.
      topSchoolPrograms: isGraduateLevel(row.credentialLevel)
        ? []
        : schoolRanked.slice(0, 3).map((topRow) => ({
            name: FIELD_NAMES[topRow.cipCode]?.name ?? missingName(topRow),
            earningsYear1: topRow.earningsYear1!,
            ...(hrefByRow.has(topRow) ? { href: hrefByRow.get(topRow) } : {}),
          })),
      priceLevels,
      occupations: occupationsFor(row.cipCode, stateInfo.fips),
      // The matching job of a field is the job its bachelor's degree trains for
      // (registered nurses for nursing). A master's degree leads elsewhere. A
      // graduate page makes no such comparison.
      matchingOccupation: isGraduateLevel(row.credentialLevel)
        ? undefined
        : matchingOccupationFor(row.cipCode, stateInfo.fips, locationTrusted ? metroCode : undefined),
      stateRankingHref: stateRankingHrefByKey.get(stateKey),
      ...(bachelorsRow
        ? { bachelorsProgram: { href: hrefByRow.get(bachelorsRow)!, degree: DEGREE_ABBREVIATIONS[row.cipCode]?.[3] ?? CREDENTIALS[3].label } }
        : {}),
      ...(mastersRow
        ? { mastersProgram: { href: hrefByRow.get(mastersRow)!, degree: DEGREE_ABBREVIATIONS[row.cipCode]?.[5] ?? CREDENTIALS[5].label } }
        : {}),
      // A school has its own page only when it has an undergraduate program
      // page. A school with graduate pages alone has none, whatever it reports.
      schoolProgramTotal: undergraduatePageUnitIds.has(row.unitId!) ? schoolProgramTotal(row.unitId!) : 0,
      ...(studiedHere.stateCount > 1 ? { inStateGraduateShare: studiedHere.inState / studiedHere.total } : {}),
      stateComparison,
      nearby,
    }
    const builtPages = isGraduateLevel(row.credentialLevel) ? graduatePages : pages
    builtPages.push(page)
  }

  function missingName(row: ProgramRow) {
    missingFieldNames.add(`${row.cipCode} ${row.cipTitle}`)
    return row.cipTitle
  }
  if (missingFieldNames.size > 0) {
    throw new Error(`Add these CIP codes to scripts/reference/field-names.ts:\n${[...missingFieldNames].sort().join('\n')}`)
  }

  const stateProgramPages = buildStateProgramPages()

  function buildStateProgramPages() {
    const result: StateProgramPage[] = []
    for (const [key, href] of stateRankingHrefByKey) {
      const pool = statePools.get(key)!
      const [cipCode, credentialText, stateCode] = key.split('|')
      const credentialLevel = Number(credentialText) as CredentialLevel
      const stateInfo = STATES[stateCode]
      const withPay = pool.filter((row) => row.earningsYear1 !== undefined)
      const withBoth = pool.filter(hasPayAndDebt)
      const ratio = (row: ProgramRow) => row.debtMedian! / row.earningsYear1!
      const programs: RankedProgram[] = withPay.map((row) => {
        const institution = institutions.get(row.unitId!)!
        const reportsDebt = row.debtMedian !== undefined
        return {
          schoolName: schoolDisplayName(row.unitId!),
          city: institution.city,
          control: institution.control,
          isOpen: institution.isOperating,
          earningsYear1: row.earningsYear1!,
          earningsYear5: row.earningsYear5,
          medianDebt: row.debtMedian,
          ...(hrefByRow.has(row) ? { href: hrefByRow.get(row) } : {}),
          payRank: 1 + countWhere(withPay, (other) => other.earningsYear1! > row.earningsYear1!),
          ...(reportsDebt
            ? {
                debtRank: 1 + countWhere(withBoth, (other) => other.debtMedian! < row.debtMedian!),
                ratioRank: 1 + countWhere(withBoth, (other) => ratio(other) < ratio(row)),
              }
            : {}),
        }
      })
      programs.sort(
        (first, second) => second.earningsYear1 - first.earningsYear1 || first.schoolName.localeCompare(second.schoolName),
      )
      const matching = isGraduateLevel(credentialLevel) ? undefined : MATCHING_OCCUPATIONS[cipCode]
      const matchingOutlook = matching ? outlookFor(matching.socCode, stateInfo.fips) : undefined
      const otherCredentials = ([5, 3, 2, 1] as CredentialLevel[])
        .filter((level) => level !== credentialLevel)
        .flatMap((level) => {
          const otherHref = stateRankingHrefByKey.get(poolKey(cipCode, level, stateCode))
          if (!otherHref) return []
          const degree = DEGREE_ABBREVIATIONS[cipCode]?.[level] ?? CREDENTIALS[level].label
          const programCount = countWhere(statePools.get(poolKey(cipCode, level, stateCode))!, (row) => row.earningsYear1 !== undefined)
          return [{ href: otherHref, title: `${FIELD_NAMES[cipCode].name} (${degree}) programs in ${placeInSentence(stateInfo.name)}, ranked`, programCount }]
        })
      const [, , stateSlug, slug] = href.split('/')
      result.push({
        stateSlug,
        programSlug: slug,
        state: { code: stateCode, name: stateInfo.name },
        program: {
          cipCode,
          credentialLevel,
          name: FIELD_NAMES[cipCode].name,
          sentenceName: fieldSentenceName(cipCode),
          fullTitle: withPay[0]?.cipTitle ?? pool[0].cipTitle,
          credential: CREDENTIALS[credentialLevel].label,
          degreeAbbreviation: DEGREE_ABBREVIATIONS[cipCode]?.[credentialLevel],
        },
        benchmarks: {
          state: cachedBenchmark(statePools, key),
          national: cachedBenchmark(nationalPools, poolKey(cipCode, credentialLevel)),
        },
        programs,
        debtOnlyCount: countWhere(pool, (row) => row.debtMedian !== undefined && row.earningsYear1 === undefined),
        studiedElsewhereCount: studiedElsewhereByStatePool.get(key) ?? 0,
        ...(matching && matchingOutlook?.stateMedianPay !== undefined
          ? { matchingJob: { ...matchingOutlook, pluralName: matching.pluralName } }
          : {}),
        occupations: occupationsFor(cipCode, stateInfo.fips),
        otherCredentials,
      })
    }
    return result
  }

  const schoolPages = buildSchoolPages()

  // One page per school with program pages and at least two programs that report
  // first-year pay, listing every one of them.
  function buildSchoolPages() {
    const result: SchoolPage[] = []
    for (const unitId of pageUnitIds) {
      if (!hasSchoolPage(schoolProgramTotal(unitId))) continue
      const institution = institutions.get(unitId)!
      const levels: SchoolLevel[] = []
      for (const credentialLevel of [5, 3, 2, 1] as CredentialLevel[]) {
        const pool = schoolPools.get(poolKey(unitId, credentialLevel))
        if (!pool) continue
        const graduates = (row: ProgramRow) => (row.awardsLaterYear ? row.awardsLaterYear : undefined)
        const programs: SchoolProgram[] = pool.map((row) => {
          const stateKey = poolKey(row.cipCode, credentialLevel, institution.state)
          const stateWithPay = statePools.get(stateKey)!.filter((other) => other.earningsYear1 !== undefined)
          const rowGraduates = graduates(row)
          return {
            cipCode: row.cipCode,
            name: FIELD_NAMES[row.cipCode]?.name ?? missingName(row),
            earningsYear1: row.earningsYear1!,
            earningsYear5: row.earningsYear5,
            medianDebt: row.debtMedian,
            graduatesPerYear: rowGraduates,
            ...(hrefByRow.has(row) ? { href: hrefByRow.get(row) } : {}),
            payRank: 1 + countWhere(pool, (other) => other.earningsYear1! > row.earningsYear1!),
            ...(row.debtMedian !== undefined
              ? { debtRank: 1 + countWhere(pool, (other) => other.debtMedian !== undefined && other.debtMedian < row.debtMedian!) }
              : {}),
            ...(rowGraduates !== undefined
              ? { graduatesRank: 1 + countWhere(pool, (other) => (graduates(other) ?? 0) > rowGraduates) }
              : {}),
            stateRank: 1 + countWhere(stateWithPay, (other) => other.earningsYear1! > row.earningsYear1!),
            stateProgramCount: stateWithPay.length,
            ...(stateRankingHrefByKey.has(stateKey) ? { stateRankingHref: stateRankingHrefByKey.get(stateKey) } : {}),
          }
        })
        programs.sort((first, second) => second.earningsYear1 - first.earningsYear1 || first.name.localeCompare(second.name))
        levels.push({
          credentialLevel,
          credential: CREDENTIALS[credentialLevel].label,
          programs,
          debtOnlyCount: debtOnlyCountBySchool.get(poolKey(unitId, credentialLevel)) ?? 0,
        })
      }
      result.push({
        schoolSlug: schoolSlugByUnitId.get(unitId)!,
        school: schoolFacts(institution),
        levels,
        studiedElsewhereCount: studiedElsewhereBySchool.get(unitId) ?? 0,
      })
    }
    return result
  }
  if (missingFieldNames.size > 0) {
    throw new Error(`Add these CIP codes to scripts/reference/field-names.ts:\n${[...missingFieldNames].sort().join('\n')}`)
  }

  const statePages = buildStatePages()

  // One page per state with program pages: medians by credential, the state's
  // field rankings, and its schools with program pages.
  function buildStatePages() {
    // State pages cover the undergraduate levels. Graduate pools are passed over.
    const nationalRowsByLevel = new Map<CredentialLevel, ProgramRow[]>([[1, []], [2, []], [3, []]])
    for (const [key, pool] of nationalPools) {
      nationalRowsByLevel.get(Number(key.split('|')[1]) as CredentialLevel)?.push(...pool)
    }
    const pageRowsByUnitId = new Map<string, ProgramRow[]>()
    for (const row of pageRows) addTo(pageRowsByUnitId, row.unitId!, row)

    const result: StatePage[] = []
    for (const stateCode of new Set(pageRows.map((row) => institutions.get(row.unitId!)!.state))) {
      const stateInfo = STATES[stateCode]
      const rowsByLevel = new Map<CredentialLevel, ProgramRow[]>([[1, []], [2, []], [3, []]])
      for (const [key, pool] of statePools) {
        const [, levelText, poolState] = key.split('|')
        if (poolState === stateCode) rowsByLevel.get(Number(levelText) as CredentialLevel)?.push(...pool)
      }
      const levels = ([3, 2, 1] as CredentialLevel[]).filter((level) =>
        rowsByLevel.get(level)!.some((row) => row.earningsYear1 !== undefined),
      )
      if (!levels.includes(3)) throw new Error(`${stateCode} has no bachelor's programs that report pay`)
      const credentials = levels.map((level) => ({
        credentialLevel: level,
        credential: CREDENTIALS[level].label,
        state: computeBenchmark(rowsByLevel.get(level)!),
        national: computeBenchmark(nationalRowsByLevel.get(level)!),
      }))

      const fieldLevels: StateFieldLevel[] = []
      for (const level of [5, 3, 2, 1] as CredentialLevel[]) {
        const rankings = stateProgramPages.filter(
          (page) => page.state.code === stateCode && page.program.credentialLevel === level,
        )
        if (rankings.length === 0) continue
        const fields: StateField[] = rankings.map((page) => {
          const pay = page.benchmarks.state.earningsYear1
          const debt = page.benchmarks.state.medianDebt
          return {
            cipCode: page.program.cipCode,
            name: page.program.name,
            sentenceName: page.program.sentenceName,
            degreeAbbreviation: page.program.degreeAbbreviation,
            href: `/states/${page.stateSlug}/${page.programSlug}`,
            programCount: page.programs.length,
            earningsYear1: pay,
            medianDebt: debt,
            payRank: 1 + countWhere(rankings, (other) => other.benchmarks.state.earningsYear1 > pay),
            debtRank: 1 + countWhere(rankings, (other) => other.benchmarks.state.medianDebt < debt),
            programCountRank: 1 + countWhere(rankings, (other) => other.programs.length > page.programs.length),
          }
        })
        fields.sort((first, second) => second.earningsYear1 - first.earningsYear1 || first.name.localeCompare(second.name))
        fieldLevels.push({ credentialLevel: level, credential: CREDENTIALS[level].label, fields })
      }

      const schools: StateSchool[] = pageUnitIds
        .filter((unitId) => institutions.get(unitId)!.state === stateCode)
        .map((unitId) => {
          const institution = institutions.get(unitId)!
          const programCount = schoolProgramTotal(unitId)
          const base = { unitId, name: schoolDisplayName(unitId), city: institution.city, control: institution.control, programCount }
          if (hasSchoolPage(programCount)) return { ...base, href: `/schools/${schoolSlugByUnitId.get(unitId)}` }
          // One program that reports pay, and it has a page.
          const [onlyRow] = pageRowsByUnitId.get(unitId)!
          const degree = DEGREE_ABBREVIATIONS[onlyRow.cipCode]?.[onlyRow.credentialLevel] ?? CREDENTIALS[onlyRow.credentialLevel].label
          return { ...base, href: hrefByRow.get(onlyRow)!, programName: `${FIELD_NAMES[onlyRow.cipCode].name} (${degree})` }
        })
        .sort((first, second) => first.name.localeCompare(second.name))

      const allRows = levels.flatMap((level) => rowsByLevel.get(level)!)
      result.push({
        stateSlug: stateSlug(stateCode),
        state: { code: stateCode, name: stateInfo.name },
        credentials,
        fieldLevels,
        schools,
        programCount: countWhere(allRows, (row) => row.earningsYear1 !== undefined),
        schoolsWithPayCount: new Set(allRows.filter((row) => row.earningsYear1 !== undefined).map((row) => row.unitId)).size,
        priceIndex: priceParities.states.get(`${stateInfo.fips}000`)?.index,
      })
    }
    return result
  }

  const nationalProgramPages = buildNationalProgramPages()

  // One page per field and credential with program pages: every state's ranking,
  // national quick picks, and national job pay.
  function buildNationalProgramPages() {
    const nationalHref = (cipCode: string, level: CredentialLevel) => `/programs/${slugify(FIELD_NAMES[cipCode].name)}-${CREDENTIALS[level].slug}`
    const result: NationalProgramPage[] = []
    for (const [key, fieldPageRows] of [...pageRowsByField, ...graduateRowsByField]) {
      const [cipCode, levelText] = key.split('|')
      const credentialLevel = Number(levelText) as CredentialLevel
      const nationalPool = nationalPools.get(key)!
      const rankings = stateProgramPages.filter(
        (page) => page.program.cipCode === cipCode && page.program.credentialLevel === credentialLevel,
      )
      const states: NationalStateRow[] = rankings.map((page) => {
        const pay = page.benchmarks.state.earningsYear1
        const debt = page.benchmarks.state.medianDebt
        return {
          stateCode: page.state.code,
          stateName: page.state.name,
          href: `/states/${page.stateSlug}/${page.programSlug}`,
          programCount: page.programs.length,
          earningsYear1: pay,
          medianDebt: debt,
          payRank: 1 + countWhere(rankings, (other) => other.benchmarks.state.earningsYear1 > pay),
          debtRank: 1 + countWhere(rankings, (other) => other.benchmarks.state.medianDebt < debt),
          programCountRank: 1 + countWhere(rankings, (other) => other.programs.length > page.programs.length),
        }
      })
      states.sort((first, second) => second.earningsYear1 - first.earningsYear1 || first.stateName.localeCompare(second.stateName))

      // Places whose programs report pay but have no ranking page. The page says
      // that is because too few programs report both pay and debt, so check it.
      let unrankedPlaceCount = 0
      for (const [stateKey, pool] of statePools) {
        const [poolCip, poolLevel, poolState] = stateKey.split('|')
        if (poolCip !== cipCode || Number(poolLevel) !== credentialLevel || stateRankingHrefByKey.has(stateKey)) continue
        if (!pool.some((row) => row.earningsYear1 !== undefined)) continue
        if (countWhere(pool, hasPayAndDebt) >= MINIMUM_STATE_PROGRAMS) {
          throw new Error(`${stateKey} has enough programs for a ranking but no ranking page`)
        }
        unrankedPlaceCount += 1
      }

      // Every program of the field and credential that reports first-year pay and
      // whose school is in a state pool, ranked like the state tables. The rest
      // of the national pool can't be named: Scorecard's institution file has no
      // school for them, or the school's main campus is in another state.
      const listed = [...statePools]
        .filter(([stateKey]) => stateKey.startsWith(`${key}|`))
        .flatMap(([, pool]) => pool.filter((row) => row.earningsYear1 !== undefined))
      const withPayCount = countWhere(nationalPool, (row) => row.earningsYear1 !== undefined)
      const withoutSchoolCount = countWhere(
        nationalPool,
        (row) => row.earningsYear1 !== undefined && (!row.unitId || !institutions.has(row.unitId)),
      )
      // Pay after prices uses the school's state price level, and only where at
      // least half of the graduates who work are working in the school's state.
      const priced = listed.map((row) => {
        const institution = institutions.get(row.unitId!)!
        const stateInfo = STATES[institution.state]
        const priceIndex = stateInfo ? priceParities.states.get(`${stateInfo.fips}000`)?.index : undefined
        const mostStay =
          row.workingCount !== undefined && row.workingCount > 0 && row.workingInStateCount !== undefined && row.workingInStateCount * 2 >= row.workingCount
        return { row, institution, priceIndex: mostStay ? priceIndex : undefined }
      })
      const listedWithBoth = listed.filter(hasPayAndDebt)
      const debtRatio = (row: ProgramRow) => row.debtMedian! / row.earningsYear1!
      const ranking: NationalRankedProgram[] = priced.map(({ row, institution, priceIndex }) => {
        const thousandths = priceIndex !== undefined ? Math.round(priceIndex * 1000) : undefined
        return {
          unitId: row.unitId!,
          schoolName: schoolDisplayName(row.unitId!),
          city: institution.city,
          stateCode: institution.state,
          stateName: STATES[institution.state]?.name ?? institution.state,
          control: institution.control,
          isOpen: institution.isOperating,
          earningsYear1: row.earningsYear1!,
          earningsYear5: row.earningsYear5,
          medianDebt: row.debtMedian,
          ...(priceIndex !== undefined ? { earningsYear1AfterPrices: payAfterPrices(row.earningsYear1!, priceIndex) } : {}),
          ...(hrefByRow.has(row) ? { href: hrefByRow.get(row) } : {}),
          payRank: 1 + countWhere(listed, (other) => other.earningsYear1! > row.earningsYear1!),
          // Pay after prices is compared exactly: a / ta > b / tb when a * tb > b * ta.
          ...(thousandths !== undefined
            ? {
                afterPricesRank:
                  1 +
                  countWhere(priced, (other) => {
                    if (other.priceIndex === undefined) return false
                    return other.row.earningsYear1! * thousandths > row.earningsYear1! * Math.round(other.priceIndex * 1000)
                  }),
              }
            : {}),
          ...(row.debtMedian !== undefined
            ? {
                debtRank: 1 + countWhere(listedWithBoth, (other) => other.debtMedian! < row.debtMedian!),
                ratioRank: 1 + countWhere(listedWithBoth, (other) => debtRatio(other) < debtRatio(row)),
              }
            : {}),
        }
      })
      ranking.sort((first, second) => first.payRank - second.payRank || first.schoolName.localeCompare(second.schoolName))

      const picksFrom = fieldPageRows.map((row): NationalPick => {
        const institution = institutions.get(row.unitId!)!
        return {
          schoolName: schoolDisplayName(row.unitId!),
          stateCode: institution.state,
          stateName: STATES[institution.state].name,
          href: hrefByRow.get(row)!,
          earningsYear1: row.earningsYear1!,
          medianDebt: row.debtMedian!,
        }
      })
      const byName = (first: NationalPick, second: NationalPick) => first.schoolName.localeCompare(second.schoolName)
      const picks = {
        byDebt: [...picksFrom]
          .sort((first, second) => first.medianDebt - second.medianDebt || second.earningsYear1 - first.earningsYear1 || byName(first, second))
          .slice(0, NATIONAL_PICK_COUNT),
        byDebtForPay: [...picksFrom]
          .sort(
            (first, second) =>
              first.medianDebt / first.earningsYear1 - second.medianDebt / second.earningsYear1 ||
              second.earningsYear1 - first.earningsYear1 ||
              byName(first, second),
          )
          .slice(0, NATIONAL_PICK_COUNT),
      }

      const matching = isGraduateLevel(credentialLevel) ? undefined : MATCHING_OCCUPATIONS[cipCode]
      const matchingOutlook = matching ? nationalOutlookFor(matching.socCode) : undefined
      const otherCredentials = ([5, 3, 2, 1] as CredentialLevel[])
        .filter((level) => level !== credentialLevel && (pageRowsByField.has(poolKey(cipCode, level)) || graduateRowsByField.has(poolKey(cipCode, level))))
        .map((level) => {
          const degree = DEGREE_ABBREVIATIONS[cipCode]?.[level] ?? CREDENTIALS[level].label
          return {
            href: nationalHref(cipCode, level),
            title: `${FIELD_NAMES[cipCode].name} (${degree}) programs in the US, ranked`,
            programCount: cachedBenchmark(nationalPools, poolKey(cipCode, level)).earningsYear1Count,
          }
        })
      const withPay = nationalPool.filter((row) => row.earningsYear1 !== undefined)
      result.push({
        programSlug: nationalHref(cipCode, credentialLevel).split('/')[2],
        program: {
          cipCode,
          credentialLevel,
          name: FIELD_NAMES[cipCode].name,
          sentenceName: fieldSentenceName(cipCode),
          fullTitle: withPay[0].cipTitle,
          credential: CREDENTIALS[credentialLevel].label,
          degreeAbbreviation: DEGREE_ABBREVIATIONS[cipCode]?.[credentialLevel],
        },
        national: cachedBenchmark(nationalPools, key),
        states,
        unrankedPlaceCount,
        programPageCount: fieldPageRows.length,
        ranking,
        unlistedCount: withPayCount - ranking.length,
        withoutSchoolCount,
        picks,
        ...(matching && matchingOutlook?.stateMedianPay !== undefined ? { matchingJob: { ...matchingOutlook, pluralName: matching.pluralName } } : {}),
        occupations: occupationCodesFor(cipCode).map((socCode) => nationalOutlookFor(socCode)!),
        otherCredentials,
      })
    }
    return result
  }

  const occupationPages = buildOccupationPages()

  // One page per occupation that careers sections list: pay in every state and
  // the national program pages whose fields lead there.
  function buildOccupationPages() {
    const statePageCodes = new Set(statePages.map((page) => page.state.code))
    const nationalPageByKey = new Map(nationalProgramPages.map((page) => [poolKey(page.program.cipCode, page.program.credentialLevel), page]))
    const result: OccupationPage[] = []
    for (const [socCode, careerSlug] of careerSlugBySoc) {
      const national = occupationWages.get(`US|${socCode}`)!
      const projection = projections.get(socCode)
      const priced: { row: Omit<OccupationStateRow, 'payRank'>; thousandths?: number }[] = []
      const statesWithoutPay: string[] = []
      for (const [stateCode, info] of Object.entries(STATES)) {
        const wage = occupationWages.get(`S${info.fips}|${socCode}`)
        if (wage?.median === undefined) {
          statesWithoutPay.push(info.name)
          continue
        }
        const price = priceParities.states.get(`${info.fips}000`)
        priced.push({
          row: {
            stateCode,
            stateName: info.name,
            ...(statePageCodes.has(stateCode) ? { stateSlug: stateSlug(stateCode) } : {}),
            medianPay: wage.median,
            ...(price ? { adjustedPay: payAfterPrices(wage.median, price.index) } : {}),
            employment: wage.employment,
            p10Pay: wage.p10,
            p90Pay: wage.p90,
          },
          thousandths: price ? Math.round(price.index * 1000) : undefined,
        })
      }
      // Pay after prices is compared exactly: a / ta > b / tb when a * tb > b * ta.
      const states: OccupationStateRow[] = priced.map(({ row, thousandths }) => ({
        ...row,
        payRank: 1 + countWhere(priced, (other) => other.row.medianPay > row.medianPay),
        ...(thousandths !== undefined
          ? {
              adjustedRank:
                1 +
                countWhere(
                  priced,
                  (other) => other.thousandths !== undefined && other.row.medianPay * thousandths > row.medianPay * other.thousandths,
                ),
            }
          : {}),
        ...(row.employment !== undefined
          ? { employmentRank: 1 + countWhere(priced, (other) => (other.row.employment ?? -1) > row.employment!) }
          : {}),
      }))
      states.sort((first, second) => second.medianPay - first.medianPay || first.stateName.localeCompare(second.stateName))

      const programs: OccupationProgram[] = careerFieldKeysBySoc.get(socCode)!.map((key) => {
        const page = nationalPageByKey.get(key)!
        return {
          href: `/programs/${page.programSlug}`,
          label: `${page.program.name} (${page.program.degreeAbbreviation ?? page.program.credential})`,
          credentialLevel: page.program.credentialLevel,
          programCount: page.national.earningsYear1Count,
          earningsYear1: page.national.earningsYear1,
          medianDebt: page.national.medianDebt,
        }
      })
      programs.sort((first, second) => second.earningsYear1 - first.earningsYear1 || first.label.localeCompare(second.label))

      const name = occupationName(socCode)
      result.push({
        careerSlug,
        socCode,
        title: national.title,
        name,
        sentenceName: lowercaseWords(name),
        national: {
          medianPay: national.median!,
          employment: national.employment,
          allJobs: projection?.employment,
          p10Pay: national.p10,
          p90Pay: national.p90,
          ...(national.yearlyPayOnly ? { yearlyPayOnly: true as const } : {}),
        },
        growthShare: projection?.growthShare,
        openingsPerYear: projection?.openingsPerYear,
        typicalEducation: projection?.typicalEducation,
        workExperience: projection?.workExperience,
        states,
        statesWithoutPay,
        programs,
      })
    }
    return result
  }

  const sitePages = buildSitePages()

  // The home page and the navbar's list pages, built from the other records so
  // their figures match the pages they link to.
  function buildSitePages() {
    const listedProgram = (page: NationalProgramPage): ListedProgram => ({
      href: `/programs/${page.programSlug}`,
      label: `${page.program.name} (${page.program.degreeAbbreviation ?? page.program.credential})`,
      cipCode: page.program.cipCode,
      credentialLevel: page.program.credentialLevel,
      programCount: page.national.earningsYear1Count,
      earningsYear1: page.national.earningsYear1,
      medianDebt: page.national.medianDebt,
    })
    const listedCareer = (page: OccupationPage): ListedCareer => ({
      href: `/careers/${page.careerSlug}`,
      name: page.name,
      socCode: page.socCode,
      medianPay: page.national.medianPay,
      // Everyone in the job, as on the career's own page.
      employment: page.national.allJobs ?? page.national.employment,
      growthShare: page.growthShare,
    })
    const listedNationalPages = nationalProgramPages
    const byProgramCount = [...listedNationalPages].sort(
      (first, second) => second.national.earningsYear1Count - first.national.earningsYear1Count || first.programSlug.localeCompare(second.programSlug),
    )
    const byPay = (first: NationalProgramPage, second: NationalProgramPage) =>
      second.national.earningsYear1 - first.national.earningsYear1 || first.programSlug.localeCompare(second.programSlug)
    const byJobs = [...occupationPages].sort(
      (first, second) =>
        (second.national.allJobs ?? second.national.employment ?? -1) - (first.national.allJobs ?? first.national.employment ?? -1) ||
        first.careerSlug.localeCompare(second.careerSlug),
    )
    const statesByName = [...statePages].sort((first, second) => first.state.name.localeCompare(second.state.name))

    const home: HomePage = {
      counts: {
        programPages: pages.length + graduatePages.length,
        schools: pageUnitIds.length,
        schoolPages: schoolPages.length,
        stateRankings: countWhere(stateProgramPages, (page) => !isGraduateLevel(page.program.credentialLevel)),
        nationalPrograms: listedNationalPages.length,
        careers: occupationPages.length,
      },
      states: statesByName.map((page) => ({ name: page.state.name, href: `/states/${page.stateSlug}` })),
      commonPrograms: byProgramCount.slice(0, HOME_LIST_COUNT).map(listedProgram),
      topPayingBachelors: nationalProgramPages
        .filter((page) => page.program.credentialLevel === 3)
        .sort(byPay)
        .slice(0, HOME_LIST_COUNT)
        .map(listedProgram),
      largestCareers: byJobs.slice(0, HOME_LIST_COUNT).map(listedCareer),
    }

    const programsList: ProgramsListPage = {
      levels: ([5, 3, 2, 1] as CredentialLevel[]).map((level) => {
        const listed = nationalProgramPages.filter((page) => page.program.credentialLevel === level).sort(byPay).map(listedProgram)
        return {
          credentialLevel: level,
          credential: CREDENTIALS[level].label,
          programs: listed.map((program) => ({
            ...program,
            payRank: 1 + countWhere(listed, (other) => other.earningsYear1 > program.earningsYear1),
            debtRank: 1 + countWhere(listed, (other) => other.medianDebt < program.medianDebt),
            programCountRank: 1 + countWhere(listed, (other) => other.programCount > program.programCount),
          })),
        }
      }),
    }

    const schoolsList: SchoolsListPage = {
      states: statesByName.map((page) => ({
        name: page.state.name,
        href: `/states/${page.stateSlug}`,
        schools: page.schools.map((school) => {
          const officialName = institutions.get(school.unitId)!.name
          return {
            unitId: school.unitId,
            name: school.name,
            ...(officialName !== school.name ? { officialName } : {}),
            href: school.href,
            programCount: school.programCount,
          }
        }),
      })),
    }

    const careers = [...occupationPages]
      .sort((first, second) => second.national.medianPay - first.national.medianPay || first.careerSlug.localeCompare(second.careerSlug))
      .map(listedCareer)
    const careersList: CareersListPage = {
      careers: careers.map((career) => ({
        ...career,
        payRank: 1 + countWhere(careers, (other) => other.medianPay > career.medianPay),
        ...(career.employment !== undefined
          ? { employmentRank: 1 + countWhere(careers, (other) => (other.employment ?? -1) > career.employment!) }
          : {}),
        ...(career.growthShare !== undefined
          ? { growthRank: 1 + countWhere(careers, (other) => other.growthShare !== undefined && other.growthShare > career.growthShare!) }
          : {}),
      })),
    }
    return { home, programs: programsList, schools: schoolsList, careers: careersList }
  }

  const indexEntry = (page: ProgramPage): ProgramIndexEntry => ({
    schoolSlug: page.schoolSlug,
    programSlug: page.programSlug,
    unitId: page.school.unitId,
    cipCode: page.program.cipCode,
    credentialLevel: page.program.credentialLevel,
    state: page.school.state,
    graduatesPerYear: page.program.graduatesPerYear ?? 0,
    isComplete: isComplete(page),
  })
  // Build order: pages with every section filled first, bachelor's first, then
  // by graduate count, largest first.
  const inBuildOrder = (first: ProgramIndexEntry, second: ProgramIndexEntry) =>
    Number(second.isComplete) - Number(first.isComplete) ||
    second.credentialLevel - first.credentialLevel ||
    second.graduatesPerYear - first.graduatesPerYear ||
    `${first.schoolSlug}/${first.programSlug}`.localeCompare(`${second.schoolSlug}/${second.programSlug}`)
  // Graduate pages come after all the others, in the same order among
  // themselves. This way every page listed before them keeps its place.
  const index = [...pages.map(indexEntry).sort(inBuildOrder), ...graduatePages.map(indexEntry).sort(inBuildOrder)]

  await rm(path.join(OUTPUT_DIRECTORY, 'programs'), { recursive: true, force: true })
  for (const page of [...pages, ...graduatePages]) {
    const directory = path.join(OUTPUT_DIRECTORY, 'programs', page.schoolSlug)
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, `${page.programSlug}.json`), JSON.stringify(page))
  }
  await writeFile(path.join(OUTPUT_DIRECTORY, 'program-index.json'), JSON.stringify(index, null, 1))

  await rm(path.join(OUTPUT_DIRECTORY, 'state-programs'), { recursive: true, force: true })
  for (const page of stateProgramPages) {
    const directory = path.join(OUTPUT_DIRECTORY, 'state-programs', page.stateSlug)
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, `${page.programSlug}.json`), JSON.stringify(page))
  }
  // Build order for ranking pages: most programs first, then by URL. Graduate
  // pages come after all the others, in the same order among themselves, so
  // that every page listed before them keeps its place.
  const stateProgramEntries = (graduate: boolean): StateProgramIndexEntry[] =>
    stateProgramPages
      .filter((page) => isGraduateLevel(page.program.credentialLevel) === graduate)
      .map((page) => ({
        stateSlug: page.stateSlug,
        programSlug: page.programSlug,
        cipCode: page.program.cipCode,
        credentialLevel: page.program.credentialLevel,
        state: page.state.code,
        programCount: page.programs.length,
      }))
      .sort(
        (first, second) =>
          second.programCount - first.programCount ||
          `${first.stateSlug}/${first.programSlug}`.localeCompare(`${second.stateSlug}/${second.programSlug}`),
      )
  const stateProgramIndex = [...stateProgramEntries(false), ...stateProgramEntries(true)]
  await writeFile(path.join(OUTPUT_DIRECTORY, 'state-program-index.json'), JSON.stringify(stateProgramIndex, null, 1))

  await rm(path.join(OUTPUT_DIRECTORY, 'school-pages'), { recursive: true, force: true })
  await mkdir(path.join(OUTPUT_DIRECTORY, 'school-pages'), { recursive: true })
  for (const page of schoolPages) {
    await writeFile(path.join(OUTPUT_DIRECTORY, 'school-pages', `${page.schoolSlug}.json`), JSON.stringify(page))
  }
  // Build order for school pages: most programs first, then by URL.
  const schoolIndex: SchoolIndexEntry[] = schoolPages
    .map((page) => ({
      schoolSlug: page.schoolSlug,
      unitId: page.school.unitId,
      state: page.school.state,
      programCount: page.levels.reduce((total, level) => total + level.programs.length, 0),
    }))
    .sort((first, second) => second.programCount - first.programCount || first.schoolSlug.localeCompare(second.schoolSlug))
  await writeFile(path.join(OUTPUT_DIRECTORY, 'school-index.json'), JSON.stringify(schoolIndex, null, 1))

  await rm(path.join(OUTPUT_DIRECTORY, 'state-pages'), { recursive: true, force: true })
  await mkdir(path.join(OUTPUT_DIRECTORY, 'state-pages'), { recursive: true })
  for (const page of statePages) {
    await writeFile(path.join(OUTPUT_DIRECTORY, 'state-pages', `${page.stateSlug}.json`), JSON.stringify(page))
  }
  // Build order for state pages: most programs first, then by URL.
  const stateIndex: StateIndexEntry[] = statePages
    .map((page) => ({ stateSlug: page.stateSlug, state: page.state.code, programCount: page.programCount }))
    .sort((first, second) => second.programCount - first.programCount || first.stateSlug.localeCompare(second.stateSlug))
  await writeFile(path.join(OUTPUT_DIRECTORY, 'state-index.json'), JSON.stringify(stateIndex, null, 1))

  await rm(path.join(OUTPUT_DIRECTORY, 'national-programs'), { recursive: true, force: true })
  await mkdir(path.join(OUTPUT_DIRECTORY, 'national-programs'), { recursive: true })
  for (const page of nationalProgramPages) {
    await writeFile(path.join(OUTPUT_DIRECTORY, 'national-programs', `${page.programSlug}.json`), JSON.stringify(page))
  }
  // Build order for national pages: most programs first, then by URL, with
  // graduate pages after all the others, as in the list of ranking pages.
  const nationalEntries = (graduate: boolean): NationalProgramIndexEntry[] =>
    nationalProgramPages
      .filter((page) => isGraduateLevel(page.program.credentialLevel) === graduate)
      .map((page) => ({
        programSlug: page.programSlug,
        cipCode: page.program.cipCode,
        credentialLevel: page.program.credentialLevel,
        programCount: page.national.earningsYear1Count,
      }))
      .sort((first, second) => second.programCount - first.programCount || first.programSlug.localeCompare(second.programSlug))
  const nationalIndex = [...nationalEntries(false), ...nationalEntries(true)]
  await writeFile(path.join(OUTPUT_DIRECTORY, 'national-program-index.json'), JSON.stringify(nationalIndex, null, 1))

  await rm(path.join(OUTPUT_DIRECTORY, 'occupations'), { recursive: true, force: true })
  await mkdir(path.join(OUTPUT_DIRECTORY, 'occupations'), { recursive: true })
  for (const page of occupationPages) {
    await writeFile(path.join(OUTPUT_DIRECTORY, 'occupations', `${page.careerSlug}.json`), JSON.stringify(page))
  }
  // Build order for occupation pages: most jobs nationwide first, then by URL.
  const occupationIndex: OccupationIndexEntry[] = occupationPages
    .map((page) => ({ careerSlug: page.careerSlug, socCode: page.socCode, employment: page.national.allJobs ?? page.national.employment ?? 0 }))
    .sort((first, second) => second.employment - first.employment || first.careerSlug.localeCompare(second.careerSlug))
  await writeFile(path.join(OUTPUT_DIRECTORY, 'occupation-index.json'), JSON.stringify(occupationIndex, null, 1))

  await rm(path.join(OUTPUT_DIRECTORY, 'site'), { recursive: true, force: true })
  await mkdir(path.join(OUTPUT_DIRECTORY, 'site'), { recursive: true })
  for (const [name, record] of Object.entries(sitePages)) {
    await writeFile(path.join(OUTPUT_DIRECTORY, 'site', `${name}.json`), JSON.stringify(record))
  }
  const siteIndex: SiteIndexEntry[] = [
    { path: '/', name: 'home' },
    { path: '/programs', name: 'programs' },
    { path: '/schools', name: 'schools' },
    { path: '/careers', name: 'careers' },
  ]
  await writeFile(path.join(OUTPUT_DIRECTORY, 'site-index.json'), JSON.stringify(siteIndex, null, 1))

  const countByLevel = (level: CredentialLevel) => countWhere(pages, (page) => page.program.credentialLevel === level)
  console.log(
    [
      `Program pages: ${pages.length} (bachelor's ${countByLevel(3)}, associate's ${countByLevel(2)}, certificates ${countByLevel(1)})`,
      `Master's program pages: ${graduatePages.length}, at ${new Set(graduatePages.map((page) => page.school.unitId)).size} schools, with every section filled: ${countWhere(graduatePages, isComplete)}`,
      `Schools: ${pageUnitIds.length}, fields of study: ${new Set(pages.map((page) => page.program.cipCode)).size}, states: ${new Set(pages.map((page) => page.school.state)).size}`,
      `With 5-year earnings: ${countWhere(pages, (page) => page.earnings.year5 !== undefined)}, every section filled: ${countWhere(pages, isComplete)}`,
      `Ranking pages (field and credential in a state): ${stateProgramPages.length}`,
      `School pages: ${schoolPages.length}, listing ${schoolIndex.reduce((total, entry) => total + entry.programCount, 0)} programs`,
      `State pages: ${statePages.length}`,
      `National program pages: ${nationalProgramPages.length}`,
      `Occupation pages: ${occupationPages.length}`,
      `Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    ].join('\n'),
  )
}

function isComplete(page: ProgramPage) {
  const { school, earnings, debt } = page
  const sectionsOfEveryPage =
    earnings.year5 !== undefined &&
    earnings.workingCount !== undefined &&
    earnings.workingInStateCount !== undefined &&
    debt.monthlyPayment !== undefined &&
    page.repayment?.rows.length === 4 &&
    page.priceLevels?.area !== undefined &&
    page.nearby.length > 1 &&
    page.program.graduatesPerYear !== undefined
  // A graduate page shows no split by Pell Grant, no Parent PLUS figures and no
  // section about the school.
  if (isGraduateLevel(page.program.credentialLevel)) return sectionsOfEveryPage
  return (
    sectionsOfEveryPage &&
    earnings.pellYear1 !== undefined &&
    earnings.otherYear1 !== undefined &&
    debt.pellMedian !== undefined &&
    debt.otherMedian !== undefined &&
    debt.parentPlusBorrowers !== undefined &&
    debt.parentPlusMedian !== undefined &&
    (school.inStateTuition !== undefined || school.programTuition !== undefined) &&
    school.averageNetPrice !== undefined &&
    school.admissionRate !== undefined &&
    school.graduationRate !== undefined &&
    school.undergraduates !== undefined
  )
}

await main()
