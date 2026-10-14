// The questions under a row of key figures: what "median" means, then one
// question for each figure. The definitions follow College Scorecard's field of
// study documentation. An answer that names College Scorecard ends with a line
// that says what it is. keyFigureQuestions is for pages whose figures are medians
// across many programs; programKeyFigureQuestions is for one program's page;
// schoolKeyFigureQuestions is for a school's page; stateKeyFigureQuestions is
// for a state's page; occupationKeyFigureQuestions is for a career's page.

import type { PageQuestion } from '@/components/page-blocks'
import type { Benchmark } from '@/data/program-page'
import { formatCount, formatMoney, formatShare } from '@/lib/format'

const SCORECARD = "the U.S. Department of Education's public database of colleges and their programs"
const PAY_SOURCE = { name: 'College Scorecard', text: `${SCORECARD}, with pay figures drawn from federal tax records.` }
const DEBT_SOURCE = { name: 'College Scorecard', text: `${SCORECARD}, with debt figures drawn from federal student loan records.` }

const PAY_MEASURE = [
  "College Scorecard reports the median pay of each program's graduates one year after they finished.",
  'It counts only graduates who received federal financial aid, were working and were not enrolled in more school.',
]
const DEBT_MEASURE = [
  "College Scorecard reports the median amount each program's graduates borrowed in federal student loans.",
  'It counts only graduates who took federal loans, and it leaves out interest, Parent PLUS loans and private loans.',
]
const DEBT_TO_EARNINGS_MEASURE = "It is a program's median federal debt divided by its graduates' median first-year pay."
// For a graduate degree the file gives debt only for loans taken at the school
// itself for graduate study (College Scorecard's field of study documentation,
// cumulative loan debt).
const GRADUATE_DEBT_MEASURE = [
  "For a graduate degree, College Scorecard reports the median amount each program's graduates borrowed in federal student loans for graduate study at that school.",
  'It counts only graduates who took federal loans, and it leaves out interest, undergraduate loans, loans taken at other schools and private loans.',
]
const GRADUATE_DEBT_TO_EARNINGS_MEASURE = "It is a program's median federal debt for graduate study divided by its graduates' median first-year pay."
// A graduate's loans from an earlier degree are in neither the debt figure nor
// anything worked out from it, and the answer says so where the figure is explained.
const GRADUATE_DEBT_TO_EARNINGS_LIMIT = 'Loans from an earlier degree are not counted. With them the figure would be higher.'
const LOWER_IS_BETTER = 'A lower figure means graduates owe less compared with what they earn.'

// The five salaries are an example, not data: they add up to $400,000. `people`
// names who earns them: graduates on pages about programs, workers on pages
// about jobs.
function medianQuestion(people: string): PageQuestion {
  return {
    question: 'What does "median" mean?',
    answer: [
      `An average adds up every value and divides by how many there are. A few very large or very small values can pull it far from what is typical. Imagine five ${people} who earn $40,000, $45,000, $50,000, $55,000 and $210,000. Their average is $80,000, but four of the five earn less than that.`,
      `The median is the middle value when the values are put in order: half are higher, and half are lower. For these five ${people} it is $50,000, which is much closer to what most of them earn.`,
    ],
  }
}
const MEDIAN_QUESTION = medianQuestion('graduates')

// `programs` names the programs the medians are taken across, as it reads before
// the word "programs": "computer engineering bachelor's", "Texas nursing bachelor's".
// `graduateDebt` is true on the ranking pages of a graduate degree, whose debt
// figure is measured differently and has its own name.
export function keyFigureQuestions({
  benchmark,
  programs,
  showYear5,
  graduateDebt = false,
}: {
  benchmark: Benchmark
  programs: string
  showYear5: boolean
  graduateDebt?: boolean
}): PageQuestion[] {
  const pay = [
    ...PAY_MEASURE,
    `${formatMoney(benchmark.earningsYear1)} is the median of those figures across the ${formatCount(benchmark.earningsYear1Count)} ${programs} programs that report one.`,
  ]
  if (showYear5) {
    pay.push(`Median pay after 5 years is the same measure for an earlier graduating class, and ${formatCount(benchmark.earningsYear5Count)} programs report it.`)
  }
  return [
    MEDIAN_QUESTION,
    { question: 'What is median first-year pay?', answer: [pay.join(' ')], source: PAY_SOURCE },
    {
      question: graduateDebt ? 'What is median federal debt for graduate study?' : 'What is median federal debt?',
      answer: [
        [
          ...(graduateDebt ? GRADUATE_DEBT_MEASURE : DEBT_MEASURE),
          `${formatMoney(benchmark.medianDebt)} is the median of those figures across the ${formatCount(benchmark.medianDebtCount)} programs that report one.`,
        ].join(' '),
      ],
      source: DEBT_SOURCE,
    },
    {
      question: 'What is debt-to-earnings?',
      answer: [
        [
          graduateDebt ? GRADUATE_DEBT_TO_EARNINGS_MEASURE : DEBT_TO_EARNINGS_MEASURE,
          'A program whose graduates borrowed $20,000 and earned $50,000 in their first year would be at 40%.',
          LOWER_IS_BETTER,
          `${formatShare(benchmark.debtToEarnings)} is the median across the ${formatCount(benchmark.debtToEarningsCount)} ${programs} programs that report both figures.`,
          ...(graduateDebt ? [GRADUATE_DEBT_TO_EARNINGS_LIMIT] : []),
        ].join(' '),
      ],
    },
  ]
}

