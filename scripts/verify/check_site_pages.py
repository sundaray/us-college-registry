#!/usr/bin/env python3
"""Checks the built home page and the navbar's list pages (/programs, /schools,
/careers) against the public data in data/raw.

Same approach as check_program_pages.py: page_model.py works out, from data/raw
only, every number each page must show; this script compares that, section by
section, with the built HTML, and checks each listed row and its link.

Usage:
  python3 scripts/verify/check_site_pages.py --html-dir dist/client --pages pages.txt --report report.json
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_model  # noqa: E402
from check_program_pages import FORBIDDEN_PATTERNS, Expectation, number_tokens, parse_html, visible_text  # noqa: E402
from page_model import count, money, percent_number  # noqa: E402

CREDENTIAL_LABELS = {1: 'Certificate', 2: "Associate's", 3: "Bachelor's"}
CREDENTIAL_SLUGS = {1: 'certificate', 2: 'associate', 3: 'bachelors'}
HOME_LIST_COUNT = 8
NURSING_NOTE = r'\(RN-to-BSN\)\. College Scorecard counts them with programs for new students'
SITE_STATIC_PHRASES = ['Economic Analysis, 2024']
TITLES = {
    '/': 'Compare US College Programs by Graduate Pay, Debt, and Careers',
    '/programs': 'US College Programs by Field, Ranked by Graduate Pay and Debt',
    '/schools': 'US Colleges and Trade Schools by State, With Graduate Pay and Debt',
    '/careers': 'Careers That US College Programs Lead To, by Pay and Job Growth',
}


class Site:
    """Everything the four pages list, from data/raw."""

    def __init__(self, model):
        self.model = model
        field_names = page_model.load_field_names()
        degrees = page_model.load_degree_abbreviations()
        occupation_names = page_model.load_occupation_names()
        state_names = page_model.load_state_names()

        self.programs = []
        for (cip, level) in model.page_rows_by_field:
            benchmark = model.benchmark(model.national[(cip, level)])
            slug = f'{page_model.slugify(field_names[cip])}-{CREDENTIAL_SLUGS[level]}'
            self.programs.append({
                'cip': cip, 'level': level, 'href': f'/programs/{slug}', 'slug': slug,
                'label': f"{field_names[cip]} ({degrees.get((cip, level)) or CREDENTIAL_LABELS[level]})",
                'count': benchmark['year1_count'], 'pay': benchmark['year1'], 'debt': benchmark['debt'],
            })

        self.careers = []
        for code in model.career_fields():
            wage = model.wages[('US', code)]
            projection = model.projections.get(code, {})
            self.careers.append({
                'code': code, 'name': occupation_names.get(code, wage['title']), 'pay': wage['median'],
                'jobs': wage['employment'], 'growth': projection.get('growth_percent'),
            })
        for career in self.careers:
            career['href'] = f"/careers/{page_model.slugify(career['name'])}"
            career['pay_rank'] = 1 + sum(1 for other in self.careers if other['pay'] > career['pay'])

        totals = defaultdict(int)
        for (unit_id, _level), rows in model.school.items():
            totals[unit_id] += len(rows)
        self.schools_by_state = defaultdict(dict)
        for unit_id in model.page_unit_ids:
            state = model.institutions[unit_id]['STABBR']
            self.schools_by_state[state_names[state]][unit_id] = totals[unit_id]
        self.state_names = sorted(self.schools_by_state)

        self.counts = {
            'program_pages': len(model.page_rows),
            'schools': len(model.page_unit_ids),
            'school_pages': sum(1 for unit_id in model.page_unit_ids if totals[unit_id] >= 2),
            'state_rankings': sum(1 for rows in model.state.values() if any(id(row) in model.page_ids for row in rows)),
            'nationals': len(self.programs),
            'careers': len(self.careers),
        }


def growth_label(growth_percent):
    share = Fraction(growth_percent) / 100
    whole = percent_number(abs(share))
    if whole == 0:
        return '0%'
    return f'+{whole}%' if share > 0 else f'−{whole}%'


def home_sections(site):
    sections = {}
    counts = site.counts
    header = sections['header'] = Expectation(True)
    header.add(count(counts['program_pages']), count(counts['school_pages']), count(counts['state_rankings']), count(counts['careers']))

    sections['states'] = Expectation(True)

    common = sorted(site.programs, key=lambda program: (-program['count'], program['slug']))[:HOME_LIST_COUNT]
    paying = sorted((program for program in site.programs if program['level'] == 3), key=lambda program: (-program['pay'], program['slug']))[:HOME_LIST_COUNT]
    fields = sections['fields'] = Expectation(True)
    for program in common + paying:
        fields.add(count(program['count']), money(program['pay']))
    fields.add(count(counts['nationals']), count(counts['nationals']))
    fields.claim(NURSING_NOTE, any(program['cip'] == '5138' and program['level'] == 3 for program in common + paying))
    fields.rows = [program['href'] for program in common + paying]

    largest = sorted(site.careers, key=lambda career: (-(career['jobs'] or -1), career['href']))[:HOME_LIST_COUNT]
    careers = sections['careers'] = Expectation(True)
    for career in largest:
        careers.add(money(career['pay']))
        if career['jobs'] is not None:
            careers.add(count(career['jobs']))
    careers.add(count(counts['careers']))
    careers.rows = [career['href'] for career in largest]

    sections['sources'] = Expectation(True)
    description = sections['#description'] = Expectation(True)
    description.add(count(counts['program_pages']), count(counts['schools']), count(counts['careers']))
    return sections


def check_home(root, main, site, errors):
    states = main.find(lambda node: node.attributes.get('data-section') == 'states')
    links = [anchor.attributes.get('href') for anchor in states.find_all(lambda node: node.tag == 'a')] if states else []
    expected = [f'/states/{page_model.state_slug(name)}' for name in site.state_names]
    if links != expected:
        errors.append(f'section states: links {links[:3]}..., expected {len(expected)} state pages A to Z')


def check_listed_links(node, expected_hrefs, name, errors):
    hrefs = [anchor.attributes.get('href') for anchor in node.find_all(lambda child: child.tag == 'a') if anchor.attributes.get('href') in expected_hrefs]
    if hrefs != expected_hrefs:
        errors.append(f'section {name}: listed links {hrefs}, expected {expected_hrefs}')


def programs_sections(site):
    sections = {}
    for level in (3, 2, 1):
        rows = [program for program in site.programs if program['level'] == level]
        for program in rows:
            program['rank'] = 1 + sum(1 for other in rows if other['pay'] > program['pay'])
        section = sections[f'programs-{level}'] = Expectation(bool(rows))
        for program in rows:
            section.add(str(program['rank']), count(program['count']), money(program['pay']), money(program['debt']))
        section.claim(NURSING_NOTE, level == 3 and any(program['cip'] == '5138' for program in rows))
        section.rows = rows
    description = sections['#description'] = Expectation(True)
    description.add(count(site.counts['nationals']))
    return sections


def check_program_rows(node, expectation, name, errors):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-href' in child.attributes)
    expected = {program['href']: program for program in expectation.rows}
    if sorted(row.attributes['data-href'] for row in rows) != sorted(expected):
        errors.append(f'section {name}: table rows are not the expected programs')
        return
    for row in rows:
        program = expected[row.attributes['data-href']]
        shown = [visible_text(cell) for cell in row.find_all(lambda child: child.tag == 'td')]
        wanted = [str(program['rank']), program['label'], count(program['count']), money(program['pay']), money(program['debt'])]
        if shown != wanted:
            errors.append(f"section {name}: {program['href']} shows {shown}, expected {wanted}")
        link = row.find(lambda child: child.tag == 'a')
        if link is None or link.attributes.get('href') != program['href']:
            errors.append(f"section {name}: {program['href']} is not linked")


def schools_sections(site):
    sections = {}
    for state_name in site.state_names:
        schools = site.schools_by_state[state_name]
        section = sections[f'state-{page_model.state_slug(state_name)}'] = Expectation(True)
        section.add(count(len(schools)))
        for total in schools.values():
            section.add(count(total))
        section.rows = schools
        section.state_name = state_name
    description = sections['#description'] = Expectation(True)
    description.add(count(site.counts['schools']))
    return sections


def check_school_rows(node, expectation, name, errors):
    items = node.find_all(lambda child: child.tag == 'li' and 'data-unit-id' in child.attributes)
    if sorted(item.attributes['data-unit-id'] for item in items) != sorted(expectation.rows):
        errors.append(f'section {name}: listed schools are not the expected schools')
        return
    for item in items:
        unit_id = item.attributes['data-unit-id']
        total = expectation.rows[unit_id]
        link = item.find(lambda child: child.tag == 'a')
        segments = (link.attributes.get('href', '') if link else '').strip('/').split('/')
        if segments[0] != 'schools' or len(segments) != (2 if total >= 2 else 3):
            errors.append(f'section {name}: {unit_id} links to {segments}')
        if visible_text(item, skip_names=True) != count(total):
            errors.append(f'section {name}: {unit_id} shows {visible_text(item, skip_names=True)!r} programs, expected {count(total)}')
    state_link = node.find(lambda child: child.tag == 'a' and child.attributes.get('href') == f'/states/{page_model.state_slug(expectation.state_name)}')
    if state_link is None:
        errors.append(f'section {name}: no link to the state page')


def careers_sections(site):
    sections = {}
    section = sections['careers'] = Expectation(True)
    for career in site.careers:
        section.add(str(career['pay_rank']), money(career['pay']))
        if career['jobs'] is not None:
            section.add(count(career['jobs']))
        if career['growth'] is not None:
            label = growth_label(career['growth'])
            section.add(label.lstrip('+−'))
    section.rows = site.careers
    description = sections['#description'] = Expectation(True)
    description.add(count(site.counts['careers']))
    return sections


def check_career_rows(node, expectation, errors):
    rows = node.find_all(lambda child: child.tag == 'tr' and 'data-soc' in child.attributes)
    expected = {career['code']: career for career in expectation.rows}
    if sorted(row.attributes['data-soc'] for row in rows) != sorted(expected):
        errors.append('section careers: table rows are not the expected careers')
        return
    previous = None
    for row in rows:
        career = expected[row.attributes['data-soc']]
        shown = [visible_text(cell) for cell in row.find_all(lambda child: child.tag == 'td')]
        wanted = [
            str(career['pay_rank']), career['name'], money(career['pay']),
            count(career['jobs']) if career['jobs'] is not None else 'Not reported',
            growth_label(career['growth']) if career['growth'] is not None else 'Not reported',
        ]
        if shown != wanted:
            errors.append(f"section careers: {career['code']} shows {shown}, expected {wanted}")
        link = row.find(lambda child: child.tag == 'a')
        if link is None or link.attributes.get('href') != career['href']:
            errors.append(f"section careers: {career['code']} links to {link.attributes.get('href') if link else None}")
        if previous is not None and career['pay'] > previous:
            errors.append('section careers: rows are not in order of pay')
        previous = career['pay']


def check_page(html_text, site, page_path):
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
    if title != TITLES.get(page_path) or h1 != title:
        errors.append(f'title or H1 is not the expected {TITLES.get(page_path)!r}: {title!r}, {h1!r}')
    if not description:
        errors.append('missing meta description')
    if len(title) > 60:
        warnings.append(f'title is {len(title)} characters')
    if len(description) > 160:
        warnings.append(f'description is {len(description)} characters')
    main = root.find(lambda node: node.tag == 'main')
    if main is None:
        return {'page': page_path, 'errors': errors + ['no <main>'], 'warnings': warnings, 'links': []}
    main_text = visible_text(main)
    for pattern in FORBIDDEN_PATTERNS:
        for place, text in (('title', title), ('description', description), ('page', main_text)):
            if re.search(pattern, text):
                errors.append(f'forbidden text {pattern} in {place}')

    builders = {'/': home_sections, '/programs': programs_sections, '/schools': schools_sections, '/careers': careers_sections}
    if page_path not in builders:
        return {'page': page_path, 'errors': errors + [f'unknown page {page_path}'], 'warnings': warnings, 'links': []}
    expectations = builders[page_path](site)

    def tokens(text):
        for phrase in SITE_STATIC_PHRASES:
            text = text.replace(phrase, ' ')
        return Counter(number_tokens(text, ''))

    present = {node.attributes['data-section']: node for node in main.find_all(lambda node: 'data-section' in node.attributes)}
    unexpected = set(present) - set(expectations) - ({'header'} if page_path != '/' else set())
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
        actual = tokens(visible_text(node, skip_names=True))
        if actual != expectation.tokens:
            errors.append(f'section {name} numbers differ: missing {dict(expectation.tokens - actual)}, unexpected {dict(actual - expectation.tokens)}')
        for pattern, should_match in expectation.claims:
            if bool(re.search(pattern, visible_text(node))) != should_match:
                errors.append(f'section {name}: wording {pattern!r} should {"" if should_match else "not "}appear')
        if page_path == '/' and name in ('fields', 'careers'):
            check_listed_links(node, expectation.rows, name, errors)
        if page_path == '/programs':
            check_program_rows(node, expectation, name, errors)
        if page_path == '/schools':
            check_school_rows(node, expectation, name, errors)
        if page_path == '/careers':
            check_career_rows(node, expectation, errors)
    if page_path == '/':
        check_home(root, main, site, errors)
    if page_path != '/':
        header = present.get('header')
        if header is None or not header.find(lambda node: node.tag == 'a' and node.attributes.get('href') == '/'):
            errors.append('breadcrumb link to the home page missing')
        facts = {
            '/programs': [f"{count(site.counts['nationals'])} kinds of programs"],
            '/schools': [f"{count(site.counts['schools'])} schools", f"{count(len(site.state_names))} states and territories"],
            '/careers': [f"{count(site.counts['careers'])} careers"],
        }[page_path]
        header_text = visible_text(header) if header is not None else ''
        for fact in facts:
            if fact not in header_text:
                errors.append(f'header does not show {fact!r}')

    if tokens(description) != expectations['#description'].tokens:
        errors.append(f"description numbers differ: expected {dict(expectations['#description'].tokens)}, found {dict(tokens(description))}")

    navbar = root.find(lambda node: node.tag == 'nav' and node.attributes.get('aria-label') == 'Main')
    nav_links = [anchor.attributes.get('href') for anchor in navbar.find_all(lambda node: node.tag == 'a')] if navbar else []
    if nav_links != ['/programs', '/schools', '/careers']:
        errors.append(f'navbar links {nav_links}')

    links = sorted({node.attributes['href'] for node in root.find_all(lambda node: node.tag == 'a' and node.attributes.get('href', '').startswith('/'))})
    return {'page': page_path, 'title': title, 'description': description, 'errors': errors, 'warnings': warnings, 'links': links}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--html-dir', required=True)
    parser.add_argument('--pages', required=True)
    parser.add_argument('--report', required=True)
    arguments = parser.parse_args()
    site = Site(page_model.Model())
    results = []
    for page_path in [line.strip() for line in Path(arguments.pages).read_text().splitlines() if line.strip()]:
        file_path = Path(arguments.html_dir) / ('index.html' if page_path == '/' else page_path.strip('/') + '.html')
        if not file_path.exists():
            results.append({'page': page_path, 'errors': [f'no built file {file_path}'], 'warnings': [], 'links': []})
            continue
        results.append(check_page(file_path.read_text(), site, page_path))
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
