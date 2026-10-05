import { Link } from '@tanstack/react-router'
import { DatabaseIcon } from 'lucide-react'
import { SlashIcon } from '@/components/slash-icon'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import type { OccupationPage } from '@/data/occupation-page'
import { formatCount } from '@/lib/format'
import { buildOccupationTitle } from '@/lib/occupation-copy'

// The tinted band at the top of an occupation page, matching the other pages.
export function OccupationHeader({ page }: { page: OccupationPage }) {
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
              <BreadcrumbLink render={<Link to="/careers" />} className="underline underline-offset-3 hover:text-foreground">
                Careers
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-muted-foreground">{page.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[clamp(28px,5vw,40px)] leading-tight font-extrabold tracking-tight text-balance">{buildOccupationTitle(page)}</h1>

        <ul className="flex flex-wrap gap-x-5.5 gap-y-1.5 text-[15px] text-muted-foreground [&>li]:inline-flex [&>li]:items-center [&>li]:gap-2 [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:bg-primary [&>li]:before:content-['']">
          {page.national.employment !== undefined ? <li className="tabular-nums">{formatCount(page.national.employment)} jobs in the US</li> : null}
          {page.typicalEducation ? (
            <li>
              Typical education to start: {page.typicalEducation.charAt(0).toLowerCase()}
              {page.typicalEducation.slice(1)}
            </li>
          ) : null}
          {/* data-name: the code and BLS title are labels, not figures. */}
          <li data-name="">
            {page.name === page.title ? `Occupation code ${page.socCode}` : `BLS title: ${page.title} (${page.socCode})`}
          </li>
        </ul>

        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground [&>svg]:size-3.5">
          <DatabaseIcon aria-hidden />
          BLS wages May 2025 · BLS projections 2025 to 2035 · BEA price parities 2024
        </p>
      </div>
    </div>
  )
}
