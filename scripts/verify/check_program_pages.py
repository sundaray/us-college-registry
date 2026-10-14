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
import unicodedata
from collections import Counter, defaultdict
from fractions import Fraction
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_model  # noqa: E402
import raw_data  # noqa: E402
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


def share_of(expectation, share, programs):
    """How a sentence gives the share of programs with more debt, or with less,
    as a pattern: "87% of those programs", or "nearly all of those programs"
    when the share rounds to 100% but is not all of them. `programs` is a
    pattern for what is counted. Adds the number, when the words show one, to
    the expectation."""
    if percent_number(share) == 100 and share < 1:
        return f'nearly all of {programs}' if programs.startswith('those ') else f'nearly all {programs}'
    expectation.add(percent(share))
    return f'{percent(share)} of {programs}'


# Wording that the two kinds of ranking page share when they rank the programs
# of a graduate degree. The user approved it in the preview of 2026-10-14.
GRADUATE_DEBT_COLUMN_NOTE = r"Debt is the median amount a program's graduates borrowed in federal loans for graduate study at that school\. It only counts graduates who took such loans\. Undergraduate loans and loans taken at other schools are not counted\."
GRADUATE_LOWEST_DEBT_CAUTION = r"A debt figure only counts the graduates who took federal loans for graduate study at the school\. At some programs that is a small part of the class, and each program's own page says how many\."
GRADUATE_RANKING_DATA_NOTES = r"Pay only includes graduates who received federal financial aid\. Debt only includes graduates who took federal loans\. Pay only counts graduates who were working and not enrolled in more school\. Graduates who went straight to further study are not included\. Debt only includes federal loans taken for graduate study at each program's own school\. Undergraduate loans, loans taken at other schools, private loans and credit cards are not counted\."
# Words that belong to one kind of ranking page and must not turn up on the other.
GRADUATE_ONLY_WORDING = [r'graduate study', r'earlier degree', r'such loans']
UNDERGRADUATE_ONLY_WORDING = [r'Parent PLUS', r'several years ago', r'upper left']
# Wording that no ranking page uses any more. The user reworded the paragraphs
# above the tables on 2026-10-14, for every credential.
RETIRED_RANKING_WORDING = [r"don't report a figure", r'This measures', r'State names link', r'A state ranking needs', r'too few (?:in each )?to rank']


def ranking_debt_name(masters):
    return 'median federal debt for graduate study' if masters else 'median federal debt'


def ranking_question_claims(questions, masters):
    """The two answers under a ranking page's key figures that explain debt and
    debt-to-earnings. A graduate figure counts only loans for graduate study at
    the school, and its answers say so."""
    if masters:
        questions.claim(r"What is median federal debt for graduate study\? For a graduate degree, College Scorecard reports the median amount each program's graduates borrowed in federal student loans for graduate study at that school\. It counts only graduates who took federal loans, and it leaves out interest, undergraduate loans, loans taken at other schools and private loans\.")
        questions.claim(r"It is a program's median federal debt for graduate study divided by its graduates' median first-year pay\. A program whose graduates borrowed \$20,000 and earned \$50,000 in their first year would be at 40%\.")
        questions.claim(r'programs that report both figures\. Loans from an earlier degree are not counted\. With them the figure would be higher\.')
    else:
        questions.claim(r"What is median federal debt\? College Scorecard reports the median amount each program's graduates borrowed in federal student loans\. It counts only graduates who took federal loans, and it leaves out interest, Parent PLUS loans and private loans\.")
        questions.claim(r"It is a program's median federal debt divided by its graduates' median first-year pay\. A program whose graduates borrowed \$20,000 and earned \$50,000 in their first year would be at 40%\.")
    questions.claim(r'earlier degree', masters)


def ranking_about_claims(about, masters, has_five_year_pay, after_years):
    """The lines of "About this data" that differ between a ranking page of a
    graduate degree and any other. `after_years` is what follows the sentence
    about graduating classes, as a pattern."""
    if masters:
        about.claim(GRADUATE_RANKING_DATA_NOTES)
        years_sentence = class_years_sentence(has_five_year_pay)
        about.add(*number_tokens(years_sentence, ''))
        about.claim(rf'{re.escape(years_sentence)} {after_years}')
    else:
        about.claim(r'Pay and debt only include students who received federal financial aid, and pay only counts graduates who were working and not enrolled in more school\. Debt only includes federal loans\. Private loans and credit cards are not counted\.')
        about.claim(rf'College Scorecard figures describe graduating classes from several years ago\. {after_years}')


def wrong_kind_errors(masters, main_text):
    """An error for each phrase of the other kind of ranking page, and for
    each phrase that no ranking page uses any more."""
    unwanted = UNDERGRADUATE_ONLY_WORDING if masters else GRADUATE_ONLY_WORDING
    errors = [f'wording of the other kind of ranking page: {pattern!r}' for pattern in unwanted if re.search(pattern, main_text)]
    return errors + [f'retired wording {pattern!r}' for pattern in RETIRED_RANKING_WORDING if re.search(pattern, main_text)]


