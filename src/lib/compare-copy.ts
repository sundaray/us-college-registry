// The compare page's rows and the words that explain them. Every figure comes
// from the program's own page record, which scripts/build-data.ts writes from
// the files in data/raw. The page states the figures and says what each one
// counts. It does not say which program is better: the reader decides what
// matters to them (the user's decision on 2026-10-16).

import type { CredentialLevel, ProgramView, RepaymentStatus, SchoolControl, ShareRange } from '@/data/program-page'
import { isGraduateLevel } from '@/data/program-page'
import { formatCount, formatMoney, formatShare, formatShareRange } from '@/lib/format'
import { computeMetrics, debtLabelForLevel, REPAYMENT_LABELS } from '@/lib/program-copy'

// The figures of one program that the compare page shows.
export type ComparedProgram = {
  href: string
  shortName: string
  credentialLevel: CredentialLevel
  control: SchoolControl
  year1: number
  year5?: number
  workingCount?: number
  workingInStateCount?: number
  inStateShare?: number
  stateName: string
  debtMedian: number
  debtBorrowers?: number
  debtToEarnings: number
  monthlyPayment?: number
  repaymentBorrowers?: number
  repaymentShares: Partial<Record<RepaymentStatus, ShareRange>>
}

export function comparedProgram(page: ProgramView): ComparedProgram {
  const metrics = computeMetrics(page)
  return {
    href: `/schools/${page.schoolSlug}/${page.programSlug}`,
    shortName: page.school.shortName,
    credentialLevel: page.program.credentialLevel,
    control: page.school.control,
    year1: page.earnings.year1,
    year5: page.earnings.year5,
    workingCount: page.earnings.workingCount,
    workingInStateCount: page.earnings.workingInStateCount,
    inStateShare: metrics.inStateShare,
    stateName: page.school.stateName,
    debtMedian: page.debt.median,
    debtBorrowers: page.debt.borrowers,
    debtToEarnings: metrics.debtToEarnings,
    monthlyPayment: page.debt.monthlyPayment,
    repaymentBorrowers: page.repayment?.borrowers,
    repaymentShares: Object.fromEntries((page.repayment?.rows ?? []).map((row) => [row.status, row.share])),
  }
}

// One cell: one or more lines, each a figure with the words that go with it
// ("$364" and "a month"), and a line under them. A cell the files have no
// figure for is undefined, and the page writes "Not reported".
export type CompareLine = { figure: string; words?: string }
export type CompareCell = { lines: CompareLine[]; note?: string }

export type CompareRow = {
  key: string
  label: string
  cell: (program: ComparedProgram) => CompareCell | undefined
  // What the row's figure is, for the list at the bottom of the page.
  meaning: string
}

export type CompareSection = { key: string; title: string; rows: CompareRow[]; note?: string }

function figureCell(figure: string, note?: string): CompareCell {
  return { lines: [{ figure }], note }
}

function shareRow(status: RepaymentStatus, meaning: string): CompareRow {
  return {
    key: `repayment-${status}`,
    label: REPAYMENT_LABELS[status],
    cell: (program) => {
      const share = program.repaymentShares[status]
      return share ? figureCell(formatShareRange(share)) : undefined
    },
    meaning,
  }
}

// Where the program's federal loan borrowers stood two years into repayment.
function repaymentSection(): CompareSection {
  return {
    key: 'repayment',
    title: 'Two years into repayment',
    note: 'The government publishes these as ranges to protect privacy. They were measured in 2018 to 2020, partly during the pandemic pause on federal loan payments. The forbearance share may be higher than usual.',
    rows: [
      {
        key: 'repayment-borrowers',
        label: 'Borrowers counted',
        cell: (program) => (program.repaymentBorrowers ? figureCell(formatCount(program.repaymentBorrowers)) : undefined),
        meaning: "How many of the program's graduates with federal loans the repayment shares describe. Each borrower is counted once, two years after their repayment began.",
      },
      shareRow('paidInFull', "All of the borrower's loans are paid off."),
      shareRow('makingProgress', 'The borrower is making regular payments and owes less than they first borrowed.'),
      shareRow('forbearance', 'Payments are stopped or reduced for a time, and interest keeps adding up.'),
      shareRow('default', 'The borrower has not paid as the loan agreement requires for more than 360 days.'),
    ],
  }
}

