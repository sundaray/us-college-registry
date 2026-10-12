import { Link } from '@tanstack/react-router'
import { SITE_NAME } from '@/lib/site-copy'
import { cn } from '@/lib/utils'

// The bar at the top of every page. From xl up it has the width of the two-column
// pages on every page, which keeps the logo in one place as a visitor moves around.
export function SiteHeader() {
  return (
    <header className="reveal-edge-on-scroll sticky top-0 z-20 border-b bg-card">
      <div className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-4 px-5 py-3.5 xl:max-w-6xl">
        <Link to="/" className="text-lg font-extrabold tracking-tight text-foreground">
          {SITE_NAME.start} <span className="text-primary">{SITE_NAME.end}</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-5 text-sm text-muted-foreground">
          <Link to="/programs" className="hover:text-foreground">Programs</Link>
          <Link to="/schools" className="hover:text-foreground">Schools</Link>
          <Link to="/careers" className="hover:text-foreground">Careers</Link>
        </nav>
      </div>
    </header>
  )
}

// `wide` is for pages laid out with PageColumns, where the footer spans both columns.
export function SiteFooter({ wide = false }: { wide?: boolean }) {
  return (
    <footer className={cn('mx-auto mt-14 max-w-3xl border-t px-5 pt-5 pb-16 text-sm text-muted-foreground', wide && 'xl:max-w-6xl')}>
      {SITE_NAME.start} {SITE_NAME.end} is an independent site built from public U.S. government data. It is
      not affiliated with any school or government agency.
    </footer>
  )
}
