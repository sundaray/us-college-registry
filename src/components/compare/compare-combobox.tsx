import { useMemo, useState } from 'react'
import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { matchesName, searchText, startsEveryWord } from '@/lib/name-search'
import type { SearchText } from '@/lib/name-search'
import { cn } from '@/lib/utils'

// One choice in a box: its name, a line under it, and every name it answers to.
export type CompareOption = { value: string; label: string; detail?: string; searchName: SearchText }

// Lower is a better match, as in the site search (src/lib/site-search.ts).
// Null when the option does not match.
// 0: the name starts with what was typed ("psych" for "Psychology").
// 1: every typed word starts a word of the name ("Experimental Psychology").
// 2: every typed word starts a word of the option's other names (its city or state).
// 3: the typed letters appear as one run somewhere in those names.
function matchScore(typed: SearchText, name: SearchText, option: CompareOption) {
  if (name.letters.startsWith(typed.letters)) return 0
  if (startsEveryWord(typed.words, name.words)) return 1
  if (startsEveryWord(typed.words, option.searchName.words)) return 2
  if (matchesName(typed, option.searchName)) return 3
  return null
}

// A box to type in with a list under it (the shadcn Combobox), for the field of
// study and for each school. The list narrows as the reader types, by the same
// rules as the site's other searches (src/lib/name-search.ts). `thing` names
// what the list holds, for the line that says nothing matches: "No school matches".
// Text is text-base throughout, larger than the component's own text-sm.
export function CompareCombobox({
  id,
  label,
  placeholder,
  thing,
  options,
  value,
  onValueChange,
  disabled = false,
  className,
}: {
  id: string
  label: string
  placeholder: string
  thing: string
  options: CompareOption[]
  value: string | null
  onValueChange: (value: string | null) => void
  disabled?: boolean
  className?: string
}) {
  const items = useMemo(() => ComboboxPrimitive.createItems(options, { getValue: (option) => option.value, getLabel: (option) => option.label }), [options])
  // What the reader has typed. The list shows the options that match it, best
  // matches first, and A to Z among equal matches. While the box shows the chosen
  // option's name, the list shows every option.
  const [typed, setTyped] = useState('')
  const chosenLabel = options.find((option) => option.value === value)?.label
  const names = useMemo(() => new Map(options.map((option) => [option.value, searchText(option.label)])), [options])
  const shownOptions = useMemo(() => {
    const query = searchText(typed === chosenLabel ? '' : typed)
    if (query.words.length === 0) return options
    return options
      .map((option) => ({ option, score: matchScore(query, names.get(option.value)!, option) }))
      .filter((match): match is { option: CompareOption; score: number } => match.score !== null)
      .sort((first, second) => first.score - second.score)
      .map((match) => match.option)
  }, [options, names, typed, chosenLabel])

  return (
    <div data-slot="compare-combobox" className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={id} className="text-base font-semibold">
        {label}
      </Label>
      <Combobox
        items={items}
        value={value}
        onValueChange={(next) => onValueChange(typeof next === 'string' ? next : null)}
        onInputValueChange={setTyped}
        filteredItems={shownOptions}
        disabled={disabled}
        autoHighlight
      >
        {/* The clear button and the list button are the size of the clear button
            in the site's search boxes (src/components/site/search-box.tsx): a
            36px button with a 20px icon. The component's own are 24px and 16px. */}
        <ComboboxInput
          id={id}
          placeholder={placeholder}
          disabled={disabled}
          showClear
          className="h-12 w-full rounded-xl bg-card [&_input]:h-full [&_input]:px-3.5 [&_input]:text-base [&_[data-slot=combobox-clear]]:size-9 [&_[data-slot=combobox-clear]]:rounded-lg [&_[data-slot=input-group-button]]:size-9 [&_[data-slot=input-group-button]]:rounded-lg [&_[data-slot=combobox-clear]_svg.lucide]:size-5 [&_[data-slot=input-group-button]_svg.lucide]:size-5"
        />
        <ComboboxContent className="rounded-xl">
          <ComboboxEmpty className="px-3 py-3 text-base">
            {typed.trim() ? `No ${thing} matches "${typed.trim()}"` : `No ${thing} to choose`}
          </ComboboxEmpty>
          <ComboboxList className="max-h-[min(24rem,calc(var(--available-height)-1rem))] p-1.5">
            {(option: CompareOption) => (
              <ComboboxItem key={option.value} value={option.value} className="items-start rounded-lg py-2 pl-3 text-base">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{option.label}</span>
                  {option.detail ? <span className="text-muted-foreground">{option.detail}</span> : null}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
