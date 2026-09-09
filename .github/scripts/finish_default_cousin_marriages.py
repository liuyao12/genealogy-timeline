from __future__ import annotations

import json
from pathlib import Path

DATA = Path('data/british-royal-line.json')
APP = Path('app.js')
TEST = Path('tests/default-cousin-marriages.test.mjs')
CAROLINE_ID = 'profile-g4138652783200125692'

starter = json.loads(DATA.read_text(encoding='utf-8'))
people = starter['people']
caroline = people[CAROLINE_ID]

# Keep the conventional biographical name as the default, while retaining the
# historically changing styles used by the As-of view and making her royal
# status explicit to the default king/queen filter.
caroline['firstName'] = 'Caroline'
caroline['lastName'] = 'of Brunswick'
caroline['displayName'] = 'Caroline of Brunswick'
caroline['title'] = 'Queen consort of Great Britain and Ireland and Hanover'
caroline['note'] = 'Queen consort; wife and first cousin of George IV'
caroline['namePeriods'] = [
    {
        'id': 'caroline-brunswick-name-1768',
        'name': 'Caroline of Brunswick',
        'startYear': 1768,
        'endYear': 1795,
        'sourceUrl': 'https://en.wikipedia.org/wiki/Caroline_of_Brunswick',
    },
    {
        'id': 'caroline-brunswick-name-1795',
        'name': 'Caroline, Princess of Wales',
        'startYear': 1795,
        'endYear': 1820,
        'sourceUrl': 'https://en.wikipedia.org/wiki/Caroline_of_Brunswick',
    },
    {
        'id': 'caroline-brunswick-name-1820',
        'name': 'Caroline, Queen of Great Britain and Ireland and Hanover',
        'startYear': 1820,
        'endYear': 1821,
        'sourceUrl': 'https://en.wikipedia.org/wiki/Caroline_of_Brunswick',
    },
]
caroline['defaultNamePeriodId'] = 'caroline-brunswick-name-1768'
starter['treeFilter'] = 'king queen'

