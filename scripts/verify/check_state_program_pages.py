#!/usr/bin/env python3
"""Checks built ranking pages (every program of one field in one state) against
the public data in data/raw.

Same approach as check_program_pages.py: page_model.py works out, from data/raw
only, every number the page must show and which wording it must use; this
script compares that, section by section, with the built HTML.

Usage:
  python3 scripts/verify/check_state_program_pages.py --html-dir dist/client --pages pages.txt --report report.json
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
    CAMPUS_RULE, FORBIDDEN_PATTERNS, STATE_NAMES, TOKEN_PATTERN, Expectation, check_career_links, number_tokens, parse_html, visible_text,
)
from job_rows import job_text, job_tokens, lowercase_words, matching_job_names  # noqa: E402
from page_model import count, money, percent, percent_number  # noqa: E402

QUICK_PICK_COUNT = 5


VISIBLE_ROWS = 10
SOURCE_LINE = "Source: the U.S. Department of Education's College Scorecard, June 2026 release"
# A summary longer than this breaks into one paragraph for each subject.
ONE_PARAGRAPH_LIMIT = 240
# Figures in the answers that explain the key figures: examples, not data.
EXAMPLE_TOKENS = ['$40,000', '$45,000', '$50,000', '$55,000', '$210,000', '$80,000', '$50,000', '$20,000', '$50,000', '40%']
CREDENTIAL_LABELS = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's"}


def ranking_model(model, cip, credential_level, state):
    pool = model.state[(cip, credential_level, state)]
    with_pay = [row for row in pool if row['EARN_MDN_1YR'] is not None]
    with_both = [row for row in with_pay if row['DEBT_ALL_STGP_ANY_MDN'] is not None]
    if not with_both or not any(id(row) in model.page_ids for row in pool):
        raise LookupError(f'No ranking page for {cip} {credential_level} {state}')

    def ratio(row):
        return Fraction(row['DEBT_ALL_STGP_ANY_MDN'], row['EARN_MDN_1YR'])

    programs = []
    for row in with_pay:
        institution = model.institutions[row['UNITID']]
        programs.append({
            'row': row,
            'open': institution['CURROPER'] == '1',
            'year1': row['EARN_MDN_1YR'],
            'year5': row['EARN_MDN_5YR'],
            'debt': row['DEBT_ALL_STGP_ANY_MDN'],
            'pay_rank': 1 + sum(1 for other in with_pay if other['EARN_MDN_1YR'] > row['EARN_MDN_1YR']),
        })
    programs.sort(key=lambda program: -program['year1'])
    state_fips = model.institutions[with_pay[0]['UNITID']]['ST_FIPS'].zfill(2)
    matching_code = model.matching.get(cip)
    matching = None
    if matching_code:
        state_wage = model.wages.get(('S' + state_fips, matching_code), {})
        national_wage = model.wages.get(('US', matching_code), {})
        if state_wage.get('median') is not None and national_wage:
            projection = model.projections.get(matching_code, {})
            matching = {
                'state_median': state_wage['median'], 'state_employment': state_wage.get('employment'),
                'p10': state_wage.get('p10'), 'p90': state_wage.get('p90'), 'national_median': national_wage.get('median'),
                'growth_percent': projection.get('growth_percent'), 'openings': projection.get('openings_thousands'),
                'education': projection.get('education'), 'experience': projection.get('experience'),
            }
    other_counts = []
    for level in (3, 2, 1):
        if level == credential_level:
            continue
        other_pool = model.state.get((cip, level, state), [])
        if any(id(row) in model.page_ids for row in other_pool):
            other_counts.append(sum(1 for row in other_pool if row['EARN_MDN_1YR'] is not None))
    return {
        'cip': cip,
        'state_name': STATE_NAMES[state],
        'official': ' '.join(with_pay[0]['CIPDESC'].split()).rstrip('.'),
        'level': credential_level,
        'occupation_names': page_model.load_occupation_names(),
        'matching_name': matching_job_names().get(cip),
        'programs': programs,
        'both': with_both,
        'debt_only': sum(1 for row in pool if row['DEBT_ALL_STGP_ANY_MDN'] is not None and row['EARN_MDN_1YR'] is None),
        'studied_elsewhere': model.studied_elsewhere_state.get((cip, credential_level, state), 0),
        'state': model.benchmark(pool),
        'national': model.benchmark(model.national[(cip, credential_level)]),
        'ratio': ratio,
        'matching': matching,
        'occupations': model.occupations(cip, state_fips),
        'other_counts': other_counts,
    }


def occupation_tokens(expectation, occupation):
    """Numbers an OccupationRow shows: pay, employment, growth, openings, range."""
    pay = occupation['state_median'] if occupation['state_median'] is not None else occupation['national_median']
    expectation.add(money(pay))
    if occupation.get('state_employment') is not None:
        expectation.add(count(occupation['state_employment']))
    if occupation.get('growth_percent') is not None and occupation.get('openings') is not None:
        growth = percent_number(abs(occupation['growth_percent'] / 100))
        if growth != 0:
            expectation.add(f'{growth}%')
        expectation.add(count(page_model.round_half_up(occupation['openings'] * 1000)))
    if occupation.get('education') and occupation.get('experience'):
        expectation.add(*TOKEN_PATTERN.findall(occupation['experience']))
    if occupation['state_median'] is not None and occupation.get('p10') is not None and occupation.get('p90') is not None:
        expectation.add(money(occupation['p10']), money(occupation['p90']))


def expected_sections(ranking):
    programs, both = ranking['programs'], ranking['both']
    state, national = ranking['state'], ranking['national']
    ratio = ranking['ratio']
    top = programs[0]
    lowest = min(both, key=lambda row: (row['DEBT_ALL_STGP_ANY_MDN'], -row['EARN_MDN_1YR']))
    sections = {}

    summary = sections['summary'] = Expectation(True)
    gap = state['year1'] - national['year1']
    summary.add(money(state['year1']), money(top['year1']), money(lowest['DEBT_ALL_STGP_ANY_MDN']))
    if gap != 0:
        summary.add(money(abs(gap)))
    summary.claim({True: r'more than the national median', False: r'less than the national median'}[gap > 0] if gap != 0 else r'the same as the national median')
    # The state figure is a median across programs, and the wording must say so.
    summary.claim(r'^Summary The median .* program pays its graduates')
    # One school can have both the highest pay and the lowest debt.
    same_school = top['row'] is lowest
    summary.claim(rf"reports both the highest first-year pay \({re.escape(money(top['year1']))}\) and the lowest median debt \({re.escape(money(lowest['DEBT_ALL_STGP_ANY_MDN']))}\)\.", same_school)
    summary.claim(rf"reports the highest first-year pay \({re.escape(money(top['year1']))}\) and .* the lowest median debt \({re.escape(money(lowest['DEBT_ALL_STGP_ANY_MDN']))}\)\.", not same_school)
    summary.claim(r'the short answer', False)

    figures = sections['key-figures'] = Expectation(True)
    figures.add(money(state['year1']), money(national['year1']), money(state['debt']), money(national['debt']))
    figures.add(percent(state['dte']), percent(national['dte']))
    if state['year5'] is not None and national['year5'] is not None:
        figures.add(money(state['year5']), money(national['year5']))

    has_year5 = state['year5'] is not None and national['year5'] is not None
    state_name = ranking['state_name']
    state_place = page_model.place_in_sentence(state_name)
    questions = sections['key-figure-questions'] = Expectation(True)
    questions.add(*EXAMPLE_TOKENS)
    questions.add(money(state['year1']), count(state['year1_count']), money(state['debt']), count(state['debt_count']))
    questions.add(percent(state['dte']), count(state['dte_count']))
    if has_year5:
        questions.add(count(state['year5_count']))
    questions.claim(r'What does "median" mean\? An average adds up every value and divides by how many there are\.')
    questions.claim(r'The median is the middle value when the values are put in order: half are higher, and half are lower\.')
    questions.claim(rf"{re.escape(money(state['year1']))} is the median of those figures across the {count(state['year1_count'])} {re.escape(state_name)} .* programs that report one\.")
    questions.claim(rf"Median pay after 5 years is the same measure for an earlier graduating class, and {count(state['year5_count'])} programs report it\.", has_year5)
    questions.claim(rf"{re.escape(money(state['debt']))} is the median of those figures across the {count(state['debt_count'])} programs that report one\.")
    questions.claim(rf"{percent(state['dte'])} is the median across the {count(state['dte_count'])} {re.escape(state_name)} .* programs that report both figures\.")
    questions.claim(r'A lower figure means graduates owe less compared with what they earn\.')
    questions.claim(r"College Scorecard: the U\.S\. Department of Education's public database of colleges and their programs, with pay figures drawn from federal tax records\.")
    questions.claim(r"College Scorecard: the U\.S\. Department of Education's public database of colleges and their programs, with debt figures drawn from federal student loan records\.")
    questions.claim(r'for the pay|Debt to pay', False)

    table = sections['ranking'] = Expectation(True)
    table.add(count(len(programs)))  # "N {state} {field} {credential} programs, ranked by graduate pay"
    table.claim(rf"^{count(len(programs))} {re.escape(state_name)} .* programs, ranked by graduate pay ")
    table.claim(r'Lowest debt-to-earnings .* Debt Debt-to-earnings ')
    table.claim(r'for the pay|Debt to pay|, so ', False)
    if len(programs) > VISIBLE_ROWS:
        table.add('1', count(-(-len(programs) // VISIBLE_ROWS)))  # "Page 1 of N"
        table.claim(rf"Page 1 of {count(-(-len(programs) // VISIBLE_ROWS))} ")
    for program in programs:
        table.add(str(program['pay_rank']), money(program['year1']))
        if program['year5'] is not None:
            table.add(money(program['year5']))
        if program['debt'] is not None:
            table.add(money(program['debt']), percent(Fraction(program['debt'], program['year1'])))
    pay_only = [program for program in programs if program['debt'] is None]
    if len(pay_only) > 4:
        table.add(str(len(pay_only)))
    closed = sum(1 for program in programs if not program['open'])
    if closed > 1:
        table.add(str(closed))
    if ranking['debt_only'] > 1:
        table.add(str(ranking['debt_only']))
    table.claim(r' is ranked only by pay, because it reports pay but not debt\.', len(pay_only) == 1)
    table.claim(r' are ranked only by pay, because they report pay but not debt\.', len(pay_only) > 1)
    table.claim(r'since closed', closed > 0)
    table.claim(r"One more program isn't listed, because it reports debt but not pay\.", ranking['debt_only'] == 1)
    # Programs left out because most of their graduates studied in other states.
    if ranking['studied_elsewhere'] > 1:
        table.add(str(ranking['studied_elsewhere']))
    table.claim(r'One program is not listed, because most of its graduates studied at campuses in other states\.', ranking['studied_elsewhere'] == 1)
    table.claim(rf"{ranking['studied_elsewhere']} programs are not listed, because most of their graduates studied at campuses in other states\.", ranking['studied_elsewhere'] > 1)
    table.claim(r'graduates studied at campuses in other states', ranking['studied_elsewhere'] > 0)
    table.claim(rf"{ranking['debt_only']} more programs aren't listed, because they report debt but not pay\.", ranking['debt_only'] > 1)
    # The note about programs for working nurses, on nursing bachelor's pages only.
    nursing_bachelors = programs[0]['row']['CIPCODE'] == '5138' and programs[0]['row']['CREDLEV'] == 3
    table.claim(r"are for nurses who are already licensed and working\. College Scorecard counts them with programs for new students, and their graduates' pay reflects years of nursing experience\. High pay at a program here", nursing_bachelors)

    scatter = sections['scatter'] = Expectation(True)
    scatter.add(count(len(both)))
    scatter.claim(rf"Only the {count(len(both))} programs that report both pay and debt are shown\.")

    # Two lists of five, in the order of the table sorted the same way: lowest
    # first, and the higher-paying program first when two tie.
    ranking['lowest_debt'] = [money(row['DEBT_ALL_STGP_ANY_MDN']) for row in sorted(both, key=lambda row: (row['DEBT_ALL_STGP_ANY_MDN'], -row['EARN_MDN_1YR']))[:QUICK_PICK_COUNT]]
    ranking['lowest_ratio'] = [percent(ratio(row)) for row in sorted(both, key=lambda row: (ratio(row), -row['EARN_MDN_1YR']))[:QUICK_PICK_COUNT]]
    picks = sections['lowest-debt'] = Expectation(True)
    picks.add(*ranking['lowest_debt'], *ranking['lowest_ratio'])
    picks.claim(rf" programs in {re.escape(state_place)} with the lowest debt ")
    picks.claim(r'These two lists show the five programs with the lowest median federal debt and the five with the lowest debt-to-earnings\. Debt-to-earnings is median federal debt divided by first-year pay\.', len(both) >= QUICK_PICK_COUNT)
    picks.claim(r'for the pay|Debt to pay', False)

    careers = [occupation for occupation in ranking['occupations']
               if occupation['state_median'] is not None or occupation['national_median'] is not None]
    career_section = sections['careers'] = Expectation(ranking['matching'] is not None or bool(careers))
    if ranking['matching'] is not None:
        job_tokens(career_section, ranking['matching'])
        ranking['job_texts'] = [job_text(ranking['matching'], ranking['matching_name'], state_place)]
        career_section.claim(rf"These figures are for all {re.escape(ranking['matching_name'])} in {re.escape(state_place)}, at all experience levels\. They come from the Bureau of Labor Statistics\.")
    else:
        for occupation in careers:
            job_tokens(career_section, occupation)
        ranking['job_texts'] = [job_text(job, lowercase_words(ranking['occupation_names'].get(job['code'], job['title'])), state_place) for job in careers]
        career_section.claim(rf" careers in {re.escape(state_place)} These are the largest jobs that the U\.S\. Department of Education and the Bureau of Labor Statistics link to .*, by number of people employed in the US\. Pay is the {re.escape(state_name)} median for the job, at all experience levels\.")
        career_section.claim(rf"Where {re.escape(state_place)} has no figure, the national median is shown\.", any(job['state_median'] is None for job in careers))
    career_section.claim(r'crosswalk|Median pay in |Median pay nationwide|Typical education to start', False)

    faq = sections['faq'] = Expectation(True)
    faq.add(money(top['year1']))
    if top['debt'] is not None:
        faq.add(money(top['debt']))
    faq.add(money(lowest['DEBT_ALL_STGP_ANY_MDN']), money(lowest['EARN_MDN_1YR']))
    faq.add(count(len(programs)), money(state['year1']))
    if state['year5'] is not None:
        faq.add(money(state['year5']))
    if ranking['matching'] is not None:
        faq.add(money(ranking['matching']['state_median']))
    faq.add(count(len(programs)), count(len(both)))

    # The national page for the field, then the state's other credential levels.
    related = sections['related'] = Expectation(True)
    related.add(count(national['year1_count']))
    related.claim(r'programs in the US, ranked')
    for other in ranking['other_counts']:
        related.add(count(other))

    about = sections['about-data'] = Expectation(True)
    about.claim(check_program_pages.PAY_PRIVACY_NOTE.format(figures='each pay figure'))
    about.claim(r'College Scorecard figures describe graduating classes from several years ago\. Bureau of Labor Statistics wages are from May 2025\.')
    about.claim(r'RN-to-BSN|\bBLS\b|(?<!College )Scorecard figures', False)
    about.claim(rf"This page covers {CREDENTIAL_LABELS[ranking['level']].lower()} programs in the field the U\.S\. Department of Education calls \"{re.escape(ranking['official'])}\"\.")
    about.claim(CAMPUS_RULE.format(state=re.escape(state_name), place=re.escape(state_place)))
    about.claim(r'programs that report each figure, which is why the counts differ by figure\.')

    description = sections['#description'] = Expectation(True)
    description.add(str(len(programs)), money(state['year1']), money(top['year1']))
    return sections


def check_page(html_text, model, page_path):
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
    cip = main.attributes.get('data-cip')
    credential_level = int(main.attributes.get('data-credential-level', '0'))
    state = main.attributes.get('data-state')
    try:
        ranking = ranking_model(model, cip, credential_level, state)
    except LookupError as error:
        return {'page': page_path, 'errors': errors + [str(error)], 'warnings': warnings, 'links': []}

    main_text = visible_text(main)
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
    if 'programs report first-year pay' in header_text or 'also report federal debt' in header_text:
        errors.append('header still shows the facts that were removed')

    # The breadcrumb links to the state page.
    state_href = '/states/' + page_model.state_slug(STATE_NAMES[state])
    if not header or not header.find(lambda node: node.tag == 'a' and node.attributes.get('href') == state_href):
        errors.append(f'breadcrumb link to {state_href} missing')

    expectations = expected_sections(ranking)
    present = {node.attributes['data-section']: node for node in main.find_all(lambda node: 'data-section' in node.attributes)}
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
        # The official field title is a name, not data, even when it has digits.
        actual = Counter(number_tokens(text.replace(ranking['official'], ' '), ''))
        if actual != expectation.tokens:
            errors.append(f'section {name} numbers differ: missing {dict(expectation.tokens - actual)}, unexpected {dict(actual - expectation.tokens)}')
        for pattern, should_match in expectation.claims:
            if bool(re.search(pattern, text)) != should_match:
                errors.append(f'section {name}: wording {pattern!r} should {"" if should_match else "not "}appear')
        if name == 'scatter':
            circles = node.find_all(lambda child: child.tag == 'circle')
            if len(circles) != len(ranking['both']) or len(circles) < 5:
                errors.append(f"scatter has {len(circles)} dots, expected {len(ranking['both'])}")
        if name == 'summary':
            # One paragraph when the summary is short; otherwise one for the state
            # figure and one for the schools.
            paragraphs = [visible_text(paragraph) for paragraph in node.find_all(lambda child: child.tag == 'p')]
            heading = node.find(lambda child: child.tag == 'h2')
            wanted = 1 if len(' '.join(paragraphs)) <= ONE_PARAGRAPH_LIMIT else 2
            if heading is None or visible_text(heading) != 'Summary' or len(paragraphs) != wanted:
                errors.append(f'section summary: expected the heading "Summary" and {wanted} paragraphs, found {len(paragraphs)}')
            elif wanted == 2 and not paragraphs[0].endswith('national median.'):
                errors.append('section summary: the first paragraph should end with the comparison to the national median')
        if name == 'ranking':
            rows = [row for row in node.find_all(lambda child: child.tag == 'tr') if row.find(lambda child: child.tag == 'td')]
            hidden = ['hidden' in row.attributes for row in rows]
            if len(rows) != len(ranking['programs']) or hidden != [position >= VISIBLE_ROWS for position in range(len(rows))]:
                errors.append(f'section ranking: {len(rows)} rows with {hidden.count(False)} showing, expected {len(ranking["programs"])} rows with the first {VISIBLE_ROWS} showing')
            pager = node.find(lambda child: child.attributes.get('data-slot') == 'pager')
            if (pager is not None) != (len(ranking['programs']) > VISIBLE_ROWS):
                errors.append('section ranking: the pager must show only when there is more than one page of rows')
            elif pager is not None:
                buttons = pager.find_all(lambda child: child.tag == 'button')
                labels = [button.attributes.get('aria-label') or visible_text(button) for button in buttons]
                disabled = ['disabled' in button.attributes for button in buttons]
                if labels != ['First page', 'Previous', 'Next', 'Last page'] or disabled != [True, True, False, False]:
                    errors.append(f'section ranking: pager buttons are {labels} with disabled {disabled}')
        if name == 'lowest-debt':
            lists = node.find_all(lambda child: child.tag == 'ol')
            headings = [visible_text(heading) for heading in node.find_all(lambda child: child.tag == 'h3')]
            shown = [[visible_text(item.children[-1]) for item in items.find_all(lambda child: child.tag == 'li')] for items in lists]
            if headings != ['Lowest debt', 'Lowest debt-to-earnings'] or shown != [ranking['lowest_debt'], ranking['lowest_ratio']]:
                errors.append(f"section lowest-debt: lists headed {headings} show {shown}, expected {[ranking['lowest_debt'], ranking['lowest_ratio']]}")
        if name == 'careers':
            # Each job's text, whole and in order, so one job can't carry another's sentences.
            rows = [heading.parent for heading in node.find_all(lambda child: child.tag == 'h3')]
            shown = [visible_text(row.find(lambda child: child.tag == 'p')) for row in rows]
            if shown != ranking['job_texts']:
                differing = next((position for position, pair in enumerate(zip(shown, ranking['job_texts'])) if pair[0] != pair[1]), min(len(shown), len(ranking['job_texts'])))
                errors.append(f"section careers: job {differing + 1} reads {shown[differing] if differing < len(shown) else None!r}, expected {ranking['job_texts'][differing] if differing < len(ranking['job_texts']) else None!r}")

    if ranking['matching'] is not None:
        shown_careers = [model.matching[cip]]
    else:
        shown_careers = [occupation['code'] for occupation in ranking['occupations']
                         if occupation['state_median'] is not None or occupation['national_median'] is not None]
    check_career_links(present.get('careers'), shown_careers, model.career_fields(), errors)

    description_expectation = expectations['#description']
    if Counter(number_tokens(description, '')) != description_expectation.tokens:
        errors.append(f'description numbers differ: expected {dict(description_expectation.tokens)}')

    # Both lists of questions, in page order: the four under the key figures, then
    # the four common questions. An answer is every paragraph of its panel.
    visible_faq = []
    for questions_node in (present.get('key-figure-questions'), present.get('faq')):
        items = questions_node.find_all(lambda child: child.attributes.get('data-slot') == 'accordion-item') if questions_node is not None else []
        if len(items) != 4:
            errors.append(f'a list of questions has {len(items)} questions, expected 4')
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
    model = page_model.Model()
    results = []
    for page_path in [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]:
        file_path = Path(arguments.html_dir) / (page_path.strip('/') + '.html')
        if not file_path.exists():
            results.append({'page': page_path, 'errors': [f'no built file {file_path}'], 'warnings': [], 'links': []})
            continue
        results.append(check_page(file_path.read_text(), model, page_path))
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
