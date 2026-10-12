import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { SearchIcon, SearchXIcon, XIcon } from 'lucide-react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

// A box that searches a list on the page by name: a search icon on the left and
// our own clear button on the right once something is typed. Escape clears it
// too. `label` names the box for screen readers and is its placeholder.
// `children` is what the box reports under itself, such as SearchCount; it sits
// in a status region, so a screen reader hears it when it changes. `section`
// marks the box as a page section of its own for scripts/verify.
export function SearchBox({
  label,
  query,
  onQueryChange,
  section,
  className,
  children,
}: {
  label: string
  query: string
  onQueryChange: (query: string) => void
  section?: string
  className?: string
  children?: ReactNode
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  function clearSearch() {
    onQueryChange('')
    inputRef.current?.focus()
  }

  function clearOnEscape(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault()
      clearSearch()
    }
  }

  return (
    <div data-slot="search-box" data-section={section} className={className}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
        {/* A text box with the search role and not type="search", so no browser draws its
            own clear button next to ours. */}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="searchbox"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={label}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={clearOnEscape}
          className="h-12 w-full rounded-xl border border-input bg-card pr-12 pl-11 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {query !== '' ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearSearch}
            className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon aria-hidden className="size-5" />
          </button>
        ) : null}
      </div>
      {/* Always in the page, so a screen reader hears the result when it changes. */}
      <div data-slot="search-result" role="status" aria-live="polite">
        {children}
      </div>
    </div>
  )
}

// The line under the box: "15 programs match "engineering"."
export function SearchCount({ count, singular, plural, searchedText }: { count: number; singular: string; plural: string; searchedText: string }) {
  return (
    <p className="mt-3 text-muted-foreground">
      <strong className="font-semibold text-foreground">
        {formatCount(count)} {count === 1 ? singular : plural}
      </strong>{' '}
      {count === 1 ? 'matches' : 'match'} "{searchedText}".
    </p>
  )
}

// What shows when a search finds nothing: an icon with no tile behind it, then
// one line in neutral-700 with the typed words in the full text color. No
// border, no fill, all centered (the user's choices on 2026-10-12). `thing` is
// what was searched for, as in "No school matches".
export function NoMatch({ thing, searchedText, className }: { thing: string; searchedText: string; className?: string }) {
  return (
    <Empty className={cn('px-0', className)}>
      <EmptyHeader>
        {/* The plain form of the media slot: the icon alone. */}
        <EmptyMedia>
          <SearchXIcon aria-hidden className="size-6" />
        </EmptyMedia>
        <EmptyTitle className="wrap-anywhere text-neutral-700">
          No {thing} matches "<span className="text-foreground">{searchedText}</span>"
        </EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}
