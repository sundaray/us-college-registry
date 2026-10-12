import { createFileRoute } from '@tanstack/react-router'
import { ListIcon } from 'lucide-react'
import { Note, PageSection } from '@/components/page-blocks'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { ListedProgramTable } from '@/components/site/listed-program-table'
import { ListPageHeader } from '@/components/site/list-page-header'
import { getProgramsListPage } from '@/data/get-site-pages'
import { comparisonNote } from '@/lib/field-notes'
import { formatCount } from '@/lib/format'
import { canonicalLink } from '@/lib/site'
import { buildProgramsListDescription, buildProgramsListTitle, programsListCount } from '@/lib/site-copy'

// The index route matches /programs exactly; national program pages are its
// children at /programs/{program}.
export const Route = createFileRoute('/programs/')({
  loader: () => getProgramsListPage(),
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return {
      links: [canonicalLink('/programs')],
      meta: [{ title: buildProgramsListTitle() }, { name: 'description', content: buildProgramsListDescription(loaderData) }],
    }
  },
  component: ProgramsListView,
})

function ProgramsListView() {
  const page = Route.useLoaderData()
  return (
    <div className="min-h-screen bg-muted/40 text-pretty">
      <SiteHeader />
      <main>
        <ListPageHeader
          crumb="Programs"
          title={buildProgramsListTitle()}
          facts={[{ icon: <ListIcon aria-hidden />, text: `${formatCount(programsListCount(page))} types of programs` }]}
        />
        <div className="mx-auto max-w-3xl px-5">
          <p data-section="intro" className="mt-9 max-w-[66ch]">
            Each row groups programs in the same subject. Pay and debt figures are national medians across those
            programs. Select a subject to compare individual college programs.
          </p>
          {page.levels.map((level) => {
            const notes = [...new Set(level.programs.flatMap((program) => comparisonNote(program.cipCode, program.credentialLevel) ?? []))]
            return (
              <PageSection
                key={level.credentialLevel}
                name={`programs-${level.credentialLevel}`}
                title={`${level.credential} programs`}
              >
                <ListedProgramTable programs={level.programs} />
                {notes.map((note) => (
                  <Note key={note}>{note}</Note>
                ))}
              </PageSection>
            )
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