def class_years_sentence(has_five_year_pay):
    """The line in a master's page's "About this data" that names the graduating
    classes, built from the cohort map in College Scorecard's data dictionary."""
    years = raw_data.load_class_years()
    first_year, measured = ' and '.join(years['first_year']), ' and '.join(years['measured'])
    if not has_five_year_pay:
        return f"Pay and debt are for students who graduated in {first_year}. Pay was measured in {measured} and is shown in {years['dollars']} dollars."
    return (f"First-year pay and debt are for students who graduated in {first_year}. "
            f"Pay after 5 years is for students who graduated in {' and '.join(years['five_year'])}. "
            f"Both pay figures were measured in {measured} and are shown in {years['dollars']} dollars.")


def expected_sections(model_page, cip):
    page = model_page
    # A master's page names its debt figure for what it counts, has no section
    # about the school and gives the program's rank at the school in the summary.
    masters = page['masters']
    debt_label = 'Median federal debt for graduate study' if masters else 'Median federal debt'
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
    borrowed = (
        rf"The typical graduate borrowed {re.escape(money(debt))} in federal loans for graduate study at .*"
        if masters else rf"The typical graduate leaves with {re.escape(money(debt))} in federal loans"
    )
    # A master's page gives the comparison and no verdict on it: its debt figure
    # can rest on a small part of a class.
    stands_out = '' if masters else r'Where this program stands out is debt\. '
    debt_is_high = '' if masters else r'Debt is high\. '
    summary.claim(r'stands out|Debt is high|Debt is low', not masters and (low_debt or high_debt))
    if low_debt:
        debt_sentences = [rf"{stands_out}{borrowed}, less than graduates of {share_of(summary, page['lower_than'], '.* programs')} in the country\."]
    elif high_debt:
        debt_sentences = [rf"{debt_is_high}{borrowed}, more than graduates of {share_of(summary, page['higher_than'], '.* programs')} in the country\."]
    else:
        debt_sentences = [rf"{borrowed}, {against_national_median(summary, debt, national['debt'], DEBT_ABOUT_THE_SAME)}\."]
    # The closing remark goes with the subject it is about.
    higher_paying_count = page['state_pay_rank'] - 1
    if page['state_pay_rank'] <= Fraction(state['year1_count'], 4):
        pay_sentences.append(r'This is one of the higher-paying .* (?:degrees|programs) in .*\.')
    elif low_debt and page['percentile'] <= 25 and year1 < state['year1']:
        summary.add(money(state['year1']))
        if masters:
            # The same fact, with the pay sentences and without "Debt is low".
            pay_sentences.append(rf"That is also below the .* median of {re.escape(money(state['year1']))}\.")
        else:
            debt_sentences.append(rf"Debt is low, but pay is also below the .* median of {re.escape(money(state['year1']))}\.")
    elif higher_paying_count >= 3:
        pay_sentences.append(r'Several .* programs report higher pay\.')
    elif higher_paying_count == 2:
        pay_sentences.append(r'Two other .* programs report higher pay\.')
    elif higher_paying_count == 1:
        pay_sentences.append(r'One other .* program reports higher pay\.')
    # The rank among the school's master's programs that report pay closes the
    # pay sentences. A school with one such program has nothing to rank against.
    if masters and page['school_count'] > 1:
        summary.add(ordinal(page['school_rank']), count(page['school_count']))
        pay_sentences.append(rf"At .* the program ranks {ordinal(page['school_rank'])} by first-year pay among the {count(page['school_count'])} master's programs that report it\.")
    summary.claim(r'by first-year pay among', masters and page['school_count'] > 1)
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
    figures.tiles.append([debt_label, money(debt), f'{debt_place} {state_name} programs'])
    figures.add(percent(debt_to_earnings), percent(state['dte']), percent(national['dte']))
    figures.tiles.append(['Debt-to-earnings', percent(debt_to_earnings), f"{state_name} median {percent(state['dte'])}, national {percent(national['dte'])}"])

    # A note under a master's page's key figures: how many people the pay figure
    # and the debt figure each count, across the two classes they describe.
    counted = sections['counted'] = Expectation(masters and bool(page['working']))
    if counted.present:
        counted.add(count(page['working']))
        if page['borrowers']:
            counted.add(count(page['borrowers']))
            counted.claim(rf"^Pay is based on {count(page['working'])} working graduates and debt on {count(page['borrowers'])} borrowers, from two graduating classes\.$")
        else:
            counted.claim(rf"^Pay is based on {count(page['working'])} working graduates, from two graduating classes\.$")

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
    if masters:
        questions.claim(r"What is median federal debt for graduate study\? For a graduate degree, College Scorecard reports the median amount each program's graduates borrowed in federal student loans for graduate study at that school\.")
        questions.claim(rf"it leaves out interest, undergraduate loans, loans taken at other schools and private loans\. For .* graduates that figure is {re.escape(money(debt))}\.")
        questions.claim(r"It is a program's median federal debt for graduate study divided by its graduates' median first-year pay\.")
        questions.claim(rf"and the national median is {percent(national['dte'])}\. Loans from an earlier degree are not counted\. With them the figure would be higher\.")
    else:
        questions.claim(rf"Parent PLUS loans and private loans\. For .* graduates that figure is {re.escape(money(debt))}\.")
    questions.claim(r'Parent PLUS', not masters)
    questions.claim(r'earlier degree', masters)
    questions.claim(rf"For this program that is {re.escape(money(debt))} divided by {re.escape(money(year1))}, which is {percent(debt_to_earnings)}\. A lower figure means graduates owe less compared with what they earn\. The median across {re.escape(state_name)} .* programs is {percent(state['dte'])}, and the national median is {percent(national['dte'])}\.")
    questions.claim(r"College Scorecard: the U\.S\. Department of Education's public database of colleges and their programs, with pay figures drawn from federal tax records\.")
    questions.claim(r"College Scorecard: the U\.S\. Department of Education's public database of colleges and their programs, with debt figures drawn from federal student loan records\.")
    questions.claim(r'would be at 40%|is the median of those figures', False)

    # How this program compares with other programs
    compare = sections['compare'] = Expectation(True)
    if masters:
        compare.claim(rf"^How this program compares with other .* programs The first column shows the median pay and debt of .* graduates\. The other two columns show the median of the same figures across all .* programs that report them, in {re.escape(state_place)} and in the country as a whole\.")
    else:
        compare.claim(r'^How this program compares with other .* programs The first column shows this program, where each figure is the median for its graduates\.')
    compare.claim(r'Debt as share|national figure|How it compares', False)
    # The table, row by row: this program, the state median, the national median.
    compare.head = ['', None, f'{state_name} median', 'National median']
    compare.rows = [['Median first-year pay', money(year1), money(state['year1']), money(national['year1'])]]
    if year5 is not None and state['year5'] is not None and national['year5'] is not None:
        compare.rows.append(['Median pay after 5 years', money(year5), money(state['year5']), money(national['year5'])])
    compare.rows.append([debt_label, money(debt), money(state['debt']), money(national['debt'])])
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
    if masters:
        # The lines over a master's chart say what it shows and how to read a dot.
        scatter.add(count(len(page['state_both'])))
        scatter.claim(rf"The chart below shows {count(len(page['state_both']))} .* programs in {re.escape(state_place)}\. Each dot is one program\. A dot higher up means its graduates earn more in their first year, and a dot further right means they borrowed more in federal loans for graduate study\. The highlighted dot shows where .* sits among them\. Dashed lines mark the {re.escape(state_name)} medians\.")
    scatter.claim(r'Programs in the upper left give graduates higher pay for less debt\.', not masters)
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
        # A master's payment is worked out from the debt for graduate study alone,
        # and the sentence says so next to it.
        payment = rf"means a payment of about {re.escape(money(page['monthly']))} a month, or {share_of_pay:.1f}% of a graduate's typical monthly pay in the first year\."
        if masters:
            repayment.claim(rf"On a standard 10-year plan, the median debt for graduate study {payment} Loans from an earlier degree are not in this figure\. A graduate who has them pays more\.")
        else:
            repayment.claim(rf"On a standard 10-year plan, the median debt {payment}")
        repayment.claim(r'earlier degree', masters)
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
    school = sections['school'] = Expectation(not masters)
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
        # The count is of the school's programs that report pay, and the sentence says so.
        school.claim(rf" ranks {ordinal(page['school_rank'])} by first-year pay among the {count(page['school_count'])} .* programs at .* that report it\.")
        school.claim(r' programs at .* by first-year pay\.', False)
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
    left_with = (
        rf"They borrowed a median of {re.escape(money(debt))} in federal loans for graduate study at .*, "
        if masters else rf"They leave with a median of {re.escape(money(debt))} in federal loans, "
    )
    faq.claim(rf"The median graduate borrowed {re.escape(money(debt))} in federal loans for graduate study at .*, which ranks .* Undergraduate loans and loans taken at other schools are not counted\.", masters)
    if low_debt:
        faq.claim(left_with + rf"less than graduates of {share_of(faq, page['lower_than'], 'those programs')}\.")
    elif high_debt:
        faq.claim(left_with + rf"more than graduates of {share_of(faq, page['higher_than'], 'those programs')}\.")
    else:
        faq.claim(left_with + against_national_median(faq, debt, national['debt'], DEBT_ABOUT_THE_SAME) + r'\.')
    faq.claim(r'of those programs', low_debt or high_debt)
    if page['monthly'] is not None:
        share_of_pay = page_model.round_half_up(Fraction(page['monthly'] * 12 * 100, year1), 1)
        faq.add(money(page['monthly']), f'{share_of_pay:.1f}%')
        faq.claim(rf"On a standard 10-year plan that is about {re.escape(money(page['monthly']))} a month, or {share_of_pay:.1f}% of first-year pay\.")
    faq.claim(r'These figures count only students who finished, and we have no completion rate for this program alone\.')
    # The school's graduation rate describes its undergraduates. A master's page leaves it out.
    shows_graduation = page['graduation_rate'] is not None and not masters
    if shows_graduation:
        faq.add(percent(page['graduation_rate']))
        finish = 'graduate within six years' if page['within_six_years'] else 'finish within one and a half times the normal length of their program'
        faq.claim(rf"Across .*, {percent(page['graduation_rate'])} of first-time, full-time students {finish}\.")
    faq.claim(r'first-time, full-time students', shows_graduation)
    faq.claim(r'On the numbers|yes for most students|It depends on your other options|Debt equals|highest possible early salary|before deciding', False)
    # The last question gives the share who work in the school's state and says
    # nothing of staying or leaving. Where the school reports that the field's
    # programs can be completed online, the answer says so.
    faq.claim(r'What share of .* graduates work in ', in_state_share is not None)
    faq.claim(r'graduates stay in |Most do\.|Many leave\.', False)
    online = page['online'] if in_state_share is not None else None
    if in_state_share is not None:
        faq.add(percent(in_state_share), count(page['working_in_state']), count(page['working']))
        answer = rf"graduates work in {re.escape(state_place)}\? {percent(in_state_share)} \({count(page['working_in_state'])} of {count(page['working'])}\) were working in {re.escape(state_place)} one year after graduating\."
        credential = CREDENTIAL_LABELS[row['CREDLEV']].lower()
        live = 'in other states' if page_model.is_state(state_name) else 'elsewhere'
        if online == 'all':
            answer += rf" .* reports that its {re.escape(credential)} programs in this field can all be completed fully online\. Online students may live {live}\.$"
        elif online == 'some':
            answer += rf" .* reports that at least one of its {re.escape(credential)} programs in this field can be completed fully online\. Online students may live {live}\.$"
        else:
            answer += '$'
        faq.claim(answer)
    faq.claim(r'completed fully online', online is not None)

    # Meta description
    description = sections['#description'] = Expectation(True)
    description.add(money(year1), money(debt))
    if year5 is not None:
        description.add(money(year5))
        description.claim(r'graduates earn \$[\d,]+ in year one and \$[\d,]+ by year five\. ')
    else:
        description.claim(r'graduates earn \$[\d,]+ in year one\. ')
    if low_debt:
        description.claim(rf"{debt_label}: {re.escape(money(debt))}, lower than at {share_of(description, page['lower_than'], 'similar programs')}\.$")
    elif high_debt:
        description.claim(rf"{debt_label}: {re.escape(money(debt))}, higher than at {share_of(description, page['higher_than'], 'similar programs')}\.$")
    else:
        # Both figures and no verdict: the debt can be far from the national median.
        description.add(money(national['debt']))
        description.claim(rf"{debt_label}: {re.escape(money(debt))}\. National median: {re.escape(money(national['debt']))}\.$")
    description.claim(r'near the national median', False)

    # Related pages: the state ranking for this field and credential, the
    # national one, and the school's page. A master's page links to the school's
    # bachelor's program in the same field when that program has a page, and a
    # bachelor's page to the master's program.
    has_school_page = page['school_total'] >= 2
    related = sections['related'] = Expectation(True)
    related.add(count(state['year1_count']))
    related.claim(r'^Related pages .* programs in .*, ranked')
    # Schools with only one program that reports pay have no school page. The
    # school's page lists its master's programs too, and the link counts them.
    if has_school_page:
        related.add(count(page['school_total']))
    related.claim(r'All .* programs, ranked', has_school_page)
    # And the national page for the field and credential.
    related.add(count(national['year1_count']))
    related.claim(r'programs in the US, ranked')
    bachelors_degree = DEGREE_ABBREVIATIONS.get((cip, 3), "Bachelor's")
    related.claim(rf"\({re.escape(bachelors_degree)}\) Tuition, graduate salary and debt", page['bachelors_page'])
    related.claim(r'\) Graduate salary and debt', page['masters_page'])

    official = ' '.join(row['CIPDESC'].split()).rstrip('.')
    about = sections['about-data'] = Expectation(True)
    about.claim(PAY_PRIVACY_NOTE.format(figures='each pay figure'))
    # Said once here, for every rank, median and count of programs on the page.
    about.claim(r"Debt figures are not changed\. Ranks, medians and counts only include programs that report the figure\. The government withholds many programs' figures to protect privacy\. For some schools with several campuses")
    about.claim(rf"^About this data This program is in the field the U\.S\. Department of Education calls \"{re.escape(official)}\"\.")
    about.claim(CAMPUS_RULE.format(state=re.escape(state_name), place=re.escape(state_place)))
    if masters:
        about.claim(r'Pay only includes graduates who received federal financial aid\. Debt only includes graduates who took federal loans\. Pay only counts graduates who were working and not enrolled in more school\. Graduates who went straight to further study are not included\. Debt only includes federal loans taken for graduate study at .*\. Undergraduate loans, loans taken at other schools, private loans and credit cards are not counted\.')
        # The classes the figures describe, as the federal data dictionary gives them.
        years_sentence = class_years_sentence(year5 is not None)
        about.add(*number_tokens(years_sentence, ''))
        about.claim(rf'{re.escape(years_sentence)} Bureau of Labor Statistics wages are from May 2025\. Sources ')
        about.claim(r'School-level numbers|several years ago|grants or loans|[Tt]uition', False)
    else:
        about.claim(r'Pay and debt only include students who received federal financial aid \(grants or loans\)\. Pay only counts graduates who were working and not enrolled in more school\.')
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
CREDENTIAL_LABELS = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's", 5: "Master's"}
DEGREE_ABBREVIATIONS = page_model.load_degree_abbreviations()
REPAYMENT_LABELS = {
    'paidInFull': 'Paid off in full', 'makingProgress': 'Paying down the balance',
    'forbearance': 'Paused payments (forbearance)', 'default': 'In default',
}
# Sections in the order the page shows them. A page leaves out those it has no data for.
SECTION_ORDER = [
    'header', 'summary', 'key-figures', 'counted', 'campuses', 'key-figure-questions', 'compare', 'scatter', 'over-time', 'family-income',
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
    # "More than at more than 99% of" made a reader trip. It is "nearly all" now (the user, 2026-10-13).
    r'than at more than',
    # "The typical graduate leaves with $19,500, less than at 91% of business programs" read stiffly.
    # It is "less than graduates of 91% of" now, as the pay sentence says it (the user, 2026-10-13).
    r'\b(?:less|more) than at\b',
    # A school's page lists its master's programs, so the link to it no longer
    # names undergraduate programs (the user, 2026-10-14).
    r'undergraduate programs, ranked',
]


