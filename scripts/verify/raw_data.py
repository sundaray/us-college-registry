"""Loads the public data files in data/raw for the page checker.

This module is deliberately separate from the TypeScript data script
(scripts/build-data.ts): it reads the raw files itself, with its own parsing, so
the checker never trusts anything the generator computed. Only the Python
standard library is used. Parsed tables are cached in
data/generated/verify-cache, keyed by each source file's size and modification
time and on this file itself, so later runs start fast.
"""

import csv
import pickle
import re
import zipfile
import xml.etree.ElementTree as ElementTree
from collections import defaultdict
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data' / 'raw'
CACHE = ROOT / 'data' / 'generated' / 'verify-cache'

SCORECARD_MISSING = {'', 'NA', 'PS', 'PrivacySuppressed', 'NULL'}


def cached(name, source_paths, build):
    """Returns build(), cached on disk until any source file changes."""
    CACHE.mkdir(parents=True, exist_ok=True)
    # This file is part of the stamp, so changing how a file is parsed rebuilds the cache.
    stamp = [(str(path), path.stat().st_size, path.stat().st_mtime_ns) for path in [*source_paths, Path(__file__)]]
    cache_path = CACHE / f'{name}.pickle'
    if cache_path.exists():
        with open(cache_path, 'rb') as cache_file:
            saved_stamp, value = pickle.load(cache_file)
        if saved_stamp == stamp:
            return value
    value = build()
    with open(cache_path, 'wb') as cache_file:
        pickle.dump((stamp, value), cache_file)
    return value


def scorecard_number(text):
    """Scorecard value as an exact number (int or Fraction), or None when missing."""
    text = (text or '').strip()
    if text in SCORECARD_MISSING:
        return None
    if re.fullmatch(r'-?\d+', text):
        return int(text)
    if re.fullmatch(r'-?\d*\.\d+', text):
        return Fraction(text)
    raise ValueError(f'Unexpected number {text!r}')


def read_csv_columns(path, columns, encoding='utf-8-sig', errors='strict'):
    with open(path, newline='', encoding=encoding, errors=errors) as csv_file:
        reader = csv.DictReader(csv_file, skipinitialspace=True)
        missing = [column for column in columns if column not in reader.fieldnames]
        if missing:
            raise ValueError(f'{path} lacks columns {missing}')
        for row in reader:
            yield {column: row[column] for column in columns}


FOS_COLUMNS = [
    'UNITID', 'OPEID6', 'CONTROL', 'MAIN', 'CIPCODE', 'CIPDESC', 'CREDLEV', 'IPEDSCOUNT2',
    'EARN_MDN_1YR', 'EARN_MDN_5YR', 'DEBT_ALL_STGP_ANY_MDN', 'DEBT_ALL_STGP_ANY_MDN10YRPAY',
    'EARN_PELL_WNE_MDN_1YR', 'EARN_NOPELL_WNE_MDN_1YR', 'DEBT_PELL_STGP_ANY_MDN', 'DEBT_NOPELL_STGP_ANY_MDN',
    'DEBT_ALL_PP_ANY_N', 'DEBT_ALL_PP_ANY_MDN', 'EARN_COUNT_WNE_1YR', 'EARN_IN_STATE_1YR',
    'BBRR2_FED_COMP_N', 'BBRR2_FED_COMP_PAIDINFULL', 'BBRR2_FED_COMP_MAKEPROG',
    'BBRR2_FED_COMP_FBR', 'BBRR2_FED_COMP_DFLT',
]

FOS_NUMBER_COLUMNS = FOS_COLUMNS[7:21]


def load_field_of_study():
    path = RAW / 'Most-Recent-Cohorts-Field-of-Study.csv'

    def build():
        rows = []
        for raw in read_csv_columns(path, FOS_COLUMNS):
            if raw['CREDLEV'] not in ('1', '2', '3'):
                continue
            row = dict(raw)
            row['CREDLEV'] = int(raw['CREDLEV'])
            row['UNITID'] = raw['UNITID'] if raw['UNITID'].isdigit() else None
            row['CIPDESC'] = raw['CIPDESC'].strip()
            for column in FOS_NUMBER_COLUMNS:
                row[column] = scorecard_number(raw[column])
            rows.append(row)
        return rows

    return cached('field-of-study', [path], build)


INSTITUTION_COLUMNS = [
    'UNITID', 'OPEID6', 'INSTNM', 'CITY', 'STABBR', 'ST_FIPS', 'MAIN', 'CURROPER', 'CONTROL', 'ICLEVEL',
    'LATITUDE', 'LONGITUDE', 'TUITIONFEE_IN', 'TUITIONFEE_OUT', 'TUITIONFEE_PROG', 'NPT4_PUB', 'NPT4_PRIV',
    'ADM_RATE', 'C150_4', 'C150_L4', 'UGDS',
]


