import { Link } from '@tanstack/react-router'
import { RELATED_LINK, RelatedLinkText } from '@/components/page-blocks'

// A link to a school page among a page's related links.
export function RelatedSchoolLink({ schoolSlug, title, detail }: { schoolSlug: string; title: string; detail: string }) {
  return (
    <Link to="/schools/$schoolSlug" params={{ schoolSlug }} className={RELATED_LINK}>
      <RelatedLinkText title={title} detail={detail} />
    </Link>
  )
}
