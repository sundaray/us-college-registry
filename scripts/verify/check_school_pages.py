#!/usr/bin/env python3
"""Checks built school pages (every program at one school that reports pay)
against the public data in data/raw.

Same approach as check_program_pages.py: page_model.py works out, from data/raw
only, every number the page must show and which wording it must use; this
script compares that, section by section, with the built HTML. Each row of the
program tables is also checked on its own: field name, figures, ranks, and links.

Program names come from scripts/reference/field-names.ts, the reviewed list of
plain names for CIP codes, which this script reads directly.

Usage:
  python3 scripts/verify/check_school_pages.py --html-dir dist/client --pages pages.txt --report report.json
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_model  # noqa: E402
from check_program_pages import FORBIDDEN_PATTERNS, STATE_NAMES, Expectation, number_tokens, parse_html, visible_text  # noqa: E402
from page_model import count, money, ordinal, percent  # noqa: E402

CREDENTIALS = {3: "bachelor's", 2: "associate's", 1: 'certificate'}
CONTROLS = {'1': 'Public', '2': 'Private nonprofit', '3': 'Private for-profit'}
# Schools with fewer programs that report pay have no school page.
MINIMUM_SCHOOL_PAGE_PROGRAMS = 2
QUICK_PICK_MINIMUM = 6
QUICK_PICK_COUNT = 5
NURSING_CIP = '5138'
# Fixed phrases on school pages that contain digits but no data.
SCHOOL_STATIC_PHRASES = ['Within 6 years', 'Within 1.5 times the normal program length', 'IPEDS tuition and fees, 2023-24']


def positive(value):
    # Zero tuition, net price, or enrollment counts as not reported.
    return value if value is not None and value > 0 else None


def school_model(model, unit_id):
    if unit_id not in model.page_unit_ids:
        raise LookupError(f'No school page for {unit_id}')
    institution = model.institutions[unit_id]
    state = institution['STABBR']
    levels = []
    for level in (3, 2, 1):
        rows = model.school.get((unit_id, level), [])
        if not rows:
            continue
        programs = []
        for row in rows:
            pool = model.state[(row['CIPCODE'], level, state)]
            with_pay = [other for other in pool if other['EARN_MDN_1YR'] is not None]
            programs.append({
                'cip': row['CIPCODE'],
                'year1': row['EARN_MDN_1YR'],
                'year5': row['EARN_MDN_5YR'],
                'debt': row['DEBT_ALL_STGP_ANY_MDN'],
                'graduates': row['IPEDSCOUNT2'] or None,
                'pay_rank': 1 + sum(1 for other in rows if other['EARN_MDN_1YR'] > row['EARN_MDN_1YR']),
                'state_rank': 1 + sum(1 for other in with_pay if other['EARN_MDN_1YR'] > row['EARN_MDN_1YR']),
                'state_count': len(with_pay),
                'has_page': id(row) in model.page_ids,
                'has_ranking': any(id(other) in model.page_ids for other in pool),
            })
        programs.sort(key=lambda program: -program['year1'])
        levels.append({'level': level, 'programs': programs, 'debt_only': model.school_debt_only.get((unit_id, level), 0)})
    if sum(len(level['programs']) for level in levels) < MINIMUM_SCHOOL_PAGE_PROGRAMS:
        raise LookupError(f'{unit_id} has too few programs for a school page')
    primary = levels[0]
    for level in levels:
        if len(level['programs']) > len(primary['programs']):
            primary = level
    control = institution['CONTROL']
    return {
        'institution': institution,
        'levels': levels,
        'primary': primary,
        'control': CONTROLS[control],
        'four_year': institution['ICLEVEL'] == '1',
        'in_state_tuition': positive(institution['TUITIONFEE_IN']),
        'out_of_state_tuition': positive(institution['TUITIONFEE_OUT']),
        'program_tuition': positive(institution['TUITIONFEE_PROG']),
        'reports_by_program': institution['TUITIONFEE_IN'] is None and institution['TUITIONFEE_PROG'] is not None,
        'district_tuition': unit_id in model.district_schools,
        'net_price': positive(institution['NPT4_PUB'] if control == '1' else institution['NPT4_PRIV']),
        'admission_rate': institution['ADM_RATE'],
        'graduation_rate': institution['C150_4'] if institution['ICLEVEL'] == '1' else institution['C150_L4'],
        'undergraduates': positive(institution['UGDS']),
    }


def median_pay(programs):
    return page_model.median([program['year1'] for program in programs])


def tied_first(programs, value):
    return [program for program in programs if value(program) == value(programs[0])]


def expected_sections(school, field_names):
    levels, primary = school['levels'], school['primary']
    programs = primary['programs']
    credential = CREDENTIALS[primary['level']]
    sections = {}

    def name(program):
        return field_names[program['cip']]

    summary = sections['summary'] = Expectation(True)
    if len(programs) == 1:
        summary.add(money(programs[0]['year1']))
        summary.claim(rf"has one {credential} program that reports what graduates earn: {re.escape(name(programs[0]))}, which pays")
    elif len(programs) == 2:
        first, second = programs
        summary.claim(rf'has two {credential} programs that report what graduates earn\.')
        if first['year1'] == second['year1']:
            summary.add(money(first['year1']))
            summary.claim(r'both pay')
        else:
            summary.add(money(first['year1']), money(second['year1']))
            summary.claim(rf"{re.escape(name(first))} pays more in the first year")
    else:
        top = tied_first(programs, lambda program: program['year1'])
        bottom = tied_first(programs[::-1], lambda program: program['year1'])
        summary.add(count(len(programs)), money(top[0]['year1']), money(bottom[0]['year1']), money(median_pay(programs)))
        summary.claim(rf"{credential} programs report what graduates earn\.")
        if len(top) == 1:
            summary.claim(rf"{re.escape(name(top[0]))} pays the most in the first year")
        if len(bottom) == 1:
            summary.claim(rf"and {re.escape(name(bottom[0]))} the least")
        summary.claim(r'The median program pays')
    others = [level for level in levels if level is not primary]
    for level in others:
        if len(level['programs']) > 1:
            summary.add(count(len(level['programs'])))
    summary.claim(r'also has .* pay\.', bool(others))

    figures_present = False
    figures = Expectation(False)
    if school['reports_by_program']:
        if school['program_tuition'] is not None:
            figures.add(money(school['program_tuition']))
            figures.claim(r'Tuition for the largest program')
            figures_present = True
        if school['net_price'] is not None:
            figures.add(money(school['net_price']))
            figures.claim(r'Net price, largest program')
            figures_present = True
    else:
        in_state, out_of_state = school['in_state_tuition'], school['out_of_state_tuition']
        if in_state is not None and in_state == out_of_state:
            figures.add(money(in_state))
            figures.claim(r'Per year, for all students')
            figures_present = True
        elif in_state is not None:
            figures.add(money(in_state))
            figures.claim(r'In-district tuition and fees' if school['district_tuition'] else r'In-state tuition and fees')
            if out_of_state is not None:
                figures.add(money(out_of_state))
            figures_present = True
        elif out_of_state is not None:
            figures.add(money(out_of_state))
            figures.claim(r'Out-of-state tuition and fees')
            figures_present = True
        if school['net_price'] is not None:
            figures.add(money(school['net_price']))
            figures.claim(r'Average net price after aid')
            figures_present = True
    if school['graduation_rate'] is not None:
        figures.add(percent(school['graduation_rate']))
        figures.claim(r'Within 6 years' if school['four_year'] else r'Within 1\.5 times the normal program length')
        figures_present = True
    if school['admission_rate'] is not None:
        figures.add(percent(school['admission_rate']))
        figures.claim(r'Admission rate')
        figures_present = True
    figures.present = figures_present
    sections['key-figures'] = figures

    for level in levels:
        level_programs = level['programs']
        section = sections[f"ranking-{level['level']}"] = Expectation(True)
        sortable = len(level_programs) >= 3
        if sortable:
            section.add(count(len(level_programs)))
        for program in level_programs:
            if sortable:
                section.add(str(program['pay_rank']))
            section.add(money(program['year1']))
            if program['year5'] is not None:
                section.add(money(program['year5']))
            if program['debt'] is not None:
                section.add(money(program['debt']))
            if program['graduates'] is not None:
                section.add(count(program['graduates']))
            section.add(ordinal(program['state_rank']), count(program['state_count']))
        any_page = any(program['has_page'] for program in level_programs)
        section.claim(r'Program names link', any_page)
        section.claim(r'A program gets its own page', any_page and not all(program['has_page'] for program in level_programs))
        if level['debt_only'] > 1:
            section.add(count(level['debt_only']))
        section.claim(r'\d+ more .* programs report debt but not pay', level['debt_only'] > 1)
        section.claim(r'One more .* program reports debt but not pay', level['debt_only'] == 1)
        has_nursing = level['level'] == 3 and any(program['cip'] == NURSING_CIP for program in level_programs)
        section.claim(r'\(RN-to-BSN\)\. College Scorecard counts them with programs for new students', has_nursing)
        section.rows = level_programs
        section.sortable = sortable

    picks = sections['quick-picks'] = Expectation(len(programs) >= QUICK_PICK_MINIMUM)
    if picks.present:
        for program in programs[:QUICK_PICK_COUNT]:
            picks.add(money(program['year1']))
        with_debt = sorted((program for program in programs if program['debt'] is not None), key=lambda program: (program['debt'], -program['year1']))
        for program in with_debt[:QUICK_PICK_COUNT]:
            picks.add(money(program['debt']))
        with_graduates = sorted((program for program in programs if program['graduates'] is not None), key=lambda program: (-program['graduates'], -program['year1']))
        for program in with_graduates[:QUICK_PICK_COUNT]:
            picks.add(count(program['graduates']))
        picks.claim(rf'Quick picks: {credential} programs', len(levels) > 1)

    faq = sections['faq'] = Expectation(True)
    program_word = 'major' if len(levels) == 1 and primary['level'] == 3 else f'{credential} program'
    faq.question_patterns = []
    if len(programs) >= 2:
        top = tied_first(programs, lambda program: program['year1'])
        faq.add(money(top[0]['year1']), count(len(programs)))
        if len(top) > 3:
            faq.add(count(len(top)))
        faq.question_patterns.append(rf'^Which .* {program_word} pays the most\?$')
    with_debt = [program for program in programs if program['debt'] is not None]
    if len(with_debt) >= 2:
        lowest = tied_first(sorted(with_debt, key=lambda program: program['debt']), lambda program: program['debt'])
        faq.add(money(lowest[0]['debt']), count(len(with_debt)))
        if len(lowest) > 3:
            faq.add(count(len(lowest)))
        faq.question_patterns.append(rf'^Which .* {program_word} has the lowest debt\?$')
    cost_tokens = []
    if school['reports_by_program']:
        if school['program_tuition'] is not None:
            cost_tokens.append(money(school['program_tuition']))
        if school['net_price'] is not None:
            cost_tokens.append(money(school['net_price']))
    else:
        in_state, out_of_state = school['in_state_tuition'], school['out_of_state_tuition']
        if in_state is not None:
            cost_tokens.append(money(in_state))
            if out_of_state is not None and out_of_state != in_state:
                cost_tokens.append(money(out_of_state))
        elif out_of_state is not None:
            cost_tokens.append(money(out_of_state))
        if school['net_price'] is not None:
            cost_tokens.append(money(school['net_price']))
        if in_state is not None and out_of_state != in_state:
            faq.claim(r'In-district tuition and fees are' if school['district_tuition'] else r'In-state tuition and fees are')
    faq.add(*cost_tokens)
    if cost_tokens:
        faq.question_patterns.append(r'^How much does .* cost\?$')
    total = sum(len(level['programs']) for level in levels)
    total_with_debt = sum(1 for level in levels for program in level['programs'] if program['debt'] is not None)
    for level in levels:
        if len(level['programs']) > 1:
            faq.add(count(len(level['programs'])))
    if total_with_debt != total:
        faq.add(count(total_with_debt))
    faq.question_patterns.append(r'^How many .* programs report graduate pay\?$')

    sections['about-data'] = Expectation(True)

    description = sections['#description'] = Expectation(True)
    for level in levels:
        if len(level['programs']) > 1:
            description.add(count(len(level['programs'])))
        else:
            description.claim(rf"one {CREDENTIALS[level['level']]} program")
    pays = [program['year1'] for level in levels for program in level['programs']]
    description.add(money(min(pays)))
    if max(pays) != min(pays):
        description.add(money(max(pays)))
    return sections


def institution_kind(school):
    official = school['institution']['INSTNM']
    kind = 'university' if re.search(r'universit', official, re.I) else 'college' if re.search(r'college', official, re.I) else 'school'
    return f"{school['control']} {kind}"


def check_rows(node, expectation, field_names, school_slug, errors, name):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-cip' in child.attributes)
    expected = expectation.rows
    if sorted(row.attributes['data-cip'] for row in rows) != sorted(program['cip'] for program in expected):
        errors.append(f'section {name}: table rows are not the expected programs')
        return
    by_cip = {program['cip']: program for program in expected}
    previous_pay = None
    for row in rows:
        program = by_cip[row.attributes['data-cip']]
        cells = row.find_all(lambda child: child.tag == 'td')
        if expectation.sortable:
            rank_cell, cells = cells[0], cells[1:]
            if visible_text(rank_cell) != str(program['pay_rank']):
                errors.append(f"section {name}: {program['cip']} rank {visible_text(rank_cell)!r}, expected {program['pay_rank']}")
        if len(cells) != 5:
            errors.append(f"section {name}: {program['cip']} row has {len(cells)} cells")
            continue
        program_cell, year1_cell, year5_cell, debt_cell, state_cell = cells
        name_node = program_cell.find(lambda child: 'data-name' in child.attributes)
        shown_name = visible_text(name_node) if name_node else ''
        shown_graduates = visible_text(program_cell, skip_names=True)
        graduates_text = f"About {count(program['graduates'])} graduates a year" if program['graduates'] is not None else 'Graduates a year not reported'
        if shown_name != field_names[program['cip']] or shown_graduates != graduates_text:
            errors.append(f"section {name}: {program['cip']} shows {shown_name!r} and {shown_graduates!r}")
        checks = [
            (year1_cell, money(program['year1'])),
            (year5_cell, money(program['year5']) if program['year5'] is not None else 'Not reported'),
            (debt_cell, money(program['debt']) if program['debt'] is not None else 'Not reported'),
            (state_cell, f"{ordinal(program['state_rank'])} of {count(program['state_count'])}"),
        ]
        for cell, wanted in checks:
            if visible_text(cell) != wanted:
                errors.append(f"section {name}: {program['cip']} shows {visible_text(cell)!r}, expected {wanted!r}")
        program_link = program_cell.find(lambda child: child.tag == 'a')
        if program['has_page'] != (program_link is not None):
            errors.append(f"section {name}: {program['cip']} program link {'missing' if program['has_page'] else 'unexpected'}")
        elif program_link is not None and not program_link.attributes.get('href', '').startswith(f'/schools/{school_slug}/'):
            errors.append(f"section {name}: {program['cip']} links to {program_link.attributes.get('href')}")
        state_link = state_cell.find(lambda child: child.tag == 'a')
        if program['has_ranking'] != (state_link is not None):
            errors.append(f"section {name}: {program['cip']} ranking link {'missing' if program['has_ranking'] else 'unexpected'}")
        elif state_link is not None and not state_link.attributes.get('href', '').startswith('/states/'):
            errors.append(f"section {name}: {program['cip']} ranking link goes to {state_link.attributes.get('href')}")
        if previous_pay is not None and program['year1'] > previous_pay:
            errors.append(f'section {name}: rows are not in order of first-year pay')
        previous_pay = program['year1']


def check_page(html_text, model, field_names, page_path):
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
    unit_id = main.attributes.get('data-unit-id')
    short_name = main.attributes.get('data-school-name', '')
    school_slug = page_path.strip('/').split('/')[1]
    try:
        school = school_model(model, unit_id)
    except LookupError as error:
        return {'page': page_path, 'errors': errors + [str(error)], 'warnings': warnings, 'links': []}
    if not short_name or title != f'{short_name} Programs, Ranked by Graduate Pay and Debt':
        errors.append(f'title does not use the school name: {title!r}')

    main_text = visible_text(main)
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    # Identity: the header names the school the raw data says it is.
    institution = school['institution']
    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    # The official name is in the facts list, or in the H1 when it is also the short name.
    expected_facts = [institution['INSTNM'], institution_kind(school), f"{institution['CITY']}, {institution['STABBR']}"]
    if school['undergraduates'] is not None:
        expected_facts.append(f"{count(school['undergraduates'])} undergraduates")
    for fact in expected_facts:
        if fact not in header_text:
            errors.append(f'header does not show {fact!r}')
    if school['undergraduates'] is None and 'undergraduates' in header_text:
        errors.append('header shows undergraduates but the data has none')

    # The breadcrumb links to the state page.
    state_href = '/states/' + page_model.state_slug(STATE_NAMES[institution['STABBR']])
    if not header or not header.find(lambda node: node.tag == 'a' and node.attributes.get('href') == state_href):
        errors.append(f'breadcrumb link to {state_href} missing')

    def tokens(text):
        for phrase in SCHOOL_STATIC_PHRASES:
            text = text.replace(phrase, ' ')
        return Counter(number_tokens(text, short_name))

    expectations = expected_sections(school, field_names)
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
        text = visible_text(node, skip_names=True)
        for table in node.find_all(lambda child: child.tag == 'table'):
            if not table.find(lambda child: child.tag == 'td'):
                errors.append(f'section {name} has an empty table')
        actual = tokens(text)
        if actual != expectation.tokens:
            errors.append(f'section {name} numbers differ: missing {dict(expectation.tokens - actual)}, unexpected {dict(actual - expectation.tokens)}')
        for pattern, should_match in expectation.claims:
            if bool(re.search(pattern, visible_text(node))) != should_match:
                errors.append(f'section {name}: wording {pattern!r} should {"" if should_match else "not "}appear')
        if name.startswith('ranking-'):
            check_rows(node, expectation, field_names, school_slug, errors, name)

    description_expectation = expectations['#description']
    if tokens(description) != description_expectation.tokens:
        errors.append(f'description numbers differ: expected {dict(description_expectation.tokens)}, found {dict(tokens(description))}')
    for pattern, should_match in description_expectation.claims:
        if bool(re.search(pattern, description)) != should_match:
            errors.append(f'description wording {pattern!r}')

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
    model = page_model.Model()
    field_names = page_model.load_field_names()
    results = []
    for page_path in [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]:
        file_path = Path(arguments.html_dir) / (page_path.strip('/') + '.html')
        if not file_path.exists():
            results.append({'page': page_path, 'errors': [f'no built file {file_path}'], 'warnings': [], 'links': []})
            continue
        results.append(check_page(file_path.read_text(), model, field_names, page_path))
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
