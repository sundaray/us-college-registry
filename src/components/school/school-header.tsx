import { Link } from '@tanstack/react-router'
import { DatabaseIcon } from 'lucide-react'
import { SlashIcon } from '@/components/slash-icon'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { SchoolPage } from '@/data/school-page'
import { formatCount } from '@/lib/format'
import { buildSchoolTitle, institutionKind } from '@/lib/school-copy'

// The tinted band at the top of a school page, matching the program pages.
export function SchoolHeader({ page }: { page: SchoolPage }) {
  const { school } = page
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
              <BreadcrumbLink
                render={<Link to="/states/$stateSlug" params={{ stateSlug: school.stateSlug }} />}
                className="underline underline-offset-3 hover:text-foreground"
              >
                {school.stateName}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-muted-foreground">{school.shortName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[clamp(28px,5vw,40px)] leading-tight font-extrabold tracking-tight text-balance">
          {buildSchoolTitle(page)}
        </h1>

        <ul className="flex flex-wrap gap-x-5.5 gap-y-1.5 text-[15px] text-muted-foreground [&>li]:inline-flex [&>li]:items-center [&>li]:gap-2 [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:bg-primary [&>li]:before:content-['']">
          {school.name !== school.shortName ? <li>{school.name}</li> : null}
          <li>{institutionKind(school)}</li>
          <li>
            {school.city}, {school.state}
          </li>
          {school.undergraduates !== undefined ? <li className="tabular-nums">{formatCount(school.undergraduates)} undergraduates</li> : null}
        </ul>

        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground [&>svg]:size-3.5">
          <DatabaseIcon aria-hidden />
          College Scorecard June 2026 release
        </p>
      </div>
    </div>
  )
}
