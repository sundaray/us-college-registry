export function slugify(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // "Texas A&M" becomes "texas-am", "Arts & Sciences" becomes "arts-and-sciences".
    .replace(/([a-z0-9])&([a-z0-9])/g, '$1$2')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
