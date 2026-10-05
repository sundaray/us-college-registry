#!/usr/bin/env python3
"""Checks built national program pages (every program of one field and credential
in the US) against the public data in data/raw.

Same approach as check_program_pages.py: page_model.py works out, from data/raw
only, every number the page must show and which wording it must use; this
script compares that, section by section, with the built HTML. Each row of the
state table is also checked on its own, including its link.

Usage:
  python3 scripts/verify/check_national_program_pages.py --html-dir dist/client --pages pages.txt --report report.json
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
from check_program_pages import FORBIDDEN_PATTERNS, Expectation, check_career_links, number_tokens, parse_html, visible_text  # noqa: E402
from check_state_program_pages import occupation_tokens  # noqa: E402
from page_model import count, money, percent  # noqa: E402

CREDENTIALS = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's"}
PICK_COUNT = 10
# Fixed phrases on national pages that contain digits but no data.
NATIONAL_STATIC_PHRASES = ['the 50 states']
NURSING_CIP = '5138'


def national_occupation(model, code):
    """BLS figures for the whole US, in the shape occupation_tokens reads."""
    wage = model.wages.get(('US', code))
    if wage is None:
        return None
    projection = model.projections.get(code, {})
    return {
        'code': code,
        'state_median': wage['median'], 'state_employment': wage['employment'], 'p10': wage['p10'], 'p90': wage['p90'],
        'national_median': wage['median'], 'growth_percent': projection.get('growth_percent'),
        'openings': projection.get('openings_thousands'), 'education': projection.get('education'),
        'experience': projection.get('experience'),
    }


def national_model(model, state_names, cip, level):
    page_rows = model.page_rows_by_field.get((cip, level))
    if not page_rows:
        raise LookupError(f'No national page for {cip} {level}')
    pool = model.national[(cip, level)]
    states, unranked = [], 0
    for (pool_cip, pool_level, state), rows in model.state.items():
        if pool_cip != cip or pool_level != level:
            continue
        if any(id(row) in model.page_ids for row in rows):
            benchmark = model.benchmark(rows)
            states.append({'code': state, 'name': state_names[state], 'count': benchmark['year1_count'], 'pay': benchmark['year1'], 'debt': benchmark['debt']})
        elif any(row['EARN_MDN_1YR'] is not None for row in rows):
            unranked += 1
    for state in states:
        state['rank'] = 1 + sum(1 for other in states if other['pay'] > state['pay'])
    states.sort(key=lambda state: -state['pay'])

    def ratio(row):
        return Fraction(row['DEBT_ALL_STGP_ANY_MDN'], row['EARN_MDN_1YR'])

    picks = {
        'pay': sorted(page_rows, key=lambda row: -row['EARN_MDN_1YR'])[:PICK_COUNT],
        'debt': sorted(page_rows, key=lambda row: (row['DEBT_ALL_STGP_ANY_MDN'], -row['EARN_MDN_1YR']))[:PICK_COUNT],
        'ratio': sorted(page_rows, key=lambda row: (ratio(row), -row['EARN_MDN_1YR']))[:PICK_COUNT],
    }
    matching = None
    if model.matching.get(cip):
        candidate = national_occupation(model, model.matching[cip])
        if candidate and candidate['state_median'] is not None:
            matching = candidate
    occupations = [national_occupation(model, occupation['code']) for occupation in model.occupations(cip, '00')]
    others = []
    for other_level in (3, 2, 1):
        if other_level != level and model.page_rows_by_field.get((cip, other_level)):
            others.append(model.benchmark(model.national[(cip, other_level)])['year1_count'])
    return {
        'national': model.benchmark(pool),
        'official': ' '.join(next(row for row in pool if row['EARN_MDN_1YR'] is not None)['CIPDESC'].split()).rstrip('.'),
        'states': states,
        'unranked': unranked,
        'page_count': len(page_rows),
        'picks': picks,
        'ratio': ratio,
        'matching': matching,
        'occupations': [occupation for occupation in occupations if occupation['state_median'] is not None],
        'others': others,
        'nursing_bachelors': cip == NURSING_CIP and level == 3,
    }


def tied(states):
    return [state for state in states if state['pay'] == states[0]['pay']]


def expected_sections(page):
    national, states = page['national'], page['states']
    sections = {}

    summary = sections['summary'] = Expectation(True)
    summary.add(money(national['year1']), money(national['debt']))
    if national['year5'] is not None:
        summary.add(money(national['year5']))
    if len(states) >= 2:
        top, bottom = tied(states), tied(states[::-1])
        summary.add(money(top[0]['pay']), money(bottom[0]['pay']))
        if len(top) == 1:
            summary.claim(rf"{re.escape(top[0]['name'])} has the highest state median")
        if len(bottom) == 1:
            summary.claim(rf"and {re.escape(bottom[0]['name'])} the lowest")
    else:
        summary.add(money(states[0]['pay']))
        summary.claim(rf"{re.escape(states[0]['name'])} is the only state with enough programs to rank")
    summary.claim(r'The median .* program in the US pays its graduates')
    summary.claim(r'The median program leaves its graduates with')

    figures = sections['key-figures'] = Expectation(True)
    figures.add(money(national['year1']), count(national['year1_count']), money(national['debt']), count(national['debt_count']))
    figures.add(percent(national['dte']), count(national['dte_count']))
    if national['year5'] is not None:
        figures.add(money(national['year5']), count(national['year5_count']))

    state_section = sections['states'] = Expectation(True)
    sortable = len(states) >= 3
    for state in states:
        if sortable:
            state_section.add(str(state['rank']))
        state_section.add(count(state['count']), money(state['pay']), money(state['debt']))
    if page['unranked'] > 1:
        state_section.add(count(page['unranked']))
    state_section.claim(r'report pay, but too few to rank\. A state ranking needs at least five programs', page['unranked'] > 0)
    state_section.rows = states
    state_section.sortable = sortable

    picks = sections['quick-picks'] = Expectation(True)
    for row in page['picks']['pay']:
        picks.add(money(row['EARN_MDN_1YR']))
    for row in page['picks']['debt']:
        picks.add(money(row['DEBT_ALL_STGP_ANY_MDN']))
    for row in page['picks']['ratio']:
        picks.add(percent(page['ratio'](row)))
    picks.add(count(page['page_count']))
    picks.claim(r'\(RN-to-BSN\)\. College Scorecard counts them with programs for new students', page['nursing_bachelors'])

    careers = sections['careers'] = Expectation(page['matching'] is not None or bool(page['occupations']))
    for occupation in [page['matching']] if page['matching'] is not None else page['occupations']:
        occupation_tokens(careers, occupation)

    faq = sections['faq'] = Expectation(True)
    faq.add(money(national['year1']), money(national['debt']), percent(national['dte']))
    if national['year5'] is not None:
        faq.add(money(national['year5']))
    if page['matching'] is not None:
        faq.add(money(page['matching']['state_median']))
    if len(states) >= 2:
        top = tied(states)
        rest = [state for state in states if state not in top]
        faq.add(money(top[0]['pay']), count(len(states)))
        if rest:
            faq.add(money(rest[0]['pay']))
    top_pay = page['picks']['pay'][0]['EARN_MDN_1YR']
    top_picks = [row for row in page['picks']['pay'] if row['EARN_MDN_1YR'] == top_pay]
    faq.add(money(top_pay), count(page['page_count']))
    if len(top_picks) == 1:
        faq.add(money(top_picks[0]['DEBT_ALL_STGP_ANY_MDN']))

    related = sections['related'] = Expectation(bool(page['others']))
    for other in page['others']:
        related.add(count(other))

    sections['about-data'] = Expectation(True)

    description = sections['#description'] = Expectation(True)
    description.add(count(national['year1_count']), money(national['year1']))
    return sections


def check_state_rows(node, expectation, errors):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-state' in child.attributes)
    expected = {state['code']: state for state in expectation.rows}
    if sorted(row.attributes['data-state'] for row in rows) != sorted(expected):
        errors.append('section states: table rows are not the expected states')
        return
    previous = None
    for row in rows:
        state = expected[row.attributes['data-state']]
        cells = row.find_all(lambda child: child.tag == 'td')
        if expectation.sortable:
            rank_cell, cells = cells[0], cells[1:]
            if visible_text(rank_cell) != str(state['rank']):
                errors.append(f"section states: {state['code']} rank {visible_text(rank_cell)!r}, expected {state['rank']}")
        shown = [visible_text(cell) for cell in cells]
        wanted = [state['name'], count(state['count']), money(state['pay']), money(state['debt'])]
        if shown != wanted:
            errors.append(f"section states: {state['code']} shows {shown}, expected {wanted}")
        link = cells[0].find(lambda child: child.tag == 'a') if cells else None
        if link is None or not link.attributes.get('href', '').startswith(f"/states/{page_model.state_slug(state['name'])}/"):
            errors.append(f"section states: {state['code']} does not link to its state ranking")
        if previous is not None and state['pay'] > previous:
            errors.append('section states: rows are not in order of median pay')
        previous = state['pay']


def check_page(html_text, model, state_names, page_path):
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
    if not title.endswith(' Programs in the US, Ranked by Graduate Pay and Debt'):
        errors.append(f'unexpected title {title!r}')
    if not description:
        errors.append('missing meta description')
    if len(title) > 60:
        warnings.append(f'title is {len(title)} characters')
    if len(description) > 160:
        warnings.append(f'description is {len(description)} characters')

    main = root.find(lambda node: node.tag == 'main')
    if main is None:
        return {'page': page_path, 'errors': errors + ['no <main>'], 'warnings': warnings, 'links': []}
    cip = main.attributes.get('data-cip')
    level = int(main.attributes.get('data-credential-level', '0'))
    try:
        page = national_model(model, state_names, cip, level)
    except LookupError as error:
        return {'page': page_path, 'errors': errors + [str(error)], 'warnings': warnings, 'links': []}

    main_text = visible_text(main)
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    rankings = len(page['states'])
    expected_facts = [
        f"{count(page['national']['year1_count'])} programs report first-year pay",
        f"{count(rankings)} state {'ranking' if rankings == 1 else 'rankings'}",
        f"{CREDENTIALS[level]} in {page['official']}",
    ]
    for fact in expected_facts:
        if fact not in header_text:
            errors.append(f'header does not show {fact!r}')

    # The breadcrumb links to the programs list page.
    if not header or not header.find(lambda node: node.tag == 'a' and node.attributes.get('href') == '/programs'):
        errors.append('breadcrumb link to /programs missing')

    def tokens(text):
        for phrase in NATIONAL_STATIC_PHRASES:
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
            check_state_rows(node, expectation, errors)
        if name == 'quick-picks':
            links = [anchor.attributes.get('href', '') for anchor in node.find_all(lambda child: child.tag == 'a')]
            if len(links) != sum(len(picks) for picks in page['picks'].values()) or not all(link.startswith('/schools/') for link in links):
                errors.append('section quick-picks: every pick must link to its program page')

    shown_careers = [page['matching']['code']] if page['matching'] is not None else [occupation['code'] for occupation in page['occupations']]
    check_career_links(present.get('careers'), shown_careers, model.career_fields(), errors)

    if Counter(number_tokens(description, '')) != expectations['#description'].tokens:
        errors.append(f"description numbers differ: expected {dict(expectations['#description'].tokens)}")

    faq_node = present.get('faq')
    visible_faq = []
    if faq_node is not None:
        for item in faq_node.find_all(lambda child: child.attributes.get('data-slot') == 'accordion-item'):
            question = item.find(lambda child: child.tag == 'button')
            answer = item.find(lambda child: child.tag == 'p')
            visible_faq.append((visible_text(question) if question else '', visible_text(answer) if answer else ''))
    expected_questions = 4 if len(page['states']) >= 2 else 3
    if len(visible_faq) != expected_questions:
        errors.append(f'FAQ has {len(visible_faq)} questions, expected {expected_questions}')
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
    model = page_model.Model()
    state_names = page_model.load_state_names()
    results = []
    for page_path in [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]:
        file_path = Path(arguments.html_dir) / (page_path.strip('/') + '.html')
        if not file_path.exists():
            results.append({'page': page_path, 'errors': [f'no built file {file_path}'], 'warnings': [], 'links': []})
            continue
        results.append(check_page(file_path.read_text(), model, state_names, page_path))
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
