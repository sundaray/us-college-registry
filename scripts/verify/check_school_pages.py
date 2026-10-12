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
import check_program_pages  # noqa: E402
from check_program_pages import (  # noqa: E402
    CAMPUS_RULE, FORBIDDEN_PATTERNS, MEDIAN_EXAMPLE_TOKENS, ONE_PARAGRAPH_LIMIT, SOURCE_LINE, STATE_NAMES, Expectation,
    number_tokens, parse_html, tile_lines, visible_text,
)
from page_model import count, money, ordinal, percent  # noqa: E402

CREDENTIALS = {3: "bachelor's", 2: "associate's", 1: 'certificate'}
CONTROLS = {'1': 'Public', '2': 'Private nonprofit', '3': 'Private for-profit'}
# Schools with fewer programs that report pay have no school page.
MINIMUM_SCHOOL_PAGE_PROGRAMS = 2
SHORT_LIST_MINIMUM = 6
SHORT_LIST_COUNT = 5
VISIBLE_ROWS = 10
NURSING_CIP = '5138'
# Fixed phrases on school pages that contain digits but no data.
SCHOOL_STATIC_PHRASES = ['within 6 years', 'within 1.5 times the normal program length', 'IPEDS tuition and fees, 2023-24']
# Sections in the order the page shows them. A school has a ranking for each
# credential level it has programs at, bachelor's first.
SECTION_ORDER = ['header', 'summary', 'key-figures', 'key-figure-questions', 'ranking-3', 'ranking-2', 'ranking-1', 'short-lists', 'faq', 'about-data']
# Wording the revised pages no longer use anywhere.
RETIRED_WORDING = [
    r', so ', r'—', r'(?i)\bearnings\b', r'The short answer', r'Quick picks', r'\bBLS\b', r'(?<!College )\bScorecard\b',
    r', and (?:[A-Z][a-z]+ )?(?:one|\d+) (?:certificate|associate|bachelor)', r'isn\'t listed|aren\'t listed',
]


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
        'state_name': STATE_NAMES[state],
        # The school's programs that report pay but are left out of the state,
        # because most of their graduates studied at campuses in other states.
        'studied_elsewhere': model.studied_elsewhere_school.get(unit_id, 0),
        'levels': levels,
        'primary': primary,
        'control': CONTROLS[control],
        'four_year': institution['ICLEVEL'] == '1',
        # "Within 6 years" is true only at schools that mainly award bachelor's degrees.
        'within_six_years': institution['ICLEVEL'] == '1' and institution['PREDDEG'] == 3,
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


