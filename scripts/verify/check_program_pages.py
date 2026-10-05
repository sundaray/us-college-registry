#!/usr/bin/env python3
"""Checks built program pages against the public data in data/raw.

For each page this script:
1. Works out, from data/raw only (page_model.py), every number the page must show
   and which wording each sentence must use.
2. Reads the built HTML and compares, section by section, the numbers a reader
   sees with the expected ones. Any missing, wrong, or extra number is an error.
3. Checks the page as a whole: lang, title and H1, meta description, FAQ answers
   and FAQPage JSON-LD, forbidden text (undefined, NaN, null, $0), empty
   sections, and the scatter chart.

Usage:
  python3 scripts/verify/check_program_pages.py --html-dir dist/client --pages pages.txt --report report.json

pages.txt lists one page path per line, such as /schools/x/y. The script exits
with status 1 when any page has an error.
"""

import argparse
import json
import re
import sys
from collections import Counter
from fractions import Fraction
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_model  # noqa: E402
from page_model import count, miles_label, money, ordinal, percent, percent_number, share_of_programs  # noqa: E402

# ---------------------------------------------------------------------------
# HTML reading

VOID_TAGS = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
BLOCK_TAGS = {
    'div', 'p', 'li', 'ul', 'ol', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3',
    'section', 'main', 'header', 'footer', 'nav', 'button', 'body', 'html', 'head', 'title',
}
SKIPPED_TAGS = {'script', 'style', 'svg', 'template', 'noscript'}


class Node:
    def __init__(self, tag, attributes, parent):
        self.tag = tag
        self.attributes = attributes
        self.parent = parent
        self.children = []

    def find_all(self, matches):
        found = []
        for child in self.children:
            if isinstance(child, Node):
                if matches(child):
                    found.append(child)
                found.extend(child.find_all(matches))
        return found

    def find(self, matches):
        results = self.find_all(matches)
        return results[0] if results else None

    def raw_text(self):
        return ''.join(child if isinstance(child, str) else child.raw_text() for child in self.children)


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root', {}, None)
        self.current = self.root

    def handle_starttag(self, tag, attributes):
        node = Node(tag, dict(attributes), self.current)
        self.current.children.append(node)
        if tag not in VOID_TAGS:
            self.current = node

    def handle_startendtag(self, tag, attributes):
        self.current.children.append(Node(tag, dict(attributes), self.current))

    def handle_endtag(self, tag):
        node = self.current
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node is not self.root:
            self.current = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def parse_html(text):
    builder = TreeBuilder()
    builder.feed(text)
    builder.close()
    return builder.root


def visible_text(node, skip_names=False):
    """Text a reader sees, with block elements separated by spaces."""
    parts = []

    def walk(current):
        for child in current.children:
            if isinstance(child, str):
                parts.append(child)
                continue
            if child.tag in SKIPPED_TAGS:
                continue
            if skip_names and 'data-name' in child.attributes:
                continue
            block = child.tag in BLOCK_TAGS
            if block:
                parts.append(' ')
            walk(child)
            if block:
                parts.append(' ')

    walk(node)
    return ' '.join(''.join(parts).split())


# ---------------------------------------------------------------------------
# Number tokens

# Fixed template phrases that contain digits but no data.
STATIC_PHRASES = [
    'June 2026', 'May 2025', '2025 to 2035', '2018 to 2020', 'Price Parities, 2024', 'CIP 2020 to SOC 2018',
    'directory, 2024', 'Earnings after 5 years', 'Earnings, 1 year after graduating', 'Earnings, 5 years after graduating',
    'Year 1 and year 5', ', year 1', ', year 5', '10-year', 'over 10 years', 'Bottom 10%:', 'Top 10%:',
    '(within 6 years)', '(within 1.5 times the normal program length)', 'Year 1 pay',
    # Ranking pages.
    'Median pay after 5 years', 'Year 5 pay',
]
TOKEN_PATTERN = re.compile(
    r'more than 99%|Under 1 mi|\d+% or (?:less|more)|\d+–\d+%|\$\d{1,3}(?:,\d{3})*'
    r'|\d+(?:\.\d+)?%|\d+ mi\b|\d+(?:st|nd|rd|th)\b|\d{1,3}(?:,\d{3})+|\d+'
)


