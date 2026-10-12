import { useEffect, useState } from 'react'
import { ArrowUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// The element keyboard focus moves to after scrolling up: the logo link in the
// site header.
export const PAGE_TOP_ID = 'page-top'

// A round "Back to top" button in the bottom right corner of the window. It
// appears after about one and a half screens of scrolling. A short page never
// shows it. The root route renders it once, outside the page column.
export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight * 1.5)
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <button
      type="button"
      aria-label="Back to top"
      // While hidden it can't be reached by Tab or by screen readers.
      inert={!visible}
      onClick={() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
        // Keyboard and screen reader users start from the top again. preventScroll
        // keeps the smooth scroll.
        document.getElementById(PAGE_TOP_ID)?.focus({ preventScroll: true })
      }}
      className={cn(
        'fixed right-4 bottom-[calc(--spacing(4)+env(safe-area-inset-bottom))] z-30 grid size-12 place-items-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-border outline-none',
        'transition-[opacity,translate,background-color] duration-150 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
        !visible && 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowUpIcon aria-hidden className="size-5.5" />
    </button>
  )
}
