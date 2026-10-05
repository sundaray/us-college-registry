import type { ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { NationalProgramLink } from '@/components/national/national-program-link'
import { Note, Section } from '@/components/page-sections'
import { ProgramLink } from '@/components/program/program-link'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { Card } from '@/components/ui/card'
import { getHomePage } from '@/data/get-site-pages'
import type { ListedCareer, ListedProgram } from '@/data/site-pages'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount, formatMoney } from '@/lib/format'
import { buildHomeDescription, buildHomeTitle } from '@/lib/site-copy'

// The approved reference program page, used as the example of what a program is.
const EXAMPLE_PROGRAM_HREF = '/schools/university-of-texas-at-austin/nursing-bachelors'

export const Route = createFileRoute('/')({
  loader: () => getHomePage(),
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return {
      meta: [{ title: buildHomeTitle() }, { name: 'description', content: buildHomeDescription(loaderData) }],
    }
  },
  component: Home,
})

function Home() {
  const page = Route.useLoaderData()
  const { counts } = page
  const notes = [
    ...new Set(
      [...page.commonPrograms, ...page.topPayingBachelors].flatMap((program) => comparisonNote(program.cipCode, program.credentialLevel) ?? []),
    ),
  ]

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main>
        <div data-section="header" className="border-b border-primary/12 bg-primary/6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 pt-10 pb-9.5">
            <h1 className="text-[clamp(32px,6vw,48px)] leading-tight font-extrabold tracking-tight text-balance">{buildHomeTitle()}</h1>
            <p className="max-w-[60ch] text-lg leading-relaxed">
              Look up programs at US colleges, universities, and trade schools by state, by field, or by the career they
              lead to. For each one, see what graduates earn one and five years after finishing, how much federal student
              debt they leave with, and how it ranks in its state. Every figure comes from U.S. Department of Education
              and Bureau of Labor Statistics data.
            </p>
            <p className="max-w-[60ch] text-[15px] text-muted-foreground">
              A program is one degree or certificate at one school, for example the{' '}
              <ProgramLink href={EXAMPLE_PROGRAM_HREF} className="font-semibold text-primary underline underline-offset-3">
                nursing bachelor's degree at UT Austin
              </ProgramLink>
              .
            </p>
            <div className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border md:grid-cols-4">
              <Count value={counts.programPages} label="program pages" />
              <Count value={counts.schoolPages} label="school pages" />
              <Count value={counts.stateRankings} label="state rankings" />
              <Count value={counts.careers} label="careers" />
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-5">
          <Section name="states" title="Browse by state">
            <p>Each state page ranks its fields by graduate pay and lists every school with a program page.</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
              {page.states.map((state) => (
                <li key={state.href}>
                  <Link to="/states/$stateSlug" params={{ stateSlug: state.href.split('/')[2] }} className="text-[15px] text-primary underline underline-offset-3">
                    {state.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section name="fields" title="Browse by field">
            <p>Each field's page ranks every state by graduate pay and debt, and lists the top programs nationwide.</p>
            <div className="grid gap-3.5 md:grid-cols-2">
              <ListCard title="Most common programs" subtitle="Median first-year pay across US programs" more={<AllProgramsLink count={counts.nationalPrograms} />}>
                {page.commonPrograms.map((program) => (
                  <ProgramRow key={program.href} program={program} />
                ))}
              </ListCard>
              <ListCard title="Highest-paying bachelor's fields" subtitle="Median first-year pay across US programs" more={<AllProgramsLink count={counts.nationalPrograms} />}>
                {page.topPayingBachelors.map((program) => (
                  <ProgramRow key={program.href} program={program} />
                ))}
              </ListCard>
            </div>
            {notes.map((note) => (
              <Note key={note}>{note}</Note>
            ))}
          </Section>

          <Section name="careers" title="Browse by career">
            <p>Each career's page shows pay in every state, adjusted for prices, and the programs that lead there.</p>
            <ListCard
              title="Careers with the most jobs"
              subtitle="Median pay across all experience levels, May 2025"
              more={
                <Link to="/careers" className="text-sm font-semibold text-primary underline underline-offset-3">
                  See all {formatCount(counts.careers)} careers
                </Link>
              }
            >
              {page.largestCareers.map((career) => (
                <CareerRow key={career.href} career={career} />
              ))}
            </ListCard>
          </Section>

          <Section name="sources" title="Where the numbers come from">
            <ul className="flex max-w-[66ch] list-disc flex-col gap-2 pl-5">
              <li>Graduate pay and debt: U.S. Department of Education, College Scorecard, June 2026 release.</li>
              <li>Job pay and job counts: Bureau of Labor Statistics, May 2025. Job growth: Bureau of Labor Statistics projections for 2025 to 2035.</li>
              <li>Price levels by state: Bureau of Economic Analysis, 2024.</li>
              <li>Every number on the site is computed from these files, and a separate program checks each page against them before it is published.</li>
            </ul>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-4 py-3.5">
      <span className="text-2xl font-extrabold tracking-tight tabular-nums">{formatCount(value)}</span>
      <span className="text-[13px] text-muted-foreground">{label}</span>
    </div>
  )
}

function ListCard({ title, subtitle, more, children }: { title: string; subtitle: string; more: ReactNode; children: ReactNode }) {
  return (
    <Card size="sm" className="gap-0 px-4 py-1">
      <h3 className="mt-3 text-base font-bold">{title}</h3>
      <p className="mb-1.5 text-[13px] text-muted-foreground">{subtitle}</p>
      <ol>{children}</ol>
      <div className="my-3">{more}</div>
    </Card>
  )
}

function AllProgramsLink({ count }: { count: number }) {
  return (
    <Link to="/programs" className="text-sm font-semibold text-primary underline underline-offset-3">
      See all {formatCount(count)} programs
    </Link>
  )
}

function ListRow({ name, detail, value }: { name: ReactNode; detail: string; value: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t py-2.5 text-[15px]">
      <span data-name="">{name}</span>
      <span className="row-span-2 self-center font-bold tabular-nums">{value}</span>
      <span className="text-[13px] text-muted-foreground tabular-nums">{detail}</span>
    </li>
  )
}

function ProgramRow({ program }: { program: ListedProgram }) {
  return (
    <ListRow
      name={
        <NationalProgramLink href={program.href} className="font-semibold text-primary underline underline-offset-3">
          {program.label}
        </NationalProgramLink>
      }
      detail={`${formatCount(program.programCount)} programs`}
      value={formatMoney(program.earningsYear1)}
    />
  )
}

function CareerRow({ career }: { career: ListedCareer }) {
  return (
    <ListRow
      name={
        <Link to="/careers/$careerSlug" params={{ careerSlug: career.href.split('/')[2] }} className="font-semibold text-primary underline underline-offset-3">
          {career.name}
        </Link>
      }
      detail={career.employment !== undefined ? `${formatCount(career.employment)} jobs` : 'Jobs not reported'}
      value={formatMoney(career.medianPay)}
    />
  )
}