def graduates_per_year(graduates):
    """How a page gives a program's graduates a year: one graduate, or several."""
    return f"About {count(graduates)} {'graduate' if graduates == 1 else 'graduates'} a year"


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


# ---------------------------------------------------------------------------
# Names and addresses
#
# What the site calls each school and where each program page lives, worked out
# from the federal files and the reviewed lists in scripts/reference. A second
# implementation of the naming and address rules in scripts/build-data.ts.

FIELD_NAMES = page_model.load_field_names()
CREDENTIAL_SLUGS = {1: 'certificate', 2: 'associate', 3: 'bachelors', 5: 'masters'}
# The rules of scripts/reference/school-short-names.ts, in order: the pattern,
# what replaces it, and whether every match is replaced or only the first. A
# second copy on purpose. Its length is compared with the file's. A rule
# added there stops this checker until it is added here.
SHORT_NAME_RULES = [
    (r'\s*-\s*Main Campus$', '', False),
    (r'\s+Main Campus$', '', False),
    (r'-Main$', '', False),
    (r'^The ', '', False),
    (r',? (LLC|Inc)\.?$', '', False),
    (r'^CUNY (.+)$', r'\1', False),
    (r'^(.+) CUNY$', r'\1', False),
    (r' A & M ', ' A&M ', True),
    (r'^University of California-(.+)$', r'UC \1', False),
    (r'^California State University-(.+)$', r'Cal State \1', False),
    (r'^University of Texas at (.+)$', r'UT \1', False),
    (r'^Texas A&M University-(.+)$', r'Texas A&M-\1', False),
    (r'^University of North Carolina at (.+)$', r'UNC \1', False),
    (r'^University of Wisconsin-(.+)$', r'UW-\1', False),
    (r'^University of Massachusetts-(.+)$', r'UMass \1', False),
    (r'^Indiana University-(.+)$', r'IU \1', False),
    (r'^Purdue University (.+)$', r'Purdue \1', False),
    (r'^State University of New York at (.+)$', r'SUNY \1', False),
    (r'^SUNY at (.+)$', r'SUNY \1', False),
    (r'^University of Puerto Rico-(.+)$', r'UPR \1', False),
    (r'^University of South Carolina-(.+)$', r'USC \1', False),
    (r'^(.+?)(?<!&)(?<! and) State University$', r'\1 State', False),
    (r'^(University of Phoenix|DeVry University|Colorado Technical University|Keiser University|Rasmussen University|Chamberlain University)-.+$', r'\1', False),
    (r"^St\. John's University-New York$", "St. John's University", False),
    (r"^Saint Joseph's University - Philadelphia$", "Saint Joseph's University", False),
]


