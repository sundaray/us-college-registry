import { readFileSync } from 'node:fs'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { SITE_ORIGIN } from './src/lib/site'

const BUCKET_SIZE = 100

// Page lists in build order, written by `pnpm build-data`. When BUCKET is set,
// only that bucket of 100 pages of PAGE_TYPE ("programs", "state-programs",
// "schools", "states", "national-programs", "occupations", or "site" (the home page
// and the navbar's list pages) is prerendered; the bucket runner uses this to build and check one
// bucket at a time. Without BUCKET, every page of every type is prerendered.
type IndexEntry = { schoolSlug?: string; stateSlug?: string; programSlug?: string; careerSlug?: string; path?: string }

const PAGE_TYPES = {
  programs: { index: 'data/generated/program-index.json', pathOf: (entry: IndexEntry) => `/schools/${entry.schoolSlug}/${entry.programSlug}` },
  'state-programs': { index: 'data/generated/state-program-index.json', pathOf: (entry: IndexEntry) => `/states/${entry.stateSlug}/${entry.programSlug}` },
  schools: { index: 'data/generated/school-index.json', pathOf: (entry: IndexEntry) => `/schools/${entry.schoolSlug}` },
  states: { index: 'data/generated/state-index.json', pathOf: (entry: IndexEntry) => `/states/${entry.stateSlug}` },
  'national-programs': { index: 'data/generated/national-program-index.json', pathOf: (entry: IndexEntry) => `/programs/${entry.programSlug}` },
  occupations: { index: 'data/generated/occupation-index.json', pathOf: (entry: IndexEntry) => `/careers/${entry.careerSlug}` },
  site: { index: 'data/generated/site-index.json', pathOf: (entry: IndexEntry) => entry.path! },
} as const

type PageType = keyof typeof PAGE_TYPES

function pagePaths(pageType: PageType) {
  const { index, pathOf } = PAGE_TYPES[pageType]
  let entries: IndexEntry[]
  try {
    entries = JSON.parse(readFileSync(index, 'utf8'))
  } catch {
    throw new Error(`${index} is missing. Run \`pnpm build-data\` first.`)
  }
  return entries.map(pathOf)
}

function prerenderPages() {
  const bucket = process.env.BUCKET ? Number(process.env.BUCKET) : undefined
  const pageType = (process.env.PAGE_TYPE ?? 'programs') as PageType
  if (!(pageType in PAGE_TYPES)) throw new Error(`Unknown PAGE_TYPE ${pageType}`)
  const paths = bucket
    ? pagePaths(pageType).slice((bucket - 1) * BUCKET_SIZE, bucket * BUCKET_SIZE)
    : (Object.keys(PAGE_TYPES) as PageType[]).flatMap((type) => pagePaths(type))
  return paths.map((pagePath) => ({ path: pagePath, prerender: { enabled: true } }))
}

export default defineConfig(({ command }) => ({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({
      // Static prerendering, as in the TanStack Start "Static Prerendering" guide.
      // Pages are listed explicitly, so links are not crawled. autoSubfolderIndex
      // false writes /schools/x/y.html and /schools/x.html, which Cloudflare serves
      // at /schools/x/y and /schools/x. autoStaticPathsDiscovery is off because
      // it adds the list pages again with a trailing slash (/programs/), which
      // put a second copy of each in the sitemap and in dist (programs/index.html).
      // Cloudflare redirects /programs/ to /programs.
      prerender: {
        enabled: true,
        crawlLinks: false,
        autoSubfolderIndex: false,
        autoStaticPathsDiscovery: false,
        failOnError: true,
      },
      pages: command === 'build' ? prerenderPages() : [],
      // Built-in sitemap ("SEO" guide). Bucket runs set SITE_URL to a placeholder
      // host; every other build lists the pages under the site's address.
      sitemap: { enabled: true, host: process.env.SITE_URL ?? SITE_ORIGIN },
    }),
    viteReact(),
    tailwindcss(),
  ],
}))
