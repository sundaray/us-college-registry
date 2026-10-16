import { useEffect, useMemo, useRef, useState } from 'react'
import { CompareCombobox } from '@/components/compare/compare-combobox'
import type { CompareOption } from '@/components/compare/compare-combobox'
import { CompareResults } from '@/components/compare/compare-results'
import type { CompareColumn } from '@/components/compare/compare-results'
import { CompareTerms } from '@/components/compare/compare-terms'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getProgramPage } from '@/data/get-program-page'
import type { CredentialLevel } from '@/data/program-page'
import { comparedProgram } from '@/lib/compare-copy'
import type { ComparedProgram } from '@/lib/compare-copy'
import { COMPARE_DEGREES, COMPARE_SLOTS, fieldStates, loadCompareOptions, sameFieldAtLevel } from '@/lib/compare-options'
import type { CompareField, CompareOptions } from '@/lib/compare-options'
import { formatCount } from '@/lib/format'
import { searchText } from '@/lib/name-search'

// What the page opens with: nothing chosen, or a comparison a link asked for.
export type CompareChoice = {
  credentialLevel: CredentialLevel | null
  fieldSlug: string | null
  // The state the school lists are narrowed to ("OH"), or null for all states.
  // It narrows the lists only: a school chosen before stays chosen.
  stateCode: string | null
  // One per box, in box order. Null for an empty box.
  schoolSlugs: (string | null)[]
  isComparing: boolean
}

export const NOTHING_CHOSEN: CompareChoice = { credentialLevel: null, fieldSlug: null, stateCode: null, schoolSlugs: Array(COMPARE_SLOTS).fill(null), isComparing: false }

// A program's figures as they arrive. The key is the program's address.
type FiguresState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; program: ComparedProgram }

function programKey(schoolSlug: string, fieldSlug: string) {
  return `${schoolSlug}/${fieldSlug}`
}

// The schools of the new field that were already chosen, each in its own box.
// A school without a page in the new field leaves its box empty.
function keepSchools(schoolSlugs: (string | null)[], field: CompareField | undefined) {
  if (!field) return schoolSlugs.map(() => null)
  const inField = new Set(field.schools.map((school) => school.slug))
  return schoolSlugs.map((slug) => (slug && inField.has(slug) ? slug : null))
}

// The chosen state, when the new field has schools there.
function keepState(stateCode: string | null, field: CompareField | undefined) {
  return stateCode && field?.schools.some((school) => school.stateCode === stateCode) ? stateCode : null
}

