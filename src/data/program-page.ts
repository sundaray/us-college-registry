// The record behind one program page (one program at one school). The data script
// (scripts/build-data.ts) writes one of these per page from the files in data/raw.
// Optional fields are missing when the source data is missing or suppressed, and
// the page hides whatever depends on them.

export type SchoolControl = 'Public' | 'Private nonprofit' | 'Private for-profit'

// Scorecard credential levels that get pages: 1 undergraduate certificate,
// 2 associate's degree, 3 bachelor's degree.
export type CredentialLevel = 1 | 2 | 3

export type ComparisonProgram = {
  schoolName: string
  city: string
  state: string
  earningsYear1: number
  earningsYear5?: number
  medianDebt: number
  isCurrent?: boolean
  // Set only when the program has its own page.
  href?: string
}

export type NearbyProgram = ComparisonProgram & {
  control: SchoolControl
  milesAway: number
}

// Medians across every program with the same field and credential, in the state or
// nationwide. Each count is the number of programs that report that figure.
export type Benchmark = {
  earningsYear1: number
  earningsYear1Count: number
  earningsYear5?: number
  earningsYear5Count: number
  medianDebt: number
  medianDebtCount: number
  // Median of each program's debt divided by its first-year earnings.
  debtToEarnings: number
  debtToEarningsCount: number
}

// Scorecard publishes repayment shares as rounded values or ranges.
export type ShareRange =
  | { kind: 'atMost'; high: number }
  | { kind: 'atLeast'; low: number }
  | { kind: 'between'; low: number; high: number }
  | { kind: 'exact'; value: number }

export type RepaymentStatus = 'paidInFull' | 'makingProgress' | 'forbearance' | 'default'

export type RepaymentRow = {
  status: RepaymentStatus
  share: ShareRange
}

export type GraduationRate = {
  rate: number
  // 'fourYear' is C150_4 and 'lessThanFourYear' is C150_L4. Both are for the whole
  // school and count first-time, full-time students who finish within 150% of the
  // normal time.
  basis: 'fourYear' | 'lessThanFourYear'
  // True when the school mostly awards bachelor's degrees (PREDDEG 3), which makes
  // 150% of the normal time six years. A school the file classes as four-year may
  // mostly award shorter credentials, and then "six years" is wrong.
  withinSixYears: boolean
}

export type PriceLevels = {
  // The price level where the school is. 'metro': the school's metro area ("Austin
  // area"). 'nonmetro': the parts of the state outside metro areas, and the name
  // is the state name. Missing when the school's location is not trusted
  // (hasTrustedLocation in scripts/build-data.ts).
  area?: { kind: 'metro' | 'nonmetro'; name: string; index: number }
  stateIndex: number
}

// One occupation the NCES CIP-to-SOC crosswalk links to the field. Pay and
// employment are BLS OEWS May 2025 (all experience levels); growth, openings, and
// education are BLS Employment Projections 2025 to 2035 (national).
export type OccupationOutlook = {
  socCode: string
  title: string
  // Set when the occupation has its own page: /careers/{careerSlug}.
  careerSlug?: string
  stateMedianPay?: number
  stateEmployment?: number
  stateP10Pay?: number
  stateP90Pay?: number
  nationalMedianPay?: number
  // 0.056 means 5.6% growth from 2025 to 2035.
  growthShare?: number
  openingsPerYear?: number
  typicalEducation?: string
  // Missing when BLS lists no work experience requirement.
  workExperience?: string
}

// An occupation with the name it takes inside a sentence ("software developers"),
// for pages that write its pay as a sentence.
export type NamedOccupation = OccupationOutlook & { sentenceName: string }

// Only for fields that train for one licensed job (scripts/reference/matching-occupations.ts).
export type MatchingOccupationPay = {
  socCode: string
  pluralName: string
  shortName: string
  stateMedianPay: number
  nationalMedianPay: number
  // The school's metro area, when BLS publishes the figure for it.
  metroMedianPay?: number
  metroName?: string
}