// The sections in the order of the program page. Every row is a figure of
// the program itself: the school-wide figures (tuition, net price, admission
// and graduation rates, enrollment) and the price level where the school is
// are left out, because a reader can take them for the program's. So is the
// number of graduates a year: it counts all of one year's graduates, and a
// reader could divide the counts of working graduates or borrowers by it and
// get a false rate. The type of school is in the row of names (the user's
// decisions on 2026-10-16). Each `meaning` says what the figure is, worded from
// the agency documents listed in data/raw/SOURCES.md.
export function compareSections(credentialLevel: CredentialLevel): CompareSection[] {
  const graduate = isGraduateLevel(credentialLevel)
  const sections: CompareSection[] = [
    {
      key: 'pay',
      title: 'Graduate pay',
      rows: [
        {
          key: 'year1',
          label: 'Median first-year pay',
          cell: (program) => figureCell(formatMoney(program.year1)),
          meaning:
            'What graduates earned in their first year after finishing, from federal tax records. It counts only graduates who received federal financial aid, were working and were not enrolled in more school. It covers students who finished in 2018-19 and 2019-20. Their pay was measured in 2020 and 2021 and is shown in 2022 dollars.',
        },
        {
          key: 'year5',
          label: 'Median pay after 5 years',
          cell: (program) => (program.year5 !== undefined ? figureCell(formatMoney(program.year5)) : undefined),
          meaning:
            'What graduates earned five years after finishing, counted the same way. It covers students who finished in 2014-15 and 2015-16, a different group from first-year pay. Their pay was also measured in 2020 and 2021 and is shown in 2022 dollars.',
        },
        {
          key: 'working',
          label: 'Working graduates counted',
          cell: (program) => (program.workingCount ? figureCell(formatCount(program.workingCount)) : undefined),
          meaning:
            'How many graduates were working and not enrolled in more school one year after finishing. First-year pay is the median of their pay. The government adjusts these counts slightly to protect privacy.',
        },
      ],
    },
    {
      key: 'debt',
      title: 'Debt',
      rows: [
        {
          key: 'debt',
          label: debtLabelForLevel(credentialLevel),
          cell: (program) => figureCell(formatMoney(program.debtMedian)),
          meaning: graduate
            ? 'The median amount that graduates who took federal student loans borrowed for graduate study at that school. Undergraduate loans, loans taken at other schools, private loans and interest are not counted.'
            : 'The median amount that graduates who took federal student loans borrowed, counting loans from every school they attended. Loans taken by parents, private loans and interest are not counted.',
        },
        ...(graduate
          ? [
              {
                key: 'borrowers',
                label: 'Borrowers counted',
                cell: (program: ComparedProgram) => (program.debtBorrowers ? figureCell(formatCount(program.debtBorrowers)) : undefined),
                meaning: 'How many graduates took the federal loans the debt figure is based on.',
              },
            ]
          : []),
        {
          key: 'debt-to-earnings',
          label: 'Debt-to-earnings',
          cell: (program) => figureCell(formatShare(program.debtToEarnings)),
          meaning: "We work it out by dividing the program's median debt by its median first-year pay.",
        },
        {
          key: 'payment',
          label: 'Estimated monthly payment over 10 years',
          cell: (program) => (program.monthlyPayment !== undefined ? { lines: [{ figure: formatMoney(program.monthlyPayment), words: 'a month' }] } : undefined),
          meaning: graduate
            ? 'The monthly payment on the median debt if it were repaid in equal payments over 10 years. The Department of Education works it out at 7.54% interest, the rate it uses for graduate programs. Loans from an earlier degree are not in this figure.'
            : 'The monthly payment on the median debt if it were repaid in equal payments over 10 years. The Department of Education works it out at 4.99% interest, the rate it uses for undergraduate programs.',
        },
      ],
    },
    // For master's programs the data dictionary describes the repayment columns
    // as "undergraduate completer undergraduate federal student loan borrowers",
    // though the file fills them in. Which loans they cover is not settled
    // (data/raw/SOURCES.md), and a master's comparison leaves the group out.
    ...(graduate ? [] : [repaymentSection()]),
    {
      key: 'work',
      title: 'Where graduates work',
      rows: [
        {
          key: 'in-state',
          label: "Working in the school's state a year after graduating",
          cell: (program) =>
            program.inStateShare !== undefined
              ? figureCell(formatShare(program.inStateShare), `${formatCount(program.workingInStateCount!)} of ${formatCount(program.workingCount!)}, in ${program.stateName}`)
              : undefined,
          meaning: 'The share of working graduates who were employed in the same state as the school one year after finishing. It is approximate, because the government adjusts these counts slightly to protect privacy.',
        },
      ],
    },
  ]
  return sections
}

// What "Not reported" and the medians mean, for the top of the list at the
// bottom of the page. The privacy shares are from the Field of Study
// documentation, page 7, as in payPrivacyNote.
export const COMPARE_GENERAL_TERMS = [
  { term: 'Median', meaning: "The middle figure among a program's graduates. Half of them are above it and half below." },
  { term: 'Not reported', meaning: "The federal files have no figure for this program. The government withholds many programs' figures to protect privacy." },
  {
    term: 'Small differences in pay',
    meaning:
      'To protect privacy, the U.S. Department of Education changes each pay figure slightly before publishing it. About half of first-year figures are within 1% of the true figure, most of the rest are within 4% and about 6% are off by 5% to 9%. Small gaps in pay may not be real differences. Debt figures are not changed.',
  },
]