// The compare page's controls and its figures. The reader picks a degree, a
// field and up to four schools, then presses Compare. After that the figures
// follow the boxes: changing a school changes its column at once.
export function CompareTool({ initialChoice = NOTHING_CHOSEN }: { initialChoice?: CompareChoice }) {
  const [options, setOptions] = useState<CompareOptions | null>(null)
  const [optionsFailed, setOptionsFailed] = useState(false)
  const [choice, setChoice] = useState(initialChoice)
  const [figures, setFigures] = useState<Map<string, FiguresState>>(() => new Map())
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current = true
    loadCompareOptions().then(
      (loaded) => current && setOptions(loaded),
      () => current && setOptionsFailed(true),
    )
    return () => {
      current = false
    }
  }, [])

  const { credentialLevel, fieldSlug, stateCode, schoolSlugs, isComparing } = choice
  const field = fieldSlug ? options?.fieldsBySlug.get(fieldSlug) : undefined
  const chosenCount = schoolSlugs.filter(Boolean).length

  // Fetch the figures of every chosen program that has none yet. Each program's
  // record is the one its own page is built from.
  useEffect(() => {
    if (!isComparing || !fieldSlug) return
    for (const schoolSlug of schoolSlugs) {
      if (!schoolSlug) continue
      const key = programKey(schoolSlug, fieldSlug)
      if (figures.has(key)) continue
      setFigures((current) => new Map(current).set(key, { status: 'loading' }))
      getProgramPage({ data: { schoolSlug, programSlug: fieldSlug } }).then(
        (page) => setFigures((current) => new Map(current).set(key, { status: 'ready', program: comparedProgram(page) })),
        () => setFigures((current) => new Map(current).set(key, { status: 'failed' })),
      )
    }
  }, [isComparing, fieldSlug, schoolSlugs, figures])

  const fieldOptions = useMemo<CompareOption[]>(
    () =>
      credentialLevel && options
        ? options.fieldsByLevel.get(credentialLevel)!.map((levelField) => ({
            value: levelField.slug,
            label: levelField.name,
            detail: `${formatCount(levelField.schools.length)} ${levelField.schools.length === 1 ? 'school' : 'schools'}`,
            searchName: levelField.searchName,
          }))
        : [],
    [credentialLevel, options],
  )

  const stateOptions = useMemo<CompareOption[]>(
    () =>
      field
        ? fieldStates(field).map((state) => ({
            value: state.code,
            label: state.name,
            detail: `${formatCount(state.schoolCount)} ${state.schoolCount === 1 ? 'school' : 'schools'}`,
            searchName: searchText(`${state.name} ${state.code}`),
          }))
        : [],
    [field],
  )

  // With a state chosen, each box lists that state's schools. A school already
  // chosen in a box stays in its list, wherever it is.
  const schoolOptions = useMemo<CompareOption[]>(
    () =>
      field
        ? field.schools
            .filter((school) => !stateCode || school.stateCode === stateCode || schoolSlugs.includes(school.slug))
            .map((school) => ({ value: school.slug, label: school.shortName, detail: school.place, searchName: school.searchName }))
        : [],
    [field, stateCode, schoolSlugs],
  )

  const columns: CompareColumn[] = schoolSlugs.map((schoolSlug) => {
    const school = schoolSlug ? field?.schools.find((candidate) => candidate.slug === schoolSlug) : undefined
    if (!school || !fieldSlug) return { status: 'empty' }
    const state = figures.get(programKey(school.slug, fieldSlug))
    if (!state || state.status === 'loading') return { status: 'loading', school }
    if (state.status === 'failed') return { status: 'failed', school }
    return { status: 'ready', school, program: state.program }
  })

  // A new degree keeps the field when the site has it at that degree, and the
  // chosen schools that have a page in it.
  function chooseLevel(nextLevel: CredentialLevel) {
    if (nextLevel === credentialLevel || !options) return
    const nextField = fieldSlug ? sameFieldAtLevel(options, fieldSlug, nextLevel) : undefined
    const nextSchools = keepSchools(schoolSlugs, nextField)
    setChoice({
      credentialLevel: nextLevel,
      fieldSlug: nextField?.slug ?? null,
      stateCode: keepState(stateCode, nextField),
      schoolSlugs: nextSchools,
      isComparing: isComparing && nextSchools.some(Boolean),
    })
  }

  function chooseField(nextSlug: string | null) {
    const nextField = nextSlug ? options?.fieldsBySlug.get(nextSlug) : undefined
    const nextSchools = keepSchools(schoolSlugs, nextField)
    setChoice({ ...choice, fieldSlug: nextSlug, stateCode: keepState(stateCode, nextField), schoolSlugs: nextSchools, isComparing: isComparing && nextSchools.some(Boolean) })
  }

  function chooseState(nextCode: string | null) {
    setChoice({ ...choice, stateCode: nextCode })
  }

  function chooseSchool(slot: number, nextSlug: string | null) {
    const nextSchools = schoolSlugs.map((slug, position) => (position === slot ? nextSlug : slug))
    setChoice({ ...choice, schoolSlugs: nextSchools, isComparing: isComparing && nextSchools.some(Boolean) })
  }

  function compare() {
    setChoice({ ...choice, isComparing: true })
    // On a phone the figures start below the four boxes, out of view.
    requestAnimationFrame(() => {
      const results = resultsRef.current
      if (results && results.getBoundingClientRect().top > window.innerHeight * 0.6) results.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const ready = options !== null
  return (
    <>
      <Card data-section="compare-picker" className="mt-9 gap-6 px-5 py-5">
        {optionsFailed ? (
          <p role="alert" className="text-base">
            The list of programs did not load. Reload the page to try again.
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <span id="compare-degree-label" className="text-base font-semibold">
            Degree
          </span>
          <ToggleGroup
            aria-labelledby="compare-degree-label"
            value={credentialLevel ? [String(credentialLevel)] : []}
            onValueChange={(values: string[]) => {
              // Pressing the chosen degree again leaves it chosen.
              const next = values[values.length - 1]
              if (next) chooseLevel(Number(next) as CredentialLevel)
            }}
            disabled={!ready}
            className="grid w-full grid-cols-2 sm:flex sm:w-fit sm:flex-wrap"
          >
            {COMPARE_DEGREES.map((degree) => (
              <ToggleGroupItem
                key={degree.credentialLevel}
                value={String(degree.credentialLevel)}
                variant="outline"
                className="h-12 rounded-full px-4 text-base aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90"
              >
                {degree.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {/* The state is optional. It narrows the four school lists to one state. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:gap-x-6">
          <CompareCombobox
            id="compare-field"
            label="Field of study"
            placeholder={credentialLevel ? 'Choose a field' : 'Choose a degree first'}
            thing="field"
            options={fieldOptions}
            value={fieldSlug}
            onValueChange={chooseField}
            disabled={!ready || !credentialLevel}
          />
          <CompareCombobox
            id="compare-state"
            label="State (optional)"
            placeholder={field ? 'All states' : 'Choose a field first'}
            thing="state"
            options={stateOptions}
            value={stateCode}
            onValueChange={chooseState}
            disabled={!field}
          />
        </div>

        <div role="group" aria-label="Schools" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-x-6">
          {schoolSlugs.map((schoolSlug, slot) => (
            <CompareCombobox
              key={slot}
              id={`compare-school-${slot + 1}`}
              label={`School ${slot + 1}`}
              placeholder={field ? 'Choose a school' : 'Choose a field first'}
              thing="school"
              // A school chosen in another box is not offered again.
              options={schoolOptions.filter((option) => option.value === schoolSlug || !schoolSlugs.includes(option.value))}
              value={schoolSlug}
              onValueChange={(nextSlug) => chooseSchool(slot, nextSlug)}
              disabled={!field}
            />
          ))}
        </div>

        {isComparing ? null : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button size="lg" onClick={compare} disabled={!field || chosenCount < 2} className="h-12 rounded-xl px-6 text-base">
              Compare
            </Button>
            {field && chosenCount < 2 ? <span className="text-base text-muted-foreground">Choose at least two schools.</span> : null}
          </div>
        )}
      </Card>

      <div ref={resultsRef} className="scroll-mt-20">
        {isComparing && credentialLevel && chosenCount > 0 ? <CompareResults columns={columns} credentialLevel={credentialLevel} /> : null}
      </div>

      {credentialLevel ? <CompareTerms credentialLevel={credentialLevel} /> : null}
    </>
  )
}
