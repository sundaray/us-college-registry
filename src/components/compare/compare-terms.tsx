import { PageSection } from '@/components/page-blocks'
import type { CredentialLevel } from '@/data/program-page'
import { COMPARE_GENERAL_TERMS, compareSections } from '@/lib/compare-copy'

// What each figure on the page is, in the order the page shows them, then the
// source. Every explanation is worded from the agency's own document (see
// data/raw/SOURCES.md). The list changes with the degree: a master's debt
// figure counts different loans, and a master's comparison has no repayment rows.
export function CompareTerms({ credentialLevel }: { credentialLevel: CredentialLevel }) {
  const sections = compareSections(credentialLevel)
  return (
    <PageSection name="compare-terms" title="What the figures mean">
      <dl className="flex max-w-[66ch] flex-col gap-4">
        {COMPARE_GENERAL_TERMS.map((item) => (
          <div key={item.term}>
            <dt className="text-base font-semibold">{item.term}</dt>
            <dd className="text-base leading-relaxed text-neutral-700">{item.meaning}</dd>
          </div>
        ))}
      </dl>
      {sections.map((section) => (
        <div key={section.key} className="mt-4 flex flex-col gap-3">
          <h3 className="text-lg leading-snug font-bold">{section.title}</h3>
          <dl className="flex max-w-[66ch] flex-col gap-4">
            {section.rows.map((row) => (
              <div key={row.key}>
                <dt className="text-base font-semibold">{row.label}</dt>
                <dd className="text-base leading-relaxed text-neutral-700">{row.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <h3 className="mt-4 text-lg leading-snug font-bold">Source</h3>
      <p className="max-w-[66ch] text-base text-neutral-700">U.S. Department of Education, College Scorecard, field of study and institution files, June 2026 release</p>
    </PageSection>
  )
}