export type ProgramPage = {
  schoolSlug: string
  programSlug: string
  school: {
    unitId: string
    name: string
    shortName: string
    city: string
    state: string
    stateName: string
    // The state page's slug: /states/{stateSlug}.
    stateSlug: string
    control: SchoolControl
    // IPEDS ICLEVEL: 1 four-year, 2 two-year, 3 less than two-year.
    level: 'fourYear' | 'twoYear' | 'lessThanTwoYear'
    // TUITIONFEE_IN is in-district tuition. At schools without district pricing
    // it equals in-state tuition.
    inStateTuition?: number
    // True when the school charged a separate, lower in-district rate in the IPEDS
    // 2023-24 charges file, so TUITIONFEE_IN is labeled "in-district".
    hasDistrictTuition: boolean
    outOfStateTuition?: number
    // Schools that report by program instead of by academic year (many trade and
    // beauty schools) publish tuition and net price for their largest program,
    // covering the whole program however long it is.
    reportsByProgram: boolean
    programTuition?: number
    averageNetPrice?: number
    admissionRate?: number
    graduationRate?: GraduationRate
    undergraduates?: number
  }
  program: {
    cipCode: string
    credentialLevel: CredentialLevel
    name: string
    sentenceName: string
    // The official CIP title without the trailing period.
    fullTitle: string
    credential: string
    degreeAbbreviation?: string
    // IPEDSCOUNT2: awards in the later of the two award years.
    graduatesPerYear?: number
  }
  earnings: {
    year1: number
    year5?: number
    pellYear1?: number
    otherYear1?: number
    workingCount?: number
    workingInStateCount?: number
  }
  debt: {
    median: number
    monthlyPayment?: number
    pellMedian?: number
    otherMedian?: number
    parentPlusBorrowers?: number
    parentPlusMedian?: number
  }
  repayment?: {
    borrowers: number
    rows: RepaymentRow[]
  }
  ranks: {
    // Share of programs nationally with lower first-year pay, as a whole percent.
    nationalEarningsPercentile: number
    // Share of programs nationally with higher median debt (0 to 1).
    debtLowerThanShare: number
    // Share of programs nationally with lower median debt (0 to 1).
    debtHigherThanShare: number
    // 1 is the highest pay among state programs that report first-year pay.
    stateEarningsRank: number
    // 1 is the lowest among state programs that report both pay and debt.
    stateDebtRank: number
    stateDebtToEarningsRank: number
    stateProgramsWithBoth: number
    // 1 is the highest pay among the school's programs at this credential level.
    schoolEarningsRank: number
    schoolProgramCount: number
  }
  benchmarks: {
    state: Benchmark
    national: Benchmark
  }
  topSchoolPrograms: { name: string; earningsYear1: number; href?: string }[]
  priceLevels?: PriceLevels
  // Up to OCCUPATION_LIMIT occupations, most national employment first.
  occupations: OccupationOutlook[]
  matchingOccupation?: MatchingOccupationPay
  // The ranking page for this field and credential in the school's state.
  stateRankingHref: string
  // Every program at the school that reports first-year pay, at every credential
  // level. The school has its own page only when this is at least 2
  // (hasSchoolPage in src/data/school-page.ts).
  schoolProgramTotal: number
  // Set when some of the program's graduates studied at campuses in other
  // states: the share who studied in the school's state. It is at least half,
  // or the program would be left out of the state and have no page.
  inStateGraduateShare?: number
  // Every state program that reports both pay and debt, for the scatter chart.
  stateComparison: ComparisonProgram[]
  // Programs with pages within NEARBY_MILES, nearest first, current program first.
  nearby: NearbyProgram[]
}

// The page as the route receives it: the record, with each job's name as it
// reads inside a sentence. getProgramPage adds the names.
export type ProgramView = Omit<ProgramPage, 'occupations'> & { occupations: NamedOccupation[] }

export type ProgramIndexEntry = {
  schoolSlug: string
  programSlug: string
  unitId: string
  cipCode: string
  credentialLevel: CredentialLevel
  state: string
  graduatesPerYear: number
  // True when every section of the page has data.
  isComplete: boolean
}
