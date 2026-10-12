import { Link } from '@tanstack/react-router'
import { DatabaseIcon } from 'lucide-react'
import { SlashIcon } from '@/components/slash-icon'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import type { NationalProgramPage } from '@/data/national-program-page'
import { buildNationalTitle, programLabel } from '@/lib/national-program-copy'

// Every figure in the top half of the page comes from College Scorecard. The
// careers section names its own source.
const SOURCE_LINE = "Source: the U.S. Department of Education's College Scorecard, June 2026 release"

// The tinted band at the top of a national program page: breadcrumb, title, and
// where the figures come from.
export function NationalProgramHeader({ page }: { page: NationalProgramPage }) {
  return (
    <div data-section="header" className="hero-grid border-b border-primary/12 bg-primary/6">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 pt-6.5 pb-7.5">
        <Breadcrumb>
          <BreadcrumbList className="gap-1 text-sm sm:gap-1.5">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/" />} className="underline underline-offset-3 hover:text-foreground">
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/programs" />} className="underline underline-offset-3 hover:text-foreground">
                Programs
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-muted-foreground">{programLabel(page)}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-balance md:text-4xl">{buildNationalTitle(page)}</h1>

        {/* The icon's box is one text line tall, so it sits beside the first line when the text wraps. */}
        <p className="inline-flex items-start gap-1.5 text-sm text-muted-foreground [&>svg]:h-lh [&>svg]:w-3.5 [&>svg]:shrink-0">
          <DatabaseIcon aria-hidden />
          {SOURCE_LINE}
        </p>
      </div>
    </div>
  )
}
