# Data sources

Every number on the site comes from the files in this folder. They are public U.S.
government data, downloaded as listed below. The data files themselves are not
committed (they are large); this list is. To rebuild, download each file to the
path shown, then run `pnpm build-data`.

Checksums are SHA-256 of the file as downloaded (or as extracted, for files that
came inside a zip).

## U.S. Department of Education, College Scorecard (June 2026 release)

| Path | Source | Downloaded |
|---|---|---|
| `Most-Recent-Cohorts-Field-of-Study.csv` | https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_06102026.zip (extracted) | 2026-10-05 |
| `Most-Recent-Cohorts-Institution.csv` | https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_06102026.zip (extracted) | 2026-10-05 |
| `CollegeScorecardDataDictionary.xlsx` | College Scorecard data dictionary, released with the June 10, 2026 files | 2026-10-05 |
| `docs/FieldOfStudyDataDocumentation.pdf` | https://collegescorecard.ed.gov/assets/FieldOfStudyDataDocumentation.pdf (methodology; the copy at this URL is labeled June 2024) | 2026-10-05 |

Checksums:

- `Most-Recent-Cohorts-Field-of-Study.csv`: `3184f634cea46a94a3e8dc73f6d2147ecaea5b3b648b26adbfdfdd9133ce8d35`
- `Most-Recent-Cohorts-Institution.csv`: `89e8a35a6588dfb81a6ce78fa9df4cb99b36ef7aa4b28fb0157f9e3e1a7d81b5`
- `CollegeScorecardDataDictionary.xlsx`: `2f314d1d02d4ce7e8ca29feffaaa69860b18b2812cbb407adc014c6792fa1740`

## NCES, IPEDS (directory HD2024, charges IC2023_AY)

Used for each school's metro area (CBSA code), which the Scorecard files don't include, and for the tuition label.

| Path | Source | Downloaded |
|---|---|---|
| `ipeds-HD2024.zip`, extracted to `ipeds/HD2024.csv` | https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip | 2026-10-05 |
| `ipeds-HD2024_Dict.zip`, extracted to `ipeds/HD2024_dict.xlsx` | https://nces.ed.gov/ipeds/datacenter/data/HD2024_Dict.zip | 2026-10-05 |
| `ipeds-IC2023_AY.zip`, extracted to `ipeds/ic2023_ay.csv` | https://nces.ed.gov/ipeds/datacenter/data/IC2023_AY.zip (2023-24 charges; used only to tell whether a school charges a separate in-district rate, which decides the tuition label. The 2024-25 file, IC2024_AY, returned 404 on 2026-10-05) | 2026-10-05 |
| `ipeds-IC2023_AY_Dict.zip`, extracted to `ipeds/ic2023_ay.xlsx` | https://nces.ed.gov/ipeds/datacenter/data/IC2023_AY_Dict.zip | 2026-10-05 |

Checksums:

- `ipeds/HD2024.csv`: `d7b20e136fd971d7dce8ad6ec9b7002f0f281f133959f2c3a6c089a5a4610fe5`
- `ipeds/ic2023_ay.csv`: `a534c8d8376274b86cf1fce17f3bf5f6adb9c5b3d60b93358e634185dc165686`

## NCES, CIP 2020 to SOC 2018 crosswalk

Maps each field of study to the occupations it leads to.

| Path | Source | Downloaded |
|---|---|---|
| `CIP2020_SOC2018_Crosswalk.xlsx` | https://nces.ed.gov/ipeds/cipcode/Files/CIP2020_SOC2018_Crosswalk.xlsx | 2026-10-05 |

Checksum: `ba3d59a191b9d977a5c457a66b9348c4f2f7963aafacf72c0b80113b46bf0ab8`

## Bureau of Economic Analysis, Regional Price Parities (2008 to 2024, released February 2026)

The site uses the 2024 "RPPs: All items" line.

| Path | Source | Downloaded |
|---|---|---|
| `bea-SARPP.zip`, extracted to `bea/SARPP_STATE_2008_2024.csv` | https://apps.bea.gov/regional/zip/SARPP.zip (states) | 2026-10-05 |
| `bea-MARPP.zip`, extracted to `bea/MARPP_MSA_2008_2024.csv` | https://apps.bea.gov/regional/zip/MARPP.zip (metro areas) | 2026-10-05 |
| `bea-PARPP.zip`, extracted to `bea/PARPP_PORT_2008_2024.csv` | https://apps.bea.gov/regional/zip/PARPP.zip (metro and nonmetro parts of each state) | 2026-10-05 |

Checksums:

- `bea/SARPP_STATE_2008_2024.csv`: `9c0cbbf81061b6721fc31f580719b1c57489aef75b70e933ed2386b4dff79863`
- `bea/MARPP_MSA_2008_2024.csv`: `4ce7a7e2ea08ff721de83f50d8a70bb9c93956a49970462f462372aa58cee9f4`
- `bea/PARPP_PORT_2008_2024.csv`: `a633f6229ee9c22b87416d6709cec01473ace68b1a2804acd20e6d56e19f1efa`

## Bureau of Labor Statistics

