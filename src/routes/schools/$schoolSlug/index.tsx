import { createFileRoute } from '@tanstack/react-router'
import { answerText, KeyFigures, Note, PageSection, QuestionList, RankedList, Summary } from '@/components/page-blocks'
import type { RankedEntry } from '@/components/page-blocks'
import { SchoolHeader } from '@/components/school/school-header'
import { SchoolProgramTable } from '@/components/school/school-program-table'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getSchoolPage } from '@/data/get-school-page'
import { isGraduateLevel } from '@/data/program-page'
import type { SchoolLevel, SchoolProgram } from '@/data/school-page'
import { combinedCampusesNotes, payPrivacyNote } from '@/lib/data-notes'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount, formatGraduatesPerYear, formatMoney } from '@/lib/format'
import { schoolKeyFigureQuestions } from '@/lib/key-figure-copy'
import { placeInSentence } from '@/lib/place-names'
import {
  SHORT_LIST_MINIMUM,
  buildSchoolDescription,
  buildSchoolFaq,
  buildSchoolKeyFigures,
  buildSchoolSummary,
  buildSchoolTitle,
  credentialLower,
  debtOnlyNote,
  levelSectionTitle,
  primaryLevel,
  shortLists,
  shortListsIntro,
  shortListsTitle,
} from '@/lib/school-copy'
import { canonicalLink } from '@/lib/site'

// The index route matches /schools/{school} exactly; program pages are its
// siblings at /schools/{school}/{program}.
export const Route = createFileRoute('/schools/$schoolSlug/')({
  loader: async ({ params }) => {
    const page = await getSchoolPage({ data: params })
    return { page, figureQuestions: schoolKeyFigureQuestions(), faq: buildSchoolFaq(page) }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { page, figureQuestions, faq } = loaderData
    return {
      links: [canonicalLink(`/schools/${params.schoolSlug}`)],
      meta: [
        { title: buildSchoolTitle(page) },
        { name: 'description', content: buildSchoolDescription(page) },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          // One FAQPage for both lists of questions, in the order the page shows them.
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [...figureQuestions, ...faq].map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: answerText(item) },
            })),
          }),
        },
      ],
    }
  },
  component: SchoolPageView,
})

function SchoolPageView() {
  const { page, figureQuestions, faq } = Route.useLoaderData()
  const { school } = page
  const figures = buildSchoolKeyFigures(school)
  const primary = primaryLevel(page)

  return (
    <div className={PAGE_CLASS_NAME}>
      <SiteHeader />
      {/* The key gives each school's page its own state. Without it, a link from one
          school page to another keeps the tables' sort and page number and the open
          questions. data-* attributes let scripts/verify find the school and skip its
          name when reading numbers. */}
      <main className={MAIN_CLASS_NAME} key={page.schoolSlug} data-unit-id={school.unitId} data-school-name={school.shortName}>
        <SchoolHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Summary paragraphs={buildSchoolSummary(page)} />

          {figures.length > 0 ? <KeyFigures figures={figures} /> : null}
          <QuestionList name="figures" section="key-figure-questions" questions={figureQuestions} className="mt-3" />

          {page.levels.map((level) => (
            <LevelSection key={level.credentialLevel} level={level} shortName={school.shortName} stateName={school.stateName} />
          ))}

          {primary.programs.length >= SHORT_LIST_MINIMUM ? <ShortLists level={primary} shortName={school.shortName} /> : null}

          <PageSection name="faq" title="Common questions">
            <QuestionList name="faq" questions={faq} openFirst />
          </PageSection>

          <PageSection name="about-data" title="About this data">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              <li>Pay and debt only include students who received federal financial aid, and pay only counts graduates who were working and not enrolled in more school.</li>
              <li>
                Debt only includes federal loans. Private loans and credit cards are not counted.
                {page.levels.some((level) => isGraduateLevel(level.credentialLevel))
                  ? " For a master's program, it only counts loans for graduate study at that school."
                  : ''}
              </li>
              <li>{payPrivacyNote()}</li>
              {/* Whom the figures at the top are for. A school that reports by program gives
                  its largest program's tuition and net price. */}
              <li>
                {school.reportsByProgram
                  ? "Tuition and net price are for undergraduates in the school's largest program. The graduation rate and admission rate are for its undergraduates."
                  : "Tuition, net price, graduation rate and admission rate are for the school's undergraduates, not for one program."}
              </li>
              {combinedCampusesNotes(school.stateName).map((note) => (
                <li key={note}>{note}</li>
              ))}
              <li>College Scorecard figures describe graduating classes from several years ago.</li>
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</li>
              <li>NCES, IPEDS tuition and fees, 2023-24, for in-district tuition labels</li>
            </ol>
          </PageSection>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function LevelSection({ level, shortName, stateName }: { level: SchoolLevel; shortName: string; stateName: string }) {
  const credential = credentialLower(level)
  const fieldNotes = [...new Set(level.programs.flatMap((program) => comparisonNote(program.cipCode, level.credentialLevel) ?? []))]
  const debtOnly = debtOnlyNote(level)
  return (
    <PageSection name={`ranking-${level.credentialLevel}`} title={levelSectionTitle(level, shortName)}>
      <p>
        Each figure is the median for the program's graduates. "Rank in {placeInSentence(stateName)}" compares first-year pay with the
        same field's {credential} programs across {placeInSentence(stateName)}.
        {level.programs.length >= 3
          ? ' Every program listed here reports first-year pay. A program that does not report debt or its number of graduates is listed last when you sort by it.'
          : ''}
      </p>
      <SchoolProgramTable programs={level.programs} stateName={stateName} />
      {fieldNotes.map((note) => (
        <Note key={note}>{note}</Note>
      ))}
      {debtOnly ? <Note>{debtOnly}</Note> : null}
      {/* A master's debt figure counts less than the others on the page, and the table says so. */}
      {isGraduateLevel(level.credentialLevel) ? (
        <Note>
          Debt for a master's program counts only the federal loans its graduates took for graduate study at that
          school. Undergraduate loans and loans taken at other schools are not counted.
        </Note>
      ) : null}
    </PageSection>
  )
}

// Two short lists drawn from the level's programs: the lowest debt and the most
// graduates. A list with no program to show is left out, and so is the section
// when both are empty.
function ShortLists({ level, shortName }: { level: SchoolLevel; shortName: string }) {
  const lists = shortLists(level)
  const shown = [
    { title: 'Lowest debt', programs: lists.byDebt, value: (program: SchoolProgram) => formatMoney(program.medianDebt!) },
    { title: 'Most graduates', programs: lists.bySize, value: (program: SchoolProgram) => formatGraduatesPerYear(program.graduatesPerYear!) },
  ].filter((list) => list.programs.length > 0)
  if (shown.length === 0) return null
  return (
    <PageSection name="short-lists" title={shortListsTitle(level, shortName, lists)}>
      <p>{shortListsIntro(lists)}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((list) => (
          <RankedList
            key={list.title}
            title={list.title}
            entries={list.programs.map((program): RankedEntry => ({ key: program.cipCode, name: program.name, href: program.href, value: list.value(program) }))}
          />
        ))}
      </div>
    </PageSection>
  )
}