def number_tokens(text, school_name):
    if school_name:
        text = text.replace(school_name, ' ')
    for phrase in STATIC_PHRASES:
        text = text.replace(phrase, ' ')
    return TOKEN_PATTERN.findall(text)


# ---------------------------------------------------------------------------
# Expected content per section


class Expectation:
    def __init__(self, present):
        self.present = present
        self.tokens = Counter()
        self.claims = []

    def add(self, *tokens):
        for token in tokens:
            self.tokens[token] += 1

    def claim(self, pattern, should_match=True):
        self.claims.append((pattern, should_match))


def expected_sections(model_page, cip):
    page = model_page
    year1, year5, debt = page['year1'], page['year5'], page['debt']
    national, state = page['national'], page['state']
    row = page['row']
    growth = Fraction(year5, year1) - 1 if year5 is not None else None
    debt_to_earnings = Fraction(debt, year1)
    sections = {}

    # Summary
    summary = sections['summary'] = Expectation(True)
    low_debt = page['lower_than'] >= Fraction(3, 4)
    high_debt = page['higher_than'] >= Fraction(3, 4)
    summary.add(money(year1), money(debt))
    if page['percentile'] >= 75:
        summary.claim(r'graduates earn more than graduates of most')
    elif page['percentile'] <= 25:
        summary.claim(r'graduates earn less than graduates of most')
    else:
        summary.claim(r'graduates earn about what')
    if low_debt:
        summary.add(share_of_programs(page['lower_than']))
        summary.claim(r'Where this program stands out is debt')
    elif high_debt:
        summary.add(share_of_programs(page['higher_than']))
        summary.claim(r'Debt is high\.')
    else:
        summary.add(money(national['debt']))
        summary.claim(r'close to the national median')
    higher_paying_count = page['state_pay_rank'] - 1
    if page['state_pay_rank'] <= Fraction(state['year1_count'], 4):
        summary.claim(r'It is one of the higher-paying')
    elif low_debt and page['percentile'] <= 25 and year1 < state['year1']:
        summary.add(money(state['year1']))
        summary.claim(r'Debt is low, but pay is also below the')
    elif low_debt:
        summary.claim(r'Strong value, but not one of the highest-paying')
    elif higher_paying_count >= 3:
        summary.claim(r'Several .* programs report higher pay\.')
    elif higher_paying_count == 2:
        summary.claim(r'Two other .* programs report higher pay\.')
    elif higher_paying_count == 1:
        summary.claim(r'One other .* program reports higher pay\.')

    # Key figures
    figures = sections['key-figures'] = Expectation(True)
    figures.add(money(year1), count(national['year1_count']))
    if page['percentile'] < 1:
        figures.add('1%')
        figures.claim(r'Bottom 1% of')
    elif page['percentile'] >= 100:
        figures.add('1%')
        figures.claim(r'Top 1% of')
    else:
        figures.add(ordinal(page['percentile']))
        figures.claim(r'percentile of')
    if year5 is not None:
        figures.add(money(year5))
        growth_percent = percent_number(abs(growth))
        if growth_percent == 0:
            figures.claim(r'About the same as year one')
        else:
            figures.add(f'{growth_percent}%')
            figures.claim(r'more than year one' if growth > 0 else r'less than year one')
    figures.add(money(debt), count(len(page['state_both'])))
    if page['state_debt_rank'] == 1:
        figures.claim(r'The lowest of')
    else:
        figures.add(ordinal(page['state_debt_rank']))
    figures.add(percent(debt_to_earnings), percent(state['dte']), percent(national['dte']))

    # How it compares
    compare = sections['compare'] = Expectation(True)
    compare.add(money(year1), money(state['year1']), money(national['year1']))
    if year5 is not None and state['year5'] is not None and national['year5'] is not None:
        compare.add(money(year5), money(state['year5']), money(national['year5']))
    compare.add(money(debt), money(state['debt']), money(national['debt']))
    compare.add(percent(debt_to_earnings), percent(state['dte']), percent(national['dte']))
    compare.add(count(state['year1_count']), count(national['year1_count']))
    if year5 is not None and state['year5'] is not None and national['year5'] is not None:
        national_share = (year5 - national['year5']) / national['year5']
        state_gap = year5 - state['year5']
        state_share = state_gap / state['year5']
        national_direction = 'same' if abs(national_share) < Fraction(3, 100) else ('more' if national_share > 0 else 'less')
        compare.claim({'same': r'earn about the national figure', 'more': r'earn more than the national figure',
                       'less': r'earn less than the national figure'}[national_direction])
        if state_share <= Fraction(-3, 100):
            compare.add(money(abs(state_gap)))
            connector = 'and' if national_direction == 'less' else 'but'
            compare.claim(rf'figure {connector} about \$[\d,]+ less than the .* median\.')
            higher_debt_higher_pay = sum(
                1 for other in page['state_both']
                if other is not row and other['DEBT_ALL_STGP_ANY_MDN'] > debt
                and other['EARN_MDN_5YR'] is not None and other['EARN_MDN_5YR'] > year5
            )
            compare.claim(r'programs with higher debt show higher pay by the five-year mark', higher_debt_higher_pay >= 3)
        elif state_share >= Fraction(3, 100):
            compare.add(money(state_gap))
            connector = 'but' if national_direction == 'less' else 'and'
            compare.claim(rf'figure {connector} about \$[\d,]+ more than the .* median\.')
        else:
            compare.claim(r'and about the same as the .* median\.')

    sections['scatter'] = Expectation(True)
    # RN-to-BSN note on nursing bachelor's pages only.
    sections['scatter'].claim(r'\(RN-to-BSN\)\. College Scorecard counts them with programs for new students', cip == '5138' and row['CREDLEV'] == 3)

    # What graduates earn over time
    over_time = sections['over-time'] = Expectation(year5 is not None)
    matching = page['matching']
    if year5 is not None:
        growth_percent = percent_number(abs(growth))
        if growth_percent == 0:
            over_time.claim(r'Pay is about the same in the first and fifth year\.')
        else:
            over_time.add(f'{growth_percent}%')
            over_time.claim(r'Pay rises about' if growth > 0 else r'Pay falls about')
        over_time.add(money(year1), money(year5))
        if state['year5'] is not None:
            over_time.add(money(state['year5']))
        if matching:
            over_time.add(money(matching['state_median']), money(matching['state_median']))
            over_time.claim(r'which shows how much room there is to grow', matching['state_median'] > year5)
            if matching['metro_median'] is not None:
                over_time.add(money(matching['metro_median']))

    # Family income
    has_pell = page['pell_year1'] is not None and page['other_year1'] is not None
    family = sections['family-income'] = Expectation(has_pell)
    if has_pell:
        pell, other_pay = page['pell_year1'], page['other_year1']
        pell_debt, other_debt = page['pell_debt'], page['other_debt']
        gap = Fraction(pell - other_pay, other_pay)
        both_debts = pell_debt is not None and other_debt is not None
        borrowed_more = both_debts and pell_debt * 10 >= other_debt * 11
        borrowed_less = both_debts and pell_debt < other_debt
        family.add(money(pell), money(other_pay))
        if pell_debt is not None:
            family.add(money(pell_debt))
        if other_debt is not None:
            family.add(money(other_debt))
        if gap <= Fraction(-3, 100):
            family.add(money(abs(pell - other_pay)))
            family.claim(r'less in their first year than other graduates')
            family.claim(r'They also borrowed more\.', borrowed_more)
        else:
            if gap >= Fraction(1, 10):
                family.claim(r'earned more in their first year')
            elif gap >= Fraction(2, 100):
                family.claim(r'earned slightly more in their first year')
            else:
                family.claim(r'earned about the same in their first year')
            if borrowed_more:
                family.add(money(pell_debt), money(other_debt))
                family.claim(r'but borrowed more: a median of')
            else:
                family.claim(r'does not look worse for students with less money')
                family.claim(r'They also borrowed less\.', borrowed_less)

    # Paying back the loans
    repayment = sections['repayment'] = Expectation(page['monthly'] is not None)
    if page['monthly'] is not None:
        repayment.add(money(page['monthly']))
        share_of_pay = page_model.round_half_up(Fraction(page['monthly'] * 12 * 100, year1), 1)
        repayment.add(f'{share_of_pay:.1f}%')
        if page['repayment']:
            repayment.add(count(page['repayment_borrowers']))
            for _, share_text in page['repayment']:
                repayment.add(share_text)
        repayment.claim(r'partly during the pandemic pause', bool(page['repayment']))
        if page['parent_plus_count'] and page['parent_plus_median'] is not None:
            repayment.add(count(page['parent_plus_count']), money(page['parent_plus_median']))

    # Where graduates work
    in_state_share = (
        Fraction(page['working_in_state'], page['working'])
        if page['working'] and page['working_in_state'] is not None else None
    )
    price = page['price']
    occupation_price = matching is not None and price is not None
    work = sections['work'] = Expectation(in_state_share is not None or price is not None or occupation_price)
    if in_state_share is not None:
        work.add(percent(in_state_share), count(page['working_in_state']), count(page['working']))
    if price is not None:
        gap_percent = percent_number(abs(1 - price['index'] / 100))
        work.claim(r'outside metro areas', price['kind'] == 'nonmetro')
        if gap_percent == 0:
            work.claim(r'about the same as the national average')
        else:
            work.add(f'{gap_percent}%', money(year1), money(Fraction(year1) / (price['index'] / 100)))
            work.claim(r'below the national average' if price['index'] < 100 else r'above the national average')
    if occupation_price:
        adjusted = Fraction(matching['state_median']) / (price['state_index'] / 100)
        work.add(money(matching['state_median']), money(matching['national_median']), money(adjusted))
        comparison = adjusted / matching['national_median'] - 1
        if comparison > Fraction(5, 100):
            work.claim(r'which puts .* ahead\.')
        elif comparison > 0:
            work.claim(r'which puts .* slightly ahead\.')
        elif comparison < Fraction(-5, 100):
            work.claim(r'which puts .* behind\.')
        elif comparison < 0:
            work.claim(r'which puts .* slightly behind\.')

    # Careers
    careers = [occupation for occupation in page['occupations']
               if occupation['state_median'] is not None or occupation['national_median'] is not None]
    career_section = sections['careers'] = Expectation(bool(careers))
    growth_phrases = Counter()
    for occupation in careers:
        career_section.add(money(occupation['state_median'] if occupation['state_median'] is not None else occupation['national_median']))
        if occupation['state_employment'] is not None:
            career_section.add(count(occupation['state_employment']))
        if occupation['growth_percent'] is not None and occupation['openings'] is not None:
            growth_percent = percent_number(abs(occupation['growth_percent'] / 100))
            if growth_percent == 0:
                growth_phrases['stay about the same in number'] += 1
            else:
                career_section.add(f'{growth_percent}%')
                growth_phrases['projected to grow' if occupation['growth_percent'] > 0 else 'projected to shrink'] += 1
            career_section.add(count(page_model.round_half_up(occupation['openings'] * 1000)))
        if occupation['education'] and occupation['experience']:
            # BLS work experience text, such as "Less than 5 years".
            career_section.add(*TOKEN_PATTERN.findall(occupation['experience']))
        if occupation['state_median'] is not None and occupation['p10'] is not None and occupation['p90'] is not None:
            career_section.add(money(occupation['p10']), money(occupation['p90']))
    career_section.growth_phrases = growth_phrases

    # About the school
    school = sections['school'] = Expectation(True)
    if page['reports_by_program']:
        if page['program_tuition'] is not None:
            school.add(money(page['program_tuition']))
        if page['net_price'] is not None:
            school.add(money(page['net_price']))
        school.claim(r"Tuition and fees for the school's largest program", page['program_tuition'] is not None)
    else:
        in_state, out_of_state = page['in_state_tuition'], page['out_of_state_tuition']
        if in_state is not None and in_state == out_of_state:
            school.add(money(in_state))
            school.claim(r'(^| )Tuition and fees ')
        else:
            if in_state is not None:
                school.add(money(in_state))
                school.claim(r'In-district tuition and fees' if page['district_tuition'] else r'In-state tuition and fees')
            if out_of_state is not None:
                school.add(money(out_of_state))
        if page['net_price'] is not None:
            school.add(money(page['net_price']))
    if page['admission_rate'] is not None:
        school.add(percent(page['admission_rate']))
    if page['graduation_rate'] is not None:
        school.add(percent(page['graduation_rate']))
        school.claim(r'Graduation rate \(within 6 years\)' if page['four_year'] else r'normal program length', True)
    if page['undergraduates'] is not None:
        school.add(count(page['undergraduates']))
    if page['school_count'] == 1:
        school.claim(r'is the only .* program at')
    else:
        school.add(ordinal(page['school_rank']), count(page['school_count']))
    if page['school_count'] >= 4:
        school.add(*[money(pay) for _, pay in page['top_programs']])
        school.claim(r'The top three are')
    else:
        others = [pay for other_cip, pay in page['top_programs'] if other_cip != cip]
        school.add(*[money(pay) for pay in others])
        if len(others) == 1:
            school.claim(r'The other is')
        elif len(others) >= 2:
            school.claim(r'The others are')

    # Nearby programs
    nearby = sections['nearby'] = Expectation(len(page['nearby']) > 1)
    if len(page['nearby']) > 1:
        for item in page['nearby']:
            if not item['current']:
                nearby.add(miles_label(item['miles']))
            nearby.add(money(item['year1']), money(item['debt']))

    # Common questions
    faq = sections['faq'] = Expectation(True)
    faq.add(money(year1))
    if year5 is not None:
        faq.add(money(year5))
    if matching:
        faq.add(money(matching['metro_median'] if matching['metro_median'] is not None else matching['state_median']))
    else:
        faq.add(money(state['year1']))
    faq.add(money(debt), count(len(page['state_both'])))
    if page['state_debt_rank'] > 1:
        faq.add(ordinal(page['state_debt_rank']))
    if page['monthly'] is not None:
        faq.add(money(page['monthly']))
    faq.add(percent(debt_to_earnings), percent(national['dte']))
    low_ratio = debt_to_earnings < national['dte']
    if low_ratio:
        faq.claim(r'On the numbers, yes for most students\.')
        default_rows = [share for status, share in page['repayment'] if status == 'default']
        if default_rows:
            faq.add(default_rows[0])
        higher_paying = [other for other in page['state_both'] if other is not row and other['EARN_MDN_1YR'] > year1]
        with_more_debt = [other for other in higher_paying if other['DEBT_ALL_STGP_ANY_MDN'] > debt]
        faq.claim(r'several .* programs report higher pay', len(higher_paying) >= 3)
        faq.claim(r'usually with more debt', len(higher_paying) >= 3 and len(with_more_debt) * 2 > len(higher_paying))
    else:
        faq.claim(r'It depends on your other options\.')
    if in_state_share is not None:
        faq.add(percent(in_state_share), count(page['working_in_state']), count(page['working']))
        faq.claim(r'Most do\.' if in_state_share >= Fraction(1, 2) else r'Many leave\.')

    # Meta description
    description = sections['#description'] = Expectation(True)
    description.add(money(year1), money(debt))
    if year5 is not None:
        description.add(money(year5))
        description.claim(r'graduates earn \$[\d,]+ in year one and \$[\d,]+ by year five\. ')
    else:
        description.claim(r'graduates earn \$[\d,]+ in year one\. ')
    if low_debt:
        description.add(share_of_programs(page['lower_than']))
        description.claim(r'Median federal debt: \$[\d,]+, lower than at .* of similar programs\.$')
    elif high_debt:
        description.add(share_of_programs(page['higher_than']))
        description.claim(r'Median federal debt: \$[\d,]+, higher than at .* of similar programs\.$')
    else:
        description.add(money(national['debt']))
        description.claim(r'Median federal debt: \$[\d,]+, near the national median of \$[\d,]+\.$')

    # Related pages: the state ranking for this field and credential, and the
    # school's page, which lists every program at the school that reports pay.
    related = sections['related'] = Expectation(True)
    related.add(count(state['year1_count']))
    related.claim(r'programs in .*, ranked')
    # Schools with only one program that reports pay have no school page.
    if page['school_total'] >= 2:
        related.add(count(page['school_total']))
    related.claim(r'All .* programs, ranked', page['school_total'] >= 2)
    # And the national page for the field and credential.
    related.add(count(national['year1_count']))
    related.claim(r'programs in the US, ranked')

    sections['#graduates'] = page['graduates']
    return sections


