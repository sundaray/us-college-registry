import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SearchIcon, XIcon } from 'lucide-react'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatCount } from '@/lib/format'
import { searchWords } from '@/lib/name-search'
import { loadSearchRows, searchSite } from '@/lib/site-search'
import type { SearchKind, SearchRow } from '@/lib/site-search'
import { cn } from '@/lib/utils'

// How many results a group shows at first, and how many each "Show more" adds.
// Drawing thousands of rows at once makes typing stutter on phones. A group of
// up to FULL_COUNT shows in full, rather than five and a button for the rest.
const FIRST_COUNT = 5
const FULL_COUNT = 7
const MORE_COUNT = 20

function firstCount(resultCount: number) {
  return resultCount <= FULL_COUNT ? resultCount : FIRST_COUNT
}

// How many results each group shows after "Show more". A new search starts
// over. `firstNew` is the first row the last "Show more" added.
type ShownCounts = { counts: Partial<Record<SearchKind, number>>; firstNew: string }
const NOTHING_MORE: ShownCounts = { counts: {}, firstNew: '' }

// The pattern that marks the typed words in a result. A word is marked where it
// starts a word of the result: "oh" marks "OH", not the middle of "John". Only
// a word that starts no word anywhere in the result is marked inside one,
// because that is then what matched. Typed words hold only letters and digits.
function markPattern(words: string[], resultText: string) {
  if (words.length === 0) return null
  const longestFirst = [...words].sort((first, second) => second.length - first.length)
  return new RegExp(`(${longestFirst.map((word) => (new RegExp(`\\b${word}`, 'i').test(resultText) ? `\\b${word}` : word)).join('|')})`, 'gi')
}

