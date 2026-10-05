#!/usr/bin/env python3
"""Checks built occupation pages (pay for one job in every state, and the programs
that lead there) against the public data in data/raw.

Same approach as check_program_pages.py: page_model.py works out, from data/raw
only, every number the page must show and which wording it must use; this
script compares that, section by section, with the built HTML. Each row of the
state and program tables is also checked on its own, including its link.

Usage:
  python3 scripts/verify/check_occupation_pages.py --html-dir dist/client --pages pages.txt --report report.json
"""

import argparse
import json
import re
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_model  # noqa: E402
from check_program_pages import FORBIDDEN_PATTERNS, TOKEN_PATTERN, Expectation, number_tokens, parse_html, visible_text  # noqa: E402
from page_model import count, money, percent_number  # noqa: E402

CREDENTIAL_SLUGS = {1: 'certificate', 2: 'associate', 3: 'bachelors'}
CREDENTIAL_LABELS = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's"}
# Fixed phrases on occupation pages that contain digits but no data.
OCCUPATION_STATIC_PHRASES = [
    'Regional Price Parities for 2024', 'US average = 100', 'BEA price parities 2024',
    'Bottom 10%', 'Top 10%', 'bottom 10%', 'top 10%',
]


def lowercase_words(name):
    return ' '.join(word if word.isupper() else word.lower() for word in name.split())


class Reference:
    def __init__(self, model):
        self.model = model
        self.state_names = page_model.load_state_names()
        self.field_names = page_model.load_field_names()
        self.degrees = page_model.load_degree_abbreviations()
        self.occupation_names = page_model.load_occupation_names()
        self.fips = {}
        for institution in model.institutions.values():
            self.fips.setdefault(institution['STABBR'], institution['ST_FIPS'].zfill(2))
        self.state_pages = {model.institutions[row['UNITID']]['STABBR'] for row in model.page_rows}


def occupation_model(reference, code):
    model = reference.model
    fields = model.career_fields().get(code)
    if not fields:
        raise LookupError(f'No occupation page for {code}')
    national = model.wages[('US', code)]
    projection = model.projections.get(code, {})
    name = reference.occupation_names.get(code, national['title'])

    states, without_pay = [], []
    for state, state_name in reference.state_names.items():
        fips = reference.fips.get(state)
        wage = model.wages.get(('S' + fips, code)) if fips else None
        if not wage or wage['median'] is None:
            without_pay.append(state_name)
            continue
        price = model.prices['states'].get(f'{fips}000')
        states.append({
            'code': state, 'name': state_name, 'linked': state in reference.state_pages,
            'pay': wage['median'], 'jobs': wage['employment'], 'p10': wage['p10'], 'p90': wage['p90'],
            'adjusted': Fraction(wage['median']) * 100 / Fraction(price[1]) if price else None,
        })
    for state in states:
        state['pay_rank'] = 1 + sum(1 for other in states if other['pay'] > state['pay'])
        if state['adjusted'] is not None:
            state['adjusted_rank'] = 1 + sum(1 for other in states if other['adjusted'] is not None and other['adjusted'] > state['adjusted'])
    states.sort(key=lambda state: -state['pay'])

    programs = []
    for cip, level in fields:
        benchmark = model.benchmark(model.national[(cip, level)])
        field_name = reference.field_names[cip]
        programs.append({
            'label': f"{field_name} ({reference.degrees.get((cip, level)) or CREDENTIAL_LABELS[level]})",
            'href': f'/programs/{page_model.slugify(field_name)}-{CREDENTIAL_SLUGS[level]}',
            'count': benchmark['year1_count'], 'pay': benchmark['year1'], 'debt': benchmark['debt'],
        })
    programs.sort(key=lambda program: -program['pay'])
    return {
        'code': code, 'title': national['title'], 'name': name, 'sentence': lowercase_words(name),
        'national': national, 'growth': projection.get('growth_percent'), 'openings': projection.get('openings_thousands'),
        'education': projection.get('education'), 'experience': projection.get('experience'),
        'states': states, 'without_pay': without_pay, 'programs': programs,
    }


def growth_tokens(expectation, page):
    """Growth percent (unless it rounds to 0) and openings a year, when both exist."""
    if page['growth'] is None or page['openings'] is None:
        return False
    growth = percent_number(abs(Fraction(page['growth']) / 100))
    if growth != 0:
        expectation.add(f'{growth}%')
    expectation.add(count(page_model.round_half_up(page['openings'] * 1000)))
    return True


