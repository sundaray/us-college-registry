import { createFileRoute } from '@tanstack/react-router'
import { OccupationHeader } from '@/components/occupation/occupation-header'
import { OccupationProgramTable } from '@/components/occupation/occupation-program-table'
import { OccupationStateTable } from '@/components/occupation/occupation-state-table'
import { answerText, KeyFigures, Note, PageSection, QuestionList, Summary } from '@/components/page-blocks'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getOccupationPage } from '@/data/get-occupation-page'
import { isGraduateLevel } from '@/data/program-page'
import { payPrivacyNote } from '@/lib/data-notes'
import {
  buildKeyFigureQuestions,
  buildOccupationDescription,
  buildOccupationFaq,
  buildOccupationKeyFigures,
  buildOccupationSummary,
  buildOccupationTitle,
  buildStateNotes,
  relatedProgramsIntro,
} from '@/lib/occupation-copy'
import { canonicalLink } from '@/lib/site'

export const Route = createFileRoute('/careers/$careerSlug')({
  loader: async ({ params }) => {
    const page = await getOccupationPage({ data: params })
    return { page, figureQuestions: buildKeyFigureQuestions(page), faq: buildOccupationFaq(page) }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { page, figureQuestions, faq } = loaderData
    return {
      links: [canonicalLink(`/careers/${params.careerSlug}`)],
      meta: [
        { title: buildOccupationTitle(page) },
        { name: 'description', content: buildOccupationDescription(page) },
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
  component: OccupationPageView,
})

function OccupationPageView() {
  const { page, figureQuestions, faq } = Route.useLoaderData()
  const stateNotes = buildStateNotes(page)

  return (
    <div className={PAGE_CLASS_NAME}>
      <SiteHeader />
      {/* The key gives each career's page its own state. Without it, a link from one
          career page to another keeps the tables' sort and page number and the open
          questions. data-soc lets scripts/verify find the occupation. */}
      <main className={MAIN_CLASS_NAME} key={page.careerSlug} data-soc={page.socCode}>
        <OccupationHeader page={page} />
        <div className="mx-auto max-w-3xl px-5">
          <Summary paragraphs={buildOccupationSummary(page)} />

          <KeyFigures figures={buildOccupationKeyFigures(page)} />
          <QuestionList name="figures" section="key-figure-questions" questions={figureQuestions} className="mt-3" />

          {page.states.length > 0 ? (
            <PageSection name="states" title={`Pay for ${page.sentenceName} by state`}>
              <p>
                Each figure is the median pay for {page.sentenceName} in that state, across all experience levels. "After
                prices" divides it by the state's price level, where the US average is 100. That shows what the pay buys
                in each state.
              </p>
              <OccupationStateTable states={page.states} />
              {stateNotes.map((note) => (
                <Note key={note}>{note}</Note>
              ))}
            </PageSection>
          ) : null}

          <PageSection name="programs" title="Related programs">
            {relatedProgramsIntro(page).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <OccupationProgramTable programs={page.programs} />
            <Note>
              Each figure is the median across that kind of program in the US. Program names link to the national ranking.
              Program figures are first-year pay for new graduates. The job's median pay covers every experience level.
            </Note>
            {/* A master's debt figure counts less than the others in the table, and the page says so. */}
            {page.programs.some((program) => isGraduateLevel(program.credentialLevel)) ? (
              <Note>
                Debt for a master's program counts only the federal loans its graduates took for graduate study at that
                school. Undergraduate loans and loans taken at other schools are not counted.
              </Note>
            ) : null}
          </PageSection>

          <PageSection name="faq" title="Common questions">
            <QuestionList name="faq" questions={faq} openFirst />
          </PageSection>

          <PageSection name="about-data" title="About this data">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              {/* data-name: the official title and its code are labels, not figures. */}
              <li data-name="">
                This page covers the job the Bureau of Labor Statistics calls "{page.title}" (occupation code {page.socCode}).
              </li>
              <li>Pay is from the Bureau of Labor Statistics Occupational Employment and Wage Statistics for May 2025. It covers all experience levels. It leaves out people who work on farms, in private households or for themselves.</li>
              <li>Projections are the Bureau of Labor Statistics Employment Projections for 2025 to 2035, for the whole US.</li>
              <li>Price levels are the Bureau of Economic Analysis Regional Price Parities for 2024.</li>
              <li>Program figures are College Scorecard medians across programs, and they only include students who received federal financial aid.</li>
              <li>{payPrivacyNote("each program's pay figure")}</li>
            </ul>
            <h3 className="text-base font-bold">Sources</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025</li>
              <li>Bureau of Labor Statistics, Employment Projections 2025 to 2035</li>
              <li>Bureau of Economic Analysis, Regional Price Parities, 2024</li>
              <li>NCES, CIP 2020 to SOC 2018 crosswalk</li>
              <li>U.S. Department of Education, College Scorecard, field of study files, June 2026 release</li>
            </ol>
          </PageSection>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