| Path | Source | Downloaded |
|---|---|---|
| `bls-oesm25all.zip`, extracted to `bls/all_data_M_2025.xlsx` | https://www.bls.gov/oes/special-requests/oesm25all.zip (Occupational Employment and Wage Statistics, May 2025, all areas; downloaded by the user in a browser because bls.gov refuses scripted requests) | 2026-10-05 |
| `bls-ep-occupation.xlsx` | https://www.bls.gov/emp/ind-occ-matrix/occupation.xlsx (Employment Projections 2025 to 2035; downloaded by the user in a browser) | 2026-10-05 |
| `bls-oews-may2025-nursing-sample.json` | BLS Public Data API v1 response for the nursing page series (Texas, Austin metro, and national registered nurse pay, plus nurse practitioner and nurse anesthetist). Superseded by the OEWS file above, which has the same values. | 2026-10-05 |

Checksums:

- `bls-oesm25all.zip`: `86ffcbbeb27a96b7aa84d01801de71ee94ee9027452152caabebfdec9d764fde`
- `bls/all_data_M_2025.xlsx`: `bf8e6ff5072a5b37e053d1d47220a73164168d2ed2a5fd22336abfd4761fa429`
- `bls-ep-occupation.xlsx`: `a7d060f0576f7d4f5b829b9a0bb4a6c11a12766d159ebb0e07aab5bd2e7583c5`

## Agency documents behind our explanations

Pages explain in plain words how each agency measures pay, jobs and prices. Each
explanation below was checked against the agency's own document, and against the
files in this folder where they can show it. Check them again when a new data
release is loaded. A new explanation goes on a page only after it has a row here.

| What the pages say | Document | Checked |
|---|---|---|
| The Bureau of Labor Statistics asks employers what they pay people in each job. The figures leave out people who work on farms, in private households or for themselves. | Occupational Employment and Wage Statistics: overview (https://www.bls.gov/oes/oes_emp.htm), questions and answers (https://www.bls.gov/oes/oes_ques.htm) and technical notes (https://www.bls.gov/oes/current/oes_tec.htm). The survey covers "wage and salary workers in nonfarm establishments" and "does not include the self-employed, owners and partners in unincorporated firms, household workers, or unpaid family workers". Crop production and animal production are not surveyed. | 2026-10-12 |
| The yearly pay figure assumes full-time work all year. | The same questions and answers ("a full-time, year-round schedule of 2,080 hours") and technical notes. On `bls/all_data_M_2025.xlsx`: for all 767 national jobs with both figures, the yearly median is the hourly median times 2,080, within what rounding allows. | 2026-10-12 |
| Eight career pages leave that sentence out. | "Field Descriptions" sheet of `bls/all_data_M_2025.xlsx`, column `ANNUAL`: only yearly pay is released for some jobs that typically work fewer than 2,080 hours a year but are paid by the year, such as teachers. 58 national jobs have it, 8 of them with a career page. | 2026-10-12 |
| Half of the workers earn less than the median. One in ten earns less than the bottom 10% figure, and one in ten earns more than the top 10% figure. | Questions and answers, as above: "A percentile wage is a boundary", and the median "is the boundary between the highest paid 50 percent and the lowest paid 50 percent of workers in that occupation". The pages we read have no separate sentence for the 10th and 90th percentiles; the "Field Descriptions" sheet of `bls/all_data_M_2025.xlsx` names those columns "Annual 10th percentile wage" and "Annual 90th percentile wage". | 2026-10-12 |
| Openings a year come from the change in the number of jobs and from people who leave the occupation, either to stop working or to move to a different kind of job. | Employment Projections, occupational separations and openings (https://www.bls.gov/emp/documentation/separations.htm): "Projections of separations are combined with projections of employment change to determine occupational openings", and separations are "workers exiting the labor force, due to retirement or other reasons" and "workers transferring to different occupations". On `bls-ep-occupation.xlsx`: openings equal separations plus the yearly change in jobs for all 1,112 occupations, the shrinking ones included. | 2026-10-12 |
| A price level of 100 is the US average, and dividing pay by a state's price level shows what the pay buys there. | Bureau of Economic Analysis, Regional Price Parities by State and Metro Area (https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area), and the definition file inside the zips listed above. | 2026-10-12 |
| The U.S. Department of Education and the Bureau of Labor Statistics link programs to jobs. | NCES, CIP to SOC crosswalk (https://nces.ed.gov/ipeds/cipcode/post3.aspx?y=56): "a joint effort by the Bureau of Labor Statistics and the National Center for Education Statistics". NCES is part of the Department of Education. | 2026-10-12 |
| Related fields do not establish that an individual program qualifies a graduate for a job. | NCES, Guidelines for Using the CIP-SOC Crosswalk (https://nces.ed.gov/Ipeds/cipcode/Files/IES2020_CIP_SOC_Crosswalk_508C.pdf), page 2. The links describe possible relationships, not graduates' job outcomes; users must consider education level and other entry requirements. This site groups the detailed fields into the broader fields used by College Scorecard. | 2026-10-12 |
| Nurse practitioners need at least a master's degree in advanced practice nursing, plus nursing licenses and certification. | Bureau of Labor Statistics, Occupational Outlook Handbook, How to Become a Nurse Anesthetist, Nurse Midwife, or Nurse Practitioner (https://www.bls.gov/ooh/healthcare/nurse-anesthetists-nurse-midwives-and-nurse-practitioners.htm#tab-4). The education and licenses sections describe graduate preparation, registered nursing and advanced practice licenses, and national certification. | 2026-10-12 |
| The Department of Education changes each pay figure slightly before publishing it, and debt figures are not changed. | `docs/FieldOfStudyDataDocumentation.pdf`, page 7, listed above. | 2026-10-12 |
