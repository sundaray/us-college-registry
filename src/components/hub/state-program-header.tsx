import { Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/page-blocks'
import type { StateProgramPage } from '@/data/state-program-page'
import { buildStateProgramTitle, degreeLabel } from '@/lib/state-program-copy'

// The band at the top of a ranking page: Home, the state, then the program.
export function StateProgramHeader({ page }: { page: StateProgramPage }) {
  return (
    <PageHeader
      trail={[
        { label: 'Home', link: <Link to="/" /> },
        { label: page.state.name, link: <Link to="/states/$stateSlug" params={{ stateSlug: page.stateSlug }} /> },
        { label: `${page.program.name} (${degreeLabel(page)})` },
      ]}
      title={buildStateProgramTitle(page)}
      wide
    />
  )
}
