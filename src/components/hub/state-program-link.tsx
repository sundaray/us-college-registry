import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { RELATED_LINK, RelatedLinkText } from '@/components/page-blocks'

// Links to a ranking page from its stored URL ("/states/{state}/{program}").
export function StateProgramLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const [, , stateSlug, programSlug] = href.split('/')
  return (
    <Link to="/states/$stateSlug/$programSlug" params={{ stateSlug, programSlug }} className={className}>
      {children}
    </Link>
  )
}

// A link to a ranking page among a page's related links.
export function RelatedRankingLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <StateProgramLink href={href} className={RELATED_LINK}>
      <RelatedLinkText title={title} detail={detail} />
    </StateProgramLink>
  )
}
