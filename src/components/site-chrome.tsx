import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { MenuIcon, XIcon } from 'lucide-react'
import { PAGE_TOP_ID } from '@/components/back-to-top'
import { SearchButton } from '@/components/search/search-button'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SITE_NAME } from '@/lib/site-copy'
import { cn } from '@/lib/utils'

// The navbar's links: in the bar from md up, and in the menu below md, where
// they do not fit beside the site's name.
const NAV_LINKS = [
  { to: '/programs', label: 'Programs' },
  { to: '/schools', label: 'Schools' },
  { to: '/careers', label: 'Careers' },
  { to: '/programs/compare', label: 'Compare programs' },
] as const

// The bar at the top of every page. From xl up it has the width of the two-column
// pages on every page, which keeps the logo in one place as a visitor moves around.
// Below md the links move into a menu that opens from a button at the right end
// of the bar. `interactive` is false only on the "not found" page: Cloudflare
// serves that page without the app's scripts, and neither the Search button nor
// the menu could open there. Its links stay in the bar at every width.
export function SiteHeader({ interactive = true }: { interactive?: boolean }) {
  const headerRef = useRef<HTMLElement>(null)
  useHeaderHeightProperty(headerRef)
  return (
    // While the menu is open the bottom border shows even at the top of the
    // page, between the bar and the menu. The scroll animation sets the
    // border's color, and an animation outranks other rules: the color is set
    // with !important.
    <header ref={headerRef} className="reveal-edge-on-scroll sticky top-0 z-20 border-b bg-card has-[[data-slot=sheet-trigger][aria-expanded=true]]:border-b-border!">
      <div className={cn('mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-4 px-5 py-3.5 xl:max-w-6xl', interactive && 'max-md:flex-nowrap max-md:items-center max-md:py-2.5')}>
        <Link id={PAGE_TOP_ID} to="/" className="text-lg font-extrabold tracking-tight text-foreground">
          {SITE_NAME.start} <span className="text-primary">{SITE_NAME.end}</span>
        </Link>
        {/* Search sits after the links: it opens a dialog and leads to no page of its own. */}
        <div className={cn('flex flex-wrap items-center gap-5', interactive && 'max-md:flex-nowrap max-md:gap-2')}>
          <nav aria-label="Main" className={cn('flex flex-wrap gap-5 text-sm text-muted-foreground', interactive && 'max-md:hidden')}>
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
          {interactive ? <SearchButton /> : null}
          {interactive ? <SiteMenu /> : null}
        </div>
      </div>
    </header>
  )
}

// The header's height as --site-header-height on the root element, for the
// menu, which opens under the header. The header grows when its text wraps.
function useHeaderHeightProperty(headerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`))
    observer.observe(header)
    return () => observer.disconnect()
  }, [headerRef])
}

// The menu below md: a button at the right end of the bar opens the links in a
// shadcn sheet from the left, under the header, over 80% of the screen's
// width, and dims the rest of the page. The button turns into a close button
// while the menu is open. The menu closes when the reader presses that button
// again, taps the dimmed page, picks a link or presses Escape, and when the
// screen widens to md, where the links are in the bar again. The page under it
// does not scroll while it is open.
function SiteMenu() {
  const [open, setOpen] = useState(false)
  // A link click closes the menu. A change of page from anywhere else, such as
  // the browser's back button, closes it too. This runs while rendering.
  const pathname = useLocation({ select: (location) => location.pathname })
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setOpen(false)
  }
  useEffect(() => {
    const wideScreen = window.matchMedia('(width >= 48rem)')
    const closeOnWideScreen = () => {
      if (wideScreen.matches) setOpen(false)
    }
    wideScreen.addEventListener('change', closeOnWideScreen)
    return () => wideScreen.removeEventListener('change', closeOnWideScreen)
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* 44px, the size of a comfortable tap target. */}
      <SheetTrigger
        render={<Button variant="outline" size="icon" className="size-11 rounded-full md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} />}
      >
        {open ? <XIcon aria-hidden className="size-5" /> : <MenuIcon aria-hidden className="size-5" />}
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        overlayClassName="top-(--site-header-height) bg-black/50 supports-backdrop-filter:backdrop-blur-none motion-reduce:transition-none"
        className="gap-0 px-5 py-2 text-base data-[side=left]:top-(--site-header-height) data-[side=left]:h-auto data-[side=left]:w-4/5 data-[side=left]:sm:max-w-none motion-reduce:transition-none"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <nav aria-label="Main" className="flex flex-col divide-y">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} onClick={() => setOpen(false)} className="py-4 text-lg font-semibold text-foreground outline-none focus-visible:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

// The band at the bottom of every page. Each page is a column (PAGE_CLASS_NAME)
// whose main part grows (MAIN_CLASS_NAME), so on a short page the band still
// sits at the bottom of the window.
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card px-5 py-8">
      <p className="mx-auto max-w-[62ch] text-center text-base text-balance text-muted-foreground">
        {SITE_NAME.start} {SITE_NAME.end} is an independent site built from public U.S. government data. It is not
        affiliated with any school or government agency.
      </p>
    </footer>
  )
}

// The classes of every page's outer element and of its <main>.
export const PAGE_CLASS_NAME = 'flex min-h-screen flex-col bg-muted/40 text-pretty'
export const MAIN_CLASS_NAME = 'flex-1'
