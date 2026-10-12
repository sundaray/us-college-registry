import { Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/page-blocks'
import type { NationalProgramPage } from '@/data/national-program-page'
import { buildNationalTitle, programLabel } from '@/lib/national-program-copy'

// The band at the top of a national program page: Home, Programs, then the program.
export function NationalProgramHeader({ page }: { page: NationalProgramPage }) {
  return (
    <PageHeader
      trail={[{ label: 'Home', link: <Link to="/" /> }, { label: 'Programs', link: <Link to="/programs" /> }, { label: programLabel(page) }]}
      title={buildNationalTitle(page)}
    />
  )
}
