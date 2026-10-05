import ExcelJS from 'exceljs'

type ReadSheetOptions = {
  sheetName: string
  // 1-based row number of the header row.
  headerRow: number
  columns: readonly string[]
}

// Streams one worksheet and returns its rows as objects keyed by header text, with
// every cell as a trimmed string. Used for the BLS and NCES Excel files, the
// largest of which (OEWS, 80 MB) is too big to load whole.
export async function readSheet(filePath: string, options: ReadSheetOptions) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    hyperlinks: 'ignore',
    styles: 'ignore',
  })
  const records: Record<string, string>[] = []
  let found = false

  for await (const worksheet of reader) {
    // The streaming reader names sheets only through the workbook's sheet list.
    const sheetName = (worksheet as unknown as { name: string }).name
    if (sheetName !== options.sheetName) {
      for await (const _row of worksheet) {
        // Drain the sheet so the reader moves on to the next one.
      }
      continue
    }
    found = true
    let columnIndexes: number[] | undefined
    for await (const row of worksheet) {
      const values = row.values as unknown[]
      if (row.number < options.headerRow) continue
      if (row.number === options.headerRow) {
        const header = values.map((value) => cellText(value))
        columnIndexes = options.columns.map((column) => {
          const columnIndex = header.indexOf(column)
          if (columnIndex === -1) throw new Error(`${filePath} sheet ${sheetName} has no column ${column}`)
          return columnIndex
        })
        continue
      }
      const record: Record<string, string> = {}
      options.columns.forEach((column, position) => {
        record[column] = cellText(values[columnIndexes![position]])
      })
      records.push(record)
    }
    break
  }
  if (!found) throw new Error(`${filePath} has no sheet ${options.sheetName}`)
  return records
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    // Rich text and formula cells.
    const cell = value as { richText?: { text: string }[]; result?: unknown; text?: string }
    if (cell.richText) return cell.richText.map((part) => part.text).join('').trim()
    if (cell.result !== undefined) return cellText(cell.result)
    if (cell.text !== undefined) return String(cell.text).trim()
  }
  return String(value).trim()
}
