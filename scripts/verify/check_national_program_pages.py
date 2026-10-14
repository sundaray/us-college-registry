#!/usr/bin/env python3
"""Checks built national program pages (every program of one field and credential
in the US) against the public data in data/raw.

Same approach as check_program_pages.py: page_model.py works out, from data/raw
only, every number the page must show and which wording it must use; this
script compares that, section by section, with the built HTML. Each row of the
state table is also checked on its own, including its link, and so is each row
of the national ranking: its rank, figures, pay after cost of living, and the
program page it links to. The two lists of programs with the lowest debt are
checked item by item against the same ranking.

Usage:
  python3 scripts/verify/check_national_program_pages.py --html-dir dist/client --pages pages.txt --report report.json
"""

import argparse
import json
import re
import math
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_model  # noqa: E402
import raw_data  # noqa: E402
import check_program_pages  # noqa: E402
from job_rows import job_text, job_tokens, lowercase_words, matching_job_names, start_sentence  # noqa: E402
from check_program_pages import (  # noqa: E402
    FORBIDDEN_PATTERNS, GRADUATE_DEBT_COLUMN_NOTE, GRADUATE_LOWEST_DEBT_CAUTION, Expectation, Identity, check_career_links, number_tokens,
    parse_html, ranking_about_claims, ranking_debt_name, ranking_question_claims, visible_text, wrong_kind_errors,
)
from page_model import count, money, percent  # noqa: E402

CREDENTIALS = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's", 5: "Master's"}
PICK_COUNT = 10
# Ranking rows on one page of the table; the rest are in the HTML, hidden.
VISIBLE_ROWS = 10
SOURCE_LINE = "Source: the U.S. Department of Education's College Scorecard, June 2026 release"
# Figures in the answers that explain the key figures: examples, not data.
EXAMPLE_TOKENS = ['$40,000', '$45,000', '$50,000', '$55,000', '$210,000', '$80,000', '$50,000', '$20,000', '$50,000', '40%']
CONTROL_NAMES = {'1': 'public', '2': 'private nonprofit', '3': 'private for-profit'}
# Fixed phrases on national pages that contain digits but no data.
NATIONAL_STATIC_PHRASES = ['the 50 states', 'the US average is 100', 'Price Parities for 2024']
NURSING_CIP = '5138'


def national_occupation(model, code):
    """BLS figures for the whole US, in the shape occupation_tokens reads."""
    wage = model.wages.get(('US', code))
    if wage is None:
        return None
    projection = model.projections.get(code, {})
    return {
        'code': code, 'title': wage['title'],
        # For the whole country the count is everyone in the job, from the projections.
        'state_median': wage['median'], 'state_employment': projection.get('employment') or wage['employment'], 'p10': wage['p10'], 'p90': wage['p90'],
        'national_median': wage['median'], 'growth_percent': projection.get('growth_percent'),
        'openings': projection.get('openings_thousands'), 'education': projection.get('education'),
        'experience': projection.get('experience'),
    }


