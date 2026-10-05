import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2Icon, DatabaseIcon, GraduationCapIcon, MapPinIcon, UsersIcon } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SlashIcon } from '@/components/slash-icon'
import type { ProgramPage } from '@/data/program-page'
import { hasSchoolPage } from '@/data/school-page'
import { formatCount } from '@/lib/format'
import { buildPageTitle } from '@/lib/program-copy'
import { institutionKind } from '@/lib/school-copy'

const LINK_CLASS_NAME = 'underline underline-offset-3 hover:text-foreground'

export const DATA_SOURCES_LABEL = 'College Scorecard June 2026 release · BLS wages May 2025'

// The tinted band at the top of a program page: breadcrumb, title, and the
// basic facts that say which program and school the page is about.
export function ProgramHeader({ page }: { page: ProgramPage }) {
  const { school, program } = page

  return (
    <div data-section="header" className="border-b border-primary/12 bg-primary/6">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 pt-6.5 pb-7.5">
        <Breadcrumb>
          <BreadcrumbList className="gap-1 text-[13px] sm:gap-1.5">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/" />} className={LINK_CLASS_NAME}>
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={<Link to="/states/$stateSlug" params={{ stateSlug: school.stateSlug }} />}
                className={LINK_CLASS_NAME}
              >
                {school.stateName}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              {hasSchoolPage(page.schoolProgramTotal) ? (
                <BreadcrumbLink
                  render={<Link to="/schools/$schoolSlug" params={{ schoolSlug: page.schoolSlug }} />}
                  className={LINK_CLASS_NAME}
                >
                  {school.shortName}
                </BreadcrumbLink>
              ) : (
                school.shortName
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-muted-foreground">
                {program.name} ({program.degreeAbbreviation ?? program.credential})
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[clamp(28px,5vw,40px)] leading-tight font-extrabold tracking-tight text-balance">
          {buildPageTitle(page)}
        </h1>

        <ul className="flex flex-wrap gap-x-5.5 gap-y-1.5 text-[15px] text-muted-foreground">
          <HeaderFact icon={<GraduationCapIcon />}>
            {program.credential} in {program.fullTitle}
          </HeaderFact>
          <HeaderFact icon={<Building2Icon />}>{institutionKind(school)}</HeaderFact>
          <HeaderFact icon={<MapPinIcon />}>
            {school.city}, {school.state}
          </HeaderFact>
          {program.graduatesPerYear ? (
            <HeaderFact icon={<UsersIcon />}>
              <span className="tabular-nums">About {formatCount(program.graduatesPerYear)} graduates a year</span>
            </HeaderFact>
          ) : null}
        </ul>

        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground [&>svg]:size-3.5">
          <DatabaseIcon aria-hidden />
          {DATA_SOURCES_LABEL}
        </p>
      </div>
    </div>
  )
}

function HeaderFact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-primary">
      {icon}
      <span>{children}</span>
    </li>
  )
}
