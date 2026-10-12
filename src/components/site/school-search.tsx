import { memo, useDeferredValue, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PageSection } from '@/components/page-blocks'
import { ProgramLink } from '@/components/program/program-link'
import { NoMatch, SearchBox, SearchCount } from '@/components/site/search-box'
import type { ListedSchool, SchoolsListPage } from '@/data/site-pages'
import { formatCount } from '@/lib/format'
import { matchesName, searchText, startsEveryWord } from '@/lib/name-search'

const LINK_CLASS_NAME = 'text-primary underline underline-offset-3'

// How one school answers the search. `showsOfficialName` is set when the listed
// name alone would not explain the match ("grand canyon" finds "GCU").
type SchoolMatch = { isShown: boolean; showsOfficialName: boolean }

export type SchoolSearch = ReturnType<typeof useSchoolSearch>
type SchoolSearchResult = SchoolSearch['result']

// The search on the schools list: what the reader typed and which schools it
// finds. A school is searched by its listed name and its official name.
export function useSchoolSearch(page: SchoolsListPage) {
  const [query, setQuery] = useState('')
  // Typing stays quick: the list of schools follows a moment behind the box.
  const searchedQuery = useDeferredValue(query)
  const names = useMemo(
    () =>
      page.states.map((state) =>
        state.schools.map((school) => {
          const listed = searchText(school.name)
          const official = school.officialName ? searchText(school.officialName) : undefined
          // Typed words may be spread over the two names ("gcu canyon").
          return { listed, official, bothWords: official ? [...listed.words, ...official.words] : listed.words }
        }),
      ),
    [page],
  )
  // Worked out again only when the searched text changes, so the list below is
  // not redrawn on every keystroke.
  const result = useMemo(() => {
    const typed = searchText(searchedQuery)
    const isSearching = typed.words.length > 0
    const states = names.map((schools) => {
      const matches: SchoolMatch[] = schools.map((school) => {
        const matchesListedName = matchesName(typed, school.listed)
        const isShown =
          matchesListedName ||
          (school.official !== undefined && (matchesName(typed, school.official) || startsEveryWord(typed.words, school.bothWords)))
        return { isShown, showsOfficialName: isSearching && isShown && !matchesListedName }
      })
      return { matches, shownCount: matches.filter((match) => match.isShown).length }
    })
    const foundCount = states.reduce((total, state) => total + state.shownCount, 0)
    return { searchedText: searchedQuery.trim(), isSearching, states, foundCount }
  }, [names, searchedQuery])
  return { query, setQuery, result }
}

// The box above the list, with the line that says how many schools it found.
export function SchoolSearchBox({ search }: { search: SchoolSearch }) {
  const { searchedText, isSearching, foundCount } = search.result
  return (
    <SearchBox label="Search schools by name" query={search.query} onQueryChange={search.setQuery} section="search" className="mt-9">
      {isSearching && foundCount > 0 ? <SearchCount count={foundCount} singular="school" plural="schools" searchedText={searchedText} /> : null}
      {isSearching && foundCount === 0 ? <NoMatch thing="school" searchedText={searchedText} /> : null}
    </SearchBox>
  )
}

// One section per state. Every school stays in the page: a school the search
// leaves out is hidden, and so is a state with no school left.
export const SchoolStates = memo(function SchoolStates({ page, result }: { page: SchoolsListPage; result: SchoolSearchResult }) {
  return page.states.map((state, statePosition) => {
    const { matches, shownCount } = result.states[statePosition]
    const stateSlug = state.href.split('/')[2]
    return (
      <PageSection key={state.href} name={`state-${stateSlug}`} title={state.name} hidden={shownCount === 0}>
        <p className="text-sm text-muted-foreground">
          {result.isSearching ? `${formatCount(shownCount)} of ` : ''}
          {formatCount(state.schools.length)} {state.schools.length === 1 ? 'school' : 'schools'}.{' '}
          <Link to="/states/$stateSlug" params={{ stateSlug }} className={LINK_CLASS_NAME}>
            See the {state.name} page
          </Link>
        </p>
        <ul className="grid gap-x-6 gap-y-1.5 text-base md:grid-cols-2">
          {state.schools.map((school, schoolPosition) => (
            <SchoolItem
              key={school.unitId}
              school={school}
              isShown={matches[schoolPosition].isShown}
              showsOfficialName={matches[schoolPosition].showsOfficialName}
            />
          ))}
        </ul>
      </PageSection>
    )
  })
})

// Memoized with its link, so a keystroke redraws only the schools whose place in
// the result changes.
const SchoolItem = memo(function SchoolItem({ school, isShown, showsOfficialName }: { school: ListedSchool; isShown: boolean; showsOfficialName: boolean }) {
  return (
    // data-unit-id lets scripts/verify check each school against the raw data.
    <li data-unit-id={school.unitId} hidden={!isShown}>
      <SchoolName school={school} />
      {showsOfficialName ? <span className="text-muted-foreground"> ({school.officialName})</span> : null}{' '}
      {/* The count says what it counts, because no paragraph on the page explains it. */}
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatCount(school.programCount)} {school.programCount === 1 ? 'program' : 'programs'}
      </span>
    </li>
  )
})

// A school with one program links straight to that program's page.
const SchoolName = memo(function SchoolName({ school }: { school: ListedSchool }) {
  return (
    <span data-name="">
      {school.href.split('/').length === 4 ? (
        <ProgramLink href={school.href} className={LINK_CLASS_NAME}>
          {school.name}
        </ProgramLink>
      ) : (
        <Link to="/schools/$schoolSlug" params={{ schoolSlug: school.href.split('/')[2] }} className={LINK_CLASS_NAME}>
          {school.name}
        </Link>
      )}
    </span>
  )
})