def national_model(model, state_names, cip, level):
    # A master's national page ranks master's programs, which have their own set of pages.
    masters = level == raw_data.MASTERS_LEVEL
    with_page = model.masters_ids if masters else model.page_ids
    page_rows = (model.masters_rows_by_field if masters else model.page_rows_by_field).get((cip, level))
    if not page_rows:
        raise LookupError(f'No national page for {cip} {level}')
    pool = model.national[(cip, level)]
    states, unranked = [], 0
    for (pool_cip, pool_level, state), rows in model.state.items():
        if pool_cip != cip or pool_level != level:
            continue
        if any(id(row) in with_page for row in rows):
            benchmark = model.benchmark(rows)
            states.append({'code': state, 'name': state_names[state], 'count': benchmark['year1_count'], 'pay': benchmark['year1'], 'debt': benchmark['debt']})
        elif any(row['EARN_MDN_1YR'] is not None for row in rows):
            unranked += 1
    for state in states:
        # The number beside a state is its place among the states only. A place that is not a state has none.
        state['rank'] = 1 + sum(1 for other in states if page_model.is_state(other['name']) and other['pay'] > state['pay']) if page_model.is_state(state['name']) else None
    states.sort(key=lambda state: -state['pay'])

    def ratio(row):
        return Fraction(row['DEBT_ALL_STGP_ANY_MDN'], row['EARN_MDN_1YR'])

    ranking = national_ranking(model, cip, level, with_page)
    with_pay = [row for row in pool if row['EARN_MDN_1YR'] is not None]
    without_school = sum(1 for row in with_pay if not row['UNITID'] or row['UNITID'] not in model.institutions)

    # The lowest-debt lists draw on every ranked program that reports debt, in the
    # order of the ranking table sorted the same way: by rank, then by pay rank.
    with_debt = [program for program in ranking if program['debt'] is not None]
    picks = {
        'debt': sorted(with_debt, key=lambda program: (program['debt_rank'], program['pay_rank']))[:PICK_COUNT],
        'ratio': sorted(with_debt, key=lambda program: (program['ratio_rank'], program['pay_rank']))[:PICK_COUNT],
    }
    matching = None
    # The matching job of a field is the job its bachelor's degree trains for.
    # A master's page lists the field's jobs instead.
    if not masters and model.matching.get(cip):
        candidate = national_occupation(model, model.matching[cip])
        if candidate and candidate['state_median'] is not None:
            matching = candidate
    occupations = [national_occupation(model, occupation['code']) for occupation in model.occupations(cip, '00')]
    # The national rankings of the field's other credentials, master's first:
    # each one's credential and the number of programs that report pay.
    others = []
    for other_level in (raw_data.MASTERS_LEVEL, 3, 2, 1):
        if other_level != level and (model.masters_rows_by_field if other_level == raw_data.MASTERS_LEVEL else model.page_rows_by_field).get((cip, other_level)):
            others.append((other_level, model.benchmark(model.national[(cip, other_level)])['year1_count']))
    return {
        'masters': masters,
        'national': model.benchmark(pool),
        'official': ' '.join(next(row for row in pool if row['EARN_MDN_1YR'] is not None)['CIPDESC'].split()).rstrip('.'),
        'states': states,
        'unranked': unranked,
        'page_count': len(page_rows),
        'ranking': ranking,
        'unlisted': len(with_pay) - len(ranking),
        'without_school': without_school,
        'picks': picks,
        'ratio': ratio,
        'matching': matching,
        'occupations': [occupation for occupation in occupations if occupation['state_median'] is not None],
        'others': others,
        'nursing_bachelors': cip == NURSING_CIP and level == 3,
        'level': level,
        'occupation_names': page_model.load_occupation_names(),
        'matching_name': matching_job_names().get(cip),
    }


def national_ranking(model, cip, level, with_page):
    """Every program of the field and credential in a state pool that reports
    first-year pay, with its ranks. `with_page` holds the programs that have a
    page of their own. Pay after cost of living divides pay by the
    BEA price level of the school's state, only where at least half of the
    graduates who work are working in that state."""
    listed = []
    for (pool_cip, pool_level, _state), rows in model.state.items():
        if pool_cip == cip and pool_level == level:
            listed.extend(row for row in rows if row['EARN_MDN_1YR'] is not None)
    programs = []
    for row in listed:
        institution = model.institutions[row['UNITID']]
        price = model.prices['states'].get(f"{institution['ST_FIPS'].zfill(2)}000")
        working, in_state = row['EARN_COUNT_WNE_1YR'], row['EARN_IN_STATE_1YR']
        most_stay = working is not None and working > 0 and in_state is not None and in_state * 2 >= working
        exact = Fraction(row['EARN_MDN_1YR']) * 100 / Fraction(str(price[1])) if price and most_stay else None
        programs.append({
            'row': row,
            'unit_id': row['UNITID'],
            'state': institution['STABBR'],
            'city': institution['CITY'],
            'control': CONTROL_NAMES[institution['CONTROL']],
            'open': institution['CURROPER'] == '1',
            'year1': row['EARN_MDN_1YR'],
            'year5': row['EARN_MDN_5YR'],
            'debt': row['DEBT_ALL_STGP_ANY_MDN'],
            'after_exact': exact,
            'after': math.floor(exact + Fraction(1, 2)) if exact is not None else None,
            'has_page': id(row) in with_page,
        })
    with_debt = [program for program in programs if program['debt'] is not None]
    for program in programs:
        program['pay_rank'] = 1 + sum(1 for other in programs if other['year1'] > program['year1'])
        if program['after_exact'] is not None:
            program['after_rank'] = 1 + sum(1 for other in programs if other['after_exact'] is not None and other['after_exact'] > program['after_exact'])
        if program['debt'] is not None:
            ratio = Fraction(program['debt'], program['year1'])
            program['debt_rank'] = 1 + sum(1 for other in with_debt if other['debt'] < program['debt'])
            program['ratio_rank'] = 1 + sum(1 for other in with_debt if Fraction(other['debt'], other['year1']) < ratio)
    programs.sort(key=lambda program: program['pay_rank'])
    return programs


def tied(states):
    return [state for state in states if state['pay'] == states[0]['pay']]


