"""What every program page must show, worked out from data/raw alone.

This is an independent second implementation of the page rules in
scripts/build-data.ts and src/lib/program-copy.ts. It shares no code or output
with them. Arithmetic is exact (Fraction), and display rounding is half up, so a
difference between this model and a built page means one of the two is wrong.
"""

import math
import re
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path

import raw_data

MINIMUM_STATE_PROGRAMS = 5
NEARBY_MILES = 60
NEARBY_LIMIT = 8
OCCUPATION_LIMIT = 4
EARTH_RADIUS_MILES = 3958.8
REPAYMENT_COLUMNS = [
    ('paidInFull', 'BBRR2_FED_COMP_PAIDINFULL'),
    ('makingProgress', 'BBRR2_FED_COMP_MAKEPROG'),
    ('forbearance', 'BBRR2_FED_COMP_FBR'),
    ('default', 'BBRR2_FED_COMP_DFLT'),
]
# FIPS codes of the 50 states, DC, and Puerto Rico.
PAGE_STATE_FIPS = {f'{code:02d}' for code in range(1, 57)} - {'03', '07', '14', '43', '52'} | {'72'}


REFERENCE = Path(__file__).resolve().parents[1] / 'reference'


def load_state_names():
    """USPS code to state name, from scripts/reference/states.ts."""
    text = (REFERENCE / 'states.ts').read_text()
    return dict(re.findall(r"(\w\w): \{ name: '([^']+)', fips: '\d\d' \}", text))


