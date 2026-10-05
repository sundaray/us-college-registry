import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

// Links to another program page from its stored URL ("/schools/{school}/{program}").
export function ProgramLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const [, , schoolSlug, programSlug] = href.split('/')
  return (
    <Link to="/schools/$schoolSlug/$programSlug" params={{ schoolSlug, programSlug }} className={className}>
      {children}
    </Link>
  )
}
