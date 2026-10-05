# Handover: build all program pages

Written 2026-10-05 at the end of the first session. Read all of it before writing code.

## Goal

Build every eligible program page (20,297) and the page types they link to (about 25,900 pages in total, see "Other page types"), for an independent programmatic SEO experiment, in buckets of 100. For every page: generate the page, its title, and its meta description; verify every number against the public US government data in `data/raw`; make sure every internal link works; run the other checks listed below.

This project is independent. Never connect it to the user's job board project.

## Project

- Path: `/Users/hemanta/Documents/pseo`
- Stack: TanStack Start (React 19, Vite 8), Tailwind v4, shadcn preset `base-vega` (Base UI primitives), pnpm.
- Commands: `pnpm dev` (port 3000), `pnpm typecheck`, `pnpm build`.
- Site name "DegreeLedger" is a placeholder. The domain is not chosen yet.
- Follow the user's global CLAUDE.md: no em dashes anywhere (code comments, page copy, docs), plain words, descriptive parameter names (never one letter), no function names starting with `to`.

## The reference page (approved by the user)

`http://localhost:3000/schools/university-of-texas-at-austin/nursing-bachelors`

The user reviewed this page section by section. Keep its layout, sections, and writing style for every page.

- `src/routes/schools/$schoolSlug/$programSlug.tsx`: the page route (loader, head tags, FAQ JSON-LD, all sections).
- `src/data/programs.ts`: the `ProgramPage` type and one hand-entered record. The script must replace this record with generated data.
- `src/lib/program-copy.ts`: computed metrics and data-driven sentences. `buildPageTitle` (used for both `<title>` and the H1), `buildMetaDescription`, `buildSummary`, `buildFiveYearSentence`, `buildFamilyIncomeSentence`, `buildFaq`.
- `src/components/program/`: `program-header.tsx` (tinted band), `debt-earnings-scatter.tsx`, `earnings-bars.tsx`.
- `src/components/slash-icon.tsx`: breadcrumb separator, copied from the user's jobhunter project.
- shadcn components in `src/components/ui/`: accordion, badge, breadcrumb, button, card, table.
- `sample-page/` is an outdated early mockup with wrong numbers. Ignore it.

## Decisions already made (ask the user before changing any)