# ---------------------------------------------------------------------------
# Page checks

STATE_NAMES = page_model.load_state_names()

def check_career_links(node, codes, career_codes, errors):
    """Each listed job links to its occupation page when it has one."""
    if node is None:
        return
    links = [anchor.attributes.get('href', '') for anchor in node.find_all(lambda child: child.tag == 'a')]
    career_links = [link for link in links if link.startswith('/careers/')]
    expected = sum(1 for code in codes if code in career_codes)
    if len(career_links) != expected:
        errors.append(f'section careers: {len(career_links)} links to occupation pages, expected {expected}')

FORBIDDEN_PATTERNS = [r'\bundefined\b', r'\bNaN\b', r'\bnull\b', r'\$0(?![\d,])']


def check_page(html_text, model, page_path):
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
    if not title:
        errors.append('missing <title>')
    if title != h1:
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
    cip = main.attributes.get('data-cip')
    credential_level = int(main.attributes.get('data-credential-level', '0'))
    school_name = main.attributes.get('data-school-name', '')
    try:
        model_page = model.page(unit_id, cip, credential_level)
    except LookupError as error:
        return {'page': page_path, 'errors': errors + [str(error)], 'warnings': warnings, 'links': []}

    main_text = visible_text(main)
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    # Identity: the page names the program and school the raw data says it is.
    institution = model_page['institution']
    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    credential_labels = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's"}
    # Browsers collapse repeated spaces, so compare with single spaces.
    official_title = ' '.join(model_page['row']['CIPDESC'].split()).rstrip('.')
    expected_field = f"{credential_labels[credential_level]} in {official_title}"
    if expected_field not in header_text:
        errors.append(f'header does not show {expected_field!r}')
    if f"{institution['CITY']}, {institution['STABBR']}" not in header_text:
        errors.append(f"header does not show {institution['CITY']}, {institution['STABBR']}")
    graduates = model_page['graduates']
    graduates_match = re.search(r'About ([\d,]+) graduates a year', header_text)
    if graduates:
        if not graduates_match or graduates_match.group(1) != count(graduates):
            errors.append(f'header graduates: expected {count(graduates)}, found {graduates_match.group(1) if graduates_match else None}')
    elif graduates_match:
        errors.append('header shows graduates but the data has none')
    # The breadcrumb links to the school page, which exists only for schools with
    # at least two programs that report pay.
    school_href = '/'.join(page_path.split('/')[:3])
    school_link = header.find(lambda node: node.tag == 'a' and node.attributes.get('href') == school_href) if header else None
    if (school_link is not None) != (model_page['school_total'] >= 2):
        errors.append(f"breadcrumb link to {school_href} {'missing' if school_link is None else 'unexpected'}")

    # The breadcrumb links to the state page.
    state_href = '/states/' + page_model.state_slug(STATE_NAMES[institution['STABBR']])
    if not header or not header.find(lambda node: node.tag == 'a' and node.attributes.get('href') == state_href):
        errors.append(f'breadcrumb link to {state_href} missing')

    expectations = expected_sections(model_page, cip)
    present_sections = {
        node.attributes['data-section']: node
        for node in main.find_all(lambda node: 'data-section' in node.attributes)
    }
    for name, expectation in expectations.items():
        if name.startswith('#'):
            continue
        node = present_sections.get(name)
        if expectation.present != (node is not None):
            errors.append(f'section {name}: expected {"present" if expectation.present else "hidden"}')
            continue
        if node is None:
            continue
        text = visible_text(node, skip_names=True)
        heading = node.find(lambda child: child.tag == 'h2')
        if heading is not None and not text.replace(visible_text(heading), '').strip():
            errors.append(f'section {name} is empty')
        for table in node.find_all(lambda child: child.tag == 'table'):
            if not table.find(lambda child: child.tag == 'td'):
                errors.append(f'section {name} has an empty table')
        actual = Counter(number_tokens(text, school_name))
        if actual != expectation.tokens:
            missing = expectation.tokens - actual
            extra = actual - expectation.tokens
            errors.append(f'section {name} numbers differ: missing {dict(missing)}, unexpected {dict(extra)}')
        for pattern, should_match in expectation.claims:
            if bool(re.search(pattern, text)) != should_match:
                errors.append(f'section {name}: wording {pattern!r} should {"" if should_match else "not "}appear')
        if name == 'careers':
            for phrase, expected_count in expectation.growth_phrases.items():
                if text.count(phrase) != expected_count:
                    errors.append(f'section careers: expected {expected_count} x {phrase!r}')
        if name == 'scatter':
            circles = node.find_all(lambda child: child.tag == 'circle')
            if len(circles) != len(model_page['state_both']) or len(circles) < 5:
                errors.append(f"scatter has {len(circles)} dots, expected {len(model_page['state_both'])} (at least 5)")

    shown_careers = [occupation['code'] for occupation in model_page['occupations']
                     if occupation['state_median'] is not None or occupation['national_median'] is not None]
    check_career_links(present_sections.get('careers'), shown_careers, model.career_fields(), errors)

    description_expectation = expectations['#description']
    actual = Counter(number_tokens(description, school_name))
    if actual != description_expectation.tokens:
        errors.append(f'description numbers differ: missing {dict(description_expectation.tokens - actual)}, unexpected {dict(actual - description_expectation.tokens)}')
    for pattern, should_match in description_expectation.claims:
        if bool(re.search(pattern, description)) != should_match:
            errors.append(f'description wording {pattern!r}')

    # FAQ: every answer is in the HTML, and the JSON-LD matches the visible FAQ.
    faq_node = present_sections.get('faq')
    visible_faq = []
    if faq_node is not None:
        for item in faq_node.find_all(lambda child: child.attributes.get('data-slot') == 'accordion-item'):
            question_node = item.find(lambda child: child.tag == 'button')
            answer_node = item.find(lambda child: child.tag == 'p')
            visible_faq.append((visible_text(question_node) if question_node else '', visible_text(answer_node) if answer_node else ''))
    if not visible_faq or any(not question or not answer for question, answer in visible_faq):
        errors.append('FAQ questions or answers missing from the HTML')
    json_ld_nodes = root.find_all(lambda node: node.tag == 'script' and node.attributes.get('type') == 'application/ld+json')
    try:
        structured = json.loads(json_ld_nodes[0].raw_text()) if json_ld_nodes else None
    except json.JSONDecodeError:
        structured = None
    if not structured or structured.get('@type') != 'FAQPage':
        errors.append('FAQPage JSON-LD missing or does not parse')
    else:
        structured_faq = [(entry['name'], entry['acceptedAnswer']['text']) for entry in structured['mainEntity']]
        if structured_faq != visible_faq:
            errors.append('FAQPage JSON-LD does not match the visible FAQ')

    links = sorted({
        node.attributes['href'] for node in root.find_all(lambda node: node.tag == 'a' and node.attributes.get('href', '').startswith('/'))
    })
    return {'page': page_path, 'title': title, 'description': description, 'errors': errors, 'warnings': warnings, 'links': links}


def html_path(html_directory, page_path):
    return Path(html_directory) / (page_path.strip('/') + '.html')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--html-dir', required=True)
    parser.add_argument('--pages', required=True, help='file with one page path per line')
    parser.add_argument('--report', required=True, help='where to write the JSON report')
    arguments = parser.parse_args()

    model = page_model.Model()
    page_paths = [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]
    results = []
    for page_path in page_paths:
        file_path = html_path(arguments.html_dir, page_path)
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
