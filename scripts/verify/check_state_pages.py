#!/usr/bin/env python3
"""Checks built state pages against the public data in data/raw.

Same approach as check_program_pages.py: page_model.py works out, from data/raw
only, every number the page must show and which wording it must use; this
script compares that, section by section, with the built HTML. Each row of the
field and school tables is also checked on its own, including its link.

Usage:
  python3 scripts/verify/check_state_pages.py --html-dir dist/client --pages pages.txt --report report.json
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_model  # noqa: E402
import check_program_pages  # noqa: E402
from check_program_pages import (  # noqa: E402
    CAMPUS_RULE, FORBIDDEN_PATTERNS, MEDIAN_EXAMPLE_TOKENS, ONE_PARAGRAPH_LIMIT, SOURCE_LINE, STATE_NAMES, TOKEN_PATTERN, Expectation,
    number_tokens, parse_html, table_rows, tile_lines, visible_text,
)
from page_model import count, money, round_half_up  # noqa: E402

CREDENTIALS = {3: "Bachelor's", 2: "Associate's", 1: 'Certificate'}
WITH_ARTICLE = {3: "a bachelor's", 2: "an associate's", 1: 'a certificate'}
CONTROL_LABELS = {'1': 'Public', '2': 'Private nonprofit', '3': 'For-profit'}
NURSING_CIP = '5138'
# Fixed phrases on state pages that contain digits but no data.
STATE_STATIC_PHRASES = ['Regional Price Parities for 2024', 'Regional Price Parity for 2024', 'Regional Price Parities, 2024', 'US average 100', 'which it sets at 100']
VISIBLE_ROWS = 10
# Sections in the order the page shows them. A state has a field ranking for each
# credential level it has ranking pages at, bachelor's first.
SECTION_ORDER = ['header', 'summary', 'key-figures', 'key-figure-questions', 'credentials', 'fields-3', 'fields-2', 'fields-1', 'schools', 'faq', 'about-data']
# Wording the revised pages no longer use anywhere.
RETIRED_WORDING = [r', so ', r'—', r'(?i)\bearnings\b', r'The short answer', r'\bBLS\b', r'\bBEA\b', r'(?<!College )\bScorecard\b', r', and the median', r', ranked$']


class Rows:
    """Rows of one state, by credential level, plus national rows by level."""

    def __init__(self, model):
        self.model = model
        self.state = defaultdict(lambda: defaultdict(list))
        self.pools = defaultdict(list)
        for (cip, level, state), rows in model.state.items():
            self.state[state][level].extend(rows)
            self.pools[state].append((cip, level, rows))
        self.national = defaultdict(list)
        for (cip, level), rows in model.national.items():
            self.national[level].extend(rows)
        self.page_states = {model.institutions[row['UNITID']]['STABBR'] for row in model.page_rows}
        self.page_rows_by_unit = defaultdict(list)
        for row in model.page_rows:
            self.page_rows_by_unit[row['UNITID']].append(row)


def state_model(rows, state, field_names, degrees):
    model = rows.model
    if state not in rows.page_states:
        raise LookupError(f'No state page for {state}')
    by_level = rows.state[state]
    credentials = []
    for level in (3, 2, 1):
        if any(row['EARN_MDN_1YR'] is not None for row in by_level[level]):
            credentials.append({'level': level, 'state': model.benchmark(by_level[level]), 'national': model.benchmark(rows.national[level])})

    fields = {}
    for cip, level, pool in rows.pools[state]:
        if not any(id(row) in model.page_ids for row in pool):
            continue
        benchmark = model.benchmark(pool)
        degree = degrees.get((cip, level))
        fields.setdefault(level, []).append({
            'cip': cip,
            'label': f'{field_names[cip]} ({degree})' if degree else field_names[cip],
            'name': field_names[cip],
            'count': benchmark['year1_count'],
            'pay': benchmark['year1'],
            'debt': benchmark['debt'],
        })
    for level, level_fields in fields.items():
        for field in level_fields:
            field['pay_rank'] = 1 + sum(1 for other in level_fields if other['pay'] > field['pay'])
        level_fields.sort(key=lambda field: -field['pay'])

    schools = {}
    for unit_id, page_rows in rows.page_rows_by_unit.items():
        institution = model.institutions[unit_id]
        if institution['STABBR'] != state:
            continue
        total = sum(len(model.school.get((unit_id, level), [])) for level in (1, 2, 3))
        only = page_rows[0] if total == 1 else None
        program_name = None
        if only is not None:
            degree = degrees.get((only['CIPCODE'], only['CREDLEV'])) or CREDENTIALS[only['CREDLEV']]
            program_name = f"{field_names[only['CIPCODE']]} ({degree})"
        schools[unit_id] = {
            'city': institution['CITY'],
            'control': CONTROL_LABELS[institution['CONTROL']],
            'programs': total,
            'program_name': program_name,
        }

    all_rows = [row for level in (1, 2, 3) for row in by_level[level]]
    with_pay = [row for row in all_rows if row['EARN_MDN_1YR'] is not None]
    fips = next(row for row in model.institutions.values() if row['STABBR'] == state)['ST_FIPS'].zfill(2)
    price = model.prices['states'].get(f'{fips}000')
    return {
        'name': STATE_NAMES[state],
        'credentials': credentials,
        'fields': fields,
        'schools': schools,
        'program_count': len(with_pay),
        'schools_with_pay': len({row['UNITID'] for row in with_pay}),
        'price': price[1] if price else None,
    }


def price_tokens(index):
    gap = Fraction(index) - 100
    percent = int(round_half_up(abs(gap)))
    tenths = round_half_up(Fraction(index), 1)
    label = 'About the same' if percent == 0 else f"{percent}% {'higher' if gap > 0 else 'lower'}"
    return label, f'{tenths}'


def expected_sections(state):
    name = state['name']
    bachelors = next(credential for credential in state['credentials'] if credential['level'] == 3)
    b_state, b_national = bachelors['state'], bachelors['national']
    bachelor_fields = state['fields'].get(3, [])
    sections = {}

    def tied(fields, value):
        return [field for field in fields if field['pay'] == value]

    # The summary has two subjects: the state's medians for pay and debt, then
    # the fields that pay the most and the least.
    summary = sections['summary'] = Expectation(True)
    gap = b_state['year1'] - b_national['year1']
    summary.add(money(b_state['year1']), money(b_state['debt']), money(b_national['debt']))
    if gap != 0:
        summary.add(money(abs(gap)))
        comparison = rf"{re.escape(money(abs(gap)))} {'more' if gap > 0 else 'less'} than the national median"
    else:
        comparison = 'the same as the national median'
    # Figures are medians across programs, and the wording must say so.
    summary.claim(rf"^Summary The median {re.escape(name)} bachelor's program pays its graduates {re.escape(money(b_state['year1']))} in their first year, {comparison}\. It leaves them with {re.escape(money(b_state['debt']))} in federal debt, compared with {re.escape(money(b_national['debt']))} nationally\.")
    if len(bachelor_fields) >= 2:
        top = tied(bachelor_fields, bachelor_fields[0]['pay'])
        bottom = tied(bachelor_fields, bachelor_fields[-1]['pay'])
        summary.add(count(len(bachelor_fields)), money(top[0]['pay']), money(bottom[0]['pay']))
        summary.claim(rf"nationally\. Of the {count(len(bachelor_fields))} bachelor's fields ranked in {re.escape(page_model.place_in_sentence(name))}, ")
        if len(top) == 1:
            summary.claim(rf"(?i){re.escape(top[0]['name'])} pays the most \({re.escape(money(top[0]['pay']))}\) and ", True)
        else:
            summary.claim(rf" pay the most \({re.escape(money(top[0]['pay']))}\) and ", True)
        if len(bottom) == 1:
            summary.claim(rf"(?i) and {re.escape(bottom[0]['name'])} pays the least \({re.escape(money(bottom[0]['pay']))}\)\.$", True)
        else:
            summary.claim(rf" pay the least \({re.escape(money(bottom[0]['pay']))}\)\.$", True)
    elif len(bachelor_fields) == 1:
        summary.add(money(bachelor_fields[0]['pay']))
        summary.claim(rf"nationally\. .* is the only bachelor's field ranked in {re.escape(page_model.place_in_sentence(name))}, with a median of {re.escape(money(bachelor_fields[0]['pay']))}\.$")
    summary.has_second_subject = bool(bachelor_fields)

    # Each tile's label, value and line of context.
    has_year5 = b_state['year5'] is not None and b_national['year5'] is not None
    figures = sections['key-figures'] = Expectation(True)
    figures.add(money(b_state['year1']), money(b_national['year1']), money(b_state['debt']), money(b_national['debt']))
    figures.add(count(b_state['year1_count']), count(b_state['debt_count']))
    figures.tiles = [["Median first-year pay, bachelor's", money(b_state['year1']), f"Across {count(b_state['year1_count'])} programs. National {money(b_national['year1'])}"]]
    if has_year5:
        figures.add(money(b_state['year5']), money(b_national['year5']), count(b_state['year5_count']))
        figures.tiles.append(["Median pay after 5 years, bachelor's", money(b_state['year5']), f"Across {count(b_state['year5_count'])} programs. National {money(b_national['year5'])}"])
    figures.tiles.append(["Median federal debt, bachelor's", money(b_state['debt']), f"Across {count(b_state['debt_count'])} programs. National {money(b_national['debt'])}"])
    if state['price'] is not None:
        label, index = price_tokens(state['price'])
        figures.add(*TOKEN_PATTERN.findall(label), *TOKEN_PATTERN.findall(index))
        figures.tiles.append(['Prices compared with the US', label, f'Price level {index}, US average 100'])

    # The questions under the key figures: the median, the two figures, and the
    # state's price level when it has one.
    questions = sections['key-figure-questions'] = Expectation(True)
    questions.add(*MEDIAN_EXAMPLE_TOKENS)
    questions.add(money(b_state['year1']), count(b_state['year1_count']), money(b_state['debt']), count(b_state['debt_count']))
    if has_year5:
        questions.add(count(b_state['year5_count']))
    questions.claim(r'What does "median" mean\? An average adds up every value and divides by how many there are\.')
    questions.claim(rf"{re.escape(money(b_state['year1']))} is the median of those figures across the {count(b_state['year1_count'])} {re.escape(name)} bachelor's programs that report one\.")
    questions.claim(rf"Median pay after 5 years is the same measure for an earlier graduating class, and {count(b_state['year5_count'])} programs report it\.", has_year5)
    questions.claim(rf"{re.escape(money(b_state['debt']))} is the median of those figures across the {count(b_state['debt_count'])} programs that report one\.")
    questions.names = ['What does "median" mean?', 'What is median first-year pay?', 'What is median federal debt?']
    if state['price'] is not None:
        label, index = price_tokens(state['price'])
        questions.add(*TOKEN_PATTERN.findall(label), *TOKEN_PATTERN.findall(index))
        questions.names.append('What does "prices compared with the US" mean?')
        place = page_model.place_starting_sentence(name)
        if label == 'About the same':
            meaning = 'which means prices there are about the same as in the country as a whole'
        else:
            percent_text, direction = label.split(' ')
            meaning = f"which means goods, services and housing cost about {percent_text} {'more' if direction == 'higher' else 'less'} there than in the country as a whole"
        questions.claim(rf"The Bureau of Economic Analysis measures how prices in each state compare with the national average, which it sets at 100\. {re.escape(place)} is at {re.escape(index)}, {meaning}\. Bureau of Economic Analysis: the federal agency that publishes the main measures of the U\.S\. economy\. The figure is its Regional Price Parity for 2024\.")
    questions.claim(r'debt-to-earnings|would be at 40%', False)
    questions.claim(r'Bureau of Economic Analysis', state['price'] is not None)

    # The table of credentials, row by row.
    credential_section = sections['credentials'] = Expectation(True)
    credential_section.claim(rf"^Pay and debt by credential Each row is the median across every {re.escape(name)} program at that credential that reports the figure, next to the national median\.")
    credential_section.rows = []
    for credential in state['credentials']:
        cells = [
            count(credential['state']['year1_count']), money(credential['state']['year1']), money(credential['national']['year1']),
            money(credential['state']['debt']), money(credential['national']['debt']),
        ]
        credential_section.add(*cells)
        credential_section.rows.append([CREDENTIALS[credential['level']], *cells])

    for level in (3, 2, 1):
        level_fields = state['fields'].get(level, [])
        section = sections[f'fields-{level}'] = Expectation(bool(level_fields))
        sortable = len(level_fields) >= 3
        # "Bachelor's programs", whatever the number of rows. The page title already
        # says what they are ranked by, so the heading has no count and no "ranked by".
        if level_fields:
            section.claim(rf"^{re.escape(CREDENTIALS[level])} programs Each row is one field's median")
        section.claim(r'types? of|ranked by graduate pay', False)
        # "Page 1 of N" under a table with more than ten fields.
        section.pages = -(-len(level_fields) // VISIBLE_ROWS)
        if section.pages > 1:
            section.add('1', count(section.pages))
        for field in level_fields:
            if sortable:
                section.add(str(field['pay_rank']))
            section.add(count(field['count']), money(field['pay']), money(field['debt']))
        section.claim(r'are for nurses who are already licensed and working\. College Scorecard counts them with programs for new students', level == 3 and any(field['cip'] == NURSING_CIP for field in level_fields))
        section.rows = level_fields
        section.sortable = sortable

    school_section = sections['schools'] = Expectation(True)
    if len(state['schools']) > 1:
        school_section.add(count(len(state['schools'])))
        school_section.claim(rf"^{count(len(state['schools']))} {re.escape(name)} schools with program pages This table lists every {re.escape(name)} school with at least one program page\.")
    else:
        school_section.claim(rf"^One {re.escape(name)} school with program pages This table lists every")
    school_section.pages = -(-len(state['schools']) // VISIBLE_ROWS)
    if school_section.pages > 1:
        school_section.add('1', count(school_section.pages))
    for school in state['schools'].values():
        school_section.add(count(school['programs']))

    faq = sections['faq'] = Expectation(True)
    faq.question_patterns = []
    if len(bachelor_fields) >= 2:
        top = tied(bachelor_fields, bachelor_fields[0]['pay'])
        rest = [field for field in bachelor_fields if field not in top]
        faq.add(money(top[0]['pay']), count(len(bachelor_fields)))
        if rest:
            faq.add(money(rest[0]['pay']))
        faq.question_patterns.append(rf'^What college major pays the most in {re.escape(page_model.place_in_sentence(name))}\?$')
    for credential in state['credentials']:
        faq.add(money(credential['state']['year1']))
    faq.question_patterns.append(rf'^How much do {re.escape(name)} college graduates earn\?$')
    faq.claim(rf"The median bachelor's program in {re.escape(page_model.place_in_sentence(name))} pays its graduates")
    faq.claim(rf"The median bachelor's program in {re.escape(page_model.place_in_sentence(name))} leaves its graduates with")
    all_lower = all(credential['state']['debt'] < credential['national']['debt'] for credential in state['credentials'])
    all_higher = all(credential['state']['debt'] > credential['national']['debt'] for credential in state['credentials'])
    for credential in state['credentials']:
        faq.add(money(credential['state']['debt']))
        if not (all_lower or all_higher):
            faq.add(money(credential['national']['debt']))
    faq.claim(r'lower than the national median', all_lower)
    faq.claim(r'higher than the national median', all_higher)
    faq.question_patterns.append(rf'^How much student debt do {re.escape(name)} graduates have\?$')
    faq.add(count(state['schools_with_pay']), count(state['program_count']))
    if len(state['schools']) > 1:
        faq.add(count(len(state['schools'])))
    faq.question_patterns.append(rf'^How many {re.escape(name)} colleges report graduate pay\?$')

    about = sections['about-data'] = Expectation(True)
    about.claim(check_program_pages.PAY_PRIVACY_NOTE.format(figures='each pay figure'))
    about.claim(r'^About this data Pay and debt only include students who received federal financial aid, and pay only counts graduates who were working and not enrolled in more school\.')
    about.claim(r'Price levels are the Bureau of Economic Analysis Regional Price Parities for 2024\.', state['price'] is not None)
    about.claim(r'Medians are across programs, not students\. Each program counts once, however many graduates it has\.')
    about.claim(CAMPUS_RULE.format(state=re.escape(name), place=re.escape(page_model.place_in_sentence(name))))

    description = sections['#description'] = Expectation(True)
    description.add(count(state['program_count']), money(b_state['year1']))
    return sections


def check_field_rows(node, expectation, state_slug, errors, name):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-cip' in child.attributes)
    expected = {field['cip']: field for field in expectation.rows}
    if sorted(row.attributes['data-cip'] for row in rows) != sorted(expected):
        errors.append(f'section {name}: table rows are not the expected fields')
        return
    previous = None
    for row in rows:
        field = expected[row.attributes['data-cip']]
        cells = row.find_all(lambda child: child.tag == 'td')
        if expectation.sortable:
            rank_cell, cells = cells[0], cells[1:]
            if visible_text(rank_cell) != str(field['pay_rank']):
                errors.append(f"section {name}: {field['cip']} rank {visible_text(rank_cell)!r}, expected {field['pay_rank']}")
        if len(cells) != 4:
            errors.append(f"section {name}: {field['cip']} row has {len(cells)} cells")
            continue
        wanted = [field['label'], count(field['count']), money(field['pay']), money(field['debt'])]
        shown = [visible_text(cell) for cell in cells]
        if shown != wanted:
            errors.append(f"section {name}: {field['cip']} shows {shown}, expected {wanted}")
        link = cells[0].find(lambda child: child.tag == 'a')
        if link is None or not link.attributes.get('href', '').startswith(f'/states/{state_slug}/'):
            errors.append(f"section {name}: {field['cip']} does not link to a {state_slug} ranking")
        if previous is not None and field['pay'] > previous:
            errors.append(f'section {name}: rows are not in order of median pay')
        previous = field['pay']


def check_school_rows(node, schools, errors):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-unit-id' in child.attributes)
    if sorted(row.attributes['data-unit-id'] for row in rows) != sorted(schools):
        errors.append('section schools: table rows are not the expected schools')
        return
    for row in rows:
        unit_id = row.attributes['data-unit-id']
        school = schools[unit_id]
        cells = row.find_all(lambda child: child.tag == 'td')
        if len(cells) != 4:
            errors.append(f'section schools: {unit_id} row has {len(cells)} cells')
            continue
        shown = [visible_text(cells[1]), visible_text(cells[2]), visible_text(cells[3])]
        wanted = [school['city'], school['control'], count(school['programs'])]
        if shown != wanted:
            errors.append(f'section schools: {unit_id} shows {shown}, expected {wanted}')
        link = cells[0].find(lambda child: child.tag == 'a')
        href = link.attributes.get('href', '') if link is not None else ''
        segments = href.strip('/').split('/')
        if segments[0] != 'schools' or len(segments) != (3 if school['program_name'] else 2):
            errors.append(f'section schools: {unit_id} links to {href!r}')
        names = [visible_text(child) for child in cells[0].find_all(lambda child: 'data-name' in child.attributes)]
        if school['program_name'] and (len(names) != 2 or names[1] != school['program_name']):
            errors.append(f"section schools: {unit_id} program shows {names[1:]}, expected {school['program_name']!r}")


def check_page(html_text, rows, field_names, degrees, page_path):
    errors, warnings = [], []
    root = parse_html(html_text)
    html_node = root.find(lambda node: node.tag == 'html')
    if not html_node or html_node.attributes.get('lang') != 'en':
        errors.append('html lang is not "en"')
    title_node = root.find(lambda node: node.tag == 'title')
    title = title_node.raw_text().strip() if title_node else ''
    description_node = root.find(lambda node: node.tag == 'meta' and node.attributes.get('name') == 'description')
    description = (description_node.attributes.get('content') or '').strip() if description_node else ''
    h1_node = root.find(lambda node: node.tag == 'h1')
    h1 = visible_text(h1_node) if h1_node else ''
    if not title or title != h1:
        errors.append(f'title and H1 differ: {title!r} vs {h1!r}')
    if not description:
        errors.append('missing meta description')
    if len(title) > 60:
        warnings.append(f'title is {len(title)} characters')
    if len(description) > 160:
        warnings.append(f'description is {len(description)} characters')

    main = root.find(lambda node: node.tag == 'main')
    if main is None:
        return {'page': page_path, 'errors': errors + ['no <main>'], 'warnings': warnings, 'links': []}
    code = main.attributes.get('data-state')
    try:
        state = state_model(rows, code, field_names, degrees)
    except LookupError as error:
        return {'page': page_path, 'errors': errors + [str(error)], 'warnings': warnings, 'links': []}
    slug = page_model.state_slug(state['name'])
    if page_path != f'/states/{slug}':
        errors.append(f'page path {page_path} is not /states/{slug}')
    if title != f"{state['name']} Colleges and Majors, Ranked by Graduate Pay and Debt":
        errors.append(f'title does not name the state: {title!r}')

    main_text = visible_text(main)
    errors.extend(page_model.bare_place_errors(title, description, main_text))
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    # The band holds the breadcrumb, the title and one source line. The counts it
    # used to show are the page's own section titles.
    if header_text != f"Home {state['name']} {h1} {SOURCE_LINE}":
        errors.append(f'header reads {header_text!r}')

    def tokens(text):
        for phrase in STATE_STATIC_PHRASES:
            text = text.replace(phrase, ' ')
        return Counter(number_tokens(text, ''))

    expectations = expected_sections(state)
    present = {node.attributes['data-section']: node for node in main.find_all(lambda node: 'data-section' in node.attributes)}
    unexpected = set(present) - set(expectations) - {'header'}
    if unexpected:
        errors.append(f'unexpected sections {sorted(unexpected)}')
    if list(present) != [name for name in SECTION_ORDER if name in present]:
        errors.append(f'sections are in the wrong order: {list(present)}')
    our_text = visible_text(main, skip_names=True)
    for pattern in RETIRED_WORDING:
        found = re.search(pattern, our_text)
        if found:
            errors.append(f'retired wording {pattern!r}: ...{our_text[max(0, found.start() - 40):found.end() + 40]}...')


    def check_paging(node, name, expectation, marker):
        """The first ten rows show, and the pager appears only when there are more."""
        rows = node.find_all(lambda child: child.tag == 'tr' and marker in child.attributes)
        hidden = ['hidden' in row.attributes for row in rows]
        if hidden != [position >= VISIBLE_ROWS for position in range(len(rows))]:
            errors.append(f'section {name}: {hidden.count(False)} of {len(rows)} rows show, expected the first {VISIBLE_ROWS}')
        pager = node.find(lambda child: child.attributes.get('data-slot') == 'pager')
        if (pager is not None) != (expectation.pages > 1):
            errors.append(f'section {name}: the pager must show only when there is more than one page of rows')
        elif pager is not None:
            buttons = pager.find_all(lambda child: child.tag == 'button')
            labels = [button.attributes.get('aria-label') or visible_text(button) for button in buttons]
            disabled = ['disabled' in button.attributes for button in buttons]
            if labels != ['First page', 'Previous', 'Next', 'Last page'] or disabled != [True, True, False, False] or f'Page 1 of {count(expectation.pages)}' not in visible_text(pager):
                errors.append(f'section {name}: pager reads {visible_text(pager)!r} with buttons {labels} and disabled {disabled}')

    for name, expectation in expectations.items():
        if name.startswith('#'):
            continue
        node = present.get(name)
        if expectation.present != (node is not None):
            errors.append(f'section {name}: expected {"present" if expectation.present else "hidden"}')
            continue
        if node is None:
            continue
        for table in node.find_all(lambda child: child.tag == 'table'):
            if not table.find(lambda child: child.tag == 'td'):
                errors.append(f'section {name} has an empty table')
        actual = tokens(visible_text(node, skip_names=True))
        if actual != expectation.tokens:
            errors.append(f'section {name} numbers differ: missing {dict(expectation.tokens - actual)}, unexpected {dict(actual - expectation.tokens)}')
        for pattern, should_match in expectation.claims:
            if bool(re.search(pattern, visible_text(node))) != should_match:
                errors.append(f'section {name}: wording {pattern!r} should {"" if should_match else "not "}appear')
        if name == 'summary':
            # One paragraph when the summary is short. Otherwise the second starts
            # where the fields do.
            paragraphs = [visible_text(paragraph) for paragraph in node.find_all(lambda child: child.tag == 'p')]
            heading = node.find(lambda child: child.tag == 'h2')
            wanted = 2 if expectation.has_second_subject and len(' '.join(paragraphs)) > ONE_PARAGRAPH_LIMIT else 1
            if heading is None or visible_text(heading) != 'Summary' or len(paragraphs) != wanted:
                errors.append(f'section summary: expected the heading "Summary" and {wanted} paragraphs, found {len(paragraphs)}')
            elif wanted == 2 and not paragraphs[0].endswith('nationally.'):
                errors.append(f'section summary: the first paragraph should end with the debt comparison: {paragraphs[0][-60:]!r}')
        if name == 'key-figures' and tile_lines(node) != expectation.tiles:
            errors.append(f'section key-figures: tiles read {tile_lines(node)}, expected {expectation.tiles}')
        if name == 'credentials' and table_rows(node) != expectation.rows:
            errors.append(f'section credentials: rows read {table_rows(node)}, expected {expectation.rows}')
        if name.startswith('fields-'):
            check_field_rows(node, expectation, slug, errors, name)
            check_paging(node, name, expectation, 'data-cip')
        if name == 'schools':
            check_school_rows(node, state['schools'], errors)
            check_paging(node, name, expectation, 'data-unit-id')

    if tokens(description) != expectations['#description'].tokens:
        errors.append(f"description numbers differ: expected {dict(expectations['#description'].tokens)}, found {dict(tokens(description))}")

    # Both lists of questions, in page order: those under the key figures, then
    # the common questions. An answer is every paragraph of its panel.
    def questions_in(section_name):
        node = present.get(section_name)
        items = node.find_all(lambda child: child.attributes.get('data-slot') == 'accordion-item') if node is not None else []
        pairs = []
        for item in items:
            question = item.find(lambda child: child.tag == 'button')
            answer = item.find(lambda child: child.attributes.get('data-slot') == 'accordion-content')
            pairs.append((visible_text(question) if question else '', visible_text(answer) if answer else ''))
        return pairs

    figure_questions, common_questions = questions_in('key-figure-questions'), questions_in('faq')
    if [question for question, _ in figure_questions] != expectations['key-figure-questions'].names:
        errors.append(f'questions under the key figures differ: {[question for question, _ in figure_questions]}')
    patterns = expectations['faq'].question_patterns
    if len(common_questions) != len(patterns) or any(not re.search(pattern, question) for pattern, (question, _) in zip(patterns, common_questions)):
        errors.append(f'FAQ questions differ: {[question for question, _ in common_questions]}')
    visible_faq = figure_questions + common_questions
    json_ld = root.find_all(lambda node: node.tag == 'script' and node.attributes.get('type') == 'application/ld+json')
    try:
        structured = json.loads(json_ld[0].raw_text()) if json_ld else None
    except json.JSONDecodeError:
        structured = None
    if not structured or structured.get('@type') != 'FAQPage':
        errors.append('FAQPage JSON-LD missing or does not parse')
    elif [(entry['name'], entry['acceptedAnswer']['text']) for entry in structured['mainEntity']] != visible_faq:
        errors.append('FAQPage JSON-LD does not match the visible FAQ')
    if not visible_faq or any(not question or not answer for question, answer in visible_faq):
        errors.append('FAQ questions or answers missing from the HTML')

    links = sorted({node.attributes['href'] for node in root.find_all(lambda node: node.tag == 'a' and node.attributes.get('href', '').startswith('/'))})
    return {'page': page_path, 'title': title, 'description': description, 'errors': errors, 'warnings': warnings, 'links': links}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--html-dir', required=True)
    parser.add_argument('--pages', required=True)
    parser.add_argument('--report', required=True)
    arguments = parser.parse_args()
    rows = Rows(page_model.Model())
    field_names = page_model.load_field_names()
    degrees = page_model.load_degree_abbreviations()
    results = []
    for page_path in [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]:
        file_path = Path(arguments.html_dir) / (page_path.strip('/') + '.html')
        if not file_path.exists():
            results.append({'page': page_path, 'errors': [f'no built file {file_path}'], 'warnings': [], 'links': []})
            continue
        results.append(check_page(file_path.read_text(), rows, field_names, degrees, page_path))
    Path(arguments.report).write_text(json.dumps(results, indent=1))
    failed = [result for result in results if result['errors']]
    print(f'Checked {len(results)} pages: {len(results) - len(failed)} passed, {len(failed)} failed, '
          f'{sum(len(result["warnings"]) for result in results)} warnings.')
    for result in failed[:20]:
        print(f'  {result["page"]}')
        for error in result['errors'][:8]:
            print(f'    - {error}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