def load_institutions():
    path = RAW / 'Most-Recent-Cohorts-Institution.csv'

    def build():
        institutions = {}
        for raw in read_csv_columns(path, INSTITUTION_COLUMNS):
            row = dict(raw)
            row['INSTNM'] = ' '.join(raw['INSTNM'].split())
            row['CITY'] = ' '.join(raw['CITY'].split())
            for column in INSTITUTION_COLUMNS[10:]:
                row[column] = scorecard_number(raw[column])
            institutions[raw['UNITID']] = row
        return institutions

    return cached('institutions', [path], build)


def load_metro_codes():
    """IPEDS HD2024: UNITID to metro (CBSA) code, for metropolitan areas only."""
    path = RAW / 'ipeds' / 'HD2024.csv'

    def build():
        codes = {}
        for row in read_csv_columns(path, ['UNITID', 'CBSA', 'CBSATYPE'], errors='replace'):
            if row['CBSATYPE'].strip() == '1':
                codes[row['UNITID'].strip()] = row['CBSA'].strip()
        return codes

    return cached('ipeds-metro', [path], build)


def load_district_tuition_schools():
    """IPEDS 2023-24 charges: schools whose in-district tuition and fees differ from in-state."""
    path = RAW / 'ipeds' / 'ic2023_ay.csv'

    def build():
        def value(text):
            text = text.strip()
            return None if text in ('', '.') else int(text)

        unit_ids = set()
        for row in read_csv_columns(path, ['UNITID', 'TUITION1', 'FEE1', 'TUITION2', 'FEE2'], errors='replace'):
            district, state = value(row['TUITION1']), value(row['TUITION2'])
            if district is None or state is None:
                continue
            if district + (value(row['FEE1']) or 0) != state + (value(row['FEE2']) or 0):
                unit_ids.add(row['UNITID'].strip())
        return unit_ids

    return cached('ipeds-district', [path], build)


def load_price_parities():
    """BEA RPP 2024, all items: states (GeoFIPS ss000), metros (CBSA), state portions (ss998, ss999)."""
    paths = [RAW / 'bea' / name for name in ('SARPP_STATE_2008_2024.csv', 'MARPP_MSA_2008_2024.csv', 'PARPP_PORT_2008_2024.csv')]

    def build():
        tables = []
        for path in paths:
            table = {}
            with open(path, newline='', encoding='latin-1') as csv_file:
                reader = csv.reader(csv_file, skipinitialspace=True)
                header = next(reader)
                fips_index, name_index = header.index('GeoFIPS'), header.index('GeoName')
                line_index, year_index = header.index('LineCode'), header.index('2024')
                for row in reader:
                    if len(row) <= year_index or row[line_index].strip() != '1':
                        continue
                    text = row[year_index].strip()
                    if re.fullmatch(r'\d+(\.\d+)?', text):
                        table[row[fips_index].strip()] = (row[name_index].strip(), Fraction(text))
            tables.append(table)
        return {'states': tables[0], 'metros': tables[1], 'portions': tables[2]}

    return cached('bea', paths, build)


def xlsx_rows(path, sheet_name):
    """Streams rows of one worksheet as lists of strings (standard library only)."""
    namespace = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    relationship_namespace = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            with archive.open('xl/sharedStrings.xml') as shared_file:
                for _, element in ElementTree.iterparse(shared_file):
                    if element.tag == namespace + 'si':
                        shared.append(''.join(text.text or '' for text in element.iter(namespace + 't')))
                        element.clear()
        workbook = ElementTree.fromstring(archive.read('xl/workbook.xml'))
        relationships = ElementTree.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets = {relation.get('Id'): relation.get('Target') for relation in relationships}
        target = None
        for sheet in workbook.iter(namespace + 'sheet'):
            if sheet.get('name') == sheet_name:
                target = targets[sheet.get(relationship_namespace + 'id')].lstrip('/')
        if target is None:
            raise ValueError(f'{path} has no sheet {sheet_name}')
        if not target.startswith('xl/'):
            target = 'xl/' + target

        def column_index(reference):
            letters = re.match(r'[A-Z]+', reference).group(0)
            index = 0
            for letter in letters:
                index = index * 26 + ord(letter) - 64
            return index - 1

        with archive.open(target) as sheet_file:
            for _, element in ElementTree.iterparse(sheet_file):
                if element.tag != namespace + 'row':
                    continue
                cells = {}
                for cell in element.findall(namespace + 'c'):
                    cell_type = cell.get('t')
                    value_element = cell.find(namespace + 'v')
                    if cell_type == 's' and value_element is not None:
                        value = shared[int(value_element.text)]
                    elif cell_type == 'inlineStr':
                        value = ''.join(text.text or '' for text in cell.iter(namespace + 't'))
                    else:
                        value = value_element.text if value_element is not None else ''
                    cells[column_index(cell.get('r'))] = (value or '').strip()
                yield [cells.get(index, '') for index in range(max(cells) + 1)] if cells else []
                element.clear()