def state_slug(name):
    """URL slug of a state name. State names have only letters and spaces."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


# A place's name as it reads when it stands alone in a sentence: "in Texas", "in
# the District of Columbia". Before a noun the plain name is right ("District of
# Columbia programs"), and so it is in a table cell or a breadcrumb.
NAMES_WITH_THE = {'District of Columbia'}


def place_in_sentence(name):
    return f'the {name}' if name in NAMES_WITH_THE else name


def place_starting_sentence(name):
    return f'The {name}' if name in NAMES_WITH_THE else name


# Places the federal data lists beside the states that are not states, and what
# each one is. Sentences that compare states leave these places out and mention
# them afterwards. A table that lists one says so in a note.
NOT_STATES = {'District of Columbia': 'a single city', 'Puerto Rico': 'a U.S. territory'}


def is_state(name):
    return name not in NOT_STATES


def join_places(parts):
    if len(parts) <= 2:
        return ' and '.join(parts)
    return f"{', '.join(parts[:-1])} and {parts[-1]}"


def not_states_note(names):
    """The note under a table of states that also lists places that are not
    states, or None when it lists none."""
    listed = [name for name in NOT_STATES if name in names]
    if not listed:
        return None
    opening = join_places([f'{place_in_sentence(name)} is {NOT_STATES[name]}' for name in listed])
    opening = opening[0].upper() + opening[1:]
    if len(listed) == 1:
        return f'{opening}, not a state. It is listed for comparison.'
    return f"{opening}. {'Neither is a state' if len(listed) == 2 else 'None of them is a state'}. They are listed for comparison."


def outside_states_range(places, highest_state, lowest_state):
    """How places that are not states compare with the states' range: "higher in
    the District of Columbia ($111,530) and lower in Puerto Rico ($43,530)", or
    None. `places` holds (name, amount) pairs. Amounts are compared as the page
    shows them. Returns the words and the amounts they show."""
    shown = lambda amount: int(round_half_up(amount))
    others = [(name, amount) for name, amount in places if not is_state(name)]
    higher = [(name, amount) for name, amount in others if shown(amount) > shown(highest_state)]
    lower = [(name, amount) for name, amount in others if shown(amount) < shown(lowest_state)]
    named = lambda pairs: join_places([f'{place_in_sentence(name)} ({money(amount)})' for name, amount in pairs])
    parts = []
    if higher:
        parts.append(f'higher in {named(higher)}')
    if lower:
        parts.append(f'lower in {named(lower)}')
    if not parts:
        return None, []
    return ' and '.join(parts), [money(amount) for _, amount in higher + lower]


# A place name that takes "the" must have it wherever it stands alone: in the
# title, the description and the page text.
BARE_PLACE_PATTERNS = [
    r'\b(?:[Ii]n|outside|puts|Where) District of Columbia\b',
    r'\bacross District of Columbia[.,]',
    r'(?<![Tt]he )District of Columbia,? (?:is|are|has|have|does|do|lowest|the lowest|at a median)\b',
]


def bare_place_errors(title, description, main_text):
    """An error for each place name that stands alone without its "the"."""
    errors = []
    for place, text in (('title', title), ('description', description), ('page', main_text)):
        for pattern in BARE_PLACE_PATTERNS:
            found = re.search(pattern, text)
            if found:
                errors.append(f'place name without "the" in {place}: ...{text[max(0, found.start() - 40):found.end() + 40]}...')
    return errors


def load_field_names():
    """CIP code to plain field name, from scripts/reference/field-names.ts."""
    text = (REFERENCE / 'field-names.ts').read_text()
    return dict(re.findall(r"'(\d{4})': \{ name: '([^']*)'", text))


def load_degree_abbreviations():
    """(CIP code, credential level) to degree abbreviation, such as ('5138', 3): 'BSN'."""
    text = (REFERENCE / 'field-names.ts').read_text()
    block = text.split('DEGREE_ABBREVIATIONS', 1)[1]
    abbreviations = {}
    for cip, levels in re.findall(r"'(\d{4})': \{([^}]*)\}", block):
        for level, abbreviation in re.findall(r"(\d): '([^']+)'", levels):
            abbreviations[(cip, int(level))] = abbreviation
    return abbreviations


def load_occupation_names():
    """SOC code to plain occupation name, from scripts/reference/occupation-names.ts."""
    text = (REFERENCE / 'occupation-names.ts').read_text()
    return dict(re.findall(r"'(\d\d-\d{4})': '([^']+)'", text))


def slugify(text):
    """URL slug of a field or occupation name (letters, digits, spaces, commas)."""
    return re.sub(r'[^a-z0-9]+', '-', text.lower().replace("'", '')).strip('-')


# Display formatting, mirroring what a reader sees.

def round_half_up(value, places=0):
    quantum = Decimal(1).scaleb(-places)
    if isinstance(value, Fraction):
        decimal_value = Decimal(value.numerator) / Decimal(value.denominator)
    else:
        decimal_value = Decimal(repr(value)) if isinstance(value, float) else Decimal(value)
    return decimal_value.quantize(quantum, rounding=ROUND_HALF_UP)


def money(value):
    return '${:,}'.format(int(round_half_up(value)))


def count(value):
    return '{:,}'.format(int(value))


def percent_number(share):
    return int(round_half_up(Fraction(share) * 100))


def percent(share):
    return f'{percent_number(share)}%'


def share_of_programs(share):
    return 'more than 99%' if percent_number(share) == 100 and share < 1 else percent(share)


def ordinal(position):
    if 11 <= position % 100 <= 13:
        return f'{position}th'
    return f'{position}' + {1: 'st', 2: 'nd', 3: 'rd'}.get(position % 10, 'th')


def share_range(text):
    """Scorecard repayment share, such as "<=0.10" or "0.30 - 0.39", as displayed."""
    text = text.strip()

    def whole(number_text):
        return int(Fraction(number_text) * 100)

    if text.startswith('<='):
        return f'{whole(text[2:])}% or less'
    if text.startswith('>='):
        return f'{whole(text[2:])}% or more'
    if ' - ' in text:
        low, high = text.split(' - ')
        return f'{whole(low)}–{whole(high)}%'
    return f'{whole(text)}%'


def miles_label(miles):
    return 'Under 1 mi' if miles < 1 else f'{int(round_half_up(miles))} mi'


def median(values):
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return Fraction(ordered[middle])
    return Fraction(ordered[middle - 1] + ordered[middle], 2)


def miles_between(first, second):
    latitude_one, longitude_one = map(math.radians, first)
    latitude_two, longitude_two = map(math.radians, second)
    haversine = (
        math.sin((latitude_two - latitude_one) / 2) ** 2
        + math.cos(latitude_one) * math.cos(latitude_two) * math.sin((longitude_two - longitude_one) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(haversine))


class Model:
    def __init__(self):
        self.programs = raw_data.load_field_of_study()
        self.institutions = raw_data.load_institutions()
        self.metro_codes = raw_data.load_metro_codes()
        self.district_schools = raw_data.load_district_tuition_schools()
        self.prices = raw_data.load_price_parities()
        self.wages = raw_data.load_occupation_wages()
        self.projections = raw_data.load_projections()
        self.crosswalk = raw_data.load_crosswalk()
        self.matching = raw_data.load_matching_occupations()
        self._build_pools()

    def _build_pools(self):
        groups = defaultdict(list)
        for row in self.programs:
            groups[(row['OPEID6'], row['CIPCODE'], row['CREDLEV'])].append(row)

        def preference(row):
            return (row['MAIN'] != '1', int(row['UNITID']) if row['UNITID'] else float('inf'))

        self.kept = [min(group, key=preference) for group in groups.values()]
        self.kept_by_unit = {(row['UNITID'], row['CIPCODE'], row['CREDLEV']): row for row in self.kept if row['UNITID']}
        main_state = {}
        for institution in self.institutions.values():
            if institution['MAIN'] == '1':
                main_state[institution['OPEID6']] = institution['STABBR']

        # Where each program's graduates studied: the file gives every campus its
        # own count, though pay and debt are one combined figure. A campus that
        # is not in the institution file can't be placed in a state.
        self.graduates_by_state = defaultdict(lambda: defaultdict(int))
        for row in self.programs:
            campus = self.institutions.get(row['UNITID']) if row['UNITID'] else None
            if campus and row['IPEDSCOUNT2']:
                self.graduates_by_state[(row['OPEID6'], row['CIPCODE'], row['CREDLEV'])][campus['STABBR']] += row['IPEDSCOUNT2']

        self.national = defaultdict(list)
        self.state = defaultdict(list)
        self.school = defaultdict(list)
        self.school_debt_only = defaultdict(int)
        # Programs that report pay but are left out of their state, because more
        # than half of their graduates studied at campuses in other states.
        self.studied_elsewhere_state = defaultdict(int)
        self.studied_elsewhere_school = defaultdict(int)
        self.in_state_pool = set()
        for row in self.kept:
            if row['CONTROL'] != 'Foreign':
                self.national[(row['CIPCODE'], row['CREDLEV'])].append(row)
            institution = self.institutions.get(row['UNITID']) if row['UNITID'] else None
            if not institution or institution['LATITUDE'] is None or institution['LONGITUDE'] is None:
                continue
            if institution['CONTROL'] not in ('1', '2', '3') or institution['ICLEVEL'] not in ('1', '2', '3'):
                continue
            home = main_state.get(row['OPEID6'])
            if home and home != institution['STABBR']:
                continue
            share = self.share_studied_in(row, institution['STABBR'])
            if share is not None and share < Fraction(1, 2):
                if row['EARN_MDN_1YR'] is not None:
                    self.studied_elsewhere_state[(row['CIPCODE'], row['CREDLEV'], institution['STABBR'])] += 1
                    self.studied_elsewhere_school[row['UNITID']] += 1
                continue
            self.state[(row['CIPCODE'], row['CREDLEV'], institution['STABBR'])].append(row)
            self.in_state_pool.add(id(row))
            if row['EARN_MDN_1YR'] is not None:
                self.school[(row['UNITID'], row['CREDLEV'])].append(row)
            elif row['DEBT_ALL_STGP_ANY_MDN'] is not None:
                self.school_debt_only[(row['UNITID'], row['CREDLEV'])] += 1

        def has_both(row):
            return row['EARN_MDN_1YR'] is not None and row['DEBT_ALL_STGP_ANY_MDN'] is not None

        self.page_rows = []
        for row in self.kept:
            if id(row) not in self.in_state_pool or not has_both(row):
                continue
            institution = self.institutions[row['UNITID']]
            if institution['CURROPER'] != '1' or institution['ST_FIPS'].zfill(2) not in PAGE_STATE_FIPS:
                continue
            pool = self.state[(row['CIPCODE'], row['CREDLEV'], institution['STABBR'])]
            if sum(1 for other in pool if has_both(other)) >= MINIMUM_STATE_PROGRAMS:
                self.page_rows.append(row)
        self.page_ids = {id(row) for row in self.page_rows}
        self.page_unit_ids = {row['UNITID'] for row in self.page_rows}
        self.page_rows_by_field = defaultdict(list)
        for row in self.page_rows:
            self.page_rows_by_field[(row['CIPCODE'], row['CREDLEV'])].append(row)

    def share_studied_in(self, row, state):
        """The share of a program's graduates who studied at campuses in one
        state, or None when no campus reports a count."""
        by_state = self.graduates_by_state.get((row['OPEID6'], row['CIPCODE'], row['CREDLEV']), {})
        total = sum(by_state.values())
        return Fraction(by_state.get(state, 0), total) if total else None

    def has_trusted_location(self, unit_id):
        """False when the school's metro area lies in another state than its
        address. Its row then contradicts itself about where the school is, and
        a page shows nothing that depends on its location."""
        metro_price = self.prices['metros'].get(self.metro_codes.get(unit_id))
        if not metro_price:
            return True
        states = re.search(r', ([A-Z]{2}(?:-[A-Z]{2})*)', metro_price[0])
        return states is None or self.institutions[unit_id]['STABBR'] in states.group(1).split('-')

    @staticmethod
    def benchmark(rows):
        pay = [row['EARN_MDN_1YR'] for row in rows if row['EARN_MDN_1YR'] is not None]
        five = [row['EARN_MDN_5YR'] for row in rows if row['EARN_MDN_5YR'] is not None]
        debt = [row['DEBT_ALL_STGP_ANY_MDN'] for row in rows if row['DEBT_ALL_STGP_ANY_MDN'] is not None]
        ratios = [
            Fraction(row['DEBT_ALL_STGP_ANY_MDN'], row['EARN_MDN_1YR'])
            for row in rows
            if row['DEBT_ALL_STGP_ANY_MDN'] is not None and row['EARN_MDN_1YR'] is not None
        ]
        return {
            'year1': median(pay), 'year1_count': len(pay),
            'year5': median(five) if five else None, 'year5_count': len(five),
            'debt': median(debt), 'debt_count': len(debt),
            'dte': median(ratios), 'dte_count': len(ratios),
        }

    def career_fields(self):
        """Occupations with their own page: every occupation a careers section can
        list (the crosswalk occupations of each field with program pages, and the
        matching jobs) that has a national median pay. Maps each SOC code to the
        (CIP, credential level) pairs whose pages list it."""
        if hasattr(self, '_career_fields'):
            return self._career_fields
        fields = defaultdict(list)
        for cip, level in self.page_rows_by_field:
            codes = [occupation['code'] for occupation in self.occupations(cip, '00')]
            if self.matching.get(cip) and self.matching[cip] not in codes:
                codes.append(self.matching[cip])
            for code in codes:
                if self.wages.get(('US', code), {}).get('median') is not None:
                    fields[code].append((cip, level))
        self._career_fields = dict(fields)
        return self._career_fields

    def occupations(self, cip, state_fips):
        candidates = []
        seen = set()
        for crosswalk_code in self.crosswalk.get(cip, set()):
            if crosswalk_code.startswith('25-1'):
                continue
            combined = crosswalk_code[:6] + '0'
            if ('US', crosswalk_code) in self.wages:
                code = crosswalk_code
            elif ('US', combined) in self.wages:
                code = combined
            else:
                continue
            if code in seen:
                continue
            national = self.wages[('US', code)]
            if 'all other' in national['title'].lower() or national['employment'] is None:
                continue
            seen.add(code)
            candidates.append((-national['employment'], code))
        result = []
        for _, code in sorted(candidates)[:OCCUPATION_LIMIT]:
            state = self.wages.get(('S' + state_fips, code), {})
            national = self.wages[('US', code)]
            projection = self.projections.get(code, {})
            result.append({
                'code': code,
                'title': national['title'],
                'state_median': state.get('median'),
                'state_employment': state.get('employment'),
                'p10': state.get('p10'),
                'p90': state.get('p90'),
                'national_median': national['median'],
                'growth_percent': projection.get('growth_percent'),
                'openings': projection.get('openings_thousands'),
                'education': projection.get('education'),
                'experience': projection.get('experience'),
            })
        return result

    def page(self, unit_id, cip, credential_level):
        """Every fact a page shows, or raises if the program shouldn't have a page."""
        row = self.kept_by_unit.get((unit_id, cip, credential_level))
        if row is None or id(row) not in self.page_ids:
            raise LookupError(f'No eligible program for {unit_id} {cip} {credential_level}')
        institution = self.institutions[unit_id]
        state = institution['STABBR']
        state_fips = institution['ST_FIPS'].zfill(2)
        year1, debt = row['EARN_MDN_1YR'], row['DEBT_ALL_STGP_ANY_MDN']

        national_rows = self.national[(cip, credential_level)]
        state_rows = self.state[(cip, credential_level, state)]
        national_pay = [other['EARN_MDN_1YR'] for other in national_rows if other['EARN_MDN_1YR'] is not None]
        national_debt = [other['DEBT_ALL_STGP_ANY_MDN'] for other in national_rows if other['DEBT_ALL_STGP_ANY_MDN'] is not None]
        state_pay = [other['EARN_MDN_1YR'] for other in state_rows if other['EARN_MDN_1YR'] is not None]
        state_both = [
            other for other in state_rows
            if other['EARN_MDN_1YR'] is not None and other['DEBT_ALL_STGP_ANY_MDN'] is not None
        ]
        ratio = Fraction(debt, year1)
        school_rows = self.school[(unit_id, credential_level)]
        top = sorted(school_rows, key=lambda other: (-other['EARN_MDN_1YR'], other['CIPCODE']))[:3]

        repayment = []
        if row['BBRR2_FED_COMP_N']:
            for status, column in REPAYMENT_COLUMNS:
                if row[column].strip() not in raw_data.SCORECARD_MISSING:
                    repayment.append((status, share_range(row[column])))

        here = (float(institution['LATITUDE']), float(institution['LONGITUDE']))
        trusted = self.has_trusted_location(unit_id)
        nearby = []
        for other in self.page_rows_by_field[(cip, credential_level)]:
            # A school without a trusted location has no nearby programs and is
            # not a nearby program of any other school.
            if other is not row and not (trusted and self.has_trusted_location(other['UNITID'])):
                continue
            other_institution = self.institutions[other['UNITID']]
            distance = miles_between(here, (float(other_institution['LATITUDE']), float(other_institution['LONGITUDE'])))
            if other is not row and distance > NEARBY_MILES:
                continue
            nearby.append({
                'current': other is row,
                'miles': 0 if other is row else distance,
                'year1': other['EARN_MDN_1YR'],
                'debt': other['DEBT_ALL_STGP_ANY_MDN'],
            })
        nearby.sort(key=lambda item: (not item['current'], item['miles']))
        nearby = nearby[: NEARBY_LIMIT + 1]

        price = None
        state_price = self.prices['states'].get(f'{state_fips}000')
        metro_code = self.metro_codes.get(unit_id)
        metro_price = self.prices['metros'].get(metro_code) if metro_code else None
        portion_price = self.prices['portions'].get(f'{state_fips}999')
        if not trusted:
            # Only the state's price level, which depends on the address alone.
            price = {'kind': None, 'index': None, 'state_index': state_price[1]} if state_price else None
        elif state_price and metro_code and metro_price:
            price = {'kind': 'metro', 'index': metro_price[1], 'state_index': state_price[1]}
        elif state_price and not metro_code and portion_price:
            price = {'kind': 'nonmetro', 'index': portion_price[1], 'state_index': state_price[1]}

        matching = None
        matching_code = self.matching.get(cip)
        if matching_code:
            state_wage = self.wages.get(('S' + state_fips, matching_code), {})
            national_wage = self.wages.get(('US', matching_code), {})
            metro_wage = self.wages.get(('M' + metro_code, matching_code), {}) if metro_code and trusted else {}
            if state_wage.get('median') is not None and national_wage.get('median') is not None:
                matching = {
                    'state_median': state_wage['median'],
                    'national_median': national_wage['median'],
                    'metro_median': metro_wage.get('median'),
                }

        control = institution['CONTROL']
        level = institution['ICLEVEL']

        def positive(value):
            # Zero tuition, net price, or enrollment counts as not reported.
            return value if value is not None and value > 0 else None

        graduation = institution['C150_4'] if level == '1' else institution['C150_L4']
        return {
            'row': row,
            'institution': institution,
            'year1': year1,
            'year5': row['EARN_MDN_5YR'],
            'debt': debt,
            'monthly': row['DEBT_ALL_STGP_ANY_MDN10YRPAY'],
            'pell_year1': row['EARN_PELL_WNE_MDN_1YR'],
            'other_year1': row['EARN_NOPELL_WNE_MDN_1YR'],
            'pell_debt': row['DEBT_PELL_STGP_ANY_MDN'],
            'other_debt': row['DEBT_NOPELL_STGP_ANY_MDN'],
            'parent_plus_count': row['DEBT_ALL_PP_ANY_N'],
            'parent_plus_median': row['DEBT_ALL_PP_ANY_MDN'],
            'working': row['EARN_COUNT_WNE_1YR'],
            'working_in_state': row['EARN_IN_STATE_1YR'],
            'graduates': row['IPEDSCOUNT2'] or None,
            'repayment_borrowers': row['BBRR2_FED_COMP_N'] if repayment else None,
            'repayment': repayment,
            'national': self.benchmark(national_rows),
            'state': self.benchmark(state_rows),
            'percentile': int(round_half_up(Fraction(100 * sum(1 for pay in national_pay if pay < year1), len(national_pay)))),
            'lower_than': Fraction(sum(1 for other in national_debt if other > debt), len(national_debt)),
            'higher_than': Fraction(sum(1 for other in national_debt if other < debt), len(national_debt)),
            'state_pay_rank': 1 + sum(1 for pay in state_pay if pay > year1),
            'state_debt_rank': 1 + sum(1 for other in state_both if other['DEBT_ALL_STGP_ANY_MDN'] < debt),
            'state_dte_rank': 1 + sum(
                1 for other in state_both if Fraction(other['DEBT_ALL_STGP_ANY_MDN'], other['EARN_MDN_1YR']) < ratio
            ),
            'state_both': state_both,
            'school_rank': 1 + sum(1 for other in school_rows if other['EARN_MDN_1YR'] > year1),
            'school_count': len(school_rows),
            'school_total': sum(len(self.school.get((unit_id, level), [])) for level in (1, 2, 3)),
            'top_programs': [(other['CIPCODE'], other['EARN_MDN_1YR']) for other in top],
            'nearby': nearby,
            'price': price,
            'trusted_location': trusted,
            # Set when some graduates studied at campuses in other states.
            'in_state_share': self.share_studied_in(row, state) if len(self.graduates_by_state.get((row['OPEID6'], cip, credential_level), {})) > 1 else None,
            'occupations': self.occupations(cip, state_fips),
            'matching': matching,
            'public': control == '1',
            'four_year': level == '1',
            # "Within six years" is true only where the school mostly awards bachelor's degrees.
            'within_six_years': level == '1' and institution['PREDDEG'] == 3,
            'in_state_tuition': positive(institution['TUITIONFEE_IN']),
            'out_of_state_tuition': positive(institution['TUITIONFEE_OUT']),
            'program_tuition': positive(institution['TUITIONFEE_PROG']),
            'reports_by_program': institution['TUITIONFEE_IN'] is None and institution['TUITIONFEE_PROG'] is not None,
            'district_tuition': unit_id in self.district_schools,
            'net_price': positive(institution['NPT4_PUB'] if control == '1' else institution['NPT4_PRIV']),
            'admission_rate': institution['ADM_RATE'],
            'graduation_rate': graduation,
            'undergraduates': positive(institution['UGDS']),
        }
