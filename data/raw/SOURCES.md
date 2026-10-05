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
