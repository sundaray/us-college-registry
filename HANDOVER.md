# Handover: build all program pages

Written 2026-10-05 at the end of the first session, updated in the second session the same day. Read all of it before writing code.

## Second session update (2026-10-05)

Done:

- Field meanings confirmed against the data dictionary and the methodology PDF (`data/raw/docs/FieldOfStudyDataDocumentation.pdf`). `BBRR2_*` is borrower status 730 days after entering repayment, measured in 2018-19 and 2019-20 (partly during the pandemic payment pause). `EARN_IN_STATE_1YR` is graduates working in the school's state. `IPEDSCOUNT2` is awards in 2022-23 and counts second majors. `DEBT_ALL_STGP_ANY_MDN10YRPAY` is the median debt over a standard 10-year plan at 4.99%.
- `pnpm build-data` (`scripts/build-data.ts`) writes one JSON record per program page to `data/generated/programs/{schoolSlug}/{programSlug}.json` plus `data/generated/program-index.json` in build order. The record type is `src/data/program-page.ts`.
- `pnpm check-reference` (`scripts/check-reference.ts`) is the regression check against the reference numbers at the end of this file. It passes.
- Downloaded and logged in `data/raw/SOURCES.md`: NCES CIP-to-SOC crosswalk, BEA price parities (states, metros, nonmetro parts of states), IPEDS directory HD2024 (school metro codes), BLS OEWS May 2025 (`bls/all_data_M_2025.xlsx`), BLS Employment Projections (`bls-ep-occupation.xlsx`). The OEWS and projections files match every BLS reference number below.
- Field short names: `scripts/reference/field-names.ts`. School short names: `scripts/reference/school-short-names.ts` (a hand-written list plus ordered rules; the data script makes every display name unique, adding the state or city when official names repeat).

Corrections to the first session's counts (its counting script gave pages to 633 programs at schools missing from the institution file, all lumped into one fake state, and didn't apply the main-campus rule):

- 19,658 program pages: 14,555 bachelor's, 2,872 associate's, 2,231 certificates. 3,342 schools, 137 fields, 49 places (47 states, DC, Puerto Rico; none in Alaska, Delaware, or Vermont). 16,551 have 5-year earnings.
- Other page types: 3,342 school pages (2,465 after the user decided to skip schools with one program, see the status below), 49 state pages, 1,684 program-in-state pages, 178 national program pages.

Decisions made by the user this session:

- Hosting: prebuild every page as a static file (plus a small JSON file per page for client-side navigation), deployed with Alchemy as a Cloudflare Worker with static assets. No D1. Paid plan limit: 100,000 files per version, 25 MiB per file; requests to static assets are free.
- Add a note under the repayment table: the shares were measured in 2018 to 2020, partly during the pandemic payment pause, so the forbearance share may be higher than usual.
- Claude decides the field and school short names, aiming for what people usually search.

Rules decided this session (tell the user if any needs to change):

