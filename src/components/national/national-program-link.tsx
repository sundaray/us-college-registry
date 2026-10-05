import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

// Links to a national program page from its stored URL ("/programs/{program}").
export function NationalProgramLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const [, , programSlug] = href.split('/')
  return (
    <Link to="/programs/$programSlug" params={{ programSlug }} className={className}>
      {children}
    </Link>
  )
}

// A card link to a national program page, styled like RelatedRankingLink.
export function RelatedNationalLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <NationalProgramLink
      href={href}
      className="block rounded-lg bg-card px-3.5 py-3 text-[15px] leading-snug font-semibold ring-1 ring-foreground/10 hover:ring-primary"
    >
      {title}
      <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">{detail}</span>
    </NationalProgramLink>
  )
}