// The same four questions on the page of one program at one school, where each
// figure is about that program's own graduates. The debt-to-earnings answer works
// the figure out from the page's two numbers. `graduates` names them ("UT Austin
// nursing graduates"). `programs` names the programs the state and national
// medians are taken across, as it reads before the word "programs" ("nursing
// bachelor's"). `graduateDebt` is true on the page of a graduate degree, whose
// debt figure is measured differently and has its own name.
export function programKeyFigureQuestions({
  graduates,
  programs,
  stateName,
  earningsYear1,
  earningsYear5,
  medianDebt,
  stateDebtToEarnings,
  nationalDebtToEarnings,
  graduateDebt = false,
}: {
  graduates: string
  programs: string
  stateName: string
  earningsYear1: number
  earningsYear5?: number
  medianDebt: number
  stateDebtToEarnings: number
  nationalDebtToEarnings: number
  graduateDebt?: boolean
}): PageQuestion[] {
  const pay = [...PAY_MEASURE, `For ${graduates} that figure is ${formatMoney(earningsYear1)}.`]
  if (earningsYear5 !== undefined) {
    pay.push(`Median pay after 5 years is the same measure for an earlier graduating class, and for this program it is ${formatMoney(earningsYear5)}.`)
  }
  return [
    MEDIAN_QUESTION,
    { question: 'What is median first-year pay?', answer: [pay.join(' ')], source: PAY_SOURCE },
    {
      question: graduateDebt ? 'What is median federal debt for graduate study?' : 'What is median federal debt?',
      answer: [[...(graduateDebt ? GRADUATE_DEBT_MEASURE : DEBT_MEASURE), `For ${graduates} that figure is ${formatMoney(medianDebt)}.`].join(' ')],
      source: DEBT_SOURCE,
    },
    {
      question: 'What is debt-to-earnings?',
      answer: [
        [
          graduateDebt ? GRADUATE_DEBT_TO_EARNINGS_MEASURE : DEBT_TO_EARNINGS_MEASURE,
          `For this program that is ${formatMoney(medianDebt)} divided by ${formatMoney(earningsYear1)}, which is ${formatShare(medianDebt / earningsYear1)}.`,
          LOWER_IS_BETTER,
          `The median across ${stateName} ${programs} programs is ${formatShare(stateDebtToEarnings)}, and the national median is ${formatShare(nationalDebtToEarnings)}.`,
          ...(graduateDebt ? [GRADUATE_DEBT_TO_EARNINGS_LIMIT] : []),
        ].join(' '),
      ],
    },
  ]
}

// The questions on a school page. Its key figures are the school's cost and
// rates, so the questions explain the pay and debt figures in its tables, by the
// name of the column that holds each one.
export function schoolKeyFigureQuestions(): PageQuestion[] {
  return [
    MEDIAN_QUESTION,
    {
      question: 'What is median first-year pay?',
      answer: [
        [
          ...PAY_MEASURE,
          'The "Year 1 pay" column on this page shows that figure for each program.',
          'The "Year 5 pay" column is the same measure for an earlier graduating class.',
        ].join(' '),
      ],
      source: PAY_SOURCE,
    },
    {
      question: 'What is median federal debt?',
      answer: [[...DEBT_MEASURE, 'The "Debt" column on this page shows that figure for each program.'].join(' ')],
      source: DEBT_SOURCE,
    },
  ]
}

