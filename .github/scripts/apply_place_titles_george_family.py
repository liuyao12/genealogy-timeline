from __future__ import annotations

import json
import re
from pathlib import Path


APP = Path('app.js')
DATA = Path('data/british-royal-line.json')
INDEX = Path('index.html')


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one match in {path}, found {count}: {old[:180]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


# ---------------------------------------------------------------------------
# Normalize sovereign/consort titles at every import and restore path.
# ---------------------------------------------------------------------------
replace_once(
    APP,
    """import { monarchGroupFromProfile } from './monarch-events.js?v=1';
import { layoutGlobalEventLabels } from './timeline-event-labels.js?v=1';
""",
    """import { monarchGroupFromProfile } from './monarch-events.js?v=1';
import { normalizeBritishRoyalPlaceName } from './royal-title-style.js?v=1';
import { layoutGlobalEventLabels } from './timeline-event-labels.js?v=1';
""",
)

replace_once(
    APP,
    """  const normalized = (Array.isArray(periods) ? periods : []).map(period => {
    const name = clean(period?.name || period?.displayName || period?.display_name || period?.label)
      .replace(/^(?:(?:H\\.?R\\.?H\\.?|H\\.?M\\.?)|(?:His|Her) Royal Highness|(?:His|Her) Majesty)\\s+/i, '');
    let startYear = numericYear(period?.startYear ?? period?.start_year ?? period?.fromYear ?? period?.from);
    let endYear = numericYear(period?.endYear ?? period?.end_year ?? period?.toYear ?? period?.to);
    if (startYear != null && endYear != null && endYear < startYear) [startYear, endYear] = [endYear, startYear];
    return {
""",
    """  const normalized = (Array.isArray(periods) ? periods : []).map(period => {
    let startYear = numericYear(period?.startYear ?? period?.start_year ?? period?.fromYear ?? period?.from);
    let endYear = numericYear(period?.endYear ?? period?.end_year ?? period?.toYear ?? period?.to);
    if (startYear != null && endYear != null && endYear < startYear) [startYear, endYear] = [endYear, startYear];
    const rawName = clean(period?.name || period?.displayName || period?.display_name || period?.label)
      .replace(/^(?:(?:H\\.?R\\.?H\\.?|H\\.?M\\.?)|(?:His|Her) Royal Highness|(?:His|Her) Majesty)\\s+/i, '');
    const name = normalizeBritishRoyalPlaceName(rawName, startYear ?? endYear);
    return {
""",
)

replace_once(
    APP,
    """  const dateYear = value => clean(value).match(/-?\\d{3,4}/)?.[0] || '';
  const sourceUrl = validPublicUrl(source.sourceUrl || source.profile_url || source.profileUrl || '');
""",
    """  const dateYear = value => clean(value).match(/-?\\d{3,4}/)?.[0] || '';
  const birthYear = clean(source.birthYear || source.bYear || birth.year || birth.date?.year || dateYear(source.birth_date));
  const deathYear = clean(source.deathYear || source.dYear || death.year || death.date?.year || dateYear(source.death_date));
  const isLiving = source.isLiving === true || source.is_alive === true;
  const displayReferenceYear = numericYear(deathYear)
    ?? (isLiving ? new Date().getFullYear() : numericYear(birthYear));
  const sourceUrl = validPublicUrl(source.sourceUrl || source.profile_url || source.profileUrl || '');
""",
)

replace_once(
    APP,
    """  const normalizedRawDefaultName = clean(rawDefaultPeriod?.name || rawDefaultPeriod?.displayName || rawDefaultPeriod?.display_name || rawDefaultPeriod?.label)
    .replace(/^(?:(?:H\\.?R\\.?H\\.?|H\\.?M\\.?)|(?:His|Her) Royal Highness|(?:His|Her) Majesty)\\s+/i, '');
  const displayName = clean(source.displayName || source.display_name || (typeof source.name === 'string' ? source.name : ''));
""",
    """  const rawDefaultName = clean(rawDefaultPeriod?.name || rawDefaultPeriod?.displayName || rawDefaultPeriod?.display_name || rawDefaultPeriod?.label)
    .replace(/^(?:(?:H\\.?R\\.?H\\.?|H\\.?M\\.?)|(?:His|Her) Royal Highness|(?:His|Her) Majesty)\\s+/i, '');
  const rawDefaultStartYear = numericYear(rawDefaultPeriod?.startYear ?? rawDefaultPeriod?.start_year ?? rawDefaultPeriod?.fromYear ?? rawDefaultPeriod?.from);
  const rawDefaultEndYear = numericYear(rawDefaultPeriod?.endYear ?? rawDefaultPeriod?.end_year ?? rawDefaultPeriod?.toYear ?? rawDefaultPeriod?.to);
  const normalizedRawDefaultName = normalizeBritishRoyalPlaceName(
    rawDefaultName,
    rawDefaultStartYear ?? rawDefaultEndYear ?? displayReferenceYear
  );
  const displayName = normalizeBritishRoyalPlaceName(
    clean(source.displayName || source.display_name || (typeof source.name === 'string' ? source.name : '')),
    displayReferenceYear
  );
""",
)

replace_once(
    APP,
    """    lastName: clean(source.lastName || source.surname || source.last_name || source.maiden_name),
    displayName,
    title: clean(source.title || source.display_title || source.occupation),
""",
    """    lastName: normalizeBritishRoyalPlaceName(clean(source.lastName || source.surname || source.last_name || source.maiden_name), displayReferenceYear),
    displayName,
    title: normalizeBritishRoyalPlaceName(clean(source.title || source.display_title || source.occupation), displayReferenceYear),
""",
)

replace_once(
    APP,
    """    birthYear: clean(source.birthYear || source.bYear || birth.year || birth.date?.year || dateYear(source.birth_date)),
    deathYear: clean(source.deathYear || source.dYear || death.year || death.date?.year || dateYear(source.death_date)),
    isLiving: source.isLiving === true || source.is_alive === true,
""",
    """    birthYear,
    deathYear,
    isLiving,
""",
)

replace_once(
    APP,
    """    note: clean(source.note || source.addendum || source.about_me),
""",
    """    note: normalizeBritishRoyalPlaceName(clean(source.note || source.addendum || source.about_me), displayReferenceYear),
""",
)

# Saved starter profiles are normalized while loading, so the upgrade's exact
# old-period checks must use the normalized place-based forms.
for old, new in {
    "'Edward VII, King of the United Kingdom'": "'Edward VII, King of Great Britain and Ireland'",
    "'George V, King of the United Kingdom'": "'George V, King of Great Britain and Ireland'",
    "'Edward VIII, King of the United Kingdom'": "'Edward VIII, King of Great Britain and Northern Ireland'",
    "'George VI, King of the United Kingdom'": "'George VI, King of Great Britain and Northern Ireland'",
    "period.name === 'Victoria, Queen of the United Kingdom'": "period.name === 'Victoria, Queen of Great Britain and Ireland'",
}.items():
    replace_once(APP, old, new)

# ---------------------------------------------------------------------------
# Repair and normalize the bundled data.
# ---------------------------------------------------------------------------
data = json.loads(DATA.read_text(encoding='utf-8'))
people = data['people']
data['version'] = 28

SOVEREIGN_UK = re.compile(
    r'\b((?:King|Queen)(?:\s+consort)?)\s+of\s+(?:the\s+)?United Kingdom'
    r'(?:\s+of\s+Great Britain\s+and\s+(?:Ireland|Northern Ireland))?',
    re.IGNORECASE,
)


def year(value: object) -> int | None:
    try:
        return int(str(value)) if value not in (None, '') else None
    except (TypeError, ValueError):
        return None


def place_title(value: object, reference_year: int | None) -> object:
    if not isinstance(value, str) or reference_year is None:
        return value
    places = 'Great Britain and Northern Ireland' if reference_year >= 1927 else 'Great Britain and Ireland'
    revised = SOVEREIGN_UK.sub(lambda match: f'{match.group(1)} of {places}', value)
    revised = re.sub(
        rf'\b({re.escape(places)}) and (Emperor|Empress) of India\b',
        r'\1, \2 of India',
        revised,
    )
    return revised


for person in people.values():
    reference_year = year(person.get('deathYear'))
    if reference_year is None:
        reference_year = 2026 if person.get('isLiving') else year(person.get('birthYear'))
    for field in ('displayName', 'title', 'lastName', 'note'):
        person[field] = place_title(person.get(field, ''), reference_year)
    for period in person.get('namePeriods', []):
        period_reference = year(period.get('startYear')) or year(period.get('endYear')) or reference_year
        period['name'] = place_title(period.get('name', ''), period_reference)

GEORGE_III = 'profile-g6000000003091034586'
CHARLOTTE = 'profile-g6000000003891728922'
GEORGE_IV = 'profile-g4137986493320052463'
WILLIAM_IV = 'profile-g4137989648200126749'
EDWARD_KENT = 'profile-g4087038607800049893'
ADOLPHUS_CAMBRIDGE = 'profile-g6000000000307240333'
GEORGE_CHILDREN = [GEORGE_IV, WILLIAM_IV, EDWARD_KENT, ADOLPHUS_CAMBRIDGE]

for child_id in GEORGE_CHILDREN:
    child = people[child_id]
    child['parents'] = [GEORGE_III, CHARLOTTE]
for parent_id in (GEORGE_III, CHARLOTTE):
    existing = [child_id for child_id in people[parent_id].get('children', []) if child_id not in GEORGE_CHILDREN]
    people[parent_id]['children'] = existing + GEORGE_CHILDREN

people[GEORGE_III]['note'] = 'King of Great Britain and Ireland, 1760–1820'

# George V and Queen Mary span the 1927 place-name boundary, so retain two
# dated title rows rather than assigning one final title to the whole reign.
GEORGE_V = 'profile-g6000000000701511040'
george_v = people[GEORGE_V]
george_v['displayName'] = 'George V, King of Great Britain and Northern Ireland'
george_v['title'] = 'King of Great Britain and Northern Ireland'
george_v['note'] = (
    'King of Great Britain and Ireland, 1910–1927; '
    'King of Great Britain and Northern Ireland, 1927–1936; '
    'Emperor of India, 1910–1936'
)
george_v_periods = [period for period in george_v['namePeriods'] if period.get('id') != 'george-v-name-1927']
for period in george_v_periods:
    if period.get('id') == 'george-v-name-1910':
        period['name'] = 'George V, King of Great Britain and Ireland, Emperor of India'
        period['endYear'] = 1927
        source_url = period.get('sourceUrl', '')
        george_v_periods.append({
            'id': 'george-v-name-1927',
            'name': 'George V, King of Great Britain and Northern Ireland, Emperor of India',
            'startYear': 1927,
            'endYear': 1936,
            'sourceUrl': source_url,
        })
        break
george_v['namePeriods'] = sorted(george_v_periods, key=lambda period: (period.get('startYear') or -99999, period.get('id', '')))
george_v['defaultNamePeriodId'] = 'george-v-name-1927'

MARY_TECK = 'profile-g6000000001324056123'
mary = people[MARY_TECK]
mary['displayName'] = 'Mary of Teck, Queen consort of Great Britain and Northern Ireland'
mary['title'] = 'Queen consort of Great Britain and Northern Ireland'
mary['note'] = (
    'Queen consort of Great Britain and Ireland, 1910–1927; '
    'Queen consort of Great Britain and Northern Ireland, 1927–1936; '
    'great-granddaughter of George III'
)
mary_periods = [period for period in mary['namePeriods'] if period.get('id') != 'mary-teck-name-1927']
for period in mary_periods:
    if period.get('id') == 'mary-teck-name-1910':
        period['name'] = 'Mary, Queen of Great Britain and Ireland, Empress of India'
        period['endYear'] = 1927
        source_url = period.get('sourceUrl', '')
        mary_periods.append({
            'id': 'mary-teck-name-1927',
            'name': 'Mary, Queen of Great Britain and Northern Ireland, Empress of India',
            'startYear': 1927,
            'endYear': 1936,
            'sourceUrl': source_url,
        })
        break
mary['namePeriods'] = sorted(mary_periods, key=lambda period: (period.get('startYear') or -99999, period.get('id', '')))

# Reciprocal-link validation is deliberately strict: the missing-parent display
# filter should never be bypassed to compensate for malformed starter data.
for person_id, person in people.items():
    for parent_id in person.get('parents', []):
        if parent_id not in people or person_id not in people[parent_id].get('children', []):
            raise SystemExit(f'Broken parent link: {parent_id} -> {person_id}')
    for child_id in person.get('children', []):
        if child_id not in people or person_id not in people[child_id].get('parents', []):
            raise SystemExit(f'Broken child link: {person_id} -> {child_id}')

DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# ---------------------------------------------------------------------------
# Cache/version assertions and permanent regression tests.
# ---------------------------------------------------------------------------
replace_once(INDEX, './app.js?v=145', './app.js?v=146')

for test_path in Path('tests').glob('*.test.mjs'):
    text = test_path.read_text(encoding='utf-8')
    text = text.replace('starter.version, 27', 'starter.version, 28')
    text = text.replace('advances to version 27', 'advances to version 28')
    text = text.replace('./app.js?v=145', './app.js?v=146')
    test_path.write_text(text, encoding='utf-8')

Path('tests/royal-title-place-style.test.mjs').write_text(r"""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBritishRoyalPlaceName } from '../royal-title-style.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;
const sovereignUnitedKingdom = /\b(?:King|Queen)(?:\s+consort)?\s+of\s+(?:the\s+)?United Kingdom\b/i;

test('normalizes sovereign and consort titles to compact geographical names', () => {
  assert.equal(
    normalizeBritishRoyalPlaceName('George IV, King of the United Kingdom', 1820),
    'George IV, King of Great Britain and Ireland'
  );
  assert.equal(
    normalizeBritishRoyalPlaceName('George VI, King of the United Kingdom and Emperor of India', 1936),
    'George VI, King of Great Britain and Northern Ireland, Emperor of India'
  );
  assert.equal(
    normalizeBritishRoyalPlaceName('Mary, Queen consort of the United Kingdom', 1910),
    'Mary, Queen consort of Great Britain and Ireland'
  );
});

test('does not rewrite United Kingdom as a princely byname', () => {
  assert.equal(
    normalizeBritishRoyalPlaceName('Princess Alice of the United Kingdom', 1843),
    'Princess Alice of the United Kingdom'
  );
});

test('the bundled example contains no United Kingdom sovereign-title phrases', () => {
  assert.equal(starter.version, 28);
  for (const person of Object.values(people)) {
    for (const field of ['displayName', 'title', 'lastName', 'note']) {
      assert.doesNotMatch(String(person[field] || ''), sovereignUnitedKingdom, `${person.displayName} ${field}`);
    }
    for (const period of person.namePeriods || []) {
      assert.doesNotMatch(period.name, sovereignUnitedKingdom, `${person.displayName} ${period.id}`);
    }
  }
  const alice = people['profile-g6000000000703284437'];
  assert.ok(alice.namePeriods.some(period => period.name === 'Princess Alice of the United Kingdom'));
});

test('George V and Queen Mary change geographical style in 1927', () => {
  const george = people['profile-g6000000000701511040'];
  const mary = people['profile-g6000000001324056123'];
  assert.deepEqual(
    george.namePeriods.filter(period => period.id.startsWith('george-v-name-19')).map(period => [period.id, period.name, period.startYear, period.endYear]),
    [
      ['george-v-name-1910', 'George V, King of Great Britain and Ireland, Emperor of India', 1910, 1927],
      ['george-v-name-1927', 'George V, King of Great Britain and Northern Ireland, Emperor of India', 1927, 1936]
    ]
  );
  assert.equal(george.defaultNamePeriodId, 'george-v-name-1927');
  assert.ok(mary.namePeriods.some(period => period.id === 'mary-teck-name-1910' && period.name.includes('Great Britain and Ireland')));
  assert.ok(mary.namePeriods.some(period => period.id === 'mary-teck-name-1927' && period.name.includes('Great Britain and Northern Ireland')));
});

test('future imports and old saved trees pass through the same title normalizer', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /import \{ normalizeBritishRoyalPlaceName \} from '\.\/royal-title-style\.js\?v=1'/);
  assert.match(app, /const name = normalizeBritishRoyalPlaceName\(rawName, startYear \?\? endYear\)/);
  assert.match(app, /title: normalizeBritishRoyalPlaceName/);
  assert.match(app, /note: normalizeBritishRoyalPlaceName/);
  assert.match(html, /\.\/app\.js\?v=146/);
});
""", encoding='utf-8')

Path('tests/george-iii-family-links.test.mjs').write_text(r"""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope } from '../descendant-scope.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;
const GEORGE_III = 'profile-g6000000003091034586';
const CHARLOTTE = 'profile-g6000000003891728922';
const CHILDREN = [
  'profile-g4137986493320052463',
  'profile-g4137989648200126749',
  'profile-g4087038607800049893',
  'profile-g6000000000307240333'
];

test('George III and Queen Charlotte share every bundled child reciprocally', () => {
  for (const childId of CHILDREN) {
    assert.deepEqual(people[childId].parents, [GEORGE_III, CHARLOTTE], people[childId].displayName);
    assert.ok(people[GEORGE_III].children.includes(childId), `George III is missing ${people[childId].displayName}`);
    assert.ok(people[CHARLOTTE].children.includes(childId), `Queen Charlotte is missing ${people[childId].displayName}`);
  }
});

test('the bundled example has no remaining one-parent profile', () => {
  for (const person of Object.values(people)) {
    const parents = (person.parents || []).filter(parentId => people[parentId]);
    assert.notEqual(parents.length, 1, `${person.displayName} has only ${people[parents[0]]?.displayName || parents[0]}`);
  }
});

test('the repaired Hanoverian branches remain visible from Henry VII', () => {
  const scope = computeDescendantScope(people, starter.rootId);
  for (const personId of [
    ...CHILDREN,
    'profile-g6000000008852088113',
    'profile-g6000000003245250586'
  ]) {
    assert.ok(scope.allowedIds.has(personId), `${people[personId].displayName} should remain in the Henry VII tree`);
  }
});
""", encoding='utf-8')
