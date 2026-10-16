import { Link } from '@tanstack/react-router'
import { PAGE_TOP_ID } from '@/components/back-to-top'
import { SearchButton } from '@/components/search/search-button'
import { SITE_NAME } from '@/lib/site-copy'

// The bar at the top of every page. From xl up it has the width of the two-column
// pages on every page, which keeps the logo in one place as a visitor moves around.
// `search` is false only on the "not found" page: Cloudflare serves that page
// without the app's scripts, and a Search button there could not open anything.
export function SiteHeader({ search = true }: { search?: boolean }) {
  return (
    <header className="reveal-edge-on-scroll sticky top-0 z-20 border-b bg-card">
      <div className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-5 py-3.5 sm:gap-4 xl:max-w-6xl">
        <Link id={PAGE_TOP_ID} to="/" className="text-lg font-extrabold tracking-tight text-foreground">
          {SITE_NAME.start} <span className="text-primary">{SITE_NAME.end}</span>
        </Link>
        {/* Search sits after the links: it opens a dialog and leads to no page of its own.
            On a phone the four links do not fit beside it. Search then sits beside
            the site's name, and the links take the line under them. */}
        <div className="contents sm:flex sm:flex-wrap sm:items-center sm:gap-5">
          <nav aria-label="Main" className="order-last flex w-full flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground sm:order-none sm:w-auto sm:gap-5">
            <Link to="/programs" className="hover:text-foreground">Programs</Link>
            <Link to="/schools" className="hover:text-foreground">Schools</Link>
            <Link to="/careers" className="hover:text-foreground">Careers</Link>
            <Link to="/programs/compare" className="hover:text-foreground">Compare programs</Link>
          </nav>
          {search ? <SearchButton /> : null}
        </div>
      </div>
    </header>
  )
}

// The band at the bottom of every page. Each page is a column (PAGE_CLASS_NAME)
// whose main part grows (MAIN_CLASS_NAME), so on a short page the band still
// sits at the bottom of the window.
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card px-5 py-8">
      <p className="mx-auto max-w-[62ch] text-center text-base text-balance text-muted-foreground">
        {SITE_NAME.start} {SITE_NAME.end} is an independent site built from public U.S. government data. It is not
        affiliated with any school or government agency.
      </p>
    </footer>
  )
}

// The classes of every page's outer element and of its <main>.
export const PAGE_CLASS_NAME = 'flex min-h-screen flex-col bg-muted/40 text-pretty'
export const MAIN_CLASS_NAME = 'flex-1'