// The questions on a state page: what "median" means, the two figures its tiles
// show for the state's bachelor's programs, and the state's price level when
// there is one. `programs` names the programs the medians are taken across
// ("Texas bachelor's"). `price` holds the place as it starts a sentence ("Texas",
// "The District of Columbia"), the price level as shown and the gap in words
// ("3% lower", "About the same").
export function stateKeyFigureQuestions({
  benchmark,
  programs,
  showYear5,
  price,
}: {
  benchmark: Benchmark
  programs: string
  showYear5: boolean
  price?: { place: string; index: string; label: string }
}): PageQuestion[] {
  const [median, pay, debt] = keyFigureQuestions({ benchmark, programs, showYear5 })
  const questions = [median, pay, debt]
  if (price) {
    const [percent, direction] = price.label.split(' ')
    const meaning =
      price.label === 'About the same'
        ? 'which means prices there are about the same as in the country as a whole'
        : `which means goods, services and housing cost about ${percent} ${direction === 'higher' ? 'more' : 'less'} there than in the country as a whole`
    questions.push({
      question: 'What does "prices compared with the US" mean?',
      answer: [
        `The Bureau of Economic Analysis measures how prices in each state compare with the national average, which it sets at 100. ${price.place} is at ${price.index}, ${meaning}.`,
      ],
      source: {
        name: 'Bureau of Economic Analysis',
        text: 'the federal agency that publishes the main measures of the U.S. economy. The figure is its Regional Price Parity for 2024.',
      },
    })
  }
  return questions
}

const LABOR_STATISTICS = 'the federal agency that measures jobs, pay and prices in the United States'

// The questions on a career page, about the job's pay and outlook in the whole
// country. `name` is the job as it reads inside a sentence ("registered nurses").
// `projection` holds the tile's label ("Projected job growth") and what the
// agency expects ("grow 6%", "shrink 3%", "stay about the same in number").
export function occupationKeyFigureQuestions({
  name,
  medianPay,
  bottomPay,
  topPay,
  yearlyPayOnly,
  surveyedJobs,
  allJobs,
  projection,
}: {
  name: string
  medianPay: string
  yearlyPayOnly: boolean
  // How many jobs the pay survey covers, and how many there are in all. The two
  // counts come from two surveys, so the answer gives them as two facts.
  surveyedJobs?: string
  allJobs?: string
  bottomPay?: string
  topPay?: string
  projection?: { label: string; expected: string; openings: string }
}): PageQuestion[] {
  const questions: PageQuestion[] = [
    medianQuestion('workers'),
    {
      question: 'What is median pay?',
      answer: [
        `The Bureau of Labor Statistics asks employers what they pay people in each job. The median for ${name} is ${medianPay} a year: half of them earn more, and half earn less. It covers every experience level. It leaves out people who work on farms, in private households or for themselves.${surveyedJobs !== undefined && allJobs !== undefined ? ` The pay survey covers ${surveyedJobs} jobs. The Bureau of Labor Statistics counts ${allJobs} in all, including people who work for themselves.` : ''}${yearlyPayOnly ? '' : ' The yearly figure assumes full-time work all year.'}`,
      ],
      source: { name: 'Bureau of Labor Statistics', text: `${LABOR_STATISTICS}. The figure is from its Occupational Employment and Wage Statistics for May 2025.` },
    },
  ]
  if (bottomPay !== undefined && topPay !== undefined) {
    questions.push({
      question: 'What do "bottom 10%" and "top 10%" mean?',
      answer: [
        `One in ten ${name} earns less than ${bottomPay} a year, and one in ten earns more than ${topPay}. The other eight in ten earn between those two figures.`,
      ],
    })
  }
  if (projection) {
    questions.push({
      question: `What does "${projection.label.toLowerCase()}" mean?`,
      answer: [
        `The Bureau of Labor Statistics projects how the number of jobs in each occupation will change over ten years. It expects the number of ${name} to ${projection.expected} from 2025 to 2035. The ${projection.openings} openings a year come from two things: the change in the number of jobs, and people who leave the occupation, either to stop working (for example to retire) or to move to a different kind of job.`,
      ],
      source: { name: 'Bureau of Labor Statistics', text: `${LABOR_STATISTICS}. The figures are from its Employment Projections for 2025 to 2035.` },
    })
  }
  return questions
}

// The official name of a field, which page titles shorten. `credential` is
// "Bachelor's", "Associate's" or "Certificate".
export function officialFieldSentence(program: { credential: string; fullTitle: string }) {
  return `This page covers ${program.credential.toLowerCase()} programs in the field the U.S. Department of Education calls "${program.fullTitle}".`
}

// The same, on the page of one program at one school.
export function officialProgramFieldSentence(program: { fullTitle: string }) {
  return `This program is in the field the U.S. Department of Education calls "${program.fullTitle}".`
}
