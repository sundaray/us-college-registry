import { Link } from '@tanstack/react-router'

// A card link to a school page, styled like RelatedRankingLink.
export function RelatedSchoolLink({ schoolSlug, title, detail }: { schoolSlug: string; title: string; detail: string }) {
  return (
    <Link
      to="/schools/$schoolSlug"
      params={{ schoolSlug }}
      className="block rounded-lg bg-card px-3.5 py-3 text-[15px] leading-snug font-semibold ring-1 ring-foreground/10 hover:ring-primary"
    >
      {title}
      <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">{detail}</span>
    </Link>
  )
}
