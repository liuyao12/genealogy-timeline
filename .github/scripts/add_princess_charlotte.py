from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('.')
DATA_PATH = ROOT / 'data/british-royal-line.json'
CHARLOTTE_ID = 'profile-g5145210727590105956'

payload = json.loads(DATA_PATH.read_text(encoding='utf-8'))
people = payload['people']


def all_names(person: dict) -> list[str]:
    return [
        str(person.get('displayName') or ''),
        str(person.get('title') or ''),
        *[str(period.get('name') or '') for period in person.get('namePeriods') or []],
    ]


def find_unique(label: str, predicate) -> tuple[str, dict]:
    matches = [(profile_id, person) for profile_id, person in people.items() if predicate(person)]
    if len(matches) != 1:
        summary = [(profile_id, person.get('displayName')) for profile_id, person in matches]
        raise RuntimeError(f'{label}: expected exactly one match, found {summary}')
    return matches[0]


george_id, george = find_unique(
    'George IV',
    lambda person: str(person.get('birthYear')) == '1762'
    and str(person.get('deathYear')) == '1830'
    and any('George IV' in name for name in all_names(person)),
)
caroline_id, caroline = find_unique(
    'Caroline of Brunswick',
    lambda person: str(person.get('birthYear')) == '1768'
    and str(person.get('deathYear')) == '1821'
    and any('Caroline of Brunswick' in name for name in all_names(person)),
)

charlotte = {
    'id': CHARLOTTE_ID,
    'firstName': 'Charlotte Augusta',
    'lastName': 'of Wales',
    'displayName': 'Charlotte Augusta of Wales',
    'title': '',
    'nameOrder': 'western',
    'gender': 'female',
    'birthYear': '1796',
    'deathYear': '1817',
    'isLiving': False,
    'place': '',
    'note': 'Only child of George IV and Caroline of Brunswick',
    'parents': [george_id, caroline_id],
    'children': [],
    'partners': [],
    'spouses': [],
    'nonSpouses': [],
    'divorcedSpouses': [],
    'marriageYears': {},
    'relationshipEndYears': {},
    'relationshipEndStatuses': {},
    'namePeriods': [
        {
            'id': 'charlotte-wales-name-1796',
            'name': 'Charlotte Augusta of Wales',
            'startYear': 1796,
            'endYear': 1817,
            'sourceUrl': 'https://www.wikidata.org/wiki/Q132440',
        }
    ],
    'defaultNamePeriodId': 'charlotte-wales-name-1796',
    'personalEvents': [],
    'sourceUrl': 'https://www.geni.com/profile/index/5145210727590105956',
    'sourceId': CHARLOTTE_ID,
    'sourceProvider': 'geni',
    'importedAt': '',
    'geniImmediateFamilyLoaded': False,
    'geniImmediateFamilyVerifiedAt': '',
    'geniImmediateFamilyIds': [],
    'starterProfile': True,
    'geniAliases': [CHARLOTTE_ID],
}

existing = people.get(CHARLOTTE_ID)
if existing:
    # Preserve any richer data that may have landed between preparation and
    # execution, while enforcing the verified identity and reciprocal parents.
    charlotte = {**charlotte, **existing}
    charlotte['id'] = CHARLOTTE_ID
    charlotte['parents'] = list(dict.fromkeys([george_id, caroline_id, *(existing.get('parents') or [])]))
    charlotte['sourceId'] = CHARLOTTE_ID
    charlotte['geniAliases'] = list(dict.fromkeys([CHARLOTTE_ID, *(existing.get('geniAliases') or [])]))
people[CHARLOTTE_ID] = charlotte

for parent in (george, caroline):
    parent['children'] = list(dict.fromkeys([*(parent.get('children') or []), CHARLOTTE_ID]))

payload['version'] = max(int(payload.get('version') or 0), 30)
DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

for path in sorted((ROOT / 'tests').glob('*.test.mjs')):
    text = path.read_text(encoding='utf-8')
    updated = text.replace('version 29', 'version 30').replace('data.version, 29', 'data.version, 30')
    if updated != text:
        path.write_text(updated, encoding='utf-8')

new_test = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPersonTimelineEvents, personEventAgeLabel } from '../person-events.js';

const data = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = data.people;
const charlotteId = 'profile-g5145210727590105956';
const charlotte = people[charlotteId];
const findUnique = predicate => {
  const matches = Object.values(people).filter(predicate);
  assert.equal(matches.length, 1);
  return matches[0];
};
const names = person => [person.displayName, ...(person.namePeriods || []).map(period => period.name)].join(' ');
const george = findUnique(person => person.birthYear === '1762' && names(person).includes('George IV'));
const caroline = findUnique(person => person.birthYear === '1768' && names(person).includes('Caroline of Brunswick'));

test('the bundled example includes George IV and Caroline’s only child with her Geni identity', () => {
  assert.equal(data.version, 30);
  assert.ok(charlotte);
  assert.equal(charlotte.displayName, 'Charlotte Augusta of Wales');
  assert.equal(charlotte.birthYear, '1796');
  assert.equal(charlotte.deathYear, '1817');
  assert.deepEqual(new Set(charlotte.parents), new Set([george.id, caroline.id]));
  assert.ok(george.children.includes(charlotteId));
  assert.ok(caroline.children.includes(charlotteId));
  assert.equal(charlotte.sourceId, charlotteId);
  assert.ok(charlotte.geniAliases.includes(charlotteId));
  assert.match(charlotte.sourceUrl, /5145210727590105956$/);
});

test('both parents’ simple chronology contains Charlotte’s birth at the correct beginning age', () => {
  for (const [parent, age] of [[george, '34'], [caroline, '28']]) {
    const rows = buildPersonTimelineEvents(parent, people, {
      nameAtYear: person => person.displayName
    });
    const birth = rows.find(event => event.kind === 'child-birth' && event.relativeId === charlotteId);
    assert.ok(birth);
    assert.equal(birth.label, 'Birth of Charlotte Augusta of Wales');
    assert.equal(birth.startYear, 1796);
    assert.equal(personEventAgeLabel(parent, birth), age);
  }
});

test('the stillborn child is not added as a visible descendant of Princess Charlotte', () => {
  assert.deepEqual(charlotte.children, []);
});
'''
(ROOT / 'tests/princess-charlotte-family.test.mjs').write_text(new_test, encoding='utf-8')

print(f'Added {CHARLOTTE_ID} as the child of {george_id} and {caroline_id}.')
