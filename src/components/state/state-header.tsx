import { Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/page-blocks'
import type { StatePage } from '@/data/state-page'
import { buildStateTitle } from '@/lib/state-copy'

// The band at the top of a state page: Home, then the state. It has no facts
// under the title: the counts it used to show are the page's own section titles.
export function StateHeader({ page }: { page: StatePage }) {
  return <PageHeader trail={[{ label: 'Home', link: <Link to="/" /> }, { label: page.state.name }]} title={buildStateTitle(page)} />
}
