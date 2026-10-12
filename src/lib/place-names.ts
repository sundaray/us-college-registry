// A place's name as it reads when it stands alone in a sentence, after "in" or
// "outside" or as the subject: "in Texas", "in the District of Columbia". At the
// start of a sentence, capitalize the result. Before a noun the plain name is
// right ("District of Columbia programs"), and so it is in a table cell or a
// breadcrumb.

const NAMES_WITH_THE = new Set(['District of Columbia'])

export function placeInSentence(placeName: string) {
  return NAMES_WITH_THE.has(placeName) ? `the ${placeName}` : placeName
}

// Places the federal data lists beside the states that are not states, and what
// each one is. Sentences that compare states leave these places out and mention
// them afterwards. A table that lists one says so in a note.
const NOT_STATES: Record<string, string> = {
  'District of Columbia': 'a single city',
  'Puerto Rico': 'a U.S. territory',
}

export function isState(placeName: string) {
  return !(placeName in NOT_STATES)
}

// "a single city", for a place that is not a state.
export function whatPlaceIs(placeName: string) {
  return NOT_STATES[placeName]
}

function joinPlaces(parts: string[]) {
  if (parts.length <= 2) return parts.join(' and ')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// The note under a table of states that also lists such places: "The District of
// Columbia is a single city and Puerto Rico is a U.S. territory. Neither is a
// state. They are listed for comparison." `placeNames` is every place in the table.
export function notStatesNote(placeNames: string[]) {
  const listed = Object.keys(NOT_STATES).filter((placeName) => placeNames.includes(placeName))
  if (listed.length === 0) return undefined
  const whatEachIs = joinPlaces(listed.map((placeName) => `${placeInSentence(placeName)} is ${NOT_STATES[placeName]}`))
  const opening = `${whatEachIs.charAt(0).toUpperCase()}${whatEachIs.slice(1)}`
  if (listed.length === 1) return `${opening}, not a state. It is listed for comparison.`
  return `${opening}. ${listed.length === 2 ? 'Neither is a state' : 'None of them is a state'}. They are listed for comparison.`
}

// The number beside a row in a table of states: its place among the states only.
// A place that is not a state gets none, and neither does a row with no rank.
// `rankOf` gives a row's rank from the record, which counts every place listed.
export function rankAmongStates<Row extends { stateName: string }>(rows: Row[], row: Row, rankOf: (row: Row) => number | undefined) {
  const rank = rankOf(row)
  if (rank === undefined || !isState(row.stateName)) return undefined
  return 1 + rows.filter((other) => isState(other.stateName) && (rankOf(other) ?? Infinity) < rank).length
}

// How places that are not states compare with the states, to follow a sentence
// that names the highest and the lowest state: "higher in the District of
// Columbia ($111,530) and lower in Puerto Rico ($43,530)". A place inside the
// states' range is not mentioned, and neither is one whose figure prints the
// same as the state's. `shownAmount` formats a figure as the page shows it.
export function outsideStatesRange(
  places: { placeName: string; amount: number }[],
  highestStateAmount: number,
  lowestStateAmount: number,
  shownAmount: (amount: number) => string,
) {
  const named = (place: { placeName: string; amount: number }) => `${placeInSentence(place.placeName)} (${shownAmount(place.amount)})`
  const others = places.filter((place) => !isState(place.placeName))
  const higher = others.filter((place) => Math.round(place.amount) > Math.round(highestStateAmount))
  const lower = others.filter((place) => Math.round(place.amount) < Math.round(lowestStateAmount))
  const parts: string[] = []
  if (higher.length > 0) parts.push(`higher in ${joinPlaces(higher.map(named))}`)
  if (lower.length > 0) parts.push(`lower in ${joinPlaces(lower.map(named))}`)
  return parts.length > 0 ? parts.join(' and ') : undefined
}