- Pages only for schools in the institution file that are currently operating (`CURROPER = 1`) and in a known state.
- National medians include every program after the duplicate rule except foreign schools. Closed schools stay in (the reference count of 895 includes 7 closed colleges). State medians use schools with a known state whose main campus is in that state.
- Medians of an even count are the mean of the two middle values; pages round money half up. So the Texas median debt displays as $25,161, not the $25,160 the reference page showed (Python rounds .5 to even).
- Nearby programs: other programs with pages, same field and credential, within 60 miles, nearest 8. Texas A&M-Central Texas (an RN-to-BSN program) now appears on the UT Austin page; its hand-written note is gone.
- CIP 11.01 is "Computer and Information Science" (11.07 is "Computer Science"), so UT Austin's top-three list says that instead of "Computer Science".
- Nursing associate's degrees use "ADN", like BSN for bachelor's.
- Site data loading follows the official TanStack Start "Static Server Functions" guide: `src/data/get-program-page.ts` is a `createServerFn` with `staticFunctionMiddleware` (last middleware), reading records through `src/data/program-records.server.ts`. Prerendering saves each result as JSON under `/__tsr/staticServerFnCache/`. `src/data/programs.ts` (the hand-entered record) is deleted. The user asked that TanStack Start and Alchemy work always follow the official, latest docs (https://tanstack.com/start/latest/docs, https://alchemy.run/getting-started/).
- Prerender (TanStack Start "Static Prerendering" guide) is set in `vite.config.ts`: explicit page list from `data/generated/program-index.json`, `crawlLinks: false`, `autoSubfolderIndex: false` (writes `/schools/x/y.html`). `BUCKET=n` prerenders only bucket n. The built-in `sitemap` option needs `SITE_URL`; bucket runs use the placeholder `https://example.invalid` until the user picks a domain. Canonical links and `robots.txt` (SEO guide) also wait for the domain.
- The user approved the program page template on 2026-10-05 ("good to go"), including the breadcrumb, the careers approach, and hidden sections.

How to run a bucket (program pages):

1. `pnpm build-data` (once, or after any data or rule change), then `pnpm check-reference`.
2. `pnpm bucket <n>` runs every check for bucket n and records the result in `data/buckets/progress.json`: typecheck; build that prerenders the bucket; `scripts/verify/check_program_pages.py` (independent Python checker, standard library only, recomputes every number and every sentence choice from `data/raw` via `scripts/verify/page_model.py` and `raw_data.py`, and compares section by section with the built HTML); titles and descriptions unique across all 19,658 pages (`scripts/verify/list-titles.ts`); static page data files; sitemap; internal links (200) and unknown pages (404) on the production preview; layout at 1280 and 390 px in Chrome with screenshots in `data/generated/screenshots/bucket-NNN/`; every page of the bucket at 390 px (no sideways page scrolling, and tables wider than their card must sit in a scrolling ScrollArea); and an in-place link click that loads the next page from its static data file.
3. Look at the screenshots, then commit: one commit per passed bucket.
4. After the last bucket, build everything (no `BUCKET`), with the real `SITE_URL`, and run the checker and link check over all pages.

Known warnings (not errors): titles over 60 characters (19,504 of 19,658) and descriptions over 160 (11,957). After bucket 1 the user decided (2026-10-05): keep the approved title; use the tighter description ("{School} {program} graduates earn $X in year one and $Y by year five. Median federal debt: $Z, lower than at N% of similar programs."); run all remaining buckets, one commit per passed bucket.
- Page copy (`src/lib/program-copy.ts`) now checks every claim against the record: "several programs" needs at least 3, "usually with more debt" needs a majority, "more than 99%" replaces a rounded 100%, Pell wording says when Pell students borrowed more, and so on. Careers list the crosswalk occupations by national employment (no "All Other" groups, no postsecondary teachers) with BLS entry education; comparison bars with one job only for fields in `scripts/reference/matching-occupations.ts`. "Related pages" is hidden until its target pages exist. Breadcrumb proposal: Home / State / School / Program, with State and School as plain text until their pages exist.
- Tables: at the user's request (2026-10-05), the shadcn `Table` component wraps every table in a shadcn `ScrollArea` with a horizontal `ScrollBar` (as in the shadcn Scroll Area docs), so wide tables scroll inside their card on phones instead of being squeezed.
- Charts on phones (user decision, 2026-10-05): the debt and pay scatter keeps a 560px minimum width inside a shadcn ScrollArea with a horizontal ScrollBar, so labels stay readable; tapping a dot shows the school. The bar charts are responsive HTML and need no scrolling. The user asked about TanStack Charts (https://tanstack.com/charts/latest): `@tanstack/charts` 1.0.0 came out on 2026-10-03 and its docs still say alpha, so the decision was to keep the hand-built SVG chart and revisit TanStack Charts after launch.
- Zero values: a tuition, net price, or undergraduate count of 0 is treated as not reported and its row is hidden (no page shows "$0"; West Valley College's Scorecard tuition is 0 but IPEDS lists $1,490). A 0% graduation rate (15 pages) and a 0% default share (one page) are shown, since they are plausible reported values.
- Tuition labels: `TUITIONFEE_IN` is the in-district rate. It is labeled "In-district" when IPEDS 2023-24 charges show a separate district rate, "Tuition and fees" when in-state equals out-of-state, and schools that report by program show whole-program figures for their largest program.
- Template wording that must change for some pages (show the user in the missing-sections sample): "{control} university" in the header, "within 6 years" for two-year schools (they report `C150_L4`), "0th percentile" (93 pages), "top three" at schools with fewer than three programs (1,942 pages), no nearby programs (2,820 pages, hide the section).

## Status at the end of the second session (2026-10-05)

- All 19,658 program pages are built and verified: 197 buckets, each committed after passing every check (`data/buckets/progress.json`). Then a full build of the whole site passed `pnpm verify-site` (`scripts/verify-site.ts`, result in `data/buckets/site-check.json`): every page built, independent number and wording check on every page, unique titles and descriptions, all 17,394 distinct internal links point at built pages, static page data and sitemap complete, unknown pages 404, every page fits at 390 px, and link clicks navigate in place.
- Problems the checks found and fixed while building: a floating-point error in the Pell "borrowed more" test (bucket 29), "$0" tuition, net price, and 0 undergraduates now treated as not reported (bucket 147), double spaces in a CIP title and a city name (buckets 16 and 161), a phone overflow fixed with shadcn ScrollArea tables and chart (buckets 24 and 51), and a missing favicon (bucket 1).
- Ranking hub pages ("program in a state, ranked", approved by the user 2026-10-05 from an artifact sample): 1,684 pages at `/states/{state}/{field-credential}`, built and verified in 17 buckets (`data/buckets/state-program-progress.json`, `pnpm bucket <n> --type state-programs`, checker `scripts/verify/check_state_program_pages.py`). Program pages link to their state ranking in "Related pages". The whole-site check over all 21,342 pages (program and ranking) passed.
- RN-to-BSN note (user decision 2026-10-05): College Scorecard groups RN-to-BSN programs (for nurses already licensed and working) with programs for new students, which puts them near the top of nursing rankings. A general note, naming no school, appears under the ranking table on the 45 nursing bachelor's ranking pages and under the scatter chart on the 827 nursing bachelor's program pages (`src/lib/field-notes.ts`). Both checkers require it on exactly those pages.
- School hub pages (approved by the user 2026-10-05 from an artifact sample of UT Austin): one page per school at `/schools/{school}`, listing every program at the school that reports first-year pay. One ranked table per credential level shows each program's pay, debt, graduates a year, and rank in its state (linked to the state ranking page when it exists), with sorting by debt and by graduates. Also the school's cost, graduation, and admission figures, quick picks (when the main level has at least 6 programs), and FAQ. Schools with only one program that reports pay get no school page (user decision 2026-10-05: the page would repeat the program page), so there are 2,465 school pages, not 3,342. Built in 25 buckets (`data/buckets/school-progress.json`, `pnpm bucket <n> --type schools`, checker `scripts/verify/check_school_pages.py`, which also checks every table row and its links). Program pages link to their school page from the breadcrumb and "Related pages" when it exists. 95 more field short names were added for fields that appear only in school tables. A full build of all 23,807 pages (program, ranking, and school) then passed `pnpm verify-site` (9 of 9 checks, 23,808 distinct internal links), which rechecked every program page with its new school link.
- State hub pages (approved by the user 2026-10-06 from an artifact sample of Texas; the user asked for no fixed-height scrolling box): 49 pages at `/states/{state}`. Each has bachelor's pay, 5-year pay, and debt next to the national medians, the BEA price level (none for Puerto Rico), medians by credential, one ranked table of fields per credential linking to the state's ranking pages, and every school with a program page (A to Z; schools with one program link straight to that program page). Checker `scripts/verify/check_state_pages.py`, `pnpm bucket 1 --type states` (`data/buckets/state-progress.json`). Every program, ranking, and school page now links its state breadcrumb to the state page, and all three checkers check that link.
- Median wording (user decision 2026-10-06): every state and national figure is a median across programs (one value per program, each program counted once), not across graduates, because Scorecard publishes no pay for single graduates. Weighting by graduate counts was rejected: IPEDS award counts are not the earnings cohort, some are missing, and the result would be a figure Scorecard never published. So state page and ranking page sentences say "the median {state} {field} program pays its graduates $X", and state key figures say "Across N programs". The checkers require this wording.
- National program pages (approved by the user 2026-10-06 from an artifact sample of nursing bachelor's): 178 pages at `/programs/{field-credential}`, one per field and credential with program pages. Each has the national medians ("Across N programs"), a ranked table of the field's state rankings (with a note on places that have too few programs to rank, which the data script checks), national quick picks (10 each, only programs with their own page, linked), national BLS pay for the matching job or the crosswalk careers (shown through the shared OccupationRow with "the US" as the area), FAQ, and links to the same field's other credential levels. Program pages and ranking pages link to their national page under "Related pages". Checker `scripts/verify/check_national_program_pages.py`, `pnpm bucket <n> --type national-programs` (2 buckets, `data/buckets/national-program-progress.json`).
- Occupation pages (approved by the user 2026-10-06 from an artifact sample of registered nurses): 230 pages at `/careers/{occupation}`, one for every occupation a careers section can list (each field's crosswalk occupations and matching jobs) that has a national median pay (actors, dancers, and musicians have only hourly pay, so they get none). Each has national pay, the bottom and top 10%, projected growth, pay in every state with pay after BEA prices (integer arithmetic, exact ranks), and the national program pages whose fields lead there. BLS titles that read badly ("Cooks, Restaurant") get plain names in `scripts/reference/occupation-names.ts`; pages also show the official title. Job titles in every careers section link to these pages, and the program, ranking, and national checkers check those links. Checker `scripts/verify/check_occupation_pages.py`, `pnpm bucket <n> --type occupations` (3 buckets, `data/buckets/occupation-progress.json`).
- Puerto Rico job pay (fixed 2026-10-06): BLS OEWS files Puerto Rico, Guam, and the Virgin Islands under area type 3 (territories), which the data script and the checker skipped, so the careers sections on Puerto Rico pages showed national pay. Both now read type 3 like states, and Puerto Rico pages show Puerto Rico pay.
- Tooling note: in this shell `grep` is a wrapper function, not the system grep, and it can return wrong counts. Check file contents with Python or `/usr/bin/grep`.
- Home page and the navbar's list pages (approved by the user 2026-10-06 from an artifact sample of the home page): `/` ("Compare US College Programs by Graduate Pay, Debt, and Careers", with Browse by state, by field, and by career), `/programs` (all 178 national program pages by credential, sortable), `/schools` (every school with a program page, by state), and `/careers` (all 230 careers, sortable by pay, jobs, and growth). The home heading names US colleges because the site name may change with the domain; the name in the top bar, footer, and home tab comes from `SITE_NAME` in `src/lib/site-copy.ts`. The navbar links to the three list pages, and national and career pages link to them in their breadcrumbs. Records in `data/generated/site/`, checker `scripts/verify/check_site_pages.py`, `pnpm bucket 1 --type site`.
- Final whole-site check (2026-10-06): a full build of all 24,268 pages (19,658 program, 1,684 ranking, 2,465 school, 49 state, 178 national program, 230 occupation, plus the home page and 3 list pages) passed `pnpm verify-site`, 9 of 9 checks (`data/buckets/site-check.json`). Every one of the 246 buckets passed. The built site is 48,575 files (2.0 GB), none over 5 MB; `/schools` is the largest page at 1.3 MB and could be split by state later.
- GitHub: the 252 local commits were squashed into one commit and pushed to `main` at the user's request (2026-10-06). The bucket-by-bucket history is kept only in the local branch `bucket-history`.
- Next session (the user is buying a domain first):
  1. The user picks the domain and site name. Set `SITE_NAME` in `src/lib/site-copy.ts` if the name changes, build with `SITE_URL` set to the domain (sitemap host), and add canonical links and `robots.txt` following the TanStack Start SEO guide.
  2. Deploy with Alchemy following https://alchemy.run/getting-started/ (the user will log in to Cloudflare). Confirm the Workers static asset file limit for 48,575 files on the Workers Paid plan, and that Cloudflare serves `/schools/x.html` at `/schools/x` while `/schools/x/` also exists as a folder.
  3. Run `pnpm verify-site` against the build that is deployed.

## Goal

Build every eligible program page (19,658, see the update above) and the page types they link to (see "Other page types"), for an independent programmatic SEO experiment, in buckets of 100. For every page: generate the page, its title, and its meta description; verify every number against the public US government data in `data/raw`; make sure every internal link works; run the other checks listed below.

This project is independent. Never connect it to the user's job board project.

## Project

- Path: `/Users/hemanta/Documents/pseo`
- Stack: TanStack Start (React 19, Vite 8), Tailwind v4, shadcn preset `base-vega` (Base UI primitives), pnpm.
- Commands: `pnpm dev` (port 3000), `pnpm typecheck`, `pnpm build`.
- Site name for now: "us-college-registry", shown on the page as "US College Registry". The domain is not chosen yet. Use `us-college-registry` as the Worker and Alchemy app name.
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

- First session count (wrong, see the update at the top): 20,297 pages. Correct count: 19,658 pages from 3,342 schools.
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
| Program at a school (approved) | nearby programs, other programs at the same school | 19,658 |
| School page (all programs at a school, ranked) | breadcrumb school link, "Related pages" | 2,465 (schools with at least two programs that report pay) |
| State page | breadcrumb state link | 49 |
| Program in a state, ranked (for example nursing bachelor's in Texas) | related pages | 1,684 |
| National program page (for example nursing bachelor's nationwide), `/programs/{field-credential}` | related pages | 178 |
| Occupation page (which degrees lead to a job) | careers section, related pages | count after the crosswalk is loaded |

Total is about 24,900 pages plus occupation pages (counts corrected in the second session).

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

### Hosting: Cloudflare Worker deployed with Alchemy

Decided by the user: the site deploys to Cloudflare as a Worker using Alchemy, the same way as the user's jobhunter project. Copy its setup:

- `/Users/hemanta/Documents/jobhunter/alchemy.run.ts` (Alchemy v2, `alchemy` package `2.0.0-beta.79`, `Cloudflare.Website.Vite` for the TanStack Start site, `Cloudflare.D1.Database` for data, stages with `alchemy dev` and `alchemy deploy --stage prod`).
- The `deploying-tanstack-start-cloudflare` skill covers this setup.

Limits that shape the build (check the current numbers at https://developers.cloudflare.com/workers/platform/limits):

- Static assets: 20,000 files per Worker version on the free plan, 100,000 on paid. About 26,000 prebuilt pages do not fit the free plan.
- Worker script size is limited, so bundling all page data into the Worker code is not an option either.
- The user has the Workers Paid plan ($5 a month), so up to 100,000 static assets per version are allowed and all ~26,000 pages can be prebuilt as static files. Decided in the second session: prebuild static pages, no D1.

## Build in buckets of 100

- Order: pages with every section filled first, bachelor's first, then by graduate count (`IPEDSCOUNT2`) descending.
- First, regenerate the UT Austin nursing page from the script. It must match the reference numbers below exactly. That is the regression check.
- The project uses git (first commit 2026-10-05, branch `main`, remote `https://github.com/sundaray/us-college-registry`). Commit after each bucket passes verification, one commit per bucket.
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
