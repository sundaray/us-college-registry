"""What a job row in a careers section must say, worked out from the BLS files.

Shared by the checkers of the page types whose careers sections write each job
as full sentences. It is an independent copy of the wording rules in
src/lib/job-copy.ts.
"""

import re

import page_model
from page_model import count, money, percent_number

# BLS "typical education needed for entry" and "work experience in a related
# occupation", as the careers section words them.
EDUCATION_NEEDED = {
    "Bachelor's degree": "a bachelor's degree",
    "Master's degree": "a master's degree",
    "Associate's degree": "an associate's degree",
    'Doctoral or professional degree': 'a doctoral or professional degree',
    'High school diploma or equivalent': 'a high school diploma or equivalent',
    'Postsecondary nondegree award': 'a certificate from a program after high school',
    'Some college, no degree': 'some college but no degree',
    'No formal educational credential': 'no diploma or degree',
}
EXPERIENCE_NEEDED = {
    '5 years or more': ' and at least 5 years of experience in a related job',
    'Less than 5 years': ' and some experience in a related job (less than 5 years)',
}


def lowercase_words(name):
    """A job name as it reads inside a sentence: lowercased word by word, keeping
    words written in capitals (HVAC)."""
    return ' '.join(word if word.isupper() else word.lower() for word in name.split())


def matching_job_names():
    """CIP code to the plural name of its one matching job, from
    scripts/reference/matching-occupations.ts ("registered nurses")."""
    text = (page_model.REFERENCE / 'matching-occupations.ts').read_text()
    return dict(re.findall(r"'(\d{4})': \{\s*socCode: '\d{2}-\d{4}',\s*pluralName: '([^']+)'", text))


def matching_job_short_names():
    """CIP code to the singular name of its one matching job, from the same file
    ("registered nurse")."""
    text = (page_model.REFERENCE / 'matching-occupations.ts').read_text()
    return dict(re.findall(r"'(\d{4})': \{\s*socCode: '\d{2}-\d{4}',\s*pluralName: '[^']+',\s*shortName: '([^']+)'", text))


def shown_pay(occupation):
    """The pay a row shows: the area's own figure, or the national one without it."""
    return occupation['state_median'] if occupation['state_median'] is not None else occupation['national_median']


def job_tokens(expectation, occupation):
    """Numbers a job row shows: pay (as the large figure and again in its
    sentence), employment, growth, openings, experience, and the pay range."""
    expectation.add(money(shown_pay(occupation)), money(shown_pay(occupation)))
    if occupation.get('state_employment') is not None:
        expectation.add(count(occupation['state_employment']))
    if occupation.get('growth_percent') is not None and occupation.get('openings') is not None:
        growth = percent_number(abs(occupation['growth_percent'] / 100))
        if growth != 0:
            expectation.add(f'{growth}%')
        expectation.add(count(page_model.round_half_up(occupation['openings'] * 1000)))
    if occupation.get('education') and occupation.get('experience'):
        # BLS work experience text, such as "Less than 5 years".
        expectation.add(*re.findall(r'\d+', occupation['experience']))
    if occupation['state_median'] is not None and occupation.get('p10') is not None and occupation.get('p90') is not None:
        expectation.add(money(occupation['p10']), money(occupation['p90']))


def start_sentence(occupation):
    """What people typically need to start in the job, as the page words it."""
    experience = EXPERIENCE_NEEDED.get(occupation.get('experience') or '', '')
    return f"To start in this job, people typically need {EDUCATION_NEEDED[occupation['education']]}{experience}."


def job_text(occupation, name, area):
    """The whole text of one job row, sentence by sentence. `area` is the place
    the figures describe: "the US" or a state's name."""
    capitalized = f'{name[0].upper()}{name[1:]}'
    if occupation['state_median'] is not None:
        parts = [f"{capitalized} earn a median of {money(occupation['state_median'])} a year in {area}."]
    else:
        parts = [f"{capitalized} earn a median of {money(occupation['national_median'])} a year nationwide."]
    if occupation.get('state_employment') is not None:
        parts.append(f"{count(occupation['state_employment'])} people work in this job in {area}.")
    if occupation.get('growth_percent') is not None and occupation.get('openings') is not None:
        growth = percent_number(abs(occupation['growth_percent'] / 100))
        change = 'projected to stay about the same in number' if growth == 0 else f"projected to {'grow' if occupation['growth_percent'] > 0 else 'shrink'} {growth}%"
        parts.append(f"Nationally, jobs are {change} from 2025 to 2035, with about {count(page_model.round_half_up(occupation['openings'] * 1000))} openings a year.")
    if occupation.get('education'):
        parts.append(start_sentence(occupation))
    return ' '.join(parts)