def oews_number(text):
    if text in ('', '*', '**', '#', '~'):
        return None
    return scorecard_number(text)


def load_occupation_wages():
    """BLS OEWS May 2025, cross-industry, all ownerships, detailed occupations.

    Keys are (area, SOC) with area 'US', 'S48' (state FIPS), or 'M12420' (metro code).
    """
    path = RAW / 'bls' / 'all_data_M_2025.xlsx'

    def build():
        wages = {}
        rows = xlsx_rows(path, 'All May 2025 data')
        header = next(rows)
        index = {name: position for position, name in enumerate(header)}
        for row in rows:
            row = row + [''] * (len(header) - len(row))
            if row[index['I_GROUP']] != 'cross-industry' or row[index['OWN_CODE']] != '1235':
                continue
            if row[index['O_GROUP']] != 'detailed':
                continue
            area_type, area = row[index['AREA_TYPE']], row[index['AREA']]
            if area_type == '1':
                area_key = 'US'
            elif area_type in ('2', '3'):
                # Type 3 is US territories (Puerto Rico, Guam, Virgin Islands),
                # keyed like states by FIPS code.
                area_key = 'S' + area.zfill(2)
            elif area_type == '4':
                area_key = 'M' + area
            else:
                continue
            wages[(area_key, row[index['OCC_CODE']])] = {
                'title': row[index['OCC_TITLE']],
                'area_title': row[index['AREA_TITLE']],
                'employment': oews_number(row[index['TOT_EMP']]),
                'median': oews_number(row[index['A_MEDIAN']]),
                'p10': oews_number(row[index['A_PCT10']]),
                'p90': oews_number(row[index['A_PCT90']]),
            }
        return wages

    return cached('oews', [path], build)


def load_projections():
    """BLS Employment Projections 2025 to 2035, table 1.2 line items."""
    path = RAW / 'bls-ep-occupation.xlsx'

    def build():
        rows = xlsx_rows(path, 'Table 1.2')
        next(rows)
        header = next(rows)
        index = {name: position for position, name in enumerate(header)}
        growth_column = 'Employment change, percent, 2025–35'
        openings_column = 'Occupational openings, 2025–35 annual average'
        projections = {}
        for row in rows:
            if not row:
                continue
            row = row + [''] * (len(header) - len(row))
            if row[index['Occupation type']] != 'Line item':
                continue
            education = row[index['Typical education needed for entry']]
            experience = row[index['Work experience in a related occupation']]
            growth = row[index[growth_column]]
            openings = row[index[openings_column]]
            projections[row[index['2025 National Employment Matrix code']]] = {
                'growth_percent': Fraction(growth) if growth else None,
                'openings_thousands': Fraction(openings) if openings else None,
                'education': education if education and education != '—' else None,
                'experience': experience if experience and experience not in ('None', '—') else None,
            }
        return projections

    return cached('projections', [path], build)


def load_crosswalk():
    """NCES CIP 2020 to SOC 2018, rolled up to 4-digit CIP codes."""
    path = RAW / 'CIP2020_SOC2018_Crosswalk.xlsx'

    def build():
        rows = xlsx_rows(path, 'CIP-SOC')
        header = next(rows)
        cip_index, soc_index = header.index('CIP2020Code'), header.index('SOC2018Code')
        by_field = defaultdict(set)
        for row in rows:
            if len(row) <= soc_index or row[soc_index] == '99-9999':
                continue
            match = re.fullmatch(r'(\d{2})\.(\d{2})\d{2}', row[cip_index])
            if not match:
                raise ValueError(f'Unexpected CIP {row[cip_index]!r}')
            by_field[match.group(1) + match.group(2)].add(row[soc_index])
        return dict(by_field)

    return cached('crosswalk', [path], build)


def load_matching_occupations():
    """The hand-written list of fields that train for one licensed job (text, not numbers)."""
    path = ROOT / 'scripts' / 'reference' / 'matching-occupations.ts'
    text = path.read_text()
    return dict(re.findall(r"'(\d{4})': \{\s*socCode: '(\d{2}-\d{4})'", text))
