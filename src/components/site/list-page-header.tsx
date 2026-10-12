import { Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/page-blocks'
import type { HeaderFact } from '@/components/page-blocks'

// The band at the top of the navbar's list pages: Home, then the list, and the
// counts that say how much the list holds.
export function ListPageHeader({ crumb, title, facts, source }: { crumb: string; title: string; facts: HeaderFact[]; source?: string }) {
  return <PageHeader trail={[{ label: 'Home', link: <Link to="/" /> }, { label: crumb }]} title={title} facts={facts} source={source} />
}
