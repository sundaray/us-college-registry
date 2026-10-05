import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

// Links to a ranking page from its stored URL ("/states/{state}/{program}").
export function StateProgramLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const [, , stateSlug, programSlug] = href.split('/')
  return (
    <Link to="/states/$stateSlug/$programSlug" params={{ stateSlug, programSlug }} className={className}>
      {children}
    </Link>
  )
}

// A card link to a ranking page, as in the "Related pages" sections.
export function RelatedRankingLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <StateProgramLink href={href} className="block rounded-lg bg-card px-3.5 py-3 text-[15px] leading-snug font-semibold ring-1 ring-foreground/10 hover:ring-primary">
      {title}
      <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">{detail}</span>
    </StateProgramLink>
  )
}
