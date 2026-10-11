// The site's address. Canonical links use it, and so does the sitemap
// (vite.config.ts) unless SITE_URL is set for a test build.
export const SITE_ORIGIN = 'https://uscollegeprograms.com'

// The Google Analytics measurement ID of the site's web stream. It is public:
// it shows in every page's source.
export const GA_MEASUREMENT_ID = 'G-8NNSPSHBY3'

// The canonical link for a route head, from the page's path ("/" or "/schools/x").
export function canonicalLink(pagePath: string) {
  return { rel: 'canonical', href: `${SITE_ORIGIN}${pagePath}` }
}