def expected_sections(page):
    national, states = page['national'], page['states']
    # A master's page names its debt figure for what it counts.
    masters = page['masters']
    debt_name = ranking_debt_name(masters)
    sections = {}

    summary = sections['summary'] = Expectation(True)
    summary.add(money(national['year1']), money(national['debt']))
    if national['year5'] is not None:
        summary.add(money(national['year5']))
    # Only states are compared with each other. A place that is not a state is
    # mentioned after them when its median falls outside their range.
    ranked = [state for state in states if page_model.is_state(state['name'])]
    if len(ranked) >= 2:
        top, bottom = tied(ranked), tied(ranked[::-1])
        summary.add(money(top[0]['pay']), money(bottom[0]['pay']))
        if len(top) == 1:
            summary.claim(rf"{re.escape(top[0]['name'])} has the highest state median pay \(")
        if len(bottom) == 1:
            summary.claim(rf"\) and {re.escape(bottom[0]['name'])} the lowest \(")
    elif len(ranked) == 1:
        summary.add(money(ranked[0]['pay']))
        summary.claim(rf"{re.escape(ranked[0]['name'])} is the only state with enough programs to rank")
    beyond, beyond_amounts = (None, [])
    if ranked:
        beyond, beyond_amounts = page_model.outside_states_range([(state['name'], state['pay']) for state in states], ranked[0]['pay'], ranked[-1]['pay'])
    summary.add(*beyond_amounts)
    summary.claim(r'The median is (?:higher|lower) in ', beyond is not None)
    if beyond is not None:
        summary.claim(rf'the lowest \(\$[\d,]+\)\. The median is {re.escape(beyond)}\.$' if len(ranked) >= 2 else rf'The median is {re.escape(beyond)}\.$')
    for state in states:
        if not page_model.is_state(state['name']):
            summary.claim(rf"{re.escape(state['name'])} (?:has|have) the highest state median pay|and {re.escape(page_model.place_in_sentence(state['name']))} the lowest \(|{re.escape(state['name'])} is the only state", False)
    summary.claim(r'^Summary The median .* program in the US pays its graduates')
    # The national debt sentence closes the first paragraph, before any state.
    if masters:
        summary.claim(rf"The median program's graduates borrowed {re.escape(money(national['debt']))} in federal loans for graduate study at their school\. \w")
    else:
        summary.claim(rf"The median program leaves its graduates with {re.escape(money(national['debt']))} in federal debt\. \w")
    summary.claim(r'the short answer', False)

    questions = sections['key-figure-questions'] = Expectation(True)
    questions.add(*EXAMPLE_TOKENS)
    questions.add(money(national['year1']), count(national['year1_count']), money(national['debt']), count(national['debt_count']))
    questions.add(percent(national['dte']), count(national['dte_count']))
    if national['year5'] is not None:
        questions.add(count(national['year5_count']))
    questions.claim(r'What does "median" mean\? An average adds up every value and divides by how many there are\.')
    questions.claim(r'A lower figure means graduates owe less compared with what they earn\.')
    ranking_question_claims(questions, masters)
    questions.claim(r'for the pay|Debt to pay', False)
    questions.claim(r'The median is the middle value when the values are put in order: half are higher, and half are lower\.')
    questions.claim(rf"{re.escape(money(national['year1']))} is the median of those figures across the {count(national['year1_count'])} .* programs that report one\.")
    questions.claim(rf"Median pay after 5 years is the same measure for an earlier graduating class, and {count(national['year5_count'])} programs report it\.", national['year5'] is not None)
    questions.claim(rf"{re.escape(money(national['debt']))} is the median of those figures across the {count(national['debt_count'])} programs that report one\.")
    questions.claim(rf"{percent(national['dte'])} is the median across the {count(national['dte_count'])} .* programs that report both figures\.")
    questions.claim(r"College Scorecard: the U\.S\. Department of Education's public database of colleges and their programs, with pay figures drawn from federal tax records\.")
    questions.claim(r"College Scorecard: the U\.S\. Department of Education's public database of colleges and their programs, with debt figures drawn from federal student loan records\.")

    figures = sections['key-figures'] = Expectation(True)
    figures.claim(r'Median federal debt for graduate study', masters)
    figures.add(money(national['year1']), count(national['year1_count']), money(national['debt']), count(national['debt_count']))
    figures.add(percent(national['dte']), count(national['dte_count']))
    if national['year5'] is not None:
        figures.add(money(national['year5']), count(national['year5_count']))

    state_section = sections['states'] = Expectation(True)
    sortable = len(states) >= 3
    for state in states:
        if sortable and state['rank'] is not None:
            state_section.add(str(state['rank']))
        state_section.add(count(state['count']), money(state['pay']), money(state['debt']))
    if page['unranked'] > 1:
        state_section.add(count(page['unranked']))
    # Above the table, the page explains the two columns and what a median
    # across programs is. A master's debt figure counts only the loans for
    # graduate study at the school. Under the table, the page says why a place
    # is missing as a plain fact.
    borrowed = 'borrowed in federal loans for graduate study at the school' if masters else 'borrowed in federal loans'
    state_section.claim(rf"programs by state In the table below, we show pay and debt for each state's .* {CREDENTIALS[page['level']].lower()} programs\. Year 1 pay is what a program's typical graduate earned in the first year after finishing\. Debt is what a program's typical graduate {borrowed}\. Each state's figure is the median across its programs: half of them are higher, and half are lower\.")
    state_section.claim(r'The table leaves out one more state or territory, because it has fewer than five programs that report both pay and debt\.', page['unranked'] == 1)
    state_section.claim(rf"The table leaves out {count(page['unranked'])} more states and territories, because each has fewer than five programs that report both pay and debt\.", page['unranked'] > 1)
    state_section.claim(r'The table leaves out', page['unranked'] > 0)
    not_states = page_model.not_states_note([state['name'] for state in states])
    state_section.claim(r'listed for comparison', not_states is not None)
    if not_states is not None:
        state_section.claim(re.escape(not_states))
    state_section.rows = states
    state_section.sortable = sortable

    ranking = page['ranking']
    table = sections['ranking'] = Expectation(True)
    table.add(count(len(ranking)))  # "N {field} {credential} programs, ranked by graduate pay"
    table.claim(rf"^{count(len(ranking))} .* programs, ranked by graduate pay ")
    # The paragraph above the table. Every listed program reports pay. Its
    # last sentence names the figure a program can lack.
    table.claim(r"ranked by graduate pay Each program is ranked by the median pay of its graduates one year after they finished\. The figures come from College Scorecard, the U\.S\. Department of Education's public database of colleges and their programs\. It takes pay from federal tax records\. The ranking shows what graduates earn, not how good the teaching is\. Pay also depends on where graduates live and work\. Every program listed here reports pay\. A program that does not report debt is listed last when you sort by debt\.")
    table.claim(GRADUATE_DEBT_COLUMN_NOTE, masters)
    table.claim(r'Show all', False)
    # One name for debt divided by pay: the sort button and the column both say debt-to-earnings.
    table.claim(r'Lowest debt-to-earnings .* Debt Debt-to-earnings ')
    table.claim(r'for the pay|Debt to pay', False)
    if len(ranking) > VISIBLE_ROWS:
        table.add('1', count(-(-len(ranking) // VISIBLE_ROWS)))  # "Page 1 of N"
        table.claim(rf"Page 1 of {count(-(-len(ranking) // VISIBLE_ROWS))} ")
    for program in ranking:
        table.add(str(program['pay_rank']), money(program['year1']))
        if program['after'] is not None:
            table.add(money(program['after']))
        if program['year5'] is not None:
            table.add(money(program['year5']))
        if program['debt'] is not None:
            table.add(money(program['debt']), percent(Fraction(program['debt'], program['year1'])))
    adjusted = sum(1 for program in ranking if program['after'] is not None)
    unadjusted = len(ranking) - adjusted
    pay_only = sum(1 for program in ranking if program['debt'] is None)
    closed = sum(1 for program in ranking if not program['open'])
    combined = page['unlisted'] - page['without_school']
    table.add(count(adjusted))
    for figure in (unadjusted, pay_only, closed, page['without_school'], combined):
        if figure > 1:
            table.add(count(figure))
    # The note about programs with no pay after cost of living. The paragraph above the table used to end with the same words.
    table.claim(r'listed last when you sort by it', unadjusted > 0)
    table.claim(r'at least half of the graduates who work are working in the school.s state')
    table.claim(r'whose graduates mostly work in other states or whose state has no price level', unadjusted > 0)
    table.claim(r'One program is ranked only by pay, because it reports pay but not debt\.', pay_only == 1)
    table.claim(rf'{count(pay_only)} programs are ranked only by pay, because they report pay but not debt\.', pay_only > 1)
    table.claim(r"to protect their privacy\. Those programs can't be ranked\.")
    table.claim(r', so ', False)
    table.claim(r'since closed', closed > 0)
    table.claim(r"College Scorecard's school file doesn't name", page['without_school'] > 0)
    table.claim(r"One more isn't listed, because it reports one combined figure for campuses in several states\.", combined == 1)
    table.claim(rf"{count(combined)} more aren't listed, because they report one combined figure for campuses in several states\.", combined > 1)
    table.claim(r'The national medians above still count them', page['unlisted'] > 0)
    table.claim(r"are for nurses who are already licensed and working\. College Scorecard counts them with programs for new students, and their graduates' pay reflects years of nursing experience\. High pay at a program here", page['nursing_bachelors'])

    picks = sections['lowest-debt'] = Expectation(bool(page['picks']['debt']))
    for program in page['picks']['debt']:
        picks.add(money(program['debt']))
    for program in page['picks']['ratio']:
        picks.add(percent(Fraction(program['debt'], program['year1'])))
    picks.claim(r' programs with the lowest debt ')
    picks.claim(rf'Debt-to-earnings is {debt_name} divided by first-year pay\.')
    picks.claim(rf'These two lists show the ten programs with the lowest {debt_name} and the ten with the lowest debt-to-earnings\.', len(page['picks']['debt']) == PICK_COUNT)
    picks.claim(GRADUATE_LOWEST_DEBT_CAUTION, masters)
    picks.claim(r'for the pay|Debt to pay', False)
    picks.claim(r'their own page', False)

    shown_jobs = [page['matching']] if page['matching'] is not None else page['occupations']
    careers = sections['careers'] = Expectation(bool(shown_jobs))
    for occupation in shown_jobs:
        job_tokens(careers, occupation)
        careers.claim(rf"earn a median of {re.escape(money(occupation['state_median']))} a year in the US\.")
        if occupation.get('education'):
            careers.claim(re.escape(start_sentence(occupation)))
    for occupation in page['occupations'] if page['matching'] is None else []:
        name = lowercase_words(page['occupation_names'].get(occupation['code'], occupation['title']))
        careers.claim(rf"{re.escape(name[0].upper() + name[1:])} earn a median of {re.escape(money(occupation['state_median']))} a year in the US\.")
    careers.claim(r'These are the largest jobs that the U\.S\. Department of Education and the Bureau of Labor Statistics link to .*, by number of people employed in the US\. Pay is the national median for the job, at all experience levels\.', page['matching'] is None)
    careers.claim(r'everyone in the job', False)
    careers.claim(r' careers These are the largest jobs', page['matching'] is None)
    careers.claim(r'crosswalk|Median pay in the US\.|Typical education to start', False)
    if page['matching'] is not None:
        careers.claim(rf"These figures are for all {re.escape(page['matching_name'])} in the US, at all experience levels\. They come from the Bureau of Labor Statistics\.")

    faq = sections['faq'] = Expectation(True)
    faq.add(money(national['year1']), money(national['debt']), percent(national['dte']))
    if national['year5'] is not None:
        faq.add(money(national['year5']))
    if page['matching'] is not None:
        faq.add(money(page['matching']['state_median']))
    # The answer names a state. A place that is not a state and pays more is
    # mentioned after it.
    ranked = [state for state in states if page_model.is_state(state['name'])]
    higher_places = []
    if len(ranked) >= 2:
        top = tied(ranked)
        rest = [state for state in ranked if state not in top]
        faq.add(money(top[0]['pay']), count(len(ranked)))
        if len(top) == 1:
            faq.claim(rf"{re.escape(top[0]['name'])} does\. The median program there pays its graduates {re.escape(money(top[0]['pay']))} in their first year, the highest of the {count(len(ranked))} states ranked\.")
        else:
            faq.claim(rf" do\. The median program in each pays its graduates {re.escape(money(top[0]['pay']))} in their first year, the highest of the {count(len(ranked))} states ranked\.")
        if rest:
            faq.add(money(rest[0]['pay']))
        higher_places = [state for state in states if not page_model.is_state(state['name']) and int(page_model.round_half_up(state['pay'])) > int(page_model.round_half_up(top[0]['pay']))]
        for place in higher_places:
            faq.add(money(place['pay']))
            faq.claim(rf"{re.escape(page_model.place_starting_sentence(place['name']))} is higher, at {re.escape(money(place['pay']))}, but it is {re.escape(page_model.NOT_STATES[place['name']])} and not a state\.")
    faq.claim(r'and not a state', bool(higher_places))
    top_programs = [program for program in ranking if program['pay_rank'] == 1]
    faq.add(money(top_programs[0]['year1']), count(len(ranking)))
    if len(top_programs) == 1 and top_programs[0]['debt'] is not None:
        faq.add(money(top_programs[0]['debt']))
        faq.claim(rf"Its {debt_name} is {re.escape(money(top_programs[0]['debt']))}\.")
    # The last answer: what the median program's graduates owe.
    if masters:
        faq.claim(rf"The median program's graduates borrowed {re.escape(money(national['debt']))} in federal loans for graduate study at their school\. Across programs, the median debt for graduate study is {percent(national['dte'])} of first-year pay\. Undergraduate loans and loans taken at other schools are not counted\.$")
    else:
        faq.claim(rf"The median program leaves its graduates with {re.escape(money(national['debt']))} in federal debt\. Across programs, the median debt is {percent(national['dte'])} of first-year pay\.$")

    related = sections['related'] = Expectation(bool(page['others']))
    for _, other in page['others']:
        related.add(count(other))

    about = sections['about-data'] = Expectation(True)
    about.claim(check_program_pages.PAY_PRIVACY_NOTE.format(figures='each pay figure'))
    ranking_about_claims(about, masters, national['year5'] is not None, r'Bureau of Labor Statistics wages are from May 2025\. Price levels are the Bureau of Economic Analysis Regional Price Parities for 2024\.')
    about.claim(r'RN-to-BSN|\bBLS\b|(?<!College )Scorecard figures', False)
    about.claim(r'every program in the 50 states, DC and US territories, including schools that have since closed')
    about.claim(r'Medians are across programs, not students\. Each program counts once, however many graduates it has\.')
    about.claim(rf"This page covers {CREDENTIALS[page['level']].lower()} programs in the field the U\.S\. Department of Education calls \"{re.escape(page['official'])}\"\.")

    description = sections['#description'] = Expectation(True)
    description.add(count(len(ranking)), money(national['year1']))
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
            if visible_text(rank_cell) != ('' if state['rank'] is None else str(state['rank'])):
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


def linked_program(html_dir, href, cache):
    """(unit ID, CIP code, credential level) of a built program page."""
    if href not in cache:
        file_path = Path(html_dir) / (href.strip('/') + '.html')
        cache[href] = None
        if file_path.exists():
            main = parse_html(file_path.read_text()).find(lambda node: node.tag == 'main')
            if main is not None:
                cache[href] = (main.attributes.get('data-unit-id'), main.attributes.get('data-cip'), main.attributes.get('data-credential-level'))
    return cache[href]


def check_ranking_rows(node, page, cip, level, html_dir, link_cache, identity, errors):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-unit' in child.attributes)
    expected = {program['unit_id']: program for program in page['ranking']}
    shown_units = [row.attributes['data-unit'] for row in rows]
    if len(shown_units) != len(set(shown_units)) or set(shown_units) != set(expected):
        errors.append(f'section ranking: rows are not the expected {len(expected)} programs ({len(shown_units)} shown)')
        return
    previous_rank = 0
    for position, row in enumerate(rows):
        program = expected[row.attributes['data-unit']]
        label = f"section ranking: unit {program['unit_id']}"
        cells = row.find_all(lambda child: child.tag == 'td')
        if len(cells) != 7:
            errors.append(f'{label} has {len(cells)} cells, expected 7')
            continue
        wanted = [
            str(program['pay_rank']),
            money(program['year1']),
            money(program['after']) if program['after'] is not None else 'Not adjusted',
            money(program['year5']) if program['year5'] is not None else 'Not reported',
            money(program['debt']) if program['debt'] is not None else 'Not reported',
            percent(Fraction(program['debt'], program['year1'])) if program['debt'] is not None else 'Not reported',
        ]
        shown = [visible_text(cells[0])] + [visible_text(cell) for cell in cells[2:]]
        if shown != wanted:
            errors.append(f'{label} shows {shown}, expected {wanted}')
        detail = visible_text(cells[1])
        if f", {program['state']} · {program['control']}" not in detail or detail.endswith(' · closed') == program['open']:
            errors.append(f"{label}: detail {detail!r} should name {program['state']}, {program['control']}{'' if program['open'] else ', closed'}")
        # The school's name and city, as the federal file and the reviewed name lists give them.
        named = [visible_text(part) for part in cells[1].find_all(lambda child: 'data-name' in child.attributes)]
        wanted_names = [identity.names.get(program['unit_id']), f"{program['city']}, {program['state']} · {program['control']}{'' if program['open'] else ' · closed'}"]
        if named != wanted_names:
            errors.append(f'{label}: names {named}, expected {wanted_names}')
        if ('hidden' in row.attributes) != (position >= VISIBLE_ROWS):
            errors.append(f"{label}: row {position + 1} should be {'hidden' if position >= VISIBLE_ROWS else 'shown'} before Show all")
        if program['pay_rank'] < previous_rank:
            errors.append('section ranking: rows are not in order of first-year pay')
        previous_rank = program['pay_rank']
        link = cells[1].find(lambda child: child.tag == 'a')
        if program['has_page'] != (link is not None):
            errors.append(f"{label}: {'missing the link to its program page' if program['has_page'] else 'links to a page it does not have'}")
        elif link is not None:
            target = linked_program(html_dir, link.attributes.get('href', ''), link_cache)
            if target != (program['unit_id'], cip, str(level)):
                errors.append(f"{label}: links to {link.attributes.get('href')!r}, which is {target}")


def check_debt_list(label, items, expected, value_of, cip, level, html_dir, link_cache, errors):
    """One list of programs with the lowest debt: the same programs in the same
    order as the ranking sorted that way, each with its figure, and a link only
    where the program has its own page. Programs that tie on both ranks may
    appear in either order."""
    by_unit = {program['unit_id']: program for program in expected['all']}
    units = [item.attributes['data-unit'] for item in items]
    if len(units) != len(expected['listed']) or len(set(units)) != len(units) or any(unit not in by_unit for unit in units):
        errors.append(f"section lowest-debt: {label} lists {len(units)} programs, expected {len(expected['listed'])} ranked programs that report debt")
        return
    shown_keys = [expected['key'](by_unit[unit]) for unit in units]
    if shown_keys != [expected['key'](program) for program in expected['listed']]:
        errors.append(f'section lowest-debt: {label} is not the ranking\'s order')
    for item, unit in zip(items, units):
        program = by_unit[unit]
        figure = visible_text(item.children[-1]) if item.children else ''
        if figure != value_of(program):
            errors.append(f"section lowest-debt: {label}, unit {unit} shows {figure!r}, expected {value_of(program)!r}")
        if f", {program['state']}" not in visible_text(item):
            errors.append(f"section lowest-debt: {label}, unit {unit} does not name {program['state']}")
        link = item.find(lambda child: child.tag == 'a')
        if program['has_page'] != (link is not None):
            errors.append(f"section lowest-debt: {label}, unit {unit} {'is missing its link' if program['has_page'] else 'links to a page it does not have'}")
        elif link is not None and linked_program(html_dir, link.attributes.get('href', ''), link_cache) != (unit, cip, str(level)):
            errors.append(f"section lowest-debt: {label}, unit {unit} links to {link.attributes.get('href')!r}, which is another program")


def check_page(html_text, model, state_names, page_path, html_dir, link_cache, identity):
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
    if not (title.startswith('Highest-Paying ') and title.endswith(' Programs in the US')):
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
    errors.extend(wrong_kind_errors(page['masters'], main_text))
    errors.extend(page_model.bare_place_errors(title, description, main_text))
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    # The band under the site header: breadcrumb, title, and one source line.
    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    if not header_text.endswith(f'{h1} {SOURCE_LINE}'):
        errors.append('header does not end with the title and the source line')
    if 'programs report first-year pay' in header_text or 'state ranking' in header_text:
        errors.append('header still shows the facts that were removed')

    # The breadcrumb links to the programs list page.
    if not header or not header.find(lambda node: node.tag == 'a' and node.attributes.get('href') == '/programs'):
        errors.append('breadcrumb link to /programs missing')

    def tokens(text):
        # The official field title is a name, not data, even when it has digits.
        for phrase in [*NATIONAL_STATIC_PHRASES, page['official']]:
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
        if name == 'related':
            # Each link's address and its words in full, master's first.
            field = check_program_pages.FIELD_NAMES[cip]
            wanted = [
                (f'/programs/{identity.program_slug(cip, other_level)}', f"{field} ({check_program_pages.DEGREE_ABBREVIATIONS.get((cip, other_level), CREDENTIALS[other_level])}) programs in the US, ranked {count(programs)} programs by pay and debt")
                for other_level, programs in page['others']
            ]
            shown = [(link.attributes.get('href'), visible_text(link)) for link in node.find_all(lambda child: child.tag == 'a')]
            if shown != wanted:
                errors.append(f'section related: the links are {shown}, expected {wanted}')
        if name == 'ranking':
            check_ranking_rows(node, page, cip, level, html_dir, link_cache, identity, errors)
        if name == 'summary':
            paragraphs = node.find_all(lambda child: child.tag == 'p')
            heading = node.find(lambda child: child.tag == 'h2')
            if heading is None or visible_text(heading) != 'Summary' or len(paragraphs) != 2:
                errors.append(f'section summary: expected the heading "Summary" and two paragraphs, found {len(paragraphs)}')
        if name == 'ranking':
            pager = node.find(lambda child: child.attributes.get('data-slot') == 'pager')
            if (pager is not None) != (len(page['ranking']) > VISIBLE_ROWS):
                errors.append('section ranking: the pager must show only when there is more than one page of rows')
            elif pager is not None:
                buttons = pager.find_all(lambda child: child.tag == 'button')
                labels = [button.attributes.get('aria-label') or visible_text(button) for button in buttons]
                disabled = ['disabled' in button.attributes for button in buttons]
                if labels != ['First page', 'Previous', 'Next', 'Last page'] or disabled != [True, True, False, False]:
                    errors.append(f'section ranking: pager buttons are {labels} with disabled {disabled}')
        if name == 'careers':
            # Each job's text, whole and in order, so one job can't carry another's sentences.
            if page['matching'] is not None:
                wanted = [job_text(page['matching'], page['matching_name'], 'the US')]
            else:
                wanted = [job_text(job, lowercase_words(page['occupation_names'].get(job['code'], job['title'])), 'the US') for job in page['occupations']]
            rows = [heading.parent for heading in node.find_all(lambda child: child.tag == 'h3')]
            shown = [visible_text(row.find(lambda child: child.tag == 'p')) for row in rows]
            if shown != wanted:
                differing = next((position for position, pair in enumerate(zip(shown, wanted)) if pair[0] != pair[1]), min(len(shown), len(wanted)))
                errors.append(f'section careers: job {differing + 1} of {len(wanted)} reads {shown[differing] if differing < len(shown) else None!r}, expected {wanted[differing] if differing < len(wanted) else None!r}')
        if name == 'lowest-debt':
            lists = node.find_all(lambda child: child.tag == 'ol')
            headings = [visible_text(heading) for heading in node.find_all(lambda child: child.tag == 'h3')]
            if len(lists) != 2 or headings != ['Lowest debt', 'Lowest debt-to-earnings']:
                errors.append(f'section lowest-debt: expected two lists, found {len(lists)} headed {headings}')
            else:
                with_debt = [program for program in page['ranking'] if program['debt'] is not None]
                for label, items_node, listed, rank_key, value_of in (
                    ('lowest debt', lists[0], page['picks']['debt'], 'debt_rank', lambda program: money(program['debt'])),
                    ('lowest debt-to-earnings', lists[1], page['picks']['ratio'], 'ratio_rank', lambda program: percent(Fraction(program['debt'], program['year1']))),
                ):
                    items = items_node.find_all(lambda child: child.tag == 'li' and 'data-unit' in child.attributes)
                    expected = {'all': with_debt, 'listed': listed, 'key': lambda program, rank_key=rank_key: (program[rank_key], program['pay_rank'])}
                    check_debt_list(label, items, expected, value_of, cip, level, html_dir, link_cache, errors)

    shown_careers = [page['matching']['code']] if page['matching'] is not None else [occupation['code'] for occupation in page['occupations']]
    check_career_links(present.get('careers'), shown_careers, model.career_fields(), errors)

    if Counter(number_tokens(description, '')) != expectations['#description'].tokens:
        errors.append(f"description numbers differ: expected {dict(expectations['#description'].tokens)}")

    # Both lists of questions, in page order: the four under the key figures, then
    # the common questions. An answer is every paragraph of its panel.
    visible_faq = []
    for questions_node, expected_questions in ((present.get('key-figure-questions'), 4), (present.get('faq'), 4 if len(page['states']) >= 2 else 3)):
        items = questions_node.find_all(lambda child: child.attributes.get('data-slot') == 'accordion-item') if questions_node is not None else []
        if len(items) != expected_questions:
            errors.append(f'a list of questions has {len(items)} questions, expected {expected_questions}')
        for item in items:
            question = item.find(lambda child: child.tag == 'button')
            answer = item.find(lambda child: child.attributes.get('data-slot') == 'accordion-content')
            visible_faq.append((visible_text(question) if question else '', visible_text(answer) if answer else ''))
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
    # Master's rows are loaded too: a field has a national page for its master's programs.
    model = page_model.Model(include_masters=True)
    identity = Identity(model)
    state_names = page_model.load_state_names()
    results = []
    link_cache = {}
    for page_path in [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]:
        file_path = Path(arguments.html_dir) / (page_path.strip('/') + '.html')
        if not file_path.exists():
            results.append({'page': page_path, 'errors': [f'no built file {file_path}'], 'warnings': [], 'links': []})
            continue
        results.append(check_page(file_path.read_text(), model, state_names, page_path, arguments.html_dir, link_cache, identity))
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
