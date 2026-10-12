import { Link } from '@tanstack/react-router'
import { Building2Icon, GraduationCapIcon, MapPinIcon, UsersIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-blocks'
import type { HeaderFact } from '@/components/page-blocks'
import type { SchoolPage } from '@/data/school-page'
import { formatCount } from '@/lib/format'
import { buildSchoolTitle, institutionKind } from '@/lib/school-copy'

// The band at the top of a school page: Home, the state, then the school, and
// the facts that say which school this is. The official name is listed only
// when the page title uses a shorter one.
export function SchoolHeader({ page }: { page: SchoolPage }) {
  const { school } = page
  const facts: HeaderFact[] = [
    ...(school.name !== school.shortName ? [{ icon: <GraduationCapIcon aria-hidden />, text: school.name }] : []),
    { icon: <Building2Icon aria-hidden />, text: institutionKind(school) },
    { icon: <MapPinIcon aria-hidden />, text: `${school.city}, ${school.state}` },
    ...(school.undergraduates !== undefined
      ? [{ icon: <UsersIcon aria-hidden />, text: `${formatCount(school.undergraduates)} undergraduates` }]
      : []),
  ]

  return (
    <PageHeader
      trail={[
        { label: 'Home', link: <Link to="/" /> },
        { label: school.stateName, link: <Link to="/states/$stateSlug" params={{ stateSlug: school.stateSlug }} /> },
        { label: school.shortName },
      ]}
      title={buildSchoolTitle(page)}
      facts={facts}
    />
  )
}
