#!/usr/bin/env python3
"""Checks built program pages against the public data in data/raw.

For each page this script:
1. Works out, from data/raw only (page_model.py), every number the page must show
   and which wording each sentence must use.
2. Reads the built HTML and compares, section by section, the numbers a reader
   sees with the expected ones. Any missing, wrong, or extra number is an error.
3. Checks the page as a whole: lang, title and H1, meta description, both lists
   of questions and FAQPage JSON-LD, forbidden text (undefined, NaN, null, $0),
   wording the revised pages no longer use, the order of the sections, empty
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
from job_rows import job_text, job_tokens, lowercase_words, matching_job_short_names  # noqa: E402
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


FOOTER_TEXT = 'US College Programs is an independent site built from public U.S. government data. It is not affiliated with any school or government agency.'


def frame_errors(root):
    """Every page is a column that fills the window: the site header, a main part
    that grows and the footer last. That keeps the footer at the bottom of the
    window on a short page. The footer holds one sentence."""
    main = root.find(lambda node: node.tag == 'main')
    if main is None:
        return ['the page has no <main>']

    def class_names(node):
        return set((node.attributes.get('class') or '').split())

    errors = []
    page = main.parent
    if not {'flex', 'min-h-screen', 'flex-col'} <= class_names(page):
        errors.append(f"the page is not a column that fills the window: class {page.attributes.get('class')!r}")
    if 'flex-1' not in class_names(main):
        errors.append(f"<main> does not grow to push the footer down: class {main.attributes.get('class')!r}")
    parts = [child.tag for child in page.children if isinstance(child, Node)]
    if parts != ['header', 'main', 'footer']:
        errors.append(f'the page should hold the site header, the main part and the footer in that order, found {parts}')
    footers = root.find_all(lambda node: node.tag == 'footer')
    if len(footers) != 1 or visible_text(footers[0]) != FOOTER_TEXT:
        errors.append(f'the footer should hold its one sentence, found {[visible_text(footer) for footer in footers]}')
    return errors


# ---------------------------------------------------------------------------
# Number tokens

# Fixed template phrases that contain digits but no data.
STATIC_PHRASES = [
    'June 2026', 'May 2025', '2025 to 2035', '2018 to 2020', 'Price Parities, 2024', 'CIP 2020 to SOC 2018',
    'directory, 2024', 'Earnings after 5 years', 'Earnings, 1 year after graduating', 'Earnings, 5 years after graduating',
    'Year 1 and year 5', ', year 1', ', year 5', '10-year', 'over 10 years', 'Bottom 10%:', 'Top 10%:',
    '(within 6 years)', '(within 1.5 times the normal program length)', 'Year 1 pay',
    # The year of the count behind the share of graduates who studied in the state.
    'graduates in 2022-23 studied',
    # Ranking pages.
    'Median pay after 5 years', 'Year 5 pay',
    # The line in "About this data" about changed pay figures.
    'within 1% of the true figure', 'most of the rest are within 4%', 'about 6% are off by 5% to 9%',
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


# A figure within this share of a median may be called "about the same" as it.
# Anything further away must be given as a gap in dollars. The limit is wider
# for pay, because the Department of Education changes each pay figure slightly
# before publishing it. Debt figures are not changed.
PAY_ABOUT_THE_SAME = Fraction(5, 100)
DEBT_ABOUT_THE_SAME = Fraction(3, 100)
# The line in "About this data" that says pay figures are changed. `figures` is
# "each pay figure", or "each program's pay figure" on career pages.
PAY_PRIVACY_NOTE = r'''To protect privacy, the U\.S\. Department of Education changes {figures} slightly before publishing it\. About half of first-year figures are within 1% of the true figure, most of the rest are within 4% and about 6% are off by 5% to 9%\. Small gaps in pay, and ranks next to each other, may not be real differences\. Debt figures are not changed\.'''


def against_national_median(expectation, amount, national_median, about_the_same):
    """How a sentence must compare a figure with the national median, as a
    pattern, adding the numbers it shows to the expectation. "About the same" is
    allowed only within the limit; otherwise the sentence gives the gap, measured
    from the median as displayed so the three numbers add up."""
    shown_median = money(national_median)
    expectation.add(shown_median)
    if abs(amount - national_median) < national_median * about_the_same:
        return rf'about the same as the national median of {re.escape(shown_median)}'
    gap = amount - int(page_model.round_half_up(national_median))
    expectation.add(money(abs(gap)))
    return rf"{re.escape(money(abs(gap)))} {'more' if gap > 0 else 'less'} than the national median of {re.escape(shown_median)}"


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
    # The summary has two subjects, pay and then debt. Each list holds the
    # sentences of one subject, in order, as patterns.
    earned = rf"graduates earn a median of {re.escape(money(year1))} in their first year"
    if page['percentile'] >= 75:
        pay_sentences = [rf'{earned}, more than graduates of most .* programs nationally\.']
    elif page['percentile'] <= 25:
        pay_sentences = [rf'{earned}, less than graduates of most .* programs nationally\.']
    else:
        pay_sentences = [rf"{earned}, {against_national_median(summary, year1, national['year1'], PAY_ABOUT_THE_SAME)}\."]
    borrowed = rf"The typical graduate leaves with {re.escape(money(debt))} in federal loans"
    if low_debt:
        summary.add(share_of_programs(page['lower_than']))
        debt_sentences = [rf"Where this program stands out is debt\. {borrowed}, less than at {share_of_programs(page['lower_than'])} of .* programs in the country\."]
    elif high_debt:
        summary.add(share_of_programs(page['higher_than']))
        debt_sentences = [rf"Debt is high\. {borrowed}, more than at {share_of_programs(page['higher_than'])} of .* programs in the country\."]
    else:
        debt_sentences = [rf"{borrowed}, {against_national_median(summary, debt, national['debt'], DEBT_ABOUT_THE_SAME)}\."]
    # The closing remark goes with the subject it is about.
    higher_paying_count = page['state_pay_rank'] - 1
    if page['state_pay_rank'] <= Fraction(state['year1_count'], 4):
        pay_sentences.append(r'This is one of the higher-paying .* (?:degrees|programs) in .*\.')
    elif low_debt and page['percentile'] <= 25 and year1 < state['year1']:
        summary.add(money(state['year1']))
        debt_sentences.append(rf"Debt is low, but pay is also below the .* median of {re.escape(money(state['year1']))}\.")
    elif higher_paying_count >= 3:
        pay_sentences.append(r'Several .* programs report higher pay\.')
    elif higher_paying_count == 2:
        pay_sentences.append(r'Two other .* programs report higher pay\.')
    elif higher_paying_count == 1:
        pay_sentences.append(r'One other .* program reports higher pay\.')
    summary.pay_pattern = ' '.join(pay_sentences)
    summary.debt_pattern = ' '.join(debt_sentences)
    summary.claim(r'The short answer|[Ss]trong value|It is one of the higher-paying|about what|close to the national median', False)

    # Key figures
    figures = sections['key-figures'] = Expectation(True)
    figures.add(money(year1), count(national['year1_count']))
    if page['percentile'] < 1:
        figures.add('1%')
        standing = f"Bottom 1% of {count(national['year1_count'])} programs nationally"
    elif page['percentile'] >= 100:
        figures.add('1%')
        standing = f"Top 1% of {count(national['year1_count'])} programs nationally"
    else:
        figures.add(f"{page['percentile']}%")
        standing = f"Higher than {page['percentile']}% of {count(national['year1_count'])} programs nationally"
    # Each tile's three lines, tile by tile.
    figures.tiles = [['Median first-year pay', money(year1), standing]]
    figures.claim(r'^Median first-year pay')
    figures.claim(r'Median federal debt.*Debt-to-earnings')
    figures.claim(r'Median pay after 5 years', year5 is not None)
    state_name = STATE_NAMES[page['institution']['STABBR']]
    state_place = page_model.place_in_sentence(state_name)
    if year5 is not None:
        figures.add(money(year5))
        growth_percent = percent_number(abs(growth))
        if growth_percent == 0:
            change = 'About the same as year one'
        else:
            figures.add(f'{growth_percent}%')
            change = f"{growth_percent}% {'more' if growth > 0 else 'less'} than year one"
        figures.tiles.append(['Median pay after 5 years', money(year5), change])
    figures.add(money(debt), count(len(page['state_both'])))
    if page['state_debt_rank'] == 1:
        debt_place = f"The lowest of {count(len(page['state_both']))}"
    else:
        figures.add(ordinal(page['state_debt_rank']))
        debt_place = f"{ordinal(page['state_debt_rank'])} lowest of {count(len(page['state_both']))}"
    figures.tiles.append(['Median federal debt', money(debt), f'{debt_place} {state_name} programs'])
    figures.add(percent(debt_to_earnings), percent(state['dte']), percent(national['dte']))
    figures.tiles.append(['Debt-to-earnings', percent(debt_to_earnings), f"{state_name} median {percent(state['dte'])}, national {percent(national['dte'])}"])

    # A note under the key figures when some graduates studied at campuses in
    # other states: the share who studied in the school's own state.
    campuses = sections['campuses'] = Expectation(page['in_state_share'] is not None)
    if page['in_state_share'] is not None:
        # The share opens a sentence, so "more than 99%" takes a capital letter,
        # and its number then reads as the plain token "99%".
        shown_share = share_of_programs(page['in_state_share'])
        if shown_share == 'more than 99%':
            shown_share = 'More than 99%'
            campuses.add('99%')
        else:
            campuses.add(shown_share)
        campuses.claim(rf"^These figures cover all of this school's campuses together\. {re.escape(shown_share)} of its .* graduates in 2022-23 studied in {re.escape(state_place)}\.$")

    # The four questions under the key figures. Each answer is about this
    # program's own graduates, and the last one works the figure out.
    questions = sections['key-figure-questions'] = Expectation(True)
    questions.add(*MEDIAN_EXAMPLE_TOKENS)
    questions.add(money(year1), money(debt))
    questions.add(money(debt), money(year1), percent(debt_to_earnings), percent(state['dte']), percent(national['dte']))
    if year5 is not None:
        questions.add(money(year5))
    questions.claim(r'What does "median" mean\? An average adds up every value and divides by how many there are\.')
    questions.claim(r'The median is the middle value when the values are put in order: half are higher, and half are lower\.')
    questions.claim(rf"were not enrolled in more school\. For .* graduates that figure is {re.escape(money(year1))}\.")
    questions.claim(rf"Median pay after 5 years is the same measure for an earlier graduating class, and for this program it is {re.escape(money(year5)) if year5 is not None else ''}\.", year5 is not None)
    questions.claim(rf"Parent PLUS loans and private loans\. For .* graduates that figure is {re.escape(money(debt))}\.")
    questions.claim(rf"For this program that is {re.escape(money(debt))} divided by {re.escape(money(year1))}, which is {percent(debt_to_earnings)}\. A lower figure means graduates owe less compared with what they earn\. The median across {re.escape(state_name)} .* programs is {percent(state['dte'])}, and the national median is {percent(national['dte'])}\.")
    questions.claim(r"College Scorecard: the U\.S\. Department of Education's public database of colleges and their programs, with pay figures drawn from federal tax records\.")
    questions.claim(r"College Scorecard: the U\.S\. Department of Education's public database of colleges and their programs, with debt figures drawn from federal student loan records\.")
    questions.claim(r'would be at 40%|is the median of those figures', False)

    # How this program compares with other programs
    compare = sections['compare'] = Expectation(True)
    compare.claim(r'^How this program compares with other .* programs The first column shows this program, where each figure is the median for its graduates\.')
    compare.claim(r'Debt as share|national figure|How it compares', False)
    # The table, row by row: this program, the state median, the national median.
    compare.head = ['', None, f'{state_name} median', 'National median']
    compare.rows = [['Median first-year pay', money(year1), money(state['year1']), money(national['year1'])]]
    if year5 is not None and state['year5'] is not None and national['year5'] is not None:
        compare.rows.append(['Median pay after 5 years', money(year5), money(state['year5']), money(national['year5'])])
    compare.rows.append(['Median federal debt', money(debt), money(state['debt']), money(national['debt'])])
    compare.rows.append(['Debt-to-earnings', percent(debt_to_earnings), percent(state['dte']), percent(national['dte'])])
    compare.rows.append(['Programs compared', '', count(state['year1_count']), count(national['year1_count'])])
    for compare_row in compare.rows:
        compare.add(*[cell for cell in compare_row[1:] if cell])
    if year5 is not None and state['year5'] is not None and national['year5'] is not None:
        national_share = (year5 - national['year5']) / national['year5']
        state_gap = year5 - state['year5']
        state_share = state_gap / state['year5']
        national_direction = 'same' if abs(national_share) < PAY_ABOUT_THE_SAME else ('more' if national_share > 0 else 'less')
        compare.claim({'same': r'earn about the national median', 'more': r'earn more than the national median',
                       'less': r'earn less than the national median'}[national_direction])
        if state_share <= -PAY_ABOUT_THE_SAME:
            compare.add(money(abs(state_gap)))
            connector = 'and' if national_direction == 'less' else 'but'
            compare.claim(rf'national median {connector} about \$[\d,]+ less than the .* median\.')
            higher_debt_higher_pay = sum(
                1 for other in page['state_both']
                if other is not row and other['DEBT_ALL_STGP_ANY_MDN'] > debt
                and other['EARN_MDN_5YR'] is not None and other['EARN_MDN_5YR'] > year5
            )
            compare.claim(r'programs with higher debt show higher pay by the five-year mark', higher_debt_higher_pay >= 3)
        elif state_share >= PAY_ABOUT_THE_SAME:
            compare.add(money(state_gap))
            connector = 'but' if national_direction == 'less' else 'and'
            compare.claim(rf'national median {connector} about \$[\d,]+ more than the .* median\.')
        else:
            compare.claim(r'and about the same as the .* median\.')

    scatter = sections['scatter'] = Expectation(True)
    scatter.add(count(len(page['state_both'])))
    scatter.claim(rf"Only the {count(len(page['state_both']))} programs that report both pay and debt are shown\.")
    # The note about programs for working nurses, on nursing bachelor's pages only.
    scatter.claim(r"are for nurses who are already licensed and working\. College Scorecard counts them with programs for new students, and their graduates' pay reflects years of nursing experience\. High pay at a program here", cip == '5138' and row['CREDLEV'] == 3)

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
        over_time.claim(r' graduates, year 1 ?\$.* graduates, year 5 ?\$')
        # The amount on each bar, bar by bar.
        over_time.bars = [money(year1), money(year5)]
        if state['year5'] is not None:
            over_time.bars.append(money(state['year5']))
        if matching:
            over_time.bars.append(money(matching['state_median']))
            if matching['metro_median'] is not None:
                over_time.bars.append(money(matching['metro_median']))
        over_time.claim(r'Year 1 and year 5 figures come from different graduating classes, which makes the growth rate an estimate\.')
        over_time.claim(r'The Bureau of Labor Statistics figures cover .* at every experience level\.', bool(matching))
        if state['year5'] is not None:
            over_time.add(money(state['year5']))
        if matching:
            over_time.add(money(matching['state_median']), money(matching['state_median']))
            over_time.claim(r'which shows how much room there is to grow', matching['state_median'] > year5)
            if matching['metro_median'] is not None:
                over_time.add(money(matching['metro_median']))
            over_time.claim(r' in the [^$]* area ?\$', matching['metro_median'] is not None)

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
        # The two tiles, line by line.
        family.tiles = [['Pell Grant recipients, median first-year pay', money(pell)], ['Other graduates, median first-year pay', money(other_pay)]]
        if pell_debt is not None:
            family.add(money(pell_debt))
            family.tiles[0].append(f'Median federal debt {money(pell_debt)}')
        if other_debt is not None:
            family.add(money(other_debt))
            family.tiles[1].append(f'Median federal debt {money(other_debt)}')
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
                family.claim(r' other graduates, but they borrowed more: a median of')
            else:
                family.claim(r'They also borrowed less\.', borrowed_less)
        # The section gives the figures and passes no judgment on them.
        family.claim(r'does not look worse|students with less money', False)

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
            repayment.rows = [[REPAYMENT_LABELS[status], share_text] for status, share_text in page['repayment']]
        repayment.claim(r'partly during the pandemic pause on federal loan payments\. The forbearance share may be higher than usual\.', bool(page['repayment']))
        if page['parent_plus_count'] and page['parent_plus_median'] is not None:
            repayment.add(count(page['parent_plus_count']), money(page['parent_plus_median']))

    # Where graduates work
    # The federal counts carry a little random noise to protect privacy, and the
    # in-state count can come out above the total. No share is given then.
    in_state_share = (
        Fraction(page['working_in_state'], page['working'])
        if page['working'] and page['working_in_state'] is not None and page['working_in_state'] <= page['working'] else None
    )
    # `price` always has the state's price level. `area_price` also has the school's
    # own area, which a school without a trusted location doesn't have.
    price = page['price']
    area_price = price if price is not None and price['kind'] is not None else None
    occupation_price = matching is not None and price is not None
    work = sections['work'] = Expectation(in_state_share is not None or area_price is not None or occupation_price)
    work.claim(r'Prices in ', area_price is not None)
    work.claim(r'^Where graduates work and what the pay is worth ')
    work.claim(rf'The share of graduates working in {re.escape(state_place)} is approximate, because the government adjusts these counts slightly to protect privacy\.', in_state_share is not None)
    work.claim(r'is approximate, because', in_state_share is not None)
    work.claim(r'were working in', in_state_share is not None)
    if in_state_share is not None:
        work.add(percent(in_state_share), count(page['working_in_state']), count(page['working']))
    if area_price is not None:
        gap_percent = percent_number(abs(1 - price['index'] / 100))
        work.claim(r'outside metro areas', price['kind'] == 'nonmetro')
        if gap_percent == 0:
            work.claim(r'about the same as the national average')
        else:
            adjusted_pay = money(Fraction(year1) / (price['index'] / 100))
            work.add(f'{gap_percent}%', money(year1), adjusted_pay)
            direction = 'below' if price['index'] < 100 else 'above'
            work.claim(rf"are about {gap_percent}% {direction} the national average\. A salary of {re.escape(money(year1))} here buys what about {re.escape(adjusted_pay)} buys in a typical US city\.")
    if occupation_price:
        adjusted = Fraction(matching['state_median']) / (price['state_index'] / 100)
        work.add(money(matching['state_median']), money(matching['national_median']), money(adjusted))
        work.claim(rf"The median {re.escape(MATCHING_SHORT_NAMES[cip])} in {re.escape(state_place)} earns {re.escape(money(matching['state_median']))}, compared with a national median of {re.escape(money(matching['national_median']))}\. After adjusting for {re.escape(state_name)} prices, that pay is worth about {re.escape(money(adjusted))}[,.]")
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
    for occupation in careers:
        job_tokens(career_section, occupation)
    # Each job's text, whole and in order.
    career_section.job_texts = [job_text(job, lowercase_words(OCCUPATION_NAMES.get(job['code'], job['title'])), state_place) for job in careers]
    career_section.claim(rf" careers in {re.escape(state_place)} These are the largest jobs that the U\.S\. Department of Education and the Bureau of Labor Statistics link to .*, by number of people employed in the US\. Pay is the {re.escape(state_name)} median for the job, at all experience levels\.")
    career_section.claim(rf"Where {re.escape(state_place)} has no figure, the national median is shown\.", any(job['state_median'] is None for job in careers))
    career_section.claim(r'crosswalk|Median pay in |Median pay nationwide|Typical education to start|Careers this field leads to', False)

    # About the school
    school = sections['school'] = Expectation(True)
    # The table of school facts, row by row.
    school.rows = []
    if page['reports_by_program']:
        if page['program_tuition'] is not None:
            school.rows.append(["Tuition and fees for the school's largest program", money(page['program_tuition'])])
        if page['net_price'] is not None:
            school.rows.append(['Average net price after aid, largest program', money(page['net_price'])])
    else:
        in_state, out_of_state = page['in_state_tuition'], page['out_of_state_tuition']
        if in_state is not None and in_state == out_of_state:
            school.rows.append(['Tuition and fees', f'{money(in_state)} a year'])
        else:
            if in_state is not None:
                school.rows.append(['In-district tuition and fees' if page['district_tuition'] else 'In-state tuition and fees', f'{money(in_state)} a year'])
            if out_of_state is not None:
                school.rows.append(['Out-of-state tuition and fees', f'{money(out_of_state)} a year'])
        if page['net_price'] is not None:
            school.rows.append(['Average net price after aid', f'{money(page["net_price"])} a year'])
    if page['admission_rate'] is not None:
        school.rows.append(['Admission rate', percent(page['admission_rate'])])
    if page['graduation_rate'] is not None:
        time_span = 'within 6 years' if page['within_six_years'] else 'within 1.5 times the normal program length'
        school.rows.append([f'Graduation rate of first-time, full-time students ({time_span})', percent(page['graduation_rate'])])
    if page['undergraduates'] is not None:
        school.rows.append(['Undergraduate students', count(page['undergraduates'])])
    for _, value in school.rows:
        school.add(value.removesuffix(' a year'))
    school.claim(r' / year|, and ', False)
    if page['school_count'] == 1:
        school.claim(r'is the only .* program at .* that reports first-year pay\.')
    else:
        school.add(ordinal(page['school_rank']), count(page['school_count']))
        school.claim(r' programs at .* by first-year pay\.')
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
        # Row by row. School names are left out: they are names, not data we compute.
        nearby.rows = []
        for item in page['nearby']:
            if not item['current']:
                nearby.add(miles_label(item['miles']))
            nearby.add(money(item['year1']), money(item['debt']))
            nearby.rows.append(['', '' if item['current'] else miles_label(item['miles']), money(item['year1']), money(item['debt'])])

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
    # "Is it worth it?": what we cannot know, how past graduates did and what those
    # figures leave out. Three paragraphs and no verdict.
    faq.claim(r'worth it\? That depends on things we cannot know: what you would pay after grants and scholarships, how much you would borrow and what work you want\. What this page shows is how past graduates did\.')
    # The question reads "Is an accounting degree ..." or "Is a nursing degree ...":
    # the article goes by the first letter of the field's name.
    faq.claim(r'\bIs a [AEIOUaeiou]', False)
    faq.claim(r'\bIs an [^AEIOUaeiou]', False)
    # A field name that starts with "other" follows the noun: "Is a degree in
    # other health professions from ... worth it?"
    faq.claim(r'\bIs an? other ', False)
    faq.add(money(year1), money(debt))
    earned_first_year = rf"graduates earn a median of {re.escape(money(year1))} in their first year, "
    if page['percentile'] < 1:
        faq.add('1%')
        faq.claim(earned_first_year + r'which is in the bottom 1% of .* programs nationally\.')
    elif page['percentile'] >= 100:
        faq.add('1%')
        faq.claim(earned_first_year + r'which is in the top 1% of .* programs nationally\.')
    else:
        faq.add(f"{page['percentile']}%")
        faq.claim(earned_first_year + rf"more than graduates of {page['percentile']}% of .* programs nationally\.")
    # The summary's rule: a program in the top or bottom quarter for debt is
    # compared with most programs, and any other with the national median in
    # dollars. Programs with the same debt count on neither side, so a smaller
    # share would read as if the rest were on the other side.
    left_with = rf"They leave with a median of {re.escape(money(debt))} in federal loans, "
    if low_debt:
        faq.add(share_of_programs(page['lower_than']))
        faq.claim(left_with + rf"less than at {re.escape(share_of_programs(page['lower_than']))} of those programs\.")
    elif high_debt:
        faq.add(share_of_programs(page['higher_than']))
        faq.claim(left_with + rf"more than at {re.escape(share_of_programs(page['higher_than']))} of those programs\.")
    else:
        faq.claim(left_with + against_national_median(faq, debt, national['debt'], DEBT_ABOUT_THE_SAME) + r'\.')
    faq.claim(r'of those programs', low_debt or high_debt)
    if page['monthly'] is not None:
        share_of_pay = page_model.round_half_up(Fraction(page['monthly'] * 12 * 100, year1), 1)
        faq.add(money(page['monthly']), f'{share_of_pay:.1f}%')
        faq.claim(rf"On a standard 10-year plan that is about {re.escape(money(page['monthly']))} a month, or {share_of_pay:.1f}% of first-year pay\.")
    faq.claim(r'These figures count only students who finished, and we have no completion rate for this program alone\.')
    if page['graduation_rate'] is not None:
        faq.add(percent(page['graduation_rate']))
        finish = 'graduate within six years' if page['within_six_years'] else 'finish within one and a half times the normal length of their program'
        faq.claim(rf"Across .*, {percent(page['graduation_rate'])} of first-time, full-time students {finish}\.")
    faq.claim(r'first-time, full-time students', page['graduation_rate'] is not None)
    faq.claim(r'On the numbers|yes for most students|It depends on your other options|Debt equals|highest possible early salary|before deciding', False)
    faq.claim(r'graduates stay in ', in_state_share is not None)
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
        # Both figures and no verdict: the debt can be far from the national median.
        description.add(money(national['debt']))
        description.claim(rf"Median federal debt: {re.escape(money(debt))}\. National median: {re.escape(money(national['debt']))}\.$")
    description.claim(r'near the national median', False)

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

    official = ' '.join(row['CIPDESC'].split()).rstrip('.')
    about = sections['about-data'] = Expectation(True)
    about.claim(PAY_PRIVACY_NOTE.format(figures='each pay figure'))
    about.claim(rf"^About this data This program is in the field the U\.S\. Department of Education calls \"{re.escape(official)}\"\.")
    about.claim(r'Pay and debt only include students who received federal financial aid \(grants or loans\)\. Pay only counts graduates who were working and not enrolled in more school\.')
    about.claim(CAMPUS_RULE.format(state=re.escape(state_name), place=re.escape(state_place)))
    about.claim(r'School-level numbers like tuition, admission rate and graduation rate are for the whole school, not the .* program\.')
    about.claim(r'College Scorecard figures describe graduating classes from several years ago\. Bureau of Labor Statistics wages are from May 2025\.')

    sections['#graduates'] = page['graduates']
    sections['#official'] = official
    return sections


# ---------------------------------------------------------------------------
# Page checks

STATE_NAMES = page_model.load_state_names()
OCCUPATION_NAMES = page_model.load_occupation_names()
MATCHING_SHORT_NAMES = matching_job_short_names()
SOURCE_LINE = "Source: the U.S. Department of Education's College Scorecard, June 2026 release"
# A summary longer than this breaks into one paragraph for each subject.
ONE_PARAGRAPH_LIMIT = 240
# "About this data": how schools with several campuses are counted, then when a
# program is left out of a state. Two items in the list, which read one after
# the other. Shared with the other checkers.
CAMPUS_RULE = r'''For some schools with several campuses, College Scorecard gives one pay figure and one debt figure for all the campuses together\. We count each of those programs once\. We leave a program out of the {state} medians and rankings when the school's main campus is outside {place} or when more than half of the program's graduates studied outside {place}\. It still counts in the national medians\.'''
# The five salaries in the answer that explains the median: an example, not data.
MEDIAN_EXAMPLE_TOKENS = ['$40,000', '$45,000', '$50,000', '$55,000', '$210,000', '$80,000', '$50,000']
CONTROL_LABELS = {'1': 'Public', '2': 'Private nonprofit', '3': 'Private for-profit'}
CREDENTIAL_LABELS = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's"}
REPAYMENT_LABELS = {
    'paidInFull': 'Paid off in full', 'makingProgress': 'Paying down the balance',
    'forbearance': 'Paused payments (forbearance)', 'default': 'In default',
}
# Sections in the order the page shows them. A page leaves out those it has no data for.
SECTION_ORDER = [
    'header', 'summary', 'key-figures', 'campuses', 'key-figure-questions', 'compare', 'scatter', 'over-time', 'family-income',
    'repayment', 'work', 'careers', 'school', 'nearby', 'faq', 'related', 'about-data',
]
# Wording the revised pages no longer use anywhere. "Earnings" survives only in
# the name "debt-to-earnings".
RETIRED_WORDING = [
    r', so ', r'\bpercentile\b', r'—', r'(?i)(?<!debt-to-)\bearnings\b', r'\bgrads\b', r' / year',
    # Short forms a reader may not know. Titles keep "BSN" and "ADN" by the user's decision.
    r'\bRN\b', r'\bLPN\b', r'\bLVN\b', r'\bBLS\b', r'(?<!College )\bScorecard\b',
    # Two agencies link fields of study to jobs, so naming one alone is retired.
    r'Department of Education links',
]


def institution_kind(institution):
    """"Public university", "Private for-profit school": the school's control and
    the kind of school its own name says it is."""
    name = institution['INSTNM']
    kind = 'university' if re.search(r'universit', name, re.I) else 'college' if re.search(r'college', name, re.I) else 'school'
    return f"{CONTROL_LABELS[institution['CONTROL']]} {kind}"


def table_rows(node):
    """The body rows of a section's table, each as the text of its cells. School
    names (data-name) are left out."""
    rows = [row for row in node.find_all(lambda child: child.tag == 'tr') if row.find(lambda child: child.tag == 'td')]
    return [[visible_text(cell, skip_names=True) for cell in row.find_all(lambda child: child.tag == 'td')] for row in rows]


def tile_lines(node):
    """The lines of each tile in a section: every element whose children are all
    spans is a tile, and each span is one line."""
    tiles = node.find_all(lambda child: child.tag == 'div' and child.children and all(isinstance(line, Node) and line.tag == 'span' for line in child.children))
    return [[visible_text(line) for line in tile.children] for tile in tiles]


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
    errors.extend(frame_errors(root))

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
    errors.extend(page_model.bare_place_errors(title, description, main_text))
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    # Identity: the page names the program and school the raw data says it is.
    institution = model_page['institution']
    header = root.find(lambda node: node.attributes.get('data-section') == 'header')
    header_text = visible_text(header) if header else ''
    # After the title: the kind of school, its city, how many graduate a year
    # (when the data has it), then the one source line. Nothing else.
    graduates = model_page['graduates']
    facts = [institution_kind(institution), f"{institution['CITY']}, {institution['STABBR']}"]
    if graduates:
        facts.append(f'About {count(graduates)} graduates a year')
    expected_end = ' '.join([h1, *facts, SOURCE_LINE])
    if not header_text.endswith(expected_end):
        errors.append(f'header should end with {expected_end!r}, found {header_text[-len(expected_end) - 40:]!r}')
    if not header_text.startswith(f"Home {STATE_NAMES[institution['STABBR']]} "):
        errors.append('breadcrumb does not start with Home and the state')
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
    official = expectations['#official']
    present_sections = {
        node.attributes['data-section']: node
        for node in main.find_all(lambda node: 'data-section' in node.attributes)
    }
    # The old header named the credential and the official field ("Bachelor's in
    # Registered Nursing..."). That line now belongs in "About this data".
    if f"{CREDENTIAL_LABELS[credential_level]} in {official}" in header_text or 'BLS wages' in header_text:
        errors.append('header still shows the official field name or the old source line')
    shown_order = list(present_sections)
    if shown_order != [name for name in SECTION_ORDER if name in present_sections]:
        errors.append(f'sections are in the wrong order or unknown: {shown_order}')
    # The school's and the field's own names are not our wording.
    our_text = visible_text(main, skip_names=True).replace(school_name, ' ').replace(institution['INSTNM'], ' ').replace(official, ' ')
    for pattern in RETIRED_WORDING:
        found = re.search(pattern, our_text)
        if found:
            errors.append(f'retired wording {pattern!r}: ...{our_text[max(0, found.start() - 40):found.end() + 40]}...')
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
        # The official field title is a name, not data, even when it has digits.
        actual = Counter(number_tokens(text.replace(official, ' '), school_name))
        if actual != expectation.tokens:
            missing = expectation.tokens - actual
            extra = actual - expectation.tokens
            errors.append(f'section {name} numbers differ: missing {dict(missing)}, unexpected {dict(extra)}')
        for pattern, should_match in expectation.claims:
            if bool(re.search(pattern, text)) != should_match:
                errors.append(f'section {name}: wording {pattern!r} should {"" if should_match else "not "}appear')
        if name == 'summary':
            # One paragraph when the summary is short. Otherwise one for pay and one
            # for debt, each with its own sentences and nothing else.
            paragraphs = [visible_text(paragraph) for paragraph in node.find_all(lambda child: child.tag == 'p')]
            heading = node.find(lambda child: child.tag == 'h2')
            whole = ' '.join(paragraphs)
            wanted = 1 if len(whole) <= ONE_PARAGRAPH_LIMIT else 2
            if heading is None or visible_text(heading) != 'Summary' or len(paragraphs) != wanted:
                errors.append(f'section summary: expected the heading "Summary" and {wanted} paragraphs, found {len(paragraphs)}')
            elif not re.fullmatch(rf'.* {expectation.pay_pattern} {expectation.debt_pattern}', whole):
                errors.append(f'section summary: sentences are not pay first and then debt: {whole!r}')
            elif wanted == 2 and not (re.fullmatch(rf'.* {expectation.pay_pattern}', paragraphs[0]) and re.fullmatch(expectation.debt_pattern, paragraphs[1])):
                errors.append(f'section summary: the paragraphs do not break between pay and debt: {paragraphs!r}')
        for part, read in (('rows', table_rows), ('tiles', tile_lines)):
            wanted_part = getattr(expectation, part, None)
            if wanted_part is not None and read(node) != wanted_part:
                errors.append(f'section {name}: {part} read {read(node)}, expected {wanted_part}')
        if name == 'compare':
            head = [visible_text(cell) for cell in node.find_all(lambda child: child.tag == 'th')]
            if head != [school_name if cell is None else cell for cell in expectation.head]:
                errors.append(f'section compare: column headings are {head}')
        if name == 'over-time':
            bars = [re.findall(r'\$[\d,]+', visible_text(bar)) for bar in node.find_all(lambda child: child.attributes.get('data-slot') == 'pay-bar')]
            if bars != [[amount] for amount in expectation.bars]:
                errors.append(f'section over-time: bars show {bars}, expected {expectation.bars}')
        if name == 'careers':
            # Each job's text, whole and in order, so one job can't carry another's sentences.
            rows = [heading.parent for heading in node.find_all(lambda child: child.tag == 'h3')]
            shown = [visible_text(row.find(lambda child: child.tag == 'p')) for row in rows]
            if shown != expectation.job_texts:
                differing = next((position for position, pair in enumerate(zip(shown, expectation.job_texts)) if pair[0] != pair[1]), min(len(shown), len(expectation.job_texts)))
                errors.append(f"section careers: job {differing + 1} reads {shown[differing] if differing < len(shown) else None!r}, expected {expectation.job_texts[differing] if differing < len(expectation.job_texts) else None!r}")
        if name == 'scatter':
            circles = node.find_all(lambda child: child.tag == 'circle')
            if len(circles) != len(model_page['state_both']) or len(circles) < 5:
                errors.append(f"scatter has {len(circles)} dots, expected {len(model_page['state_both'])} (at least 5)")
            # The chart's own words: two axis titles and the current school's name.
            chart_words = [label.raw_text().strip() for label in node.find_all(lambda child: child.tag == 'text') if not label.raw_text().strip().startswith('$')]
            if chart_words != ['Median federal debt at graduation', 'Median first-year pay', school_name]:
                errors.append(f'scatter chart shows the words {chart_words}')

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

    # Both lists of questions, in page order: the four under the key figures, then
    # the common questions (the fourth only when the data says where graduates
    # work). An answer is every paragraph of its panel. The JSON-LD holds the same.
    visible_faq = []
    wanted_counts = {'key-figure-questions': [4], 'faq': [3, 4]}
    for list_name, counts in wanted_counts.items():
        questions_node = present_sections.get(list_name)
        items = questions_node.find_all(lambda child: child.attributes.get('data-slot') == 'accordion-item') if questions_node is not None else []
        if len(items) not in counts:
            errors.append(f'{list_name} has {len(items)} questions, expected {" or ".join(map(str, counts))}')
        for item in items:
            question_node = item.find(lambda child: child.tag == 'button')
            answer_node = item.find(lambda child: child.attributes.get('data-slot') == 'accordion-content')
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