def address_slug(text):
    """A name as it reads in an address (scripts/lib/slug.ts): "Texas A&M"
    becomes "texas-am", and "Arts & Sciences" becomes "arts-and-sciences"."""
    text = re.sub('[̀-ͯ]', '', unicodedata.normalize('NFKD', text)).lower()
    text = re.sub(r'([a-z0-9])&([a-z0-9])', r'\1\2', text).replace('&', ' and ')
    return re.sub(r'[^a-z0-9]+', '-', re.sub("['’]", '', text)).strip('-')


def load_school_short_names():
    """UNITID to the short name written by hand for a well-known school."""
    text = (page_model.REFERENCE / 'school-short-names.ts').read_text()
    if text.count('{ pattern: ') != len(SHORT_NAME_RULES):
        raise ValueError('school-short-names.ts and SHORT_NAME_RULES in this file no longer hold the same number of rules')
    listed = text.split('export const SCHOOL_SHORT_NAMES', 1)[1].split('type ShortNameRule', 1)[0]
    return {unit_id: single or double for unit_id, single, double in re.findall(r"'(\d+)': (?:'([^']*)'|\"([^\"]*)\")", listed)}


class Identity:
    """The name the site gives every school its pages name, and the address of
    every program page."""

    def __init__(self, model):
        self.model = model
        institutions = model.institutions
        short_names = load_school_short_names()

        # Every school a page names: schools with program pages, and every
        # school in a state pool that reports pay. A master's pool is named when
        # its field has master's pages: the field's national ranking page lists
        # every program in it.
        named = set(model.page_unit_ids) | {row['UNITID'] for row in model.masters_rows}
        for (cip, level, _state), rows in model.state.items():
            if level == raw_data.MASTERS_LEVEL and (cip, level) not in model.masters_rows_by_field:
                continue
            named.update(row['UNITID'] for row in rows if row['EARN_MDN_1YR'] is not None)

        # A school's names, shortest first. When two schools would share a name,
        # both move to the next one: the short name, the official name, then the
        # official name with the state, then with the city too.
        def name_steps(unit_id):
            institution = institutions[unit_id]
            official = institution['INSTNM']
            short = short_names.get(unit_id)
            if short is None:
                short = official.strip()
                for pattern, replacement, every_match in SHORT_NAME_RULES:
                    short = re.sub(pattern, replacement, short, count=0 if every_match else 1)
            state_name = STATE_NAMES.get(institution['STABBR'], institution['STABBR'])
            return [short, official, f'{official} ({state_name})', f"{official} ({institution['CITY']}, {state_name})"]

        steps = {unit_id: name_steps(unit_id) for unit_id in named}
        step_of = dict.fromkeys(named, 0)
        for _ in range(4):
            sharing = defaultdict(list)
            for unit_id in named:
                sharing[steps[unit_id][step_of[unit_id]]].append(unit_id)
            moved = False
            for unit_ids in sharing.values():
                for unit_id in unit_ids if len(unit_ids) > 1 else []:
                    if step_of[unit_id] < 3:
                        step_of[unit_id] += 1
                        moved = True
            if not moved:
                break
        self.names = {unit_id: steps[unit_id][step_of[unit_id]] for unit_id in named}

        # Addresses. A school's address is its name. Schools with the same name
        # all add the state, then the city, then the UNITID.
        def name_slug(unit_id):
            return address_slug(re.sub(r'^The\s+', '', institutions[unit_id]['INSTNM'], flags=re.I))

        def longer_slugs(unit_id):
            institution = institutions[unit_id]
            state, city = address_slug(institution['STABBR']), address_slug(institution['CITY'])
            return [f'{name_slug(unit_id)}-{state}', f'{name_slug(unit_id)}-{city}-{state}', f'{name_slug(unit_id)}-{unit_id}']

        sharing = defaultdict(list)
        for unit_id in model.page_unit_ids:
            sharing[name_slug(unit_id)].append(unit_id)
        self.school_slugs = {}
        for slug, unit_ids in sharing.items():
            if len(unit_ids) == 1:
                self.school_slugs[unit_ids[0]] = slug
                continue
            for step in range(3):
                slugs = [longer_slugs(unit_id)[step] for unit_id in unit_ids]
                if len(set(slugs)) == len(slugs) or step == 2:
                    self.school_slugs.update(zip(unit_ids, slugs))
                    break
        # A school with master's pages only takes the first address that no
        # school has yet, in the order of the federal file.
        for row in model.masters_rows:
            unit_id = row['UNITID']
            if unit_id not in self.school_slugs:
                taken = set(self.school_slugs.values())
                self.school_slugs[unit_id] = next(slug for slug in [name_slug(unit_id), *longer_slugs(unit_id)] if slug not in taken)

    def program_slug(self, cip, credential_level):
        return f'{address_slug(FIELD_NAMES[cip])}-{CREDENTIAL_SLUGS[credential_level]}'

    def address(self, unit_id, cip, credential_level):
        return f'/schools/{self.school_slugs[unit_id]}/{self.program_slug(cip, credential_level)}'

    def has_page(self, unit_id, cip, credential_level):
        row = self.model.kept_by_unit.get((unit_id, cip, credential_level))
        return row is not None and id(row) in (self.model.masters_ids if credential_level == raw_data.MASTERS_LEVEL else self.model.page_ids)

    def every_address(self):
        """The address of every program page the federal files call for."""
        return {self.address(row['UNITID'], row['CIPCODE'], row['CREDLEV']) for row in [*self.model.page_rows, *self.model.masters_rows]}


