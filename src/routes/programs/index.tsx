import { createFileRoute } from '@tanstack/react-router'
import { Note, Section } from '@/components/page-sections'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { ListedProgramTable } from '@/components/site/listed-program-table'
import { ListPageHeader } from '@/components/site/list-page-header'
import { getProgramsListPage } from '@/data/get-site-pages'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount } from '@/lib/format'
import { buildProgramsListDescription, buildProgramsListTitle, programsListCount } from '@/lib/site-copy'

// The index route matches /programs exactly; national program pages are its
// children at /programs/{program}.
export const Route = createFileRoute('/programs/')({
  loader: () => getProgramsListPage(),
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return {
      meta: [{ title: buildProgramsListTitle() }, { name: 'description', content: buildProgramsListDescription(loaderData) }],
    }
  },
  component: ProgramsListView,
})

function ProgramsListView() {
  const page = Route.useLoaderData()
  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main>
        <ListPageHeader
          crumb="Programs"
          title={buildProgramsListTitle()}
          facts={[`${formatCount(programsListCount(page))} kinds of programs`, "Bachelor's degrees, associate's degrees, and certificates"]}
          source="College Scorecard June 2026 release"
        />
        <div className="mx-auto max-w-3xl px-5">
          <p className="mt-7 max-w-[66ch]">
            Each row is one field and credential. Figures are medians across that field's programs in the US. Names link
            to the field's national ranking, which links on to every state.
          </p>
          {page.levels.map((level) => {
            const notes = [...new Set(level.programs.flatMap((program) => comparisonNote(program.cipCode, program.credentialLevel) ?? []))]
            return (
              <Section key={level.credentialLevel} name={`programs-${level.credentialLevel}`} title={`${level.credential} programs`}>
                <ListedProgramTable programs={level.programs} />
                {notes.map((note) => (
                  <Note key={note}>{note}</Note>
                ))}
              </Section>
            )
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
