import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useLocation } from '@tanstack/react-router'
import { SearchContext } from '@/components/search/search-context'
import { loadSearchRows } from '@/lib/site-search'

type SearchDialogComponent = typeof import('@/components/search/search-dialog').default

// Fetches the dialog's code. It is a file of its own, which pages do not carry,
// and the browser keeps one copy however often this runs. The state is set with
// `() =>` because the value is itself a function.
function fetchSearchDialog(setSearchDialog: Dispatch<SetStateAction<SearchDialogComponent | null>>) {
  import('@/components/search/search-dialog').then(
    (module) => setSearchDialog(() => module.default),
    // Offline or a failed download: the next hover, click or shortcut tries again.
    () => {},
  )
}

// The one search dialog for the whole site. The Search button in the site
// header opens it, and so does Cmd+K or Ctrl+K on any page. It is not drawn
// when pages are prerendered, and it is never in the built HTML.
export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // The dialog, once its code has arrived. It then stays on the page, closed. It
  // opens at once and keeps what was typed.
  const [SearchDialog, setSearchDialog] = useState<SearchDialogComponent | null>(null)
  const pathname = useLocation({ select: (location) => location.pathname })

  // Close when the page changes, for example after pressing Back with the dialog
  // open. This runs while rendering. The dialog is then never drawn open on the new page.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setOpen(false)
  }

  // The dialog's code arrives once the browser is idle. The first open is then
  // instant. The much larger index waits for a hover or an open.
  useEffect(() => {
    const fetchDialog = () => fetchSearchDialog(setSearchDialog)
    if (typeof window.requestIdleCallback !== 'function') {
      const timer = window.setTimeout(fetchDialog, 2000)
      return () => window.clearTimeout(timer)
    }
    const handle = window.requestIdleCallback(fetchDialog)
    return () => window.cancelIdleCallback(handle)
  }, [])

  // Cmd+K or Ctrl+K opens and closes search from any page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      fetchSearchDialog(setSearchDialog)
      setOpen((current) => !current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // The same two functions on every render. Opening the dialog then does not
  // redraw the components that use them.
  const openSearch = useCallback(() => {
    fetchSearchDialog(setSearchDialog)
    setOpen(true)
  }, [])
  const preloadSearch = useCallback(() => {
    fetchSearchDialog(setSearchDialog)
    void loadSearchRows().catch(() => {})
  }, [])
  const controls = useMemo(() => ({ openSearch, preloadSearch }), [openSearch, preloadSearch])

  return (
    <SearchContext.Provider value={controls}>
      {children}
      {SearchDialog ? <SearchDialog open={open} onOpenChange={setOpen} /> : null}
    </SearchContext.Provider>
  )
}