def studied_elsewhere(expectation, school):
    """The sentence that says some of the school's programs are not listed,
    wherever the page counts its programs."""
    left_out = school['studied_elsewhere']
    if left_out > 1:
        expectation.add(count(left_out))
    expectation.claim(r'One program is not listed, because most of its graduates studied at campuses in other states\.', left_out == 1)
    expectation.claim(rf'{count(left_out)} programs are not listed, because most of their graduates studied at campuses in other states\.', left_out > 1)
    expectation.claim(r'graduates studied at campuses in other states', left_out > 0)


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
            summary.claim(rf"{re.escape(name(top[0]))} pays the most in the first year \({re.escape(money(top[0]['year1']))}\) and ")
        else:
            summary.claim(rf" pay the most in the first year \({re.escape(money(top[0]['year1']))}\) and ")
        if len(bottom) == 1:
            summary.claim(rf" and {re.escape(name(bottom[0]))} pays the least \({re.escape(money(bottom[0]['year1']))}\)\.")
        else:
            summary.claim(rf" pay the least \({re.escape(money(bottom[0]['year1']))}\)\.")
        summary.claim(rf"The median program pays {re.escape(money(median_pay(programs)))}\.")
    others = [level for level in levels if level is not primary]
    for level in others:
        if len(level['programs']) > 1:
            summary.add(count(len(level['programs'])))
    summary.claim(r'also has .* pay\.', bool(others))
    summary.claim(r', and .* the least', False)
    studied_elsewhere(summary, school)
    # The second subject of the summary: the school's other levels, and the
    # programs the page leaves out. A long summary breaks before it.
    summary.has_second_subject = bool(others) or school['studied_elsewhere'] > 0

    # The key figures are the school's cost and rates: each tile's label, value
    # and line of context.
    tiles = []
    if school['reports_by_program']:
        if school['program_tuition'] is not None:
            tiles.append(['Tuition for the largest program', money(school['program_tuition']), 'Tuition and fees for the whole program'])
        if school['net_price'] is not None:
            tiles.append(['Net price, largest program', money(school['net_price']), 'After aid, for the whole program'])
    else:
        in_state, out_of_state = school['in_state_tuition'], school['out_of_state_tuition']
        if in_state is not None and in_state == out_of_state:
            tiles.append(['Tuition and fees', money(in_state), 'Per year, for all students'])
        elif in_state is not None:
            tiles.append([
                'In-district tuition and fees' if school['district_tuition'] else 'In-state tuition and fees', money(in_state),
                f'Per year. Out-of-state {money(out_of_state)}' if out_of_state is not None else 'Per year',
            ])
        elif out_of_state is not None:
            tiles.append(['Out-of-state tuition and fees', money(out_of_state), 'Per year'])
        if school['net_price'] is not None:
            tiles.append(['Average net price after aid', money(school['net_price']), 'Per year'])
    if school['graduation_rate'] is not None:
        tiles.append(['Graduation rate', percent(school['graduation_rate']), f"First-time, full-time students, within {'6 years' if school['within_six_years'] else '1.5 times the normal program length'}"])
    if school['admission_rate'] is not None:
        tiles.append(['Admission rate', percent(school['admission_rate']), 'Of applicants'])
    figures = sections['key-figures'] = Expectation(bool(tiles))
    figures.tiles = tiles
    for _, value, context in tiles:
        figures.add(value, *re.findall(r'\$[\d,]+', context))

    # Three questions under the key figures. The tiles show cost and rates, so the
    # questions explain the pay and debt figures in the tables, by column name.
    questions = sections['key-figure-questions'] = Expectation(True)
    questions.add(*MEDIAN_EXAMPLE_TOKENS)
    questions.claim(r'What does "median" mean\? An average adds up every value and divides by how many there are\.')
    questions.claim(r'were not enrolled in more school\. The "Year 1 pay" column on this page shows that figure for each program\. The "Year 5 pay" column is the same measure for an earlier graduating class\. College Scorecard: ')
    questions.claim(r'Parent PLUS loans and private loans\. The "Debt" column on this page shows that figure for each program\. College Scorecard: ')
    questions.claim(r'debt-to-earnings|would be at 40%', False)

    for level in levels:
        level_programs = level['programs']
        section = sections[f"ranking-{level['level']}"] = Expectation(True)
        sortable = len(level_programs) >= 3
        level_credential = CREDENTIALS[level['level']]
        if sortable:
            section.add(count(len(level_programs)))
            section.claim(rf"^{count(len(level_programs))} .* {level_credential} programs, ranked by graduate pay Each figure is the median")
        else:
            section.claim(rf"^{'One' if len(level_programs) == 1 else 'Two'} .* {level_credential} programs? Each figure is the median")
        # "Page 1 of N" under a table with more than ten programs.
        section.pages = -(-len(level_programs) // VISIBLE_ROWS)
        if section.pages > 1:
            section.add('1', count(section.pages))
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
        section.claim(rf"{count(level['debt_only'])} more {level_credential} programs are not listed, because they report debt but not pay\.", level['debt_only'] > 1)
        section.claim(rf'One more {level_credential} program is not listed, because it reports debt but not pay\.', level['debt_only'] == 1)
        has_nursing = level['level'] == 3 and any(program['cip'] == NURSING_CIP for program in level_programs)
        section.claim(r'are for nurses who are already licensed and working\. College Scorecard counts them with programs for new students', has_nursing)
        section.rows = level_programs
        section.sortable = sortable

    # Two short lists of up to five programs: the lowest debt, then the most
    # graduates. A list with nothing to show is left out, and so is the section.
    with_debt = sorted((program for program in programs if program['debt'] is not None), key=lambda program: (program['debt'], -program['year1']))
    with_graduates = sorted((program for program in programs if program['graduates'] is not None), key=lambda program: (-program['graduates'], -program['year1']))
    lowest_debt = [money(program['debt']) for program in with_debt[:SHORT_LIST_COUNT]]
    most_graduates = [f"About {count(program['graduates'])} graduates a year" for program in with_graduates[:SHORT_LIST_COUNT]]
    picks = sections['short-lists'] = Expectation(len(programs) >= SHORT_LIST_MINIMUM and bool(lowest_debt or most_graduates))
    if picks.present:
        picks.add(*lowest_debt, *[count(program['graduates']) for program in with_graduates[:SHORT_LIST_COUNT]])
        picks.lists = [(heading, values) for heading, values in (('Lowest debt', lowest_debt), ('Most graduates', most_graduates)) if values]
        if lowest_debt and most_graduates:
            picks.claim(rf" {credential} programs with the lowest debt and the most graduates The first list orders the programs by median federal debt, lowest first\. The second orders them by graduates a year, most first\. Each list shows up to five programs\.")
        elif lowest_debt:
            picks.claim(rf" {credential} programs with the lowest debt This list orders the programs by median federal debt, lowest first, and shows up to five\.")
        else:
            picks.claim(rf" {credential} programs with the most graduates This list orders the programs by graduates a year, most first, and shows up to five\.")
        picks.claim(r'Highest first-year pay|Largest programs', False)

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
        faq.claim(r' a year, and \$', False)
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
    studied_elsewhere(faq, school)

    about = sections['about-data'] = Expectation(True)
    about.claim(check_program_pages.PAY_PRIVACY_NOTE.format(figures='each pay figure'))
    about.claim(r'^About this data Pay and debt only include students who received federal financial aid, and pay only counts graduates who were working and not enrolled in more school\.')
    about.claim(r'Tuition, net price, graduation rate and admission rate are for the whole school, not one program\.')
    about.claim(r'College Scorecard figures describe graduating classes from several years ago\.')
    about.claim(CAMPUS_RULE.format(state=re.escape(school['state_name']), place=re.escape(page_model.place_in_sentence(school['state_name']))))

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
    errors.extend(check_program_pages.frame_errors(root))
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
    errors.extend(page_model.bare_place_errors(title, description, main_text))
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    # Identity: the header names the school the raw data says it is.
    institution = school['institution']
    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    # After the title: the official name when the title uses a shorter one, the
    # kind of school, its city, its undergraduates when the data has them, then
    # the one source line. Nothing else.
    official_name = ' '.join(institution['INSTNM'].split())
    facts = [institution_kind(school), f"{institution['CITY']}, {institution['STABBR']}"]
    if official_name != short_name:
        facts.insert(0, official_name)
    if school['undergraduates'] is not None:
        facts.append(f"{count(school['undergraduates'])} undergraduates")
    expected_end = ' '.join([h1, *facts, SOURCE_LINE])
    if not header_text.endswith(expected_end):
        errors.append(f'header should end with {expected_end!r}, found {header_text[-len(expected_end) - 30:]!r}')

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
    if list(present) != [name for name in SECTION_ORDER if name in present]:
        errors.append(f'sections are in the wrong order: {list(present)}')
    # The school's own name and its programs' names are not our wording.
    our_text = visible_text(main, skip_names=True).replace(short_name, ' ').replace(official_name, ' ')
    for pattern in RETIRED_WORDING:
        found = re.search(pattern, our_text)
        if found:
            errors.append(f'retired wording {pattern!r}: ...{our_text[max(0, found.start() - 40):found.end() + 40]}...')
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
        if name == 'summary':
            # One paragraph when the summary is short or has one subject. Otherwise
            # the second paragraph starts where the second subject does.
            paragraphs = [visible_text(paragraph) for paragraph in node.find_all(lambda child: child.tag == 'p')]
            heading = node.find(lambda child: child.tag == 'h2')
            wanted = 2 if expectation.has_second_subject and len(' '.join(paragraphs)) > ONE_PARAGRAPH_LIMIT else 1
            if heading is None or visible_text(heading) != 'Summary' or len(paragraphs) != wanted:
                errors.append(f'section summary: expected the heading "Summary" and {wanted} paragraphs, found {len(paragraphs)}')
            elif wanted == 2 and not re.match(rf'{re.escape(short_name)} also has |One program is not listed|[\d,]+ programs are not listed', paragraphs[1]):
                errors.append(f'section summary: the second paragraph starts in the wrong place: {paragraphs[1][:80]!r}')
        if name == 'key-figures' and tile_lines(node) != expectation.tiles:
            errors.append(f'section key-figures: tiles read {tile_lines(node)}, expected {expectation.tiles}')
        if name == 'short-lists':
            headings = [visible_text(heading) for heading in node.find_all(lambda child: child.tag == 'h3')]
            shown = [[visible_text(item.children[-1]) for item in items.find_all(lambda child: child.tag == 'li')] for items in node.find_all(lambda child: child.tag == 'ol')]
            if list(zip(headings, shown)) != expectation.lists:
                errors.append(f'section short-lists: lists read {list(zip(headings, shown))}, expected {expectation.lists}')
        if name.startswith('ranking-'):
            check_rows(node, expectation, field_names, school_slug, errors, name)
            # The first ten rows show, and the pager appears only when there are more.
            rows = node.find_all(lambda child: child.tag == 'tr' and 'data-cip' in child.attributes)
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

    description_expectation = expectations['#description']
    if tokens(description) != description_expectation.tokens:
        errors.append(f'description numbers differ: expected {dict(description_expectation.tokens)}, found {dict(tokens(description))}')
    for pattern, should_match in description_expectation.claims:
        if bool(re.search(pattern, description)) != should_match:
            errors.append(f'description wording {pattern!r}')

    # Both lists of questions, in page order: the three under the key figures,
    # then the common questions. An answer is every paragraph of its panel.
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
    if [question for question, _ in figure_questions] != ['What does "median" mean?', 'What is median first-year pay?', 'What is median federal debt?']:
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
