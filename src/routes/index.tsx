import { createFileRoute, Link } from '@tanstack/react-router'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { listProgramPages } from '@/data/programs'
import { formatMoney } from '@/lib/format'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const pages = listProgramPages()

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pt-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">What graduates earn, program by program</h1>
          <p className="max-w-[60ch] text-muted-foreground">
            Earnings, debt, and career outcomes for college programs, built from public U.S. government data.
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {pages.map((page) => (
            <li key={`${page.schoolSlug}/${page.programSlug}`}>
              <Link
                to="/schools/$schoolSlug/$programSlug"
                params={{ schoolSlug: page.schoolSlug, programSlug: page.programSlug }}
                className="block rounded-lg bg-card px-4 py-3.5 ring-1 ring-foreground/10 hover:ring-primary"
              >
                <span className="font-semibold">
                  {page.program.name} ({page.program.credential}) at {page.school.name}
                </span>
                <span className="block text-sm text-muted-foreground tabular-nums">
                  {formatMoney(page.earnings.year1)} first-year earnings · {formatMoney(page.debt.median)} median debt
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  )
}
