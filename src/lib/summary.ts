// How a page summary is split into paragraphs. A short summary reads best as one
// paragraph. A longer one breaks where its subject changes, never inside a
// subject, so no page opens with a large block of text.

// About four lines at the summary's width on a laptop.
const ONE_PARAGRAPH_LIMIT = 240

// Each inner list holds the sentences about one subject, in reading order.
export function summaryParagraphs(subjects: string[][]) {
  const groups = subjects.filter((sentences) => sentences.length > 0).map((sentences) => sentences.join(' '))
  const whole = groups.join(' ')
  return whole.length <= ONE_PARAGRAPH_LIMIT ? [whole] : groups
}