DATA.write_text(json.dumps(starter, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# A keyword filter used to retain the two descendant branches but suppress the
# marriage between them whenever the couple's child did not itself match. That
# flattened a cousin marriage into two unrelated-looking nodes. If both spouses
# survive as lineal descendants, retain their marriage pair as well; the normal
# transport logic can then draw the second occurrence and the closing loop.
app = APP.read_text(encoding='utf-8')
old = """    const defaultVisible = !query || carriesVisibleChild;
    if (override === true || matchedPartnerPairs.has(key) || defaultVisible) renderedPartnerPairs.add(key);"""
new = """    const joinsVisibleLinealBranches = visible.has(firstId) && visible.has(secondId)
      && scope.linealIds.has(firstId) && scope.linealIds.has(secondId);
    const defaultVisible = !query || carriesVisibleChild || joinsVisibleLinealBranches;
    if (override === true || matchedPartnerPairs.has(key) || defaultVisible) renderedPartnerPairs.add(key);"""
if old not in app:
    raise SystemExit('Could not find the filtered spouse-pair visibility clause in app.js')
APP.write_text(app.replace(old, new), encoding='utf-8')

TEST.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const people = starter.people;
const root = starter.rootId;

function one(fragment) {
  const matches = Object.entries(people).filter(([, person]) =>
    person.displayName.includes(fragment)
    || (person.namePeriods || []).some(period => period.name.includes(fragment))
  );
  assert.equal(matches.length, 1, `expected one profile matching ${fragment}`);
  return matches[0];
}

function descendantsOfRoot() {
  const descendants = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const id = queue.shift();
    for (const childId of people[id]?.children || []) {
      if (!people[childId] || descendants.has(childId)) continue;
      descendants.add(childId);
      queue.push(childId);
    }
  }
  return descendants;
}

function assertDescendedSpouses(firstFragment, secondFragment, descendants) {
  const [firstId, first] = one(firstFragment);
  const [secondId, second] = one(secondFragment);
  assert.ok(first.spouses.includes(secondId), `${first.displayName} should list ${second.displayName} as spouse`);
  assert.ok(second.spouses.includes(firstId), `${second.displayName} should list ${first.displayName} as spouse`);
  assert.ok(descendants.has(firstId), `${first.displayName} should descend from Henry VII`);
  assert.ok(descendants.has(secondId), `${second.displayName} should descend from Henry VII`);
}

test('Caroline keeps her conventional default name and complete historical styles', () => {
  const [id, caroline] = one('Caroline of Brunswick');
  assert.equal(id, 'profile-g4138652783200125692');
  assert.equal(caroline.displayName, 'Caroline of Brunswick');
  assert.equal(caroline.title, 'Queen consort of Great Britain and Ireland and Hanover');
  assert.equal(caroline.defaultNamePeriodId, 'caroline-brunswick-name-1768');
  assert.deepEqual(
    caroline.namePeriods.map(period => [period.startYear, period.endYear, period.name]),
    [
      [1768, 1795, 'Caroline of Brunswick'],
      [1795, 1820, 'Caroline, Princess of Wales'],
      [1820, 1821, 'Caroline, Queen of Great Britain and Ireland and Hanover'],
    ]
  );
  const searchable = [
    caroline.displayName,
    caroline.title,
    ...caroline.namePeriods.map(period => period.name),
  ].join(' ').toLowerCase();
  assert.match(searchable, /queen/);
  assert.equal(starter.treeFilter, 'king queen');
});

test('keyword filtering retains marriages joining two visible lineal branches', () => {
  assert.match(app, /const joinsVisibleLinealBranches = visible\.has\(firstId\) && visible\.has\(secondId\)/);
  assert.match(app, /scope\.linealIds\.has\(firstId\) && scope\.linealIds\.has\(secondId\)/);
  assert.match(app, /!query \|\| carriesVisibleChild \|\| joinsVisibleLinealBranches/);
});

test('George IV and Caroline are first cousins through Frederick, Prince of Wales', () => {
  const [, georgeIII] = one('George III, King of Great Britain');
  const [, princessAugusta] = one('Augusta, Duchess of Brunswick-Wolfenbüttel');
  const [, georgeIV] = one('George IV, King of Great Britain');
  const [, caroline] = one('Caroline of Brunswick');
  assert.deepEqual(new Set(georgeIII.parents), new Set(princessAugusta.parents));
  assert.ok(georgeIV.parents.includes(georgeIII.id));
  assert.ok(caroline.parents.includes(princessAugusta.id));
  assert.ok(georgeIV.spouses.includes(caroline.id));
});

test('all intended cousin and double-descendant marriages survive in the starter', () => {
  const descendants = descendantsOfRoot();
  for (const [first, second] of [
    ['Mary, Queen of Scots', 'Lord Darnley'],
    ['William III & II', 'Mary II'],
    ['George IV, King of Great Britain', 'Caroline of Brunswick'],
    ['Adolphus, Duke of Cambridge', 'Augusta, Duchess of Cambridge'],
    ['Alice, Grand Duchess of Hesse', 'Louis IV, Grand Duke of Hesse'],
    ['Edward VII, King of Great Britain', 'Alexandra of Denmark'],
    ['Prince Andrew of Greece and Denmark', 'Princess Alice of Battenberg'],
    ['George V, King of Great Britain', 'Mary of Teck'],
    ['Elizabeth II, Queen of Great Britain', 'Philip, Duke of Edinburgh'],
  ]) assertDescendedSpouses(first, second, descendants);
});
''', encoding='utf-8')

print(json.dumps({
    'version': starter['version'],
    'profiles': len(people),
    'carolineTitle': caroline['title'],
    'carolineDefault': caroline['defaultNamePeriodId'],
}, indent=2))
