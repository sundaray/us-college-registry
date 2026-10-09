# Handover: US College Programs

Updated 2026-10-09. The code, its comments, and git history hold the details. This file holds what they don't: the user's decisions, the reasons behind unusual setup, and what comes next. Read all of it before writing code.

## What this is

- An independent programmatic SEO experiment: 24,268 static pages about US college programs, built from public U.S. government data. Never connect it to the user's job board project.
- Site name "US College Programs" (`SITE_NAME` in `src/lib/site-copy.ts`), at https://uscollegeprograms.com (`SITE_ORIGIN` in `src/lib/site.ts`). The Worker, the Alchemy stack, and the GitHub repo (https://github.com/sundaray/us-college-registry) keep the old name `us-college-registry`.
- Stack: TanStack Start (React 19, Vite 8), Tailwind v4, shadcn preset `base-vega` (Base UI primitives), pnpm 10.33.1, Node 22.
- Commands: `pnpm dev` (port 3000), `pnpm typecheck`, `pnpm build-data`, `pnpm check-reference`, `pnpm build`, `pnpm bucket`, `pnpm verify-site`, `pnpm run deploy:prod`.

## Status and next steps

All page types are built and verified:

| Page type | Address | Pages | Checker in `scripts/verify` | Bucket type |
|---|---|---|---|---|
| Program at a school | `/schools/{school}/{program}` | 19,658 | `check_program_pages.py` | `programs` |
| Program in a state, ranked | `/states/{state}/{program}` | 1,684 | `check_state_program_pages.py` | `state-programs` |
| School | `/schools/{school}` | 2,465 | `check_school_pages.py` | `schools` |
| State | `/states/{state}` | 49 | `check_state_pages.py` | `states` |
| National ranking | `/programs/{program}` | 178 | `check_national_program_pages.py` | `national-programs` |
| Career | `/careers/{occupation}` | 230 | `check_occupation_pages.py` | `occupations` |
| Home and list pages | `/`, `/programs`, `/schools`, `/careers` | 4 | `check_site_pages.py` | `site` |

The first version went live on 2026-10-06 at https://us-college-registry.effective-software.workers.dev. Everything since then is committed and pushed but not deployed yet: the domain, the new name, canonical links, the sitemap, `robots.txt`, and the national ranking. The last `pnpm verify-site` passed on 2026-10-06 (`data/buckets/site-check.json`), before the national ranking and the sitemap fix.

Next:

1. Deploy with `pnpm run deploy:prod` (see "Deploying" below). This attaches the domain with the `www` redirect and turns off the workers.dev address.
2. Run `pnpm verify-site` on the build that was deployed.
3. Check the live domain. Every built file returns 200. `www` and `http://` redirect to `https://uscollegeprograms.com` and keep the path. The workers.dev address is gone. Pages answer AI crawlers (GPTBot, ClaudeBot, PerplexityBot); the zone's bot settings were read on 2026-10-06 and nothing blocked them.
4. Ideas the user has not decided on: a static `public/llms.txt`, and WebSite and Organization JSON-LD in the root route (do it with the next change that touches every page anyway). `/schools` is the largest page at 1.3 MB and could be split by state.

## Rules for working here

