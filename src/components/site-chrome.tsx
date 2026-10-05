import { Link } from '@tanstack/react-router'

export function SiteHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-4 px-5 py-3.5">
        <Link to="/" className="text-[17px] font-extrabold tracking-tight text-foreground">
          Degree<span className="text-primary">Ledger</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-5 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Programs</Link>
          <Link to="/" className="hover:text-foreground">Schools</Link>
          <Link to="/" className="hover:text-foreground">Careers</Link>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-14 max-w-3xl border-t px-5 pt-5 pb-16 text-[13px] text-muted-foreground">
      DegreeLedger is an independent site built from public U.S. government data. It is not
      affiliated with any school or government agency.
    </footer>
  )
}
