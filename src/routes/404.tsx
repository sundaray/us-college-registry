import { createFileRoute } from '@tanstack/react-router'
import { NotFoundPage } from '@/components/not-found-page'
import { SITE_NAME } from '@/lib/site-copy'

// The "not found" page as a file. A full build writes this route to 404.html,
// and Cloudflare answers every address the site doesn't have with that file and
// a 404 status. The address /404 itself answers 200, so the page asks search
// engines not to index it, and vite.config.ts keeps it out of the sitemap.
export const Route = createFileRoute('/404')({
  head: () => ({
    meta: [{ title: `Page not found: ${SITE_NAME.start} ${SITE_NAME.end}` }, { name: 'robots', content: 'noindex' }],
  }),
  component: NotFoundPage,
})