- Title and H1 are the same text: `{School short name} {Field} ({degree abbreviation or credential}): Tuition, Graduate Salary, and Debt`. Aim for about 60 characters or less. Example: `UT Austin Nursing (BSN): Tuition, Graduate Salary, and Debt`.
- Meta description is generated, about 160 characters or less. It leads with first-year and five-year pay, then one of three debt sentences (low, high, or near the national median). Example: `UT Austin nursing graduates earn $75,095 a year after graduating and $82,838 after five. Median federal debt is $19,651, lower than at 90% of nursing programs.`
- Header: tinted band in the primary color, breadcrumb with `SlashIcon` separators, no "Program profile" label.
- FAQ uses the shadcn Accordion with `hiddenUntilFound`, so closed answers are still in the server HTML. FAQPage JSON-LD goes in the head.
- How the title was chosen: Google Search Central guidance (unique, accurate, descriptive titles; no keyword stuffing; Google may rewrite a title that doesn't match the H1; no hard length limit, text is cut to fit the screen). Google autocomplete showed people search "ut austin nursing cost/tuition", "is ut austin nursing good", "ut austin bsn ...", but not "ut austin nursing salary". For computer science, "salary" searches are common. After launch, Search Console data decides any title changes.

## Data

### Downloaded files (`data/raw`, gitignored)

- `Most-Recent-Cohorts-Field-of-Study.csv` and `Most-Recent-Cohorts-Institution.csv`: College Scorecard, June 2026 release. Sources: `https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_06102026.zip` and `..._Institution_06102026.zip`.
- `CollegeScorecardDataDictionary.xlsx`: read it to confirm what each field means before using it. Earlier work assumed these meanings without checking the dictionary: `BBRR2_*` = repayment status 2 years after entering repayment; `EARN_IN_STATE_1YR` = number of graduates working in the school's state; `IPEDSCOUNT2` = awards in the later of two years; `DEBT_ALL_STGP_ANY_MDN10YRPAY` = monthly payment on a 10-year plan.
- `bls-oews-may2025-nursing-sample.json`: the BLS API response used for the nursing page.
- Keep a `data/raw/SOURCES.md` listing every file, its source URL, and its download date.

Missing values in the Scorecard files are `PS` (privacy suppressed) or `NA`. Treat both as missing.

### Duplicate campus rule (critical)

Schools with several campuses that share one `OPEID6` report one combined figure, copied onto every campus row. Example: "South University-Austin" carries South University's figure across all its campuses in many states. Rules:

- Keep one row per (`OPEID6`, `CIPCODE`, `CREDLEV`), preferring the row with `MAIN = 1`.
- In state comparisons, leave out schools whose main campus is in another state.
- National and state medians, percentiles, and ranks use the rows left after this rule.

### Which programs get a page

Counted on 2026-10-05 with the duplicate rule applied: a program qualifies when it has `EARN_MDN_1YR` and `DEBT_ALL_STGP_ANY_MDN`, and at least 5 programs with the same CIP and credential exist in the same state.

- 20,297 pages: 14,705 bachelor's, 2,985 associate's, 2,607 undergraduate certificates. 3,674 schools, 139 fields of study.
- 17,076 of those also have 5-year earnings. 6,906 have every section filled.
- When a program lacks the data for a section (Pell split, repayment, 5-year pay, and so on), hide that section. Never show an empty table, `$0`, `NaN`, `undefined`, or `null`.

### Other sources still to download

- BLS OEWS, May 2025: state, metro, and national pay (median, 10th and 90th percentile) and employment by occupation. The user added a free BLS API v2 key to `.env` as `BLS_API_KEY` (gitignored; never print it, commit it, or send it anywhere except the BLS API). Use the v2 endpoint `https://api.bls.gov/publicAPI/v2/timeseries/data/` with `registrationkey`. The v1 API also worked without a key. Series IDs: `OEUS{state FIPS}00000000000{SOC}{datatype}`, for example `OEUS480000000000029114113` = Texas registered nurse annual median. Datatypes: 01 employment, 11 annual 10th percentile, 13 annual median, 15 annual 90th percentile. Metro: `OEUM00{MSA code}000000{SOC}{datatype}`. National: `OEUN0000000000000{SOC}{datatype}`. API v1 has a small daily limit. v2 with a key allows more requests per day and more series per request, but check its current limits. The OEWS bulk files are another option. bls.gov pages blocked plain curl requests. If bulk downloads are blocked, ask the user. Never put the user's email address in a request header without asking.
- BLS Employment Projections 2025 to 2035: national growth and yearly openings per occupation.
- NCES CIP-to-SOC crosswalk (CIP 2020): maps each field of study to its occupations.
- BEA Regional Price Parities 2024 (states and metros). FRED CSV works without a key, for example `https://fred.stlouisfed.org/graph/fredgraph.csv?id=TXRPPALL,RPPALL12420`.

## Work needed before generating pages

1. **Data script** (for example `scripts/build-data.ts`). It reads `data/raw`, applies the rules above, computes every figure (medians, percentiles, ranks, debt-to-earnings, payment share of pay, price-adjusted pay, in-state share, five-year growth, the school's own program rank, nearby programs within about 60 miles using latitude and longitude), and writes one JSON record per page plus an index.
2. **Scale.** `src/data/programs.ts` is imported by the route, and loaders also run in the browser on client navigation. 20,000 records must not end up in the client bundle. Load page data on the server (for example with `createServerFn`), prerender the pages, and generate `sitemap.xml`.
3. **Remove nursing-specific text.** The careers section, the registered nurse bars in "What graduates earn over time", the FAQ answer that mentions registered nurses, the related link "Which degrees lead to registered nursing?", and the note "BLS figures cover nurses at every experience level" were written for nursing. Drive them from the crosswalk and BLS data for each field.
4. **Plain names.** CIP titles are long ("Registered Nursing, Nursing Administration, Nursing Research and Clinical Nursing."). Write a curated short-name list for the 139 fields (5138 becomes "Nursing"). Use a degree abbreviation only where it is common and correct (BSN for a nursing bachelor's). Otherwise use the credential name. School short names (like "UT Austin") come from a curated list for well-known schools, with the full name as the fallback.
5. **Unique slugs.** School names repeat across states, so add the state or city to a slug when needed.
6. **Internal links.** Every link on the page currently points to `/` as a placeholder: breadcrumb links, nearby programs, "See all 61 programs", and related pages. Every internal link must point to a page that exists. For now, program pages link only to other built program pages (the same program at nearby schools, other programs at the same school). Links to other page types are added only after those pages are built and their template is approved (see "Other page types" below).
7. **No invented notes.** The RN-to-BSN notes (Austin Community College, Texas A&M University-Central Texas) were researched by hand. The script can't detect such programs, so don't make up notes like these.

## Other page types (needed so every link works)

The user wants all pages built, and every link and breadcrumb on every page must work. Program pages link to other page types, so those types must exist before the program pages are finished. Counts below use the same eligibility and duplicate rules (counted 2026-10-05):

| Page type | What links to it from a program page | Pages |
|---|---|---|
| Program at a school (approved) | nearby programs, other programs at the same school | 20,297 |
| School page (all programs at a school, ranked) | breadcrumb school link, "See all programs" | 3,674 |
| State page | breadcrumb state link | 50 |
| Program in a state, ranked (for example nursing bachelor's in Texas) | related pages | 1,718 |
| National program page (for example nursing bachelor's nationwide) | related pages | 181 |
| Occupation page (which degrees lead to a job) | careers section, related pages | count after the crosswalk is loaded |

Total is about 25,900 pages plus occupation pages.

### Approval comes first (user's rule)

No page type is generated in bulk until the user approves its template:

1. Build one sample page of the type with real data and show it to the user (screenshot plus localhost link).
2. Change it until the user approves it.
3. Also show the user one program page that is missing some sections (one of the roughly 13,400 programs without every section filled), because it looks different from the approved UT Austin page. Get approval for how missing sections are handled.
4. Propose the breadcrumb structure (for example Home / Texas / UT Austin / Nursing (BSN)) with the first new template.

### Order of work

1. Data script for all page types, then regenerate the UT Austin nursing page and match the reference numbers.
2. Sample pages for each new page type, one at a time, each approved by the user.
3. Generate every page type in buckets of 100 with the verification below.
4. Nothing is finished while any internal link or breadcrumb link is broken. If a link target doesn't exist yet, don't add the link; add it when the target page is built, and re-run the link check on the pages that link to it.

### Hosting limit to keep in mind

The hosting choice is open. Cloudflare's free plan allows 20,000 static files per Worker version, and the paid plan allows 100,000 (https://developers.cloudflare.com/workers/platform/limits). About 26,000 prebuilt pages would not fit the free plan, so either use a paid plan or render pages on request from stored data. Keep the data layer flexible until the user decides.

## Build in buckets of 100

- Order: pages with every section filled first, bachelor's first, then by graduate count (`IPEDSCOUNT2`) descending.
- First, regenerate the UT Austin nursing page from the script. It must match the reference numbers below exactly. That is the regression check.
- For each bucket: generate, verify, fix, then record the result in a progress log (for example `data/buckets/progress.json`: bucket number, slugs, pass or fail, issues found) so work can resume in a later session.
- After bucket 1 of each page type, show the user a summary and two sample pages before continuing.
- If a bucket has failures you can't explain, stop and report to the user.

## Verification for every bucket

1. **Numbers.** A separate check script, not the generator, recomputes every number shown on each page from `data/raw` and compares it with the rendered HTML. Zero mismatches allowed.
2. **Source.** Every figure comes from the downloaded public data. No hand-typed numbers, and no estimates presented as data.
3. **Sentences match the data.** For example, "lower than at 90%" only when the share rounds to 90%, and "Most do" only when the share is 50% or more.
4. **Titles and descriptions.** Unique across all pages. The title matches the H1. Flag titles over about 60 characters and descriptions over about 160. Neither may contain `undefined`, `NaN`, `null`, or `$0`.
5. **Internal links.** Crawl each built page. Every internal link returns 200.
6. **Server HTML.** It contains `lang="en"`, the title, the meta description, the H1, all FAQ answers (closed ones included), and FAQPage JSON-LD that parses. Unknown slugs return 404.
7. **No empty parts.** No empty sections or tables. The scatter chart has at least 5 state programs.
8. **Build.** `pnpm typecheck` and `pnpm build` pass.
9. **Visual.** Screenshot at least 2 pages per bucket at desktop and phone width with the Chrome DevTools tools. Check charts, tables, and that nothing overflows.
10. **Sitemap.** `sitemap.xml` lists every built page.

## Reference numbers: UT Austin nursing bachelor's (UNITID 228778, CIP 5138, CREDLEV 3)

Program: first-year earnings $75,095; 5-year $82,838; median federal debt $19,651; monthly payment $208; Pell graduates' first-year pay $76,134 and debt $17,481; other graduates $72,913 and $23,374; Parent PLUS 53 borrowers, median $20,508; 139 working, 121 of them in Texas (87%); repayment, 121 borrowers: paid in full 30-39%, paying down 40-49%, forbearance 10-19%, default 10% or less; about 118 graduates a year.

National (895 programs with first-year pay): median first-year $74,438; 5-year $81,525; debt $27,000; debt-to-earnings 36.4%; UT Austin at the 54th percentile for pay; its debt is lower than at 89.9% of programs.

Texas (48 programs with first-year pay, 44 with pay and debt): median first-year $76,677; 5-year $86,500; debt $25,160; debt-to-earnings 33.7%; UT Austin ranks 29th of 48 on pay, 4th lowest of 44 on debt, 7th of 44 on debt-to-earnings.

School: in-state tuition $11,688; out-of-state $44,908; average net price $19,857; admission rate 26.64%; graduation rate 88.9%; 42,855 undergraduates; nursing ranks 11th of 61 bachelor's programs at UT Austin by first-year pay.

BLS, May 2025: Texas registered nurse median $95,970, employment 271,380, 10th percentile $67,120, 90th percentile $127,950; Austin metro RN median $97,890; national RN median $97,550; Texas nurse practitioner $131,670; Texas nurse anesthetist $244,990. Projections 2025 to 2035: RN jobs +6%, 180,800 openings a year.

BEA price levels, 2024: Austin metro 98.066, Texas 97.057.