def links_in(node):
    return [anchor.attributes.get('href', '') for anchor in node.find_all(lambda child: child.tag == 'a')] if node is not None else []


def chart_errors(node, programs, medians, highlighted=None):
    """Reads the chart as a reader would, against its own axis labels. Every dot
    must sit at the pay and debt of one program in the federal file, and the
    dashed lines at the state medians. `programs` holds each program's (debt,
    pay) and `medians` the state's. On the page of one program, `highlighted`
    is that program's (debt, pay): its dot is larger and drawn last. A ranking
    page highlights no dot."""
    def number(element, name):
        return float(element.attributes[name])

    def thousands(label):
        return int(label.raw_text().strip().removeprefix('$').removesuffix('k')) * 1000

    # Each pay label sits beside its grid line. Each debt label sits under its value.
    pay_marks, debt_marks = [], []
    for label in node.find_all(lambda child: child.tag == 'text' and child.raw_text().strip().startswith('$')):
        if label.attributes.get('text-anchor') == 'end':
            pay_marks.append((thousands(label), number(label.parent.find(lambda child: child.tag == 'line'), 'y1')))
        else:
            debt_marks.append((thousands(label), number(label, 'x')))

    def reading(marks, axis):
        """Turns a position on an axis into dollars, from its first and last labels."""
        if len(marks) < 2 or marks[0][1] == marks[-1][1]:
            raise ValueError(f'the {axis} axis has {len(marks)} labels')
        (first_value, first_position), (last_value, last_position) = marks[0], marks[-1]
        dollars_per_unit = (last_value - first_value) / (last_position - first_position)
        read = lambda position: first_value + (position - first_position) * dollars_per_unit
        if any(abs(read(position) - value) > 0.5 for value, position in marks):
            raise ValueError(f'the labels of the {axis} axis are not evenly placed: {marks}')
        return read

    try:
        read_debt, read_pay = reading(debt_marks, 'debt'), reading(pay_marks, 'pay')
    except ValueError as error:
        return [f'scatter chart: {error}']

    errors = []
    circles = node.find_all(lambda child: child.tag == 'circle')
    shown = [(round(read_debt(number(circle, 'cx')), 2), round(read_pay(number(circle, 'cy')), 2)) for circle in circles]
    expected = [(float(debt), float(pay)) for debt, pay in programs]
    if Counter(shown) != Counter(expected):
        errors.append(f'scatter chart: dots sit at {sorted((Counter(shown) - Counter(expected)).elements())[:5]}, where the federal file has programs at {sorted((Counter(expected) - Counter(shown)).elements())[:5]} (debt, pay)')
    large = [position for position, circle in enumerate(circles) if circle.attributes.get('r') != '5']
    if highlighted is None:
        if large:
            errors.append(f'scatter chart: dots {large} are not the size of the others')
    else:
        here = (float(highlighted[0]), float(highlighted[1]))
        if large != [len(circles) - 1] or circles[-1].attributes.get('r') != '7' or shown[-1] != here:
            errors.append(f"scatter chart: the highlighted dot should be drawn last and sit at {here}, found dots {large} and {shown[-1] if shown else None}")
    dashed = [line for line in node.find_all(lambda child: child.tag == 'line') if 'stroke-dasharray' in line.attributes]
    medians = (float(medians[0]), float(medians[1]))
    if len(dashed) != 2:
        errors.append(f'scatter chart: {len(dashed)} dashed lines, expected 2')
    else:
        drawn = (read_debt(number(dashed[0], 'x1')), read_pay(number(dashed[1], 'y1')))
        if abs(drawn[0] - medians[0]) > 0.01 or abs(drawn[1] - medians[1]) > 0.01:
            errors.append(f'scatter chart: dashed lines at {drawn}, and the state medians are {medians} (debt, pay)')
    return errors


