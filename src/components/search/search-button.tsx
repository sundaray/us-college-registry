import { SearchIcon } from 'lucide-react'
import { useSearch } from '@/components/search/search-context'

// The Search button in the site header. Search has no page of its own: it opens
// in a dialog on whatever page the reader is on. The border and round ends make
// it look like a control to press, not one more link beside the header's links.
// On a phone it is a round 44px icon button, which leaves room for the menu
// button beside it (the text does not fit at 375px, the width of an iPhone SE).
export function SearchButton() {
  const { openSearch, preloadSearch } = useSearch()
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={openSearch}
      onPointerEnter={preloadSearch}
      onFocus={preloadSearch}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-input bg-card py-1.5 pr-4 pl-3 text-sm text-muted-foreground shadow-xs outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:size-11 max-sm:justify-center max-sm:p-0"
    >
      <SearchIcon aria-hidden className="size-4 max-sm:size-5" />
      {/* On a phone the button is an icon beside the menu button. Its name
          stays for screen readers. */}
      <span className="max-sm:sr-only">Search</span>
    </button>
  )
}
