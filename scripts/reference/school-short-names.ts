// Short school names for titles and sentences, chosen to match how people
// usually search for a school ("UT Austin nursing", "Ohio State nursing").
//
// Order of use:
// 1. SCHOOL_SHORT_NAMES, written by hand for well-known schools.
// 2. SHORT_NAME_RULES, applied in order to the official name. They remove campus
//    suffixes nobody searches for and use the common form for school systems.
// 3. Otherwise the official name.
//
// An abbreviation is used only when people commonly search with it and it points
// to one school nationally. "MSU" could be Michigan State, Mississippi State, or
// Montana State, so those use "Michigan State" and so on. The data script checks
// that no two schools end up with the same name.

export const SCHOOL_SHORT_NAMES: Record<string, string> = {
  // Online and multi-state universities
  '183026': 'SNHU',
  '433387': 'WGU',
  '104717': 'GCU',
  '163204': 'UMGC',
  // Arizona, Colorado, Utah, Idaho
  '104151': 'ASU',
  '230038': 'BYU',
  '142522': 'BYU-Idaho',
  '126614': 'CU Boulder',
  '126562': 'CU Denver',
  '126580': 'UCCS',
  '126818': 'Colorado State',
  '128106': 'CSU Pueblo',
  '476975': 'CSU Global',
  // California
  '110662': 'UCLA',
  '123961': 'USC',
  '110608': 'CSUN',
  '110617': 'Sacramento State',
  '110556': 'Fresno State',
  '110538': 'Chico State',
  '110495': 'Stanislaus State',
  '110592': 'Cal State LA',
  '110422': 'Cal Poly SLO',
  '110529': 'Cal Poly Pomona',
  '115755': 'Cal Poly Humboldt',
  // Texas
  '228778': 'UT Austin',
  '228769': 'UT Arlington',
  '228787': 'UT Dallas',
  '228802': 'UT Tyler',
  '229027': 'UTSA',
  '228796': 'UTEP',
  '227368': 'UTRGV',
  '229018': 'UT Permian Basin',
  '229300': 'UTHealth Houston',
  '228644': 'UT Health San Antonio',
  '228653': 'UTMB',
  '228723': 'Texas A&M',
  '227216': 'UNT',
  '229115': 'Texas Tech',
  '228875': 'TCU',
  '228246': 'SMU',
  '228431': 'Stephen F. Austin',
  // Florida, Georgia
  '132903': 'UCF',
  '133951': 'FIU',
  '137351': 'USF',
  '133669': 'FAU',
  '133650': 'FAMU',
  '133553': 'Embry-Riddle Daytona Beach',
  '139755': 'Georgia Tech',
  '139861': 'Georgia College',
  '140951': 'SCAD',
  // Midwest
  '204796': 'Ohio State',
  '204024': 'Miami University',
  '203517': 'Kent State',
  '243780': 'Purdue',
  '151351': 'IU Bloomington',
  '151111': 'IU Indianapolis',
  '145637': 'UIUC',
  '145600': 'UIC',
  '146719': 'Loyola Chicago',
  '170976': 'University of Michigan',
  '171137': 'UM-Dearborn',
  '171146': 'UM-Flint',
  '171128': 'Michigan Tech',
  '174066': 'University of Minnesota',
  '173920': 'Minnesota State Mankato',
  '174358': 'Minnesota State Moorhead',
  '174020': 'Metropolitan State University',
  '178396': 'University of Missouri',
  '178402': 'UMKC',
  '178420': 'UMSL',
  '178411': 'Missouri S&T',
  '179867': 'WashU',
  '201645': 'Case Western',
  '152080': 'Notre Dame',
  '179566': 'Missouri State',
  // Northeast
  '214777': 'Penn State',
  '215062': 'UPenn',
  '215293': 'University of Pittsburgh',
  '186380': 'Rutgers',
  '193900': 'NYU',
  '190150': 'Columbia University',
  '166683': 'MIT',
  '129020': 'UConn',
  '163286': 'University of Maryland',
  '163268': 'UMBC',
  '195003': 'RIT',
  '194824': 'RPI',
  '168421': 'WPI',
  '185828': 'NJIT',
  '187134': 'TCNJ',
  '193654': 'The New School',
  '190512': 'Baruch College',
  '190521': 'BMCC',
  '190567': 'City College of New York',
  '190600': 'John Jay College',
  '190655': 'City Tech',
  '196130': 'Buffalo State',
  '196255': 'SUNY Downstate',
  '190576': 'CUNY Graduate Center',
  '190691': 'CUNY York College',
  '196264': 'Empire State University',
  '187046': 'Thomas Edison State University',
  '190372': 'Cooper Union',
  '192110': 'Juilliard',
  // South and Mid-Atlantic
  '233921': 'Virginia Tech',
  '234076': 'UVA',
  '234030': 'VCU',
  '232423': 'JMU',
  '232186': 'George Mason',
  '238032': 'WVU',
  '199193': 'NC State',
  '199102': 'NC A&T',
  '199218': 'UNC Wilmington',
  '199111': 'UNC Asheville',
  '159391': 'LSU',
  '159382': 'LSU Alexandria',
  '159407': 'LSU Eunice',
  '159416': 'LSU Shreveport',
  '159373': 'LSU Health New Orleans',
  '160658': 'UL Lafayette',
  '159993': 'UL Monroe',
  '176017': 'Ole Miss',
  '100663': 'UAB',
  '106245': 'UA Little Rock',
  '218663': 'University of South Carolina',
  '221759': 'University of Tennessee',
  '221740': 'UT Chattanooga',
  '221768': 'UT Martin',
  '219602': 'Austin Peay',
  '221519': 'Sewanee',
  '160621': 'Southern University',
  // West
  '117751': "The Master's University",
  '236948': 'University of Washington',
  '141574': 'UH Manoa',
  '141565': 'UH Hilo',
  '141981': 'UH West Oahu',
  '225414': 'UH-Clear Lake',
  '225432': 'UH-Downtown',
}

