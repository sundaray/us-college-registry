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
import check_program_pages  # noqa: E402
from check_program_pages import (  # noqa: E402
    FORBIDDEN_PATTERNS, MEDIAN_EXAMPLE_TOKENS, ONE_PARAGRAPH_LIMIT, TOKEN_PATTERN, Expectation, number_tokens, parse_html, tile_lines, visible_text,
)
from job_rows import EDUCATION_NEEDED, EXPERIENCE_NEEDED  # noqa: E402
from page_model import count, money, percent_number  # noqa: E402

CREDENTIAL_SLUGS = {1: 'certificate', 2: 'associate', 3: 'bachelors'}
CREDENTIAL_LABELS = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's"}
# Fixed phrases on occupation pages that contain digits but no data.
OCCUPATION_STATIC_PHRASES = [
    'Regional Price Parities for 2024', 'Regional Price Parities, 2024', 'US average is 100',
    'Bottom 10%', 'Top 10%', 'bottom 10%', 'top 10%',
]
LABOR_SOURCE_LINE = 'Source: the U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025'
LABOR_STATISTICS = r'Bureau of Labor Statistics: the federal agency that measures jobs, pay and prices in the United States\.'
VISIBLE_ROWS = 10
SECTION_ORDER = ['header', 'summary', 'key-figures', 'key-figure-questions', 'states', 'programs', 'faq', 'about-data']
# Wording the revised pages no longer use anywhere.
RETIRED_WORDING = [
    r', so ', r'—', r'(?i)\bearnings\b', r'The short answer', r'\bBLS\b', r'\bBEA\b', r'crosswalk from fields of study',
    r'Typical education to start', r'US average = 100',
    # Claims the agency's own documents do not support, and the wording that named one agency for the links.
    r'(?i)\bevery industry\b', r'(?i)\ball industries\b', r'self-employed', r'count new jobs', r'Department of Education links',
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
        # The number beside a state is its place among the states only. A place that is not a state has none.
        state['pay_rank'] = 1 + sum(1 for other in states if page_model.is_state(other['name']) and other['pay'] > state['pay']) if page_model.is_state(state['name']) else None
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
            'count': benchmark['year1_count'], 'pay': benchmark['year1'], 'debt': benchmark['debt'], 'level': level,
        })
    programs.sort(key=lambda program: -program['pay'])
    return {
        'code': code, 'title': national['title'], 'name': name, 'sentence': lowercase_words(name),
        'national': national, 'growth': projection.get('growth_percent'), 'openings': projection.get('openings_thousands'),
        'education': projection.get('education'), 'experience': projection.get('experience'),
        'states': states, 'without_pay': without_pay, 'programs': programs,
        # Everyone in the job in 2025, from the projections. The pay survey's count
        # (national['employment']) leaves out people who work for themselves.
        'all_jobs': projection.get('employment'),
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


def named(states):
    """One place by name, or any names when several tie: the page lists tied
    places in its own order."""
    return re.escape(page_model.place_in_sentence(states[0]['name'])) if len(states) == 1 else '.*'


def expected_sections(page):
    national, states = page['national'], page['states']
    name = page['sentence']
    # Sentences that compare states rank the states only. The District of
    # Columbia and Puerto Rico stay in the table and are mentioned separately.
    true_states = [state for state in states if page_model.is_state(state['name'])]
    adjusted_states = [state for state in true_states if state['adjusted'] is not None]
    sections = {}
    has_projection = page['growth'] is not None and page['openings'] is not None
    growth = percent_number(abs(Fraction(page['growth']) / 100)) if has_projection else None
    openings = count(page_model.round_half_up(page['openings'] * 1000)) if has_projection else None
    expected_change = None
    if has_projection:
        expected_change = 'stay about the same in number' if growth == 0 else f"{'grow' if page['growth'] > 0 else 'shrink'} {growth}%"

    # The summary has two subjects: the job in the whole country, then by state.
    summary = sections['summary'] = Expectation(True)
    summary.add(money(national['median']))
    country = rf"^Summary .* earn a median of {re.escape(money(national['median']))} a year in the US, across all experience levels\."
    if has_projection:
        country += rf" Jobs are projected to {expected_change} from 2025 to 2035, with about {openings} openings a year across the US\."
    summary.claim(country)
    growth_tokens(summary, page)
    by_state = []
    if len(true_states) >= 2:
        top = [state for state in true_states if state['pay'] == true_states[0]['pay']]
        bottom = [state for state in true_states if state['pay'] == true_states[-1]['pay']]
        summary.add(money(top[0]['pay']), money(bottom[0]['pay']))
        among = 'Among the 50 states' if len(true_states) == 50 else f'Among the {len(true_states)} states with a figure'
        summary.add(str(len(true_states)))
        by_state.append(rf"{among}, pay is highest in {named(top)} \({re.escape(money(top[0]['pay']))}\) and lowest in {named(bottom)} \({re.escape(money(bottom[0]['pay']))}\)\.")
        words, amounts = page_model.outside_states_range([(state['name'], state['pay']) for state in states], top[0]['pay'], bottom[0]['pay'])
        if words:
            summary.add(*amounts)
            by_state.append(rf"It is {re.escape(words)}\.")
        summary.claim(r' It is (?:higher|lower) in ', bool(words))
    if len(adjusted_states) >= 2:
        best = max(state['adjusted'] for state in adjusted_states)
        worst = min(state['adjusted'] for state in adjusted_states)
        top = [state for state in adjusted_states if state['adjusted'] == best]
        bottom = [state for state in adjusted_states if state['adjusted'] == worst]
        summary.add(money(best), money(worst))
        by_state.append(rf"After adjusting for prices, {named(top)} {'is' if len(top) == 1 else 'are'} highest \({re.escape(money(best))}\) and {named(bottom)} lowest \({re.escape(money(worst))}\)\.")
    summary.claim(' '.join(by_state) + '$', bool(by_state))
    summary.claim(r'Pay is highest in|Among the', bool(by_state) and len(true_states) >= 2)
    summary.has_second_subject = bool(by_state)

    # Each tile's label, value and line of context.
    figures = sections['key-figures'] = Expectation(True)
    figures.add(money(national['median']))
    if national['employment'] is not None:
        figures.add(count(national['employment']))
        figures.tiles = [['Median pay', money(national['median']), f"Pay survey covers {count(national['employment'])} jobs"]]
    else:
        figures.tiles = [['Median pay', money(national['median']), 'US, all experience levels']]
    if national['p10'] is not None:
        figures.add(money(national['p10']))
        figures.tiles.append(['Bottom 10% earn under', money(national['p10']), 'US'])
    if national['p90'] is not None:
        figures.add(money(national['p90']))
        figures.tiles.append(['Top 10% earn over', money(national['p90']), 'US'])
    projection_label = None
    if growth_tokens(figures, page):
        projection_label = 'Projected job change' if growth == 0 else 'Projected job growth' if page['growth'] > 0 else 'Projected job decline'
        figures.tiles.append([projection_label, 'About the same' if growth == 0 else f'{growth}%', f'2025 to 2035, about {openings} openings a year'])

    # The questions under the key figures.
    questions = sections['key-figure-questions'] = Expectation(True)
    questions.add(*MEDIAN_EXAMPLE_TOKENS, money(national['median']))
    questions.names = ['What does "median" mean?', 'What is median pay?']
    questions.claim(r'What does "median" mean\? An average adds up every value and divides by how many there are\. .* Imagine five workers who earn')
    # A yearly figure is the hourly figure times 2,080 hours, except for the jobs
    # with yearly pay only, where employers report the yearly figure itself.
    full_time = '' if national['yearly_only'] else r' The yearly figure assumes full-time work all year\.'
    both_counts = national['employment'] is not None and page['all_jobs'] is not None
    coverage = ''
    if both_counts:
        questions.add(count(national['employment']), count(page['all_jobs']))
        coverage = rf" The pay survey covers {count(national['employment'])} jobs\. The Bureau of Labor Statistics counts {count(page['all_jobs'])} in all, including people who work for themselves\."
    questions.claim(rf"The Bureau of Labor Statistics asks employers what they pay people in each job\. The median for {re.escape(name)} is {re.escape(money(national['median']))} a year: half of them earn more, and half earn less\. It covers every experience level\. It leaves out people who work on farms, in private households or for themselves\.{coverage}{full_time} {LABOR_STATISTICS} The figure is from its Occupational Employment and Wage Statistics for May 2025\.")
    questions.claim(r'assumes full-time work', not national['yearly_only'])
    questions.claim(r'The pay survey covers ', both_counts)
    both_ends = national['p10'] is not None and national['p90'] is not None
    if both_ends:
        questions.add(money(national['p10']), money(national['p90']))
        questions.names.append('What do "bottom 10%" and "top 10%" mean?')
        questions.claim(rf"One in ten {re.escape(name)} earns less than {re.escape(money(national['p10']))} a year, and one in ten earns more than {re.escape(money(national['p90']))}\. The other eight in ten earn between those two figures\.")
    questions.claim(r'One in ten', both_ends)
    if has_projection:
        growth_tokens(questions, page)
        questions.names.append(f'What does "{projection_label.lower()}" mean?')
        questions.claim(rf"The Bureau of Labor Statistics projects how the number of jobs in each occupation will change over ten years\. It expects the number of {re.escape(name)} to {expected_change} from 2025 to 2035\. The {openings} openings a year come from two things: the change in the number of jobs, and people who leave the occupation, either to stop working \(for example to retire\) or to move to a different kind of job\. {LABOR_STATISTICS} The figures are from its Employment Projections for 2025 to 2035\.")
    questions.claim(r'will change over ten years', has_projection)

    state_section = sections['states'] = Expectation(bool(states))
    sortable = len(states) >= 3
    for state in states:
        if sortable and state['pay_rank'] is not None:
            state_section.add(str(state['pay_rank']))
        state_section.add(money(state['pay']))
        for key in ('adjusted', 'p10', 'p90'):
            if state[key] is not None:
                state_section.add(money(state[key]))
        if state['jobs'] is not None:
            state_section.add(count(state['jobs']))
    state_section.claim(rf"^Pay for {re.escape(name)} by state Each figure is the median pay for {re.escape(name)} in that state, across all experience levels\. \"After prices\" divides it by the state's price level, where the US average is 100\. That shows what the pay buys in each state\.")
    state_section.claim(rf"The Bureau of Labor Statistics publishes no median pay for {re.escape(name)} in ", bool(page['without_pay']))
    if len(page['without_pay']) > 5:
        state_section.add(count(len(page['without_pay'])))
        state_section.claim(rf"in {count(len(page['without_pay']))} other states and territories\.")
    unadjusted = [state for state in states if state['adjusted'] is None]
    state_section.claim(r' no price level from the Bureau of Economic Analysis, which is why (?:its|their) pay is not adjusted\.', bool(unadjusted))
    state_section.claim(r" has no price level from the Bureau of Economic Analysis, which is why its pay is not adjusted\.", len(unadjusted) == 1)
    # The note that says which places in the table are not states.
    not_states = page_model.not_states_note([state['name'] for state in states])
    state_section.claim(re.escape(not_states) if not_states else r'listed for comparison', bool(not_states))
    state_section.claim(r"State names link to the state's college page\.", any(state['linked'] for state in states))
    state_section.claim(r'Pay and job counts by state leave out people who work on farms, in private households or for themselves\.')
    state_section.pages = -(-len(states) // VISIBLE_ROWS)
    if state_section.pages > 1:
        state_section.add('1', count(state_section.pages))
    state_section.rows = states
    state_section.sortable = sortable

    program_section = sections['programs'] = Expectation(True)
    match = rf"^Related programs These programs are listed because their subjects are related to the work of {re.escape(name)}, according to the U\.S\. Department of Education and the Bureau of Labor Statistics\. This connection does not mean each program qualifies you for the job\."
    graduate_scope = "This site lists only certificates, associate's degrees and bachelor's degrees; it does not include graduate programs."
    usual = ''
    if page['code'] == '29-1171':
        usual = re.escape(" According to the Bureau of Labor Statistics, nurse practitioners need at least a master's degree in advanced practice nursing, plus nursing licenses and certification. " + graduate_scope)
    elif page['education']:
        usual = rf" The Bureau of Labor Statistics lists {re.escape(EDUCATION_NEEDED[page['education']])} as the typical education for entering this career\."
        if page['education'] in ("Master's degree", 'Doctoral or professional degree'):
            usual += re.escape(' ' + graduate_scope)
    program_section.claim(match + usual + ' Program ')
    program_section.claim(r"Each figure is the median across that kind of program in the US\. Program names link to the national ranking\. Program figures are first-year pay for new graduates\. The job's median pay covers every experience level\.$")
    program_section.claim(r'lead to this job|link these programs|not enough|People usually need|below that level|The match is by field', False)
    for program in page['programs']:
        program_section.add(count(program['count']), money(program['pay']), money(program['debt']))
    program_section.pages = -(-len(page['programs']) // VISIBLE_ROWS)
    if program_section.pages > 1:
        program_section.add('1', count(program_section.pages))

    faq = sections['faq'] = Expectation(True)
    faq.add(money(national['median']))
    if national['p10'] is not None and national['p90'] is not None:
        faq.add(money(national['p10']), money(national['p90']))
    faq.claim(r' and the top 10% earn more than ', national['p10'] is not None and national['p90'] is not None)
    # The question asks about states, so the answer names a state. A place that
    # is not a state and pays more is mentioned after it.
    if len(true_states) >= 2:
        top = [state for state in true_states if state['pay'] == true_states[0]['pay']]
        faq.add(money(top[0]['pay']))
        answer = rf"Which state pays {re.escape(name)} the most\? {named(top) if len(top) == 1 else '.*'}, at a median of {re.escape(money(top[0]['pay']))}\."
        if len(top) == 1:
            answer = answer.replace(named(top), re.escape(page_model.place_starting_sentence(top[0]['name'])), 1)
        if len(adjusted_states) >= 2:
            best = max(state['adjusted'] for state in adjusted_states)
            adjusted_top = [state for state in adjusted_states if state['adjusted'] == best]
            faq.add(money(best))
            answer += rf" After adjusting for prices, {named(adjusted_top)} {'is' if len(adjusted_top) == 1 else 'are'} highest, at {re.escape(money(best))} in US-average prices\."
        shown = lambda amount: int(page_model.round_half_up(amount))
        higher = [state for state in states if not page_model.is_state(state['name']) and shown(state['pay']) > shown(top[0]['pay'])]
        for place in higher:
            faq.add(money(place['pay']))
            answer += rf" {re.escape(page_model.place_starting_sentence(place['name']))} pays more \({re.escape(money(place['pay']))}\), but it is {re.escape(page_model.NOT_STATES[place['name']])} and not a state\."
        faq.claim(answer)
        faq.claim(r' pays more \(', bool(higher))
    if page['education']:
        needed = EDUCATION_NEEDED[page['education']] + EXPERIENCE_NEEDED.get(page['experience'] or '', '')
        faq.claim(rf"The Bureau of Labor Statistics says people typically need {re.escape(needed)} to start in this job\.")
        if page['experience']:
            faq.add(*re.findall(r'\d+', EXPERIENCE_NEEDED.get(page['experience'], '')))
    program_count = len(page['programs'])
    if program_count > 1:
        faq.add(count(program_count))
    faq.claim(rf"The U\.S\. Department of Education and the Bureau of Labor Statistics link {'one program' if program_count == 1 else count(program_count) + ' programs'} on this site to {re.escape(name)}[:.]")
    faq.claim(r'The ones offered at the most schools are ', program_count > 5)
    faq.claim(r', and [A-Z][^.]*\(', False)
    growth_tokens(faq, page)
    faq.questions = 2 + (len(true_states) >= 2) + has_projection

    about = sections['about-data'] = Expectation(True)
    about.claim(check_program_pages.PAY_PRIVACY_NOTE.format(figures="each program's pay figure"))
    about.claim(rf"^About this data This page covers the job the Bureau of Labor Statistics calls \"{re.escape(page['title'])}\" \(occupation code {re.escape(page['code'])}\)\.")
    about.claim(r'Pay is from the Bureau of Labor Statistics Occupational Employment and Wage Statistics for May 2025\. It covers all experience levels\. It leaves out people who work on farms, in private households or for themselves\. Projections are')

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
            if visible_text(rank_cell) != ('' if state['pay_rank'] is None else str(state['pay_rank'])):
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
    errors.extend(page_model.bare_place_errors(title, description, main_text))
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    # After the title: how many jobs there are and what it takes to start, when
    # the data has them, then the one source line. The official title and its
    # code are in "About this data".
    facts = []
    job_count = page['all_jobs'] if page['all_jobs'] is not None else page['national']['employment']
    if job_count is not None:
        facts.append(f"{count(job_count)} jobs in the US")
    if page['education']:
        facts.append(f"Typically needs {EDUCATION_NEEDED[page['education']]} to start")
    expected_header = ' '.join(['Home Careers', page['name'], h1, *facts, LABOR_SOURCE_LINE])
    if header_text != expected_header:
        errors.append(f'header reads {header_text!r}, expected {expected_header!r}')

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
    if list(present) != [name for name in SECTION_ORDER if name in present]:
        errors.append(f'sections are in the wrong order: {list(present)}')
    # The job's own names are not our wording.
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
            # where the states do.
            paragraphs = [visible_text(paragraph) for paragraph in node.find_all(lambda child: child.tag == 'p')]
            heading = node.find(lambda child: child.tag == 'h2')
            wanted = 2 if expectation.has_second_subject and len(' '.join(paragraphs)) > ONE_PARAGRAPH_LIMIT else 1
            if heading is None or visible_text(heading) != 'Summary' or len(paragraphs) != wanted:
                errors.append(f'section summary: expected the heading "Summary" and {wanted} paragraphs, found {len(paragraphs)}')
            elif wanted == 2 and not re.match(r'Among the |After adjusting for prices', paragraphs[1]):
                errors.append(f'section summary: the second paragraph starts in the wrong place: {paragraphs[1][:70]!r}')
        if name == 'key-figures' and tile_lines(node) != expectation.tiles:
            errors.append(f'section key-figures: tiles read {tile_lines(node)}, expected {expectation.tiles}')
        if name == 'states':
            check_state_rows(node, expectation, page, errors)
            check_paging(node, name, expectation, 'data-state')
        if name == 'programs':
            check_program_rows(node, page, errors)
            check_paging(node, name, expectation, 'data-href')

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
    if len(common_questions) != expectations['faq'].questions:
        errors.append(f"FAQ has {len(common_questions)} questions, expected {expectations['faq'].questions}")
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
