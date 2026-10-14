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
| `docs/InstitutionDataDocumentation.pdf` | https://collegescorecard.ed.gov/assets/InstitutionDataDocumentation.pdf (methodology of the school-level file; the copy at this URL is labeled June 2024) | 2026-10-14 |

Checksums:

- `Most-Recent-Cohorts-Field-of-Study.csv`: `3184f634cea46a94a3e8dc73f6d2147ecaea5b3b648b26adbfdfdd9133ce8d35`
- `Most-Recent-Cohorts-Institution.csv`: `89e8a35a6588dfb81a6ce78fa9df4cb99b36ef7aa4b28fb0157f9e3e1a7d81b5`
- `CollegeScorecardDataDictionary.xlsx`: `2f314d1d02d4ce7e8ca29feffaaa69860b18b2812cbb407adc014c6792fa1740`
- `docs/InstitutionDataDocumentation.pdf`: `df781892631bb3fd52123a17a4e5c0092c765b26195edfc3eaf71c3988c97a79`

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
| Nurse practitioners typically need at least a master's degree in advanced practice nursing, plus nursing licenses and certification. The page keeps the source's "typically". | Bureau of Labor Statistics, Occupational Outlook Handbook, How to Become a Nurse Anesthetist, Nurse Midwife, or Nurse Practitioner (https://www.bls.gov/ooh/healthcare/nurse-anesthetists-nurse-midwives-and-nurse-practitioners.htm#tab-4). The education and licenses sections describe graduate preparation, registered nursing and advanced practice licenses, and national certification. | 2026-10-12 |
| The Department of Education changes each pay figure slightly before publishing it, and debt figures are not changed. | `docs/FieldOfStudyDataDocumentation.pdf`, page 7, listed above. | 2026-10-12 |
| Pay comes from federal tax records. It only counts graduates who received federal financial aid, were working and were not enrolled in more school. (The "About this data" list on `/programs`.) | `docs/FieldOfStudyDataDocumentation.pdf`, the section on earnings: the cohort "consists of those individuals who received federal financial aid" and leaves out those who "were subsequently enrolled in school during the measurement year" or "did not work during the measurement year"; pay is "the sum of wages and deferred compensation from all non-duplicate W-2 forms and positive self-employment earnings from IRS Form 1040 Schedules SE". | 2026-10-12 |
| Debt comes from federal student loan records. Each program's figure is the median amount borrowed by its graduates who took federal student loans; loans taken by parents and private loans are not counted. | The same document, the section on cumulative loan debt: the metrics cover "individuals who were aided through Title IV federal loan programs"; our field `DEBT_ALL_STGP_ANY_MDN` is the median of Direct Subsidized and Unsubsidized Loans with Graduate Direct PLUS loans, and Parent PLUS loans are a separate field we do not use. Perkins Loans are left out too. The figure counts loans from any school the student attended. | 2026-10-12 |
| On a master's page, debt is the median amount a program's graduates borrowed in federal student loans for graduate study at that school. It leaves out interest, undergraduate loans, loans taken at other schools and private loans, and it only includes graduates who took federal loans. | `docs/FieldOfStudyDataDocumentation.pdf`, the section on cumulative loan debt: one method covers "loans originated only at the institution where the debt is reported" (our field `DEBT_ALL_STGP_EVAL_MDN`); the debt "only includes loans disbursed at the same academic level", so a master's figure includes "all graduate-level loans disbursed by the evaluated institution" and excludes "all undergraduate-level loans"; it "does not capture any accrued interest". The section on federally aided students: debt is "based on only federal loans for only Title IV borrowers". On `Most-Recent-Cohorts-Field-of-Study.csv`: the field for loans from any school, `DEBT_ALL_STGP_ANY_MDN`, is withheld on all 38,621 master's rows, and so are the Parent PLUS fields. | 2026-10-13 |
| On a master's page, first-year pay and debt are for students who graduated in 2018-19 and 2019-20. Pay after 5 years is for students who graduated in 2014-15 and 2015-16. Both pay figures were measured in 2020 and 2021 and are shown in 2022 dollars. | `CollegeScorecardDataDictionary.xlsx`, sheet `FieldOfStudy_Cohort_Map`, column "FieldOfStudyMostRecent datafile": `EARN_MDN_1YR` is the "AY2018-19, AY2019-20 pooled earnings cohort measured in CY2020, CY2021, inflation adjusted to 2022 dollars"; `EARN_MDN_5YR` is the "AY2014-2015, AY2015-2016 pooled earnings cohort measured in CY2020, CY2021, inflation adjusted to 2022 dollars"; `DEBT_ALL_STGP_EVAL_MDN` and `DEBT_ALL_STGP_EVAL_MDN10YRPAY` are the "NSLDS pooled AY2018-19, AY2019-20 cohort". | 2026-10-13 |
| On a program page, ranks, medians and counts only include programs that report the figure, and the government withholds many programs' figures to protect privacy. | `docs/FieldOfStudyDataDocumentation.pdf`, the section on privacy protection: debt metrics "have been treated via cell suppression methods"; for pay, cases are eliminated "based on small cell sizes" and further suppression follows; "Any debt or earnings data points suppressed for privacy are indicated by the 'PrivacySuppressed' data code". On `Most-Recent-Cohorts-Field-of-Study.csv`: 25,739 of the 71,664 bachelor's rows and 10,439 of the 38,621 master's rows report first-year pay. In `scripts/build-data.ts`, each rank, median and count is taken over the programs that report that figure. | 2026-10-13 |
| On a program page, the answer about where graduates work says when the school reports that its programs of that credential in the field can all, or in part, be completed fully online, and that online students may live in other states. The question and answer do not say graduates "stay" or "leave". | `CollegeScorecardDataDictionary.xlsx`, sheet `FieldOfStudy_Data_Dictionary`: `DISTANCE` is the "Distance education indiciator for the field of study", from IPEDS, with 3 "All credentials in this field of study may be fully completed via distance education", 2 "At least one, but not all", 1 "No credentials" and 0 "Field of study not reported to IPEDS". `docs/FieldOfStudyDataDocumentation.pdf`, the section on defining field of study, says the same and adds that a field can hold several programs, which is why the pages speak of the school's programs in the field. The file has no figure for where a graduate lived before or during study. The user decided the wording on 2026-10-13. | 2026-10-13 |
| On a master's page, the monthly payment and debt-to-earnings leave out loans from an earlier degree. A graduate who has them pays more. | `CollegeScorecardDataDictionary.xlsx`, sheet `FieldOfStudy_Data_Dictionary`: `DEBT_ALL_STGP_EVAL_MDN10YRPAY` is the "Median estimated monthly payment for Stafford and Grad PLUS loan debt disbursed at this institution". `docs/FieldOfStudyDataDocumentation.pdf`, the section on cumulative loan debt: the debt includes only loans "at the same academic level" as the credential. Debt-to-earnings is our own division of that debt by first-year pay. | 2026-10-13 |
| Not settled: which loans the repayment table on a master's page covers. The page claims only "Two years into repayment (N borrowers)". | The dictionary labels `BBRR2_FED_COMP_PAIDINFULL` and its three sister columns "Percentage of undergraduate completer undergraduate federal student loan borrowers", though 10,212 master's rows fill them. `docs/FieldOfStudyDataDocumentation.pdf`, the section on repayment rate, says status "is assigned at the borrower level" and that a borrower with "at least one" loan in default counts as in default, which reads as all of a borrower's federal loans. It does not say so for graduate programs. Do not write that the table is about the debt figure above it. | 2026-10-13 |
| On a master's page, "Pay is based on N working graduates and debt on M borrowers, from two graduating classes." | `CollegeScorecardDataDictionary.xlsx`, sheet `FieldOfStudy_Data_Dictionary`: `EARN_COUNT_WNE_1YR` is the "Number of graduates working and not enrolled 1 year after completing", and `DEBT_ALL_STGP_EVAL_N` is the "Borrower count for average/median Stafford and Grad PLUS loan debt disbursed at this institution". Sheet `FieldOfStudy_Cohort_Map`: both are for the pooled AY2018-19 and AY2019-20 cohort. On `Most-Recent-Cohorts-Field-of-Study.csv`: of the 3,876 master's programs that qualify for a page, all report the first count and 3,713 the second. The page gives no verdict on debt ("stands out", "is high"), because the debt figure can rest on a small part of a class: 46 borrowers at Harvard's business administration master's, which has about 877 graduates a year. The user decided this on 2026-10-13. | 2026-10-13 |
| A master's page shows no tuition, and its title does not name any. | `ipeds/ic2023_ay.xlsx`, sheet `Description`: `TUITION6`, `FEE6`, `TUITION7` and `FEE7` are "Charges to full-time graduate students for the full academic year 2023-24", the school's average across its graduate programs. The files hold no price for one master's program. The user decided on 2026-10-13 to leave the figure out. | 2026-10-13 |
| On `/programs`, "Programs" is the number of programs that report first-year pay, and the debt median can cover a different number. | Our own records: of the 178 rows, the count of programs with debt is lower than the count with pay on 90, higher on 79 and the same on 9 (`earningsYear1Count` and `medianDebtCount` in `data/generated/national-programs`). | 2026-10-12 |
| On a school page, tuition, net price, the graduation rate and the admission rate are for the school's undergraduates, and the figures, the answer about cost and "About this data" say so. At a school that reports by program, tuition and net price are for undergraduates in its largest program. | `docs/InstitutionDataDocumentation.pdf`: the admission rate is "the number of admitted undergraduates divided by the number of undergraduates who applied" (page 11); tuition and fees are "calculated for full-time, first-time students" at academic-year schools and "those charged to full-time, first-time undergraduates for the largest program" at program-year schools (page 13); net price is "for full-time, first-time undergraduate Title IV-receiving students" (page 14). `CollegeScorecardDataDictionary.xlsx`, sheet `Institution_Data_Dictionary`, notes on `NPT4_PUB` and `C150_4`: "full-time, first-time, degree/certificate-seeking undergraduates". | 2026-10-14 |