type ShortNameRule = {
  pattern: RegExp
  replacement: string
}

// Applied in order, each to the result of the one before. A rule that matches
// nothing leaves the name alone.
export const SHORT_NAME_RULES: ShortNameRule[] = [
  // Campus suffixes people don't search with.
  { pattern: /\s*-\s*Main Campus$/, replacement: '' },
  { pattern: /\s+Main Campus$/, replacement: '' },
  { pattern: /-Main$/, replacement: '' },
  { pattern: /^The /, replacement: '' },
  { pattern: /,? (LLC|Inc)\.?$/, replacement: '' },
  { pattern: /^CUNY (.+)$/, replacement: '$1' },
  { pattern: /^(.+) CUNY$/, replacement: '$1' },
  { pattern: / A & M /g, replacement: ' A&M ' },
  // School systems, in the form the schools themselves and searchers use.
  { pattern: /^University of California-(.+)$/, replacement: 'UC $1' },
  { pattern: /^California State University-(.+)$/, replacement: 'Cal State $1' },
  { pattern: /^University of Texas at (.+)$/, replacement: 'UT $1' },
  { pattern: /^Texas A&M University-(.+)$/, replacement: 'Texas A&M-$1' },
  { pattern: /^University of North Carolina at (.+)$/, replacement: 'UNC $1' },
  { pattern: /^University of Wisconsin-(.+)$/, replacement: 'UW-$1' },
  { pattern: /^University of Massachusetts-(.+)$/, replacement: 'UMass $1' },
  { pattern: /^Indiana University-(.+)$/, replacement: 'IU $1' },
  { pattern: /^Purdue University (.+)$/, replacement: 'Purdue $1' },
  { pattern: /^State University of New York at (.+)$/, replacement: 'SUNY $1' },
  { pattern: /^SUNY at (.+)$/, replacement: 'SUNY $1' },
  { pattern: /^University of Puerto Rico-(.+)$/, replacement: 'UPR $1' },
  { pattern: /^University of South Carolina-(.+)$/, replacement: 'USC $1' },
  // "Kennesaw State University" is "Kennesaw State" in speech and in searches.
  // Names like "Georgia College & State University" are left alone.
  { pattern: /^(.+?)(?<!&| and) State University$/, replacement: '$1 State' },
  // Location suffixes on single-campus names of multi-state chains.
  { pattern: /^(University of Phoenix|DeVry University|Colorado Technical University|Keiser University|Rasmussen University|Chamberlain University)-.+$/, replacement: '$1' },
  { pattern: /^St\. John's University-New York$/, replacement: "St. John's University" },
  { pattern: /^Saint Joseph's University - Philadelphia$/, replacement: "Saint Joseph's University" },
]

export function applyShortNameRules(officialName: string) {
  return SHORT_NAME_RULES.reduce(
    (name, rule) => name.replace(rule.pattern, rule.replacement),
    officialName.trim(),
  )
}
