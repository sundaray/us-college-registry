import { Link } from '@tanstack/react-router'
import { BriefcaseIcon, GraduationCapIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-blocks'
import type { HeaderFact } from '@/components/page-blocks'
import type { OccupationPage } from '@/data/occupation-page'
import { formatCount } from '@/lib/format'
import { educationNeeded } from '@/lib/job-copy'
import { buildOccupationTitle } from '@/lib/occupation-copy'
import { LABOR_SOURCE_LINE } from '@/lib/site-copy'

// The band at the top of a career page: Home, Careers, then the job, and two
// facts that say how large the job is and what it takes to start. The official
// title and code are in "About this data".
export function OccupationHeader({ page }: { page: OccupationPage }) {
  // Everyone in the job. The pay survey's own count is under the median pay figure.
  const jobCount = page.national.allJobs ?? page.national.employment
  const facts: HeaderFact[] = [
    ...(jobCount !== undefined ? [{ icon: <BriefcaseIcon aria-hidden />, text: `${formatCount(jobCount)} jobs in the US` }] : []),
    ...(page.typicalEducation
      ? [{ icon: <GraduationCapIcon aria-hidden />, text: `Typically needs ${educationNeeded(page.typicalEducation)} to start` }]
      : []),
  ]
  return (
    <PageHeader
      trail={[{ label: 'Home', link: <Link to="/" /> }, { label: 'Careers', link: <Link to="/careers" /> }, { label: page.name }]}
      title={buildOccupationTitle(page)}
      facts={facts}
      source={LABOR_SOURCE_LINE}
    />
  )
}
