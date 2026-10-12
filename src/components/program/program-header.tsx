import { Link } from '@tanstack/react-router'
import { Building2Icon, MapPinIcon, UsersIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-blocks'
import type { HeaderFact } from '@/components/page-blocks'
import type { ProgramPage } from '@/data/program-page'
import { hasSchoolPage } from '@/data/school-page'
import { formatCount } from '@/lib/format'
import { buildPageTitle } from '@/lib/program-copy'
import { institutionKind } from '@/lib/school-copy'

// The band at the top of a program page: Home, the state, the school, then the
// program, and three facts that say which school this is. The school step is a
// link only when the school has its own page.
export function ProgramHeader({ page }: { page: ProgramPage }) {
  const { school, program } = page
  const facts: HeaderFact[] = [
    { icon: <Building2Icon aria-hidden />, text: institutionKind(school) },
    { icon: <MapPinIcon aria-hidden />, text: `${school.city}, ${school.state}` },
    ...(program.graduatesPerYear
      ? [{ icon: <UsersIcon aria-hidden />, text: `About ${formatCount(program.graduatesPerYear)} graduates a year` }]
      : []),
  ]

  return (
    <PageHeader
      trail={[
        { label: 'Home', link: <Link to="/" /> },
        { label: school.stateName, link: <Link to="/states/$stateSlug" params={{ stateSlug: school.stateSlug }} /> },
        {
          label: school.shortName,
          link: hasSchoolPage(page.schoolProgramTotal) ? <Link to="/schools/$schoolSlug" params={{ schoolSlug: page.schoolSlug }} /> : undefined,
        },
        { label: `${program.name} (${program.degreeAbbreviation ?? program.credential})` },
      ]}
      title={buildPageTitle(page)}
      facts={facts}
      wide
    />
  )
}
