// Program page records. For now this holds one hand-checked record built from the
// June 2026 College Scorecard release, BLS OEWS (May 2025), BLS Employment
// Projections (2025 to 2035) and BEA Regional Price Parities (2024). Later a
// build script will generate these records from the bulk files.

export type SchoolControl = 'Public' | 'Private nonprofit' | 'Private for-profit'

export type ComparisonProgram = {
  schoolName: string
  city: string
  earningsYear1: number
  medianDebt: number
  isCurrent?: boolean
}

export type NearbyProgram = ComparisonProgram & {
  control: SchoolControl
  milesAway: number
  href?: string
}

export type Occupation = {
  title: string
  stateMedianPay: number
  requirement: string
  stateEmployment?: number
  stateP10Pay?: number
  stateP90Pay?: number
}

export type Benchmark = {
  earningsYear1: number
  earningsYear5: number
  medianDebt: number
  debtToEarnings: number
  programCount: number
}

export type ProgramPage = {
  schoolSlug: string
  programSlug: string
  updatedLabel: string
  school: {
    name: string
    shortName: string
    city: string
    state: string
    stateName: string
    control: SchoolControl
    inStateTuition: number
    outOfStateTuition: number
    averageNetPrice: number
    admissionRate: number
    graduationRate: number
    undergraduates: number
  }
  program: {
    name: string
    fullTitle: string
    credential: string
    // Short name people search for, such as BSN. Falls back to the credential.
    degreeAbbreviation?: string
    graduatesPerYear: number
  }
  earnings: {
    year1: number
    year5: number
    pellYear1: number
    otherYear1: number
    workingCount: number
    workingInStateCount: number
  }
  debt: {
    median: number
    monthlyPayment: number
    pellMedian: number
    otherMedian: number
    parentPlusBorrowers: number
    parentPlusMedian: number
  }
  repayment: {
    borrowers: number
    rows: { label: string; share: string }[]
  }
  ranks: {
    nationalEarningsPercentile: number
    debtLowerThanShare: number
    stateEarningsRank: number
    stateDebtRank: number
    stateDebtToEarningsRank: number
    stateProgramsWithBoth: number
    schoolEarningsRank: number
    schoolProgramCount: number
  }
  benchmarks: {
    state: Benchmark
    national: Benchmark
  }
  topSchoolPrograms: { name: string; earningsYear1: number }[]
  priceLevels: {
    areaName: string
    areaIndex: number
    stateIndex: number
  }
  occupationPay: {
    stateMedian: number
    metroMedian: number
    metroName: string
    nationalMedian: number
    growthShare: number
    growthPeriod: string
    openingsPerYear: number
  }
  occupations: Occupation[]
  stateComparison: ComparisonProgram[]
  nearby: NearbyProgram[]
  nearbyNote?: string
}

