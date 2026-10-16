import { createFileRoute } from '@tanstack/react-router'
import { ComparePage } from '@/components/compare/compare-page'
import { canonicalLink } from '@/lib/site'
import { buildCompareDescription, buildCompareTitle } from '@/lib/site-copy'

// The compare page. It is one prerendered page: the lists and every program's
// figures load in the browser, from files the build already writes (the site
// search's index and each program page's record).
export const Route = createFileRoute('/programs/compare')({
  head: () => ({
    links: [canonicalLink('/programs/compare')],
    meta: [{ title: buildCompareTitle() }, { name: 'description', content: buildCompareDescription() }],
  }),
  component: () => <ComparePage />,
})
