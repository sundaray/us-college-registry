import { createReadStream } from 'node:fs'
import { parse } from 'csv-parse'

type ReadCsvOptions = {
  // Columns to keep. Every one must exist in the header.
  columns: readonly string[]
  // BEA files end with note lines that have fewer columns.
  allowShortRows?: boolean
}

// Streams a CSV file and returns one object per row with only the requested
// columns, so the 3,000-column institution file never sits in memory whole.
export async function readCsv(filePath: string, options: ReadCsvOptions) {
  const parser = createReadStream(filePath).pipe(
    parse({ bom: true, ltrim: true, rtrim: true, relax_column_count: options.allowShortRows ?? false }),
  )
  const records: Record<string, string>[] = []
  let columnIndexes: number[] | undefined

  for await (const cells of parser as AsyncIterable<string[]>) {
    if (!columnIndexes) {
      const header = cells.map((cell) => cell.trim())
      columnIndexes = options.columns.map((column) => {
        const columnIndex = header.indexOf(column)
        if (columnIndex === -1) throw new Error(`${filePath} has no column ${column}`)
        return columnIndex
      })
      continue
    }
    if (options.allowShortRows && cells.length < columnIndexes.length) continue
    const record: Record<string, string> = {}
    options.columns.forEach((column, position) => {
      record[column] = cells[columnIndexes![position]] ?? ''
    })
    records.push(record)
  }
  return records
}

// Scorecard marks suppressed values "PS" (privacy suppressed) and missing values
// "NA". IPEDS uses negative codes such as -1 and -2 for "not applicable".
const MISSING_VALUES = new Set(['', 'NA', 'PS', 'PrivacySuppressed', 'NULL'])

export function parseNumber(value: string | undefined) {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (MISSING_VALUES.has(trimmed)) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) throw new Error(`Not a number: "${value}"`)
  return parsed
}