const utAustinNursing: ProgramPage = {
  schoolSlug: 'university-of-texas-at-austin',
  programSlug: 'nursing-bachelors',
  updatedLabel: 'College Scorecard June 2026 release · BLS wages May 2025',
  school: {
    name: 'The University of Texas at Austin',
    shortName: 'UT Austin',
    city: 'Austin',
    state: 'TX',
    stateName: 'Texas',
    control: 'Public',
    inStateTuition: 11688,
    outOfStateTuition: 44908,
    averageNetPrice: 19857,
    admissionRate: 0.2664,
    graduationRate: 0.889,
    undergraduates: 42855,
  },
  program: {
    name: 'Nursing',
    fullTitle: 'Registered Nursing',
    credential: "Bachelor's",
    degreeAbbreviation: 'BSN',
    graduatesPerYear: 118,
  },
  earnings: {
    year1: 75095,
    year5: 82838,
    pellYear1: 76134,
    otherYear1: 72913,
    workingCount: 139,
    workingInStateCount: 121,
  },
  debt: {
    median: 19651,
    monthlyPayment: 208,
    pellMedian: 17481,
    otherMedian: 23374,
    parentPlusBorrowers: 53,
    parentPlusMedian: 20508,
  },
  repayment: {
    borrowers: 121,
    rows: [
      { label: 'Paid off in full', share: '30–39%' },
      { label: 'Paying down the balance', share: '40–49%' },
      { label: 'Paused payments (forbearance)', share: '10–19%' },
      { label: 'In default', share: '10% or less' },
    ],
  },
  ranks: {
    nationalEarningsPercentile: 54,
    debtLowerThanShare: 0.899,
    stateEarningsRank: 29,
    stateDebtRank: 4,
    stateDebtToEarningsRank: 7,
    stateProgramsWithBoth: 44,
    schoolEarningsRank: 11,
    schoolProgramCount: 61,
  },
  benchmarks: {
    state: {
      earningsYear1: 76677,
      earningsYear5: 86500,
      medianDebt: 25160,
      debtToEarnings: 0.337,
      programCount: 48,
    },
    national: {
      earningsYear1: 74438,
      earningsYear5: 81525,
      medianDebt: 27000,
      debtToEarnings: 0.364,
      programCount: 895,
    },
  },
  topSchoolPrograms: [
    { name: 'Computer Science', earningsYear1: 111587 },
    { name: 'Electrical Engineering', earningsYear1: 96997 },
    { name: 'Business', earningsYear1: 94041 },
  ],
  priceLevels: {
    areaName: 'Austin area',
    areaIndex: 98.066,
    stateIndex: 97.057,
  },
  occupationPay: {
    stateMedian: 95970,
    metroMedian: 97890,
    metroName: 'Austin metro',
    nationalMedian: 97550,
    growthShare: 0.06,
    growthPeriod: '2025 to 2035',
    openingsPerYear: 180800,
  },
  occupations: [
    {
      title: 'Registered nurse',
      stateMedianPay: 95970,
      stateEmployment: 271380,
      stateP10Pay: 67120,
      stateP90Pay: 127950,
      requirement: 'The usual job for graduates of this program.',
    },
    {
      title: 'Nurse practitioner',
      stateMedianPay: 131670,
      requirement: "Requires a master's or doctoral degree in nursing after the bachelor's.",
    },
    {
      title: 'Nurse anesthetist',
      stateMedianPay: 244990,
      requirement: 'Requires a doctoral degree and critical care experience as an RN.',
    },
  ],
  stateComparison: [
    { schoolName: 'Abilene Christian University', city: 'Abilene', earningsYear1: 72481, medianDebt: 24850 },
    { schoolName: 'Angelo State University', city: 'San Angelo', earningsYear1: 73544, medianDebt: 24875 },
    { schoolName: 'Baptist Health System School of Health Professions', city: 'San Antonio', earningsYear1: 91456, medianDebt: 43010 },
    { schoolName: 'Baylor University', city: 'Waco', earningsYear1: 75213, medianDebt: 26975 },
    { schoolName: 'Concordia University Texas', city: 'Austin', earningsYear1: 73290, medianDebt: 27417 },
    { schoolName: 'East Texas Baptist University', city: 'Marshall', earningsYear1: 74452, medianDebt: 26000 },
    { schoolName: 'Houston Christian University', city: 'Houston', earningsYear1: 79229, medianDebt: 25394 },
    { schoolName: 'Lamar University', city: 'Beaumont', earningsYear1: 77946, medianDebt: 25196 },
    { schoolName: 'LeTourneau University', city: 'Longview', earningsYear1: 77117, medianDebt: 27000 },
    { schoolName: 'Lubbock Christian University', city: 'Lubbock', earningsYear1: 83470, medianDebt: 31000 },
    { schoolName: 'Midwestern State University', city: 'Wichita Falls', earningsYear1: 77928, medianDebt: 27000 },
    { schoolName: 'Prairie View A&M University', city: 'Prairie View', earningsYear1: 83218, medianDebt: 27392 },
    { schoolName: 'Sam Houston State University', city: 'Huntsville', earningsYear1: 82463, medianDebt: 26504 },
    { schoolName: 'Schreiner University', city: 'Kerrville', earningsYear1: 86950, medianDebt: 29706 },
    { schoolName: 'Southwestern Adventist University', city: 'Keene', earningsYear1: 76795, medianDebt: 31000 },
    { schoolName: 'Stephen F Austin State University', city: 'Nacogdoches', earningsYear1: 74683, medianDebt: 25125 },
    { schoolName: 'Tarleton State University', city: 'Stephenville', earningsYear1: 74753, medianDebt: 26000 },
    { schoolName: 'Texas A&M International University', city: 'Laredo', earningsYear1: 75009, medianDebt: 13750 },
    { schoolName: 'Texas A&M University-Central Texas', city: 'Killeen', earningsYear1: 88036, medianDebt: 22750 },
    { schoolName: 'Texas A&M University-College Station', city: 'College Station', earningsYear1: 78297, medianDebt: 21500 },
    { schoolName: 'Texas A&M University-Corpus Christi', city: 'Corpus Christi', earningsYear1: 71760, medianDebt: 25000 },
    { schoolName: 'Texas A&M University-Texarkana', city: 'Texarkana', earningsYear1: 67768, medianDebt: 28663 },
    { schoolName: 'Texas Christian University', city: 'Fort Worth', earningsYear1: 77808, medianDebt: 27000 },
    { schoolName: 'Texas Lutheran University', city: 'Seguin', earningsYear1: 68974, medianDebt: 23528 },
    { schoolName: 'Texas State University', city: 'San Marcos', earningsYear1: 72861, medianDebt: 23250 },
    { schoolName: 'Texas Tech Health Sciences Center El Paso', city: 'El Paso', earningsYear1: 73235, medianDebt: 25000 },
    { schoolName: 'Texas Tech University Health Sciences Center', city: 'Lubbock', earningsYear1: 77083, medianDebt: 22000 },
    { schoolName: 'Texas Woman\'s University', city: 'Denton', earningsYear1: 76344, medianDebt: 25000 },
    { schoolName: 'UT Arlington', city: 'Arlington', earningsYear1: 85513, medianDebt: 26182 },
    { schoolName: 'UT Austin', city: 'Austin', earningsYear1: 75095, medianDebt: 19651, isCurrent: true },
    { schoolName: 'UT El Paso', city: 'El Paso', earningsYear1: 72429, medianDebt: 21379 },
    { schoolName: 'UT Health Science Center at Houston', city: 'Houston', earningsYear1: 82043, medianDebt: 20500 },
    { schoolName: 'UT Health Science Center at San Antonio', city: 'San Antonio', earningsYear1: 70826, medianDebt: 24439 },
    { schoolName: 'UT Medical Branch at Galveston', city: 'Galveston', earningsYear1: 80433, medianDebt: 20500 },
    { schoolName: 'UT Permian Basin', city: 'Odessa', earningsYear1: 71681, medianDebt: 13954 },
    { schoolName: 'UT Rio Grande Valley', city: 'Edinburg', earningsYear1: 77619, medianDebt: 11674 },
    { schoolName: 'UT Tyler', city: 'Tyler', earningsYear1: 73963, medianDebt: 24356 },
    { schoolName: 'University of Houston', city: 'Houston', earningsYear1: 85740, medianDebt: 26283 },
    { schoolName: 'University of Mary Hardin-Baylor', city: 'Belton', earningsYear1: 76167, medianDebt: 28656 },
    { schoolName: 'University of St Thomas', city: 'Houston', earningsYear1: 83793, medianDebt: 24607 },
    { schoolName: 'University of the Incarnate Word', city: 'San Antonio', earningsYear1: 64720, medianDebt: 27574 },
    { schoolName: 'Wayland Baptist University', city: 'Plainview', earningsYear1: 70789, medianDebt: 44990 },
    { schoolName: 'West Coast University-Texas', city: 'Richardson', earningsYear1: 95859, medianDebt: 38145 },
    { schoolName: 'West Texas A&M University', city: 'Canyon', earningsYear1: 74531, medianDebt: 22884 },
  ],
  nearby: [
    { schoolName: 'UT Austin', city: 'Austin', control: 'Public', milesAway: 0, earningsYear1: 75095, medianDebt: 19651, isCurrent: true },
    { schoolName: 'Concordia University Texas', city: 'Austin', control: 'Private nonprofit', milesAway: 11, earningsYear1: 73290, medianDebt: 27417 },
    { schoolName: 'Texas State University', city: 'San Marcos', control: 'Public', milesAway: 30, earningsYear1: 72861, medianDebt: 23250 },
    { schoolName: 'Texas Lutheran University', city: 'Seguin', control: 'Private nonprofit', milesAway: 51, earningsYear1: 68974, medianDebt: 23528 },
    { schoolName: 'University of Mary Hardin-Baylor', city: 'Belton', control: 'Private nonprofit', milesAway: 57, earningsYear1: 76167, medianDebt: 28656 },
  ],
  nearbyNote:
    "Austin Community College ($88,105 first-year pay) and Texas A&M University-Central Texas ($88,036) also offer nursing bachelor's degrees. Both are RN-to-BSN programs for nurses who are already licensed and working, so their pay is not a fair comparison with programs for new students.",
}

const programPages: ProgramPage[] = [utAustinNursing]

export function getProgramPage(schoolSlug: string, programSlug: string) {
  return programPages.find(
    (page) => page.schoolSlug === schoolSlug && page.programSlug === programSlug,
  )
}

export function listProgramPages() {
  return programPages
}