- Follow the user's global CLAUDE.md everywhere, including code comments, page copy, and docs: no em dashes, plain words, descriptive parameter names (never one letter), no function names starting with `to`.
- TanStack Start and Alchemy work follows the official, latest docs (https://tanstack.com/start/latest/docs, https://alchemy.run/getting-started/).
- Approval comes first. No new page type is generated in bulk until the user approves a sample built with real data (screenshot plus link). If some pages of the type lack sections, show one of those too. After bucket 1 show a summary and two sample pages before continuing.
- Ask the user before changing any decision in this file.
- Every internal link must point to a built page. If the target doesn't exist yet, leave the link out.
- No invented notes. Notes about specific schools can't be detected from the data, so don't write them.
- In this shell `grep` is a wrapper function and can return wrong counts. Use `/usr/bin/grep` or Python.

## Data

- `data/raw` (gitignored except `SOURCES.md`) holds the downloaded files: College Scorecard June 2026, IPEDS, the NCES CIP-to-SOC crosswalk, BLS OEWS May 2025, BLS Employment Projections 2025 to 2035, and BEA Regional Price Parities 2024. `data/raw/SOURCES.md` lists each file's source URL, download date, and checksum.
- `pnpm build-data` (`scripts/build-data.ts`) reads `data/raw` and writes one JSON record per page to `data/generated` (about 1 GB, gitignored). The build reads only `data/generated`. Every number on the site comes from this script.
- `pnpm check-reference` checks the generated UT Austin nursing bachelor's record against the figures the user approved on the hand-built reference page.
- `.env` also has `BLS_API_KEY`. The build doesn't use it. Never print it, commit it, or send it anywhere but the BLS API.

Data rules:

- `PS` (privacy suppressed) and `NA` are missing values.
- Duplicate campuses: schools with several campuses sharing one `OPEID6` copy one combined figure onto every campus row. Keep one row per (`OPEID6`, `CIPCODE`, `CREDLEV`), preferring `MAIN = 1`. State comparisons leave out schools whose main campus is in another state.
- A program gets a page when it has `EARN_MDN_1YR` and `DEBT_ALL_STGP_ANY_MDN`, at least 5 programs with the same field and credential exist in its state, and its school is in the institution file, currently operating (`CURROPER = 1`), and in a known state.
- Schools with only one program that reports pay get no school page, because it would repeat the program page.
- National medians include every program after the duplicate rule except foreign schools, closed schools included. State medians use schools whose main campus is in that state.
- Every state and national figure is a median across programs, each program counted once, not across graduates. Pages say "the median {state} {field} program pays its graduates $X" and "Across N programs". Weighting by graduate counts was rejected, because it would give a figure Scorecard never published.
- Medians of an even count are the mean of the two middle values. Money rounds half up.
- Ranks are 1 plus the number of programs with a better figure.
- A tuition, net price, or undergraduate count of 0 means not reported and its row is hidden. A 0% graduation rate or default share is shown.
- `TUITIONFEE_IN` is the in-district rate. It's labeled "In-district" when IPEDS 2023-24 charges show a separate district rate, and "Tuition and fees" when in-state equals out-of-state.
- Field meanings, confirmed in the data dictionary and methodology PDF: `BBRR2_*` is borrower status 2 years after entering repayment (measured 2018 to 2020, partly during the pandemic payment pause). `EARN_IN_STATE_1YR` is graduates working in the school's state. `IPEDSCOUNT2` is awards in 2022-23, counting second majors. `DEBT_ALL_STGP_ANY_MDN10YRPAY` is the monthly payment on a standard 10-year plan.
- Pay after cost of living is first-year pay divided by the 2024 BEA price level of the school's state (`payAfterPrices`, integer arithmetic). It's shown only when at least half of the graduates who work are working in the school's state (`EARN_IN_STATE_1YR` over `EARN_COUNT_WNE_1YR`). Otherwise the page shows "Not adjusted", so online schools and DC schools don't get a distorted figure.
- Nearby programs are other programs with pages in the same field and credential within 60 miles, nearest 8.
- Short names for fields, schools, and occupations are in `scripts/reference/`. Claude chooses them, aiming for what people usually search. Nursing uses "BSN" and "ADN".

## Page decisions (approved by the user)

- The reference page is `/schools/university-of-texas-at-austin/nursing-bachelors`. The user reviewed it section by section, and every program page keeps its layout, sections, and writing style.
- Program page title and H1 are the same text: `{School} {Field} ({credential}): Tuition, Graduate Salary, and Debt`. Most are over 60 characters, and the user chose to keep them. After launch, Search Console data decides any title changes.
- Program page description: "{School} {program} graduates earn $X in year one and $Y by year five. Median federal debt: $Z, lower than at N% of similar programs."
- A section without data is hidden. Never show an empty table, `$0`, `NaN`, `undefined`, or `null`.
- The FAQ uses the shadcn Accordion with `hiddenUntilFound`, so closed answers are in the server HTML, with FAQPage JSON-LD in the head.
- Careers sections list the crosswalk occupations by national employment, leaving out "All Other" groups and postsecondary teachers. Comparison bars with one job are only for fields in `scripts/reference/matching-occupations.ts`.
- The repayment table has a note that the shares were measured partly during the pandemic payment pause.
- RN-to-BSN note: Scorecard groups RN-to-BSN programs (for nurses already working) with programs for new students, which puts them near the top of nursing rankings. A general note that names no school appears on nursing bachelor's ranking, program, and national pages (`src/lib/field-notes.ts`).
- Tables sit in a shadcn `ScrollArea` with a horizontal `ScrollBar`, so they scroll inside their card on phones. The debt and pay scatter chart keeps a 560 px minimum width in a ScrollArea. The charts are hand-built; TanStack Charts was still alpha and is to be revisited after launch.
- The home page H1 is the site name with the subtitle "Compare programs, graduate salaries, and student debt." The browser tab title is "Compare US College Programs by Graduate Pay, Debt, and Careers".
- National program pages are rankings titled "Highest-Paying {Field (Credential)} Programs in the US". The table lists every program of that field and credential that reports first-year pay, sortable four ways. The top 10 show first, and the rest are in the HTML as hidden rows until "Show all", so crawlers see every row and link.

## Checks

- Each page type has an independent Python checker in `scripts/verify` (standard library only). It recomputes every number and sentence choice from `data/raw` and compares it with the built HTML, section by section. Zero mismatches allowed.
- `pnpm bucket <n> --type <bucket type>` builds and checks 100 pages, and records the result in `data/buckets/`.
- For the whole site, run `pnpm build`, then `pnpm verify-site` (add `--no-layout` to skip the phone-width check).
- The bucket-by-bucket commit history is only in the local branch `bucket-history`.

## Deploying

- The site is a Cloudflare Worker with static assets only, deployed with Alchemy from `alchemy.run.ts`. No Worker code and no database. Requests for static assets are free.
- The build is 48,573 files (2.1 GB). The user's Workers Paid plan allows 100,000 files per version. The free plan's 20,000 is too few.
- It uses `Cloudflare.Website.StaticSite`, not `Cloudflare.Website.Vite`. The Vite version runs prerendering inside the Worker runtime, where `src/data/program-records.server.ts` can't read `data/generated` from disk.
- `memo: false` makes Alchemy build on every deploy. Its check for unchanged files opens every file at once, which goes past macOS's open file limit.
- `patches/alchemy@2.0.0-beta.81.patch` (registered in `pnpm-workspace.yaml`) raises Alchemy's hard-coded 20,000 file limit to 100,000. Drop it when Alchemy raises the limit. Until then, redo it with `pnpm patch alchemy@<version>` when upgrading Alchemy.
- Packages: `alchemy` 2.0.0-beta.81 needs `effect`, `@effect/platform-node`, and `@effect/platform-bun` 4.0.1 or newer, although the docs say `effect@rc`.
- Credentials are `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.env` (gitignored). Alchemy keeps its record of what's deployed in the Cloudflare account (`Cloudflare.state()`), so a deploy from another computer continues from the same record.
- Attaching the domain and the `www` redirect haven't run yet. If they fail with a permissions error, the token needs more zone permissions.
- To deploy from another computer: clone, `pnpm install`, put `.env` in place, get `data/generated` (copy it, or download `data/raw` and run `pnpm build-data`), then `pnpm run deploy:prod`.
- Any code change rewrites every page's HTML (the shared JavaScript file names change), so a deploy uploads all files again: about 45 minutes. Use a fast, stable connection.
- The live site serves `/schools/x` from `schools/x.html` even where `schools/x/` is also a folder. `/schools/x/` and `/schools/x.html` redirect to `/schools/x`, and unknown pages return 404.