def expected_sections(page):
    national, states = page['national'], page['states']
    adjusted = sorted((state for state in states if state['adjusted'] is not None), key=lambda state: state['adjusted_rank'])
    sections = {}

    summary = sections['summary'] = Expectation(True)
    summary.add(money(national['median']))
    if len(states) >= 2:
        top = [state for state in states if state['pay'] == states[0]['pay']]
        bottom = [state for state in states if state['pay'] == states[-1]['pay']]
        summary.add(money(top[0]['pay']), money(bottom[0]['pay']))
        if len(top) == 1:
            summary.claim(rf"Pay is highest in {re.escape(top[0]['name'])} \(")
        if len(bottom) == 1:
            summary.claim(rf"lowest in {re.escape(bottom[0]['name'])} \(")
    if len(adjusted) >= 2:
        summary.add(money(adjusted[0]['adjusted']), money(adjusted[-1]['adjusted']))
        summary.claim(r'After adjusting for prices')
    growth_tokens(summary, page)

    figures = sections['key-figures'] = Expectation(True)
    figures.add(money(national['median']))
    if national['p10'] is not None:
        figures.add(money(national['p10']))
    if national['p90'] is not None:
        figures.add(money(national['p90']))
    if growth_tokens(figures, page):
        growth = percent_number(abs(Fraction(page['growth']) / 100))
        figures.claim(r'Projected job change' if growth == 0 else r'Projected job growth' if page['growth'] > 0 else r'Projected job decline')

    state_section = sections['states'] = Expectation(bool(states))
    sortable = len(states) >= 3
    for state in states:
        if sortable:
            state_section.add(str(state['pay_rank']))
        state_section.add(money(state['pay']))
        for key in ('adjusted', 'p10', 'p90'):
            if state[key] is not None:
                state_section.add(money(state[key]))
        if state['jobs'] is not None:
            state_section.add(count(state['jobs']))
    state_section.claim(r'BLS publishes no median pay for', bool(page['without_pay']))
    if len(page['without_pay']) > 5:
        state_section.add(count(len(page['without_pay'])))
        state_section.claim(r'other states and territories\.')
    state_section.claim(r'no BEA price level', any(state['adjusted'] is None for state in states))
    state_section.rows = states
    state_section.sortable = sortable

    program_section = sections['programs'] = Expectation(True)
    for program in page['programs']:
        program_section.add(count(program['count']), money(program['pay']), money(program['debt']))

    faq = sections['faq'] = Expectation(True)
    faq.add(money(national['median']))
    if national['p10'] is not None and national['p90'] is not None:
        faq.add(money(national['p10']), money(national['p90']))
    if len(states) >= 2:
        faq.add(money(states[0]['pay']))
        if len(adjusted) >= 2:
            faq.add(money(adjusted[0]['adjusted']))
    if page['education'] and page['experience']:
        faq.add(*TOKEN_PATTERN.findall(page['experience']))
    if len(page['programs']) > 1:
        faq.add(count(len(page['programs'])))
    growth_tokens(faq, page)
    faq.questions = 2 + (len(states) >= 2) + (page['growth'] is not None and page['openings'] is not None)

    sections['about-data'] = Expectation(True)

    description = sections['#description'] = Expectation(True)
    description.add(money(national['median']))
    if len(page['programs']) > 1:
        description.add(count(len(page['programs'])))
    return sections


def check_state_rows(node, expectation, page, errors):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-state' in child.attributes)
    expected = {state['code']: state for state in expectation.rows}
    if sorted(row.attributes['data-state'] for row in rows) != sorted(expected):
        errors.append('section states: table rows are not the expected states')
        return
    for row in rows:
        state = expected[row.attributes['data-state']]
        cells = row.find_all(lambda child: child.tag == 'td')
        if expectation.sortable:
            rank_cell, cells = cells[0], cells[1:]
            if visible_text(rank_cell) != str(state['pay_rank']):
                errors.append(f"section states: {state['code']} rank {visible_text(rank_cell)!r}, expected {state['pay_rank']}")
        shown = [visible_text(cell) for cell in cells]
        wanted = [
            state['name'], money(state['pay']),
            money(state['adjusted']) if state['adjusted'] is not None else 'Not available',
            count(state['jobs']) if state['jobs'] is not None else 'Not reported',
            money(state['p10']) if state['p10'] is not None else 'Not reported',
            money(state['p90']) if state['p90'] is not None else 'Not reported',
        ]
        if shown != wanted:
            errors.append(f"section states: {state['code']} shows {shown}, expected {wanted}")
        link = cells[0].find(lambda child: child.tag == 'a') if cells else None
        expected_href = f"/states/{page_model.state_slug(state['name'])}"
        if state['linked'] != (link is not None) or (link is not None and link.attributes.get('href') != expected_href):
            errors.append(f"section states: {state['code']} link should {'be ' + expected_href if state['linked'] else 'not exist'}")
    note = visible_text(node)
    for state_name in page['without_pay'] if len(page['without_pay']) <= 5 else []:
        if state_name not in note:
            errors.append(f'section states: note does not name {state_name}')


