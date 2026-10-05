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
from check_program_pages import FORBIDDEN_PATTERNS, STATE_NAMES, TOKEN_PATTERN, Expectation, number_tokens, parse_html, visible_text  # noqa: E402
from page_model import count, money, round_half_up  # noqa: E402

CREDENTIALS = {3: "Bachelor's", 2: "Associate's", 1: 'Certificate'}
WITH_ARTICLE = {3: "a bachelor's", 2: "an associate's", 1: 'a certificate'}
CONTROL_LABELS = {'1': 'Public', '2': 'Private nonprofit', '3': 'For-profit'}
NURSING_CIP = '5138'
# Fixed phrases on state pages that contain digits but no data.
STATE_STATIC_PHRASES = ['BEA price parities 2024', 'Regional Price Parities for 2024', 'US average 100']


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

    summary = sections['summary'] = Expectation(True)
    gap = b_state['year1'] - b_national['year1']
    summary.add(money(b_state['year1']), money(b_state['debt']), money(b_national['debt']))
    if gap != 0:
        summary.add(money(abs(gap)))
        summary.claim(r'more than the national median' if gap > 0 else r'less than the national median')
    else:
        summary.claim(r'the same as the national median')
    if len(bachelor_fields) >= 2:
        top = tied(bachelor_fields, bachelor_fields[0]['pay'])
        bottom = tied(bachelor_fields, bachelor_fields[-1]['pay'])
        summary.add(count(len(bachelor_fields)), money(top[0]['pay']), money(bottom[0]['pay']))
        if len(top) == 1:
            summary.claim(rf"(?i){re.escape(top[0]['name'])} pays the most", True)
        if len(bottom) == 1:
            summary.claim(rf"(?i){re.escape(bottom[0]['name'])} the least", True)
    elif len(bachelor_fields) == 1:
        summary.add(money(bachelor_fields[0]['pay']))
        summary.claim(r"is the only bachelor's field ranked in")
    summary.claim(r'bachelor.s fields ranked in', len(bachelor_fields) >= 2)
    # Figures are medians across programs, and the wording must say so.
    summary.claim(r"The median .* bachelor's program pays its graduates")
    summary.claim(r"The median bachelor's program leaves its graduates with")

    figures = sections['key-figures'] = Expectation(True)
    figures.add(money(b_state['year1']), money(b_national['year1']), money(b_state['debt']), money(b_national['debt']))
    figures.add(count(b_state['year1_count']), count(b_state['debt_count']))
    if b_state['year5'] is not None and b_national['year5'] is not None:
        figures.add(money(b_state['year5']), money(b_national['year5']), count(b_state['year5_count']))
    if state['price'] is not None:
        label, index = price_tokens(state['price'])
        figures.add(*TOKEN_PATTERN.findall(label), *TOKEN_PATTERN.findall(index))
        figures.claim(re.escape(label))

    credential_section = sections['credentials'] = Expectation(True)
    for credential in state['credentials']:
        credential_section.add(
            count(credential['state']['year1_count']), money(credential['state']['year1']), money(credential['national']['year1']),
            money(credential['state']['debt']), money(credential['national']['debt']),
        )

    for level in (3, 2, 1):
        level_fields = state['fields'].get(level, [])
        section = sections[f'fields-{level}'] = Expectation(bool(level_fields))
        sortable = len(level_fields) >= 3
        for field in level_fields:
            if sortable:
                section.add(str(field['pay_rank']))
            section.add(count(field['count']), money(field['pay']), money(field['debt']))
        section.claim(r'\(RN-to-BSN\)\. College Scorecard counts them with programs for new students', level == 3 and any(field['cip'] == NURSING_CIP for field in level_fields))
        section.rows = level_fields
        section.sortable = sortable

    school_section = sections['schools'] = Expectation(True)
    if len(state['schools']) > 1:
        school_section.add(count(len(state['schools'])))
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
        faq.question_patterns.append(rf'^What college major pays the most in {re.escape(name)}\?$')
    for credential in state['credentials']:
        faq.add(money(credential['state']['year1']))
    faq.question_patterns.append(rf'^How much do {re.escape(name)} college graduates earn\?$')
    faq.claim(rf"The median bachelor's program in {re.escape(name)} pays its graduates")
    faq.claim(rf"The median bachelor's program in {re.escape(name)} leaves its graduates with")
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

    sections['about-data'] = Expectation(True)

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
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    field_count = sum(len(fields) for fields in state['fields'].values())
    school_count = len(state['schools'])
    expected_facts = [
        f"{count(state['program_count'])} programs report first-year pay",
        f"{count(school_count)} {'school' if school_count == 1 else 'schools'} with program pages",
        f"{count(field_count)} field {'ranking' if field_count == 1 else 'rankings'}",
    ]
    for fact in expected_facts:
        if fact not in header_text:
            errors.append(f'header does not show {fact!r}')
    if ('BEA price parities 2024' in header_text) != (state['price'] is not None):
        errors.append('header source line and price data disagree')

    def tokens(text):
        for phrase in STATE_STATIC_PHRASES:
            text = text.replace(phrase, ' ')
        return Counter(number_tokens(text, ''))

    expectations = expected_sections(state)
    present = {node.attributes['data-section']: node for node in main.find_all(lambda node: 'data-section' in node.attributes)}
    unexpected = set(present) - set(expectations) - {'header'}
    if unexpected:
        errors.append(f'unexpected sections {sorted(unexpected)}')
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
        if name.startswith('fields-'):
            check_field_rows(node, expectation, slug, errors, name)
        if name == 'schools':
            check_school_rows(node, state['schools'], errors)

    if tokens(description) != expectations['#description'].tokens:
        errors.append(f"description numbers differ: expected {dict(expectations['#description'].tokens)}, found {dict(tokens(description))}")

    faq_node = present.get('faq')
    visible_faq = []
    if faq_node is not None:
        for item in faq_node.find_all(lambda child: child.attributes.get('data-slot') == 'accordion-item'):
            question = item.find(lambda child: child.tag == 'button')
            answer = item.find(lambda child: child.tag == 'p')
            visible_faq.append((visible_text(question) if question else '', visible_text(answer) if answer else ''))
    patterns = expectations['faq'].question_patterns
    if len(visible_faq) != len(patterns) or any(not re.search(pattern, question) for pattern, (question, _) in zip(patterns, visible_faq)):
        errors.append(f'FAQ questions differ: {[question for question, _ in visible_faq]}')
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
