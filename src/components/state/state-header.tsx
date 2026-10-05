import { Link } from '@tanstack/react-router'
import { DatabaseIcon } from 'lucide-react'
import { SlashIcon } from '@/components/slash-icon'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import type { StatePage } from '@/data/state-page'
import { formatCount } from '@/lib/format'
import { buildStateTitle, fieldCount } from '@/lib/state-copy'

// The tinted band at the top of a state page, matching the other pages.
export function StateHeader({ page }: { page: StatePage }) {
  const rankings = fieldCount(page)
  return (
    <div data-section="header" className="border-b border-primary/12 bg-primary/6">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 pt-6.5 pb-7.5">
        <Breadcrumb>
          <BreadcrumbList className="gap-1 text-[13px] sm:gap-1.5">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/" />} className="underline underline-offset-3 hover:text-foreground">
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-muted-foreground">{page.state.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[clamp(28px,5vw,40px)] leading-tight font-extrabold tracking-tight text-balance">{buildStateTitle(page)}</h1>

        <ul className="flex flex-wrap gap-x-5.5 gap-y-1.5 text-[15px] text-muted-foreground tabular-nums [&>li]:inline-flex [&>li]:items-center [&>li]:gap-2 [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:bg-primary [&>li]:before:content-['']">
          <li>{formatCount(page.programCount)} programs report first-year pay</li>
          <li>
            {formatCount(page.schools.length)} {page.schools.length === 1 ? 'school' : 'schools'} with program pages
          </li>
          <li>
            {formatCount(rankings)} field {rankings === 1 ? 'ranking' : 'rankings'}
          </li>
        </ul>

        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground [&>svg]:size-3.5">
          <DatabaseIcon aria-hidden />
          College Scorecard June 2026 release{page.priceIndex !== undefined ? ' · BEA price parities 2024' : ''}
        </p>
      </div>
    </div>
  )
}
