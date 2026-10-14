import { RELATED_LINK, RelatedLinkText } from '@/components/page-blocks'
import { ProgramLink } from '@/components/program/program-link'

// A link to another program page among a page's related links.
export function RelatedProgramLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <ProgramLink href={href} className={RELATED_LINK}>
      <RelatedLinkText title={title} detail={detail} />
    </ProgramLink>
  )
}