def check_program_rows(node, page, errors):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-href' in child.attributes)
    expected = {program['href']: program for program in page['programs']}
    if sorted(row.attributes['data-href'] for row in rows) != sorted(expected):
        errors.append(f"section programs: rows {sorted(row.attributes['data-href'] for row in rows)}, expected {sorted(expected)}")
        return
    for row in rows:
        program = expected[row.attributes['data-href']]
        shown = [visible_text(cell) for cell in row.find_all(lambda child: child.tag == 'td')]
        wanted = [program['label'], count(program['count']), money(program['pay']), money(program['debt'])]
        if shown != wanted:
            errors.append(f"section programs: {program['href']} shows {shown}, expected {wanted}")
        link = row.find(lambda child: child.tag == 'a')
        if link is None or link.attributes.get('href') != program['href']:
            errors.append(f"section programs: {program['href']} is not linked")


def check_page(html_text, reference, page_path):
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
    code = main.attributes.get('data-soc')
    try:
        page = occupation_model(reference, code)
    except LookupError as error:
        return {'page': page_path, 'errors': errors + [str(error)], 'warnings': warnings, 'links': []}
    if title != f"{page['name']}: Pay by State and the Programs That Lead There":
        errors.append(f'title does not use the occupation name: {title!r}')
    if page_path != f"/careers/{page_model.slugify(page['name'])}":
        errors.append(f"page path {page_path} does not match the name {page['name']!r}")

    main_text = visible_text(main)
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    expected_facts = [f"Occupation code {code}" if page['name'] == page['title'] else f"BLS title: {page['title']} ({code})"]
    if page['national']['employment'] is not None:
        expected_facts.append(f"{count(page['national']['employment'])} jobs in the US")
    if page['education']:
        expected_facts.append(f"Typical education to start: {page['education'][0].lower()}{page['education'][1:]}")
    for fact in expected_facts:
        if fact not in header_text:
            errors.append(f'header does not show {fact!r}')

    # The breadcrumb links to the careers list page.
    if not header or not header.find(lambda node: node.tag == 'a' and node.attributes.get('href') == '/careers'):
        errors.append('breadcrumb link to /careers missing')

    def tokens(text):
        for phrase in OCCUPATION_STATIC_PHRASES:
            text = text.replace(phrase, ' ')
        return Counter(number_tokens(text, ''))

    expectations = expected_sections(page)
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
        if name == 'states':
            check_state_rows(node, expectation, page, errors)
        if name == 'programs':
            check_program_rows(node, page, errors)

    if tokens(description) != expectations['#description'].tokens:
        errors.append(f"description numbers differ: expected {dict(expectations['#description'].tokens)}, found {dict(tokens(description))}")

    faq_node = present.get('faq')
    visible_faq = []
    if faq_node is not None:
        for item in faq_node.find_all(lambda child: child.attributes.get('data-slot') == 'accordion-item'):
            question = item.find(lambda child: child.tag == 'button')
            answer = item.find(lambda child: child.tag == 'p')
            visible_faq.append((visible_text(question) if question else '', visible_text(answer) if answer else ''))
    if len(visible_faq) != expectations['faq'].questions:
        errors.append(f"FAQ has {len(visible_faq)} questions, expected {expectations['faq'].questions}")
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
    reference = Reference(page_model.Model())
    results = []
    for page_path in [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]:
        file_path = Path(arguments.html_dir) / (page_path.strip('/') + '.html')
        if not file_path.exists():
            results.append({'page': page_path, 'errors': [f'no built file {file_path}'], 'warnings': [], 'links': []})
            continue
        results.append(check_page(file_path.read_text(), reference, page_path))
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
