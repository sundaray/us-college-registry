import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { RELATED_LINK, RelatedLinkText } from '@/components/page-blocks'

// Links to a national program page from its stored URL ("/programs/{program}").
export function NationalProgramLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const [, , programSlug] = href.split('/')
  return (
    <Link to="/programs/$programSlug" params={{ programSlug }} className={className}>
      {children}
    </Link>
  )
}

// A link to a national program page among a page's related links.
export function RelatedNationalLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <NationalProgramLink href={href} className={RELATED_LINK}>
      <RelatedLinkText title={title} detail={detail} />
    </NationalProgramLink>
  )
}