// The text with the typed words marked: bold, on a yellow background.
function Marked({ text, pattern }: { text: string; pattern: RegExp | null }): ReactNode {
  if (!pattern) return text
  // Splitting on a pattern with one group puts the matches at the odd positions.
  return text.split(pattern).map((part, position) =>
    position % 2 === 1 ? (
      <mark key={position} className="rounded-xs bg-amber-400/40 box-decoration-clone font-bold text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

// The command list handles Enter for the whole dialog: it opens the highlighted
// result. The buttons inside it keep their own Enter and Space to themselves.
function keepKeyPress(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
}

// The site's search, in a dialog: the whole screen on phones, a box near the top
// of the window on wider screens. The box stays in place and the results scroll.
// The results come in groups, broad pages first (SEARCH_GROUPS).
export default function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // These live outside the dialog's content. They last while it is closed.
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<SearchRow[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // The highlighted result: the one Enter opens. The command list keeps it up to date.
  const [selected, setSelected] = useState('')
  const [shown, setShown] = useState(NOTHING_MORE)
  // Typing stays quick: the results follow a moment behind the box.
  const searchedQuery = useDeferredValue(query.trim())

  // Fetch the index while the dialog is open and has none yet. After a failure
  // it stops. The next keystroke clears loadFailed, which runs this again.
  useEffect(() => {
    if (!open || rows || loadFailed) return
    let ignore = false
    loadSearchRows().then(
      (loaded) => {
        if (!ignore) setRows(loaded)
      },
      () => {
        if (!ignore) setLoadFailed(true)
      },
    )
    return () => {
      ignore = true
    }
  }, [open, rows, loadFailed])

  const groups = useMemo(() => (rows ? searchSite(rows, searchedQuery) : []), [rows, searchedQuery])
  const words = useMemo(() => searchWords(searchedQuery), [searchedQuery])
  const total = groups.reduce((sum, group) => sum + group.results.length, 0)
  const { counts } = shown

  // New results, from new words or from the index arriving, start every group
  // over and highlight the first result. The command list picks its own first
  // row at the keystroke, but the results follow the box a moment behind it,
  // and that row belongs to the results before. This runs while rendering. The
  // old highlight is then never drawn on the new results.
  const [lastResults, setLastResults] = useState(groups)
  if (groups !== lastResults) {
    setLastResults(groups)
    setShown(NOTHING_MORE)
    setSelected(groups[0]?.results[0]?.href ?? '')
  }

  // After "Show more", bring the first new row fully into view.
  useEffect(() => {
    if (shown.firstNew) listRef.current?.querySelector(`[data-href="${CSS.escape(shown.firstNew)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [shown.firstNew])

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery)
    // Typing again after the index failed to load tries the fetch once more.
    setLoadFailed(false)
  }

  function showMore(kind: SearchKind, results: SearchRow[]) {
    const shownCount = counts[kind] ?? firstCount(results.length)
    const firstNew = results[shownCount]
    if (!firstNew) return
    setShown({ counts: { ...counts, [kind]: shownCount + MORE_COUNT }, firstNew: firstNew.href })
    // The highlight moves to the first new row. The arrow keys carry on from there.
    setSelected(firstNew.href)
  }

  function openPage(row: SearchRow) {
    onOpenChange(false)
    void navigate({ href: row.href })
  }

  let status: ReactNode
  if (!searchedQuery) status = 'Type a program, school, state or career.'
  else if (loadFailed) status = 'Search is unavailable right now. Please try again.'
  else if (!rows) status = 'Searching...'
  else if (total === 0) status = `No page matches "${searchedQuery}".`
  else
    status = (
      <>
        <strong className="font-semibold text-foreground">
          {formatCount(total)} {total === 1 ? 'page' : 'pages'}
        </strong>{' '}
        {total === 1 ? 'matches' : 'match'} "{searchedQuery}".
      </>
    )

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <DialogContent
        showCloseButton={false}
        // Start in the search box, with last time's words selected so typing replaces them.
        initialFocus={() => {
          inputRef.current?.select()
          return inputRef.current
        }}
        className="top-0 left-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 ring-0 sm:top-24 sm:left-1/2 sm:h-auto sm:max-h-[min(40rem,calc(100dvh-8rem))] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-xl sm:ring-1"
      >
        {/* Our own search finds and orders the results. The command list does no filtering
            of its own. Its Ctrl+K shortcut is off because Ctrl+K opens and closes this dialog. */}
        <Command shouldFilter={false} vimBindings={false} label="Search the site" value={selected} onValueChange={setSelected} className="min-h-0 flex-1">
          {/* Phones: the title and Close on one line, the box below. Wider screens:
              the box with Close beside it, and the title for screen readers only. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3">
            <DialogTitle className="order-1 grow pl-1 text-lg leading-7 font-semibold sm:sr-only">Search</DialogTitle>
            <DialogDescription className="sr-only">Search programs, schools, states and careers by name.</DialogDescription>
            <div className="relative order-3 w-full sm:order-1 sm:w-auto sm:flex-1">
              <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
              <CommandInput
                ref={inputRef}
                value={query}
                onValueChange={changeQuery}
                placeholder="Program, school, state or career"
                enterKeyHint="go"
                className="h-12 rounded-xl border border-input bg-card pr-12 pl-11 shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onKeyDown={keepKeyPress}
                  onClick={() => {
                    changeQuery('')
                    inputRef.current?.focus()
                  }}
                  className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <XIcon aria-hidden className="size-5" />
                </button>
              ) : null}
            </div>
            <DialogClose
              onKeyDown={keepKeyPress}
              className="order-2 h-11 cursor-pointer rounded-md px-3 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted"
            >
              Close
            </DialogClose>
          </div>

          <p className="px-4 pb-3 text-base text-muted-foreground" aria-live="polite">
            {status}
          </p>

          {/* The results scroll in a shadcn ScrollArea, with its thin scrollbar rather than the
              browser's. Its viewport takes the room left under the box. The dialog sets that
              room, and the list scrolls inside it. Touching the results on a phone puts the
              keyboard away, and the whole list is then in view. */}
          <ScrollArea
            className={cn(
              'flex min-h-0 flex-1 flex-col **:data-[slot=scroll-area-viewport]:min-h-0 **:data-[slot=scroll-area-viewport]:flex-1 **:data-[slot=scroll-area-viewport]:overscroll-contain',
              total > 0 && 'border-t',
            )}
            onPointerDown={(event) => {
              if (event.pointerType === 'touch') inputRef.current?.blur()
            }}
          >
            <CommandList ref={listRef} label="Results">
              {groups.map((group) => {
                const shownCount = counts[group.kind] ?? firstCount(group.results.length)
                const remaining = Math.max(0, group.results.length - shownCount)
                const moreCount = Math.min(MORE_COUNT, remaining)
                return (
                  <CommandGroup
                    key={group.kind}
                    heading={
                      <span className="flex items-baseline justify-between gap-4 text-base font-bold">
                        {group.heading}
                        <span className="font-normal text-muted-foreground tabular-nums">{formatCount(group.results.length)}</span>
                      </span>
                    }
                    className="border-b pb-2 last:border-b-0"
                  >
                    {group.results.slice(0, shownCount).map((row) => (
                      <ResultItem key={row.href} row={row} words={words} onOpen={openPage} />
                    ))}
                    {/* Once the group is shown in full, the button stays in the list, hidden and
                        switched off. Taking the highlighted row out of a command list sends the
                        highlight back to the first row. */}
                    {group.results.length > FULL_COUNT ? (
                      <CommandItem
                        value={`show-more-${group.kind}`}
                        disabled={remaining === 0}
                        onSelect={() => showMore(group.kind, group.results)}
                        className={cn('mx-4 mt-1.5 mb-1 justify-center rounded-md border font-medium active:bg-muted', remaining === 0 && 'hidden')}
                      >
                        Show {formatCount(moreCount)} more {moreCount === 1 ? group.one : group.many}
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                )
              })}
            </CommandList>
          </ScrollArea>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

// One result: the page's name, with the line under it that tells it apart.
function ResultItem({ row, words, onOpen }: { row: SearchRow; words: string[]; onOpen: (row: SearchRow) => void }) {
  const pattern = markPattern(words, `${row.title} ${row.detail}`)
  return (
    <CommandItem value={row.href} data-href={row.href} onSelect={() => onOpen(row)} className="flex-col items-start gap-0.5 py-2.5 active:bg-muted">
      <span className="font-semibold text-primary">
        <Marked text={row.title} pattern={pattern} />
      </span>
      <span className="text-muted-foreground">
        <Marked text={row.detail} pattern={pattern} />
      </span>
    </CommandItem>
  )
}
