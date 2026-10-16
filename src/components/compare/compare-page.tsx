import { Link } from '@tanstack/react-router'
import { CompareTool, NOTHING_CHOSEN } from '@/components/compare/compare-tool'
import type { CompareChoice } from '@/components/compare/compare-tool'
import { PageHeader } from '@/components/page-blocks'
import { MAIN_CLASS_NAME, PAGE_CLASS_NAME, SiteFooter, SiteHeader } from '@/components/site-chrome'
import { buildCompareTitle } from '@/lib/site-copy'

// The compare page: the header band, the controls with the figures under them,
// and what the figures mean. Its widths follow the program pages: one column
// up to xl, and the two-column pages' full width from xl up, where the four
// school boxes sit in one row.
export function ComparePage({ initialChoice = NOTHING_CHOSEN }: { initialChoice?: CompareChoice }) {
  return (
    <div className={PAGE_CLASS_NAME}>
      <SiteHeader />
      <main className={MAIN_CLASS_NAME}>
        <PageHeader
          trail={[{ label: 'Home', link: <Link to="/" /> }, { label: 'Programs', link: <Link to="/programs" /> }, { label: 'Compare' }]}
          title={buildCompareTitle()}
          wide
        />
        <div className="mx-auto max-w-3xl px-5 xl:max-w-6xl">
          <CompareTool initialChoice={initialChoice} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
