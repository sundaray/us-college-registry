// For an even count the median is the mean of the two middle values, so it can end
// in .5. Pages round money half up when they display it.
export function median(values: readonly number[]) {
  if (values.length === 0) throw new Error('median of an empty list')
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function countWhere<Item>(items: readonly Item[], matches: (item: Item) => boolean) {
  let count = 0
  for (const item of items) if (matches(item)) count += 1
  return count
}

const EARTH_RADIUS_MILES = 3958.8

// Great-circle distance between two points given in degrees.
export function milesBetween(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeChange = radians(toLatitude - fromLatitude)
  const longitudeChange = radians(toLongitude - fromLongitude)
  const haversine =
    Math.sin(latitudeChange / 2) ** 2 +
    Math.cos(radians(fromLatitude)) * Math.cos(radians(toLatitude)) * Math.sin(longitudeChange / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(haversine))
}