def check_page(html_text, model, page_path, identity):
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

    # The page is at the address this program belongs at, and it calls the
    # school and the field what the federal files and the reviewed name lists
    # call them. A master's page shows no tuition, and its title names none.
    expected_path = identity.address(unit_id, cip, credential_level)
    if page_path != expected_path:
        errors.append(f'the page is at {page_path}, and this program belongs at {expected_path}')
    expected_name = identity.names.get(unit_id)
    if school_name != expected_name:
        errors.append(f'the page calls the school {school_name!r}, expected {expected_name!r}')
    degree = DEGREE_ABBREVIATIONS.get((cip, credential_level), CREDENTIAL_LABELS[credential_level])
    title_subject = 'Graduate Salary and Debt' if model_page['masters'] else 'Tuition, Graduate Salary, and Debt'
    expected_title = f'{expected_name} {FIELD_NAMES[cip]} ({degree}): {title_subject}'
    if title != expected_title:
        errors.append(f'title should be {expected_title!r}: {title!r}')

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
        facts.append(graduates_per_year(graduates))
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
            debt_axis = 'Median federal debt for graduate study' if model_page['masters'] else 'Median federal debt at graduation'
            if chart_words != [debt_axis, 'Median first-year pay', school_name]:
                errors.append(f'scatter chart shows the words {chart_words}')
            errors.extend(chart_errors(
                node,
                [(other['DEBT_ALL_STGP_ANY_MDN'], other['EARN_MDN_1YR']) for other in model_page['state_both']],
                (model_page['state']['debt'], model_page['state']['year1']),
                (model_page['debt'], model_page['year1']),
            ))
        if name == 'nearby':
            # Each row names the school the federal file has at that distance,
            # and every row but this program's links to that school's page.
            rows = [row for row in node.find_all(lambda child: child.tag == 'tr') if row.find(lambda child: child.tag == 'td')]
            for row, item in zip(rows, model_page['nearby']):
                other = model.institutions[item['unit_id']]
                named = [visible_text(part) for part in row.find_all(lambda child: 'data-name' in child.attributes)]
                wanted_names = [identity.names.get(item['unit_id']), f"{other['CITY']}, {other['STABBR']} · {CONTROL_LABELS[other['CONTROL']].lower()}"]
                wanted_links = [] if item['current'] else [identity.address(item['unit_id'], cip, credential_level)]
                if named != wanted_names or links_in(row) != wanted_links:
                    errors.append(f'section nearby: a row names {named} and links to {links_in(row)}, expected {wanted_names} and {wanted_links}')
        if name == 'school':
            # The school's other programs, by name, each linked to its own page when it has one.
            listed = model_page['top_programs'] if model_page['school_count'] >= 4 else [top for top in model_page['top_programs'] if top[0] != cip]
            parts = [f'{FIELD_NAMES[top_cip]} ({money(pay)})' for top_cip, pay in listed]
            if parts:
                wanted_text = f"{', '.join(parts[:-1])} and {parts[-1]}." if len(parts) > 1 else f'{parts[0]}.'
                if not visible_text(node).endswith(f' {wanted_text}'):
                    errors.append(f"section school: the school's other programs should read {wanted_text!r}")
            wanted_links = [identity.address(unit_id, top_cip, credential_level) for top_cip, _ in listed if identity.has_page(unit_id, top_cip, credential_level)]
            if links_in(node) != wanted_links:
                errors.append(f'section school: links {links_in(node)}, expected {wanted_links}')
        if name == 'related':
            # The state ranking, the national ranking, the school's bachelor's
            # or master's program in the field, and the school's own page, in
            # that order.
            program_slug = identity.program_slug(cip, credential_level)
            wanted_links = [f"/states/{page_model.state_slug(STATE_NAMES[institution['STABBR']])}/{program_slug}", f'/programs/{program_slug}']
            # Each link's words in full: its title, then the line under it.
            kind = f'{FIELD_NAMES[cip]} {CREDENTIAL_LABELS[credential_level].lower()} programs'
            by_pay_and_debt = lambda programs: f"{count(programs)} programs by pay and debt"
            wanted_words = [
                f"{kind} in {page_model.place_in_sentence(STATE_NAMES[institution['STABBR']])}, ranked {by_pay_and_debt(model_page['state']['year1_count'])}",
                f"{kind} in the US, ranked {by_pay_and_debt(model_page['national']['year1_count'])}",
            ]
            if model_page['bachelors_page']:
                wanted_links.append(identity.address(unit_id, cip, 3))
                bachelors_degree = DEGREE_ABBREVIATIONS.get((cip, 3), CREDENTIAL_LABELS[3])
                wanted_words.append(f'{expected_name} {FIELD_NAMES[cip]} ({bachelors_degree}) Tuition, graduate salary and debt')
            if model_page['masters_page']:
                wanted_links.append(identity.address(unit_id, cip, raw_data.MASTERS_LEVEL))
                masters_degree = DEGREE_ABBREVIATIONS.get((cip, raw_data.MASTERS_LEVEL), CREDENTIAL_LABELS[raw_data.MASTERS_LEVEL])
                wanted_words.append(f'{expected_name} {FIELD_NAMES[cip]} ({masters_degree}) Graduate salary and debt')
            if model_page['school_total'] >= 2:
                wanted_links.append(f'/schools/{identity.school_slugs[unit_id]}')
                wanted_words.append(f"All {expected_name} programs, ranked {by_pay_and_debt(model_page['school_total'])}")
            shown_words = [visible_text(link) for link in node.find_all(lambda child: child.tag == 'a')]
            if shown_words != wanted_words:
                errors.append(f'section related: the links read {shown_words}, expected {wanted_words}')
            if links_in(node) != wanted_links:
                errors.append(f'section related: links {links_in(node)}, expected {wanted_links}')

    shown_careers = [occupation['code'] for occupation in model_page['occupations']
                     if occupation['state_median'] is not None or occupation['national_median'] is not None]
    career_codes = model.career_fields()
    check_career_links(present_sections.get('careers'), shown_careers, career_codes, errors)
    # Each job with a career page links to that page, in the order the jobs are listed.
    wanted_links = [f"/careers/{address_slug(OCCUPATION_NAMES.get(code) or model.wages[('US', code)]['title'])}" for code in shown_careers if code in career_codes]
    if links_in(present_sections.get('careers')) != wanted_links:
        errors.append(f"section careers: links {links_in(present_sections.get('careers'))}, expected {wanted_links}")

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
    parser.add_argument('--complete', action='store_true', help='the list is meant to hold every program page: fail if a program the federal files call for has no page in it')
    arguments = parser.parse_args()

    model = page_model.Model(include_masters=True)
    identity = Identity(model)
    page_paths = [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]
    results = []
    for page_path in page_paths:
        file_path = html_path(arguments.html_dir, page_path)
        if not file_path.exists():
            results.append({'page': page_path, 'errors': [f'no built file {file_path}'], 'warnings': [], 'links': []})
            continue
        results.append(check_page(file_path.read_text(), model, page_path, identity))
    if arguments.complete:
        # A page that should not exist fails its own check. A page that is missing shows up only here.
        for page_path in sorted(identity.every_address() - set(page_paths)):
            results.append({'page': page_path, 'errors': ['the federal files call for this page, and it is not in the list'], 'warnings': [], 'links': []})

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
