import { createContext, useContext } from 'react'

export type SearchControls = {
  openSearch: () => void
  // Fetches the dialog's code and the search index ahead of a click, for example on hover.
  preloadSearch: () => void
}

// In a file of its own, away from the components that use it. Editing those
// components while the dev server runs then does not replace the context.
export const SearchContext = createContext<SearchControls | null>(null)

export function useSearch() {
  const controls = useContext(SearchContext)
  if (!controls) throw new Error('useSearch must be used inside SearchProvider')
  return controls
}
