import { Link } from '@tanstack/react-router'
import { SITE_NAME } from '@/lib/site-copy'

export function SiteHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-4 px-5 py-3.5">
        <Link to="/" className="text-[17px] font-extrabold tracking-tight text-foreground">
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

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-14 max-w-3xl border-t px-5 pt-5 pb-16 text-[13px] text-muted-foreground">
      {SITE_NAME.start} {SITE_NAME.end} is an independent site built from public U.S. government data. It is
      not affiliated with any school or government agency.
    </footer>
  )
}
