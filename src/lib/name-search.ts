// Searching a list of names as the reader types.

// The words of a name or of what the reader typed: lower case, no accents, "&"
// read as "and", and every other sign as a space. "Texas A&M" and "texas a and m"
// give the same words.
export function searchWords(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

// A name, or what the reader typed, in the two forms the search compares: its
// words, and its letters and digits as one run with no spaces ("South Western"
// and "Southwestern" give the same run).
export type SearchText = { words: string[]; letters: string }

export function searchText(text: string): SearchText {
  const words = searchWords(text)
  return { words, letters: words.join('') }
}

// A name matches what was typed in either of two ways (the user's decision on
// 2026-10-12, each rule finds what the other misses).
// One: the typed letters appear in the name as one run, whatever the spaces and
// signs. "south western" finds "Southwestern" and "st johns" finds "St. John's".
// Two: every typed word starts a word of the name, in any order. "berkeley
// california" finds "University of California-Berkeley", and "texas university"
// finds "Texas A&M University".
export function matchesName(typed: SearchText, name: SearchText) {
  return name.letters.includes(typed.letters) || startsEveryWord(typed.words, name.words)
}

// Every typed word must start a word of the name, in any order. A single letter
// must be a whole word ("a" in "Texas A&M"), except the last one, which the
// reader may still be typing.
export function startsEveryWord(typedWords: string[], nameWords: string[]) {
  return typedWords.every((typed, position) => {
    const isLast = position === typedWords.length - 1
    return nameWords.some((word) => (typed.length === 1 && !isLast ? word === typed : word.startsWith(typed)))
  })
}
