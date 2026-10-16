import { Link } from '@tanstack/react-router'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { cn } from '@/lib/utils'

// What a visitor sees at an address the site doesn't have, with the same header
// and footer as every other page. The text sits in the middle of the space
// between them. Two places render it: the root route, for an address the router
// doesn't know, and the /404 route, which the build writes to 404.html for
// Cloudflare to serve with a 404 status (see alchemy.run.ts).
export function NotFoundPage() {
  return (
    <div className={PAGE_CLASS_NAME}>
      {/* No Search button and no menu: 404.html has none of the app's scripts to open them. */}
      <SiteHeader interactive={false} />
      <main className={cn(MAIN_CLASS_NAME, 'grid place-items-center px-5 py-16')}>
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight">404</h1>
          <p className="text-lg text-muted-foreground">The page you're looking for doesn't exist.</p>
          <Link to="/" className="text-base font-semibold text-primary underline underline-offset-3">
            Return Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
