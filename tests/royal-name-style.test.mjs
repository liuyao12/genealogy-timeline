import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const people = starter.people;

const expectedDefaults = {
  'profile-g6000000003409427757': 'Arthur, Prince of Wales',
  'profile-g6000000000307240333': 'Adolphus, Duke of Cambridge',
  'profile-g6000000001260403655': 'Augusta, Duchess of Cambridge',
  'profile-g6000000003245250586': 'Mary Adelaide, Duchess of Teck',
  'profile-g6000000000703284437': 'Alice, Grand Duchess of Hesse and by Rhine',
  'profile-g6000000003221640265': 'Louis Mountbatten, 1st Marquess of Milford Haven',
  'profile-g6000000003221554850': 'Victoria Mountbatten, Marchioness of Milford Haven',
  'profile-g5495575341940116659': 'Prince Andrew of Greece and Denmark',
  'profile-g6000000003075330310': 'Princess Alice of Battenberg',
  'profile-g6000000003890906681': 'Ernest Augustus, Elector of Hanover',
  'profile-g6000000003879438150': 'Sophia, Electress of Hanover',
  'profile-g304430340510004215': 'Elizabeth Stuart, Queen of Bohemia',
  'profile-g6000000003885198846': 'Mary, Princess Royal and Princess of Orange',
  'profile-g4033453667340030515': 'Anne Hyde, Duchess of York',
  'profile-g4033341615700026163': 'Prince George of Denmark, Duke of Cumberland',
  'profile-g6000000003891753089': 'Augusta of Saxe-Gotha, Princess of Wales',
  'profile-g6000000003760910764': 'Frances Brandon, Duchess of Suffolk',
  'profile-g5466010055340136751': 'Katherine Willoughby, Duchess of Suffolk'
};

function defaultName(person) {
  return person.namePeriods.find(period => period.id === person.defaultNamePeriodId)?.name;
}

test('the bundled royal example advances its migration version', () => {
  assert.equal(starter.version, 25);
});

test('substantive titles are displayed as titles rather than territorial surnames', () => {
  for (const [id, expectedName] of Object.entries(expectedDefaults)) {
    const person = people[id];
    assert.ok(person, `missing profile ${id}`);
    assert.equal(person.displayName, expectedName, id);
    assert.equal(defaultName(person), expectedName, `${id} default dated name`);
    assert.ok(person.title, `${id} should have a structured title`);
  }
});

test('dated title changes cover each corrected profile lifespan', () => {
  for (const id of Object.keys(expectedDefaults)) {
    const person = people[id];
    const periods = [...person.namePeriods].sort((a, b) => a.startYear - b.startYear);
    assert.ok(periods.length, `${id} should have dated names`);
    assert.equal(periods[0].startYear, Number(person.birthYear), `${id} first dated name`);
    assert.equal(periods.at(-1).endYear, Number(person.deathYear), `${id} last dated name`);
    for (let index = 1; index < periods.length; index += 1) {
      assert.ok(periods[index].startYear <= periods[index - 1].endYear + 1, `${id} has a gap in its dated names`);
    }
  }
});

test('genuine conventional bynames remain unchanged', () => {
  const names = new Set(Object.values(people).map(person => person.displayName));
  assert.ok(names.has('Catherine of Aragon'));
  assert.ok(names.has('Anne of Cleves'));
  assert.ok(names.has('Mary of Guise'));
});

test('the known malformed territorial-title forms have been removed', () => {
  const oldNames = new Set([
    'Arthur Tudor',
    'Adolphus of Cambridge',
    'Mary Adelaide of Cambridge',
    'Alice of the United Kingdom',
    'Louis of Battenberg',
    'Victoria of Hesse',
    'Andrew of Greece and Denmark',
    'Alice of Battenberg',
    'Ernest Augustus of Hanover',
    'Sophia of Hanover',
    'Mary Stuart',
    'George of Denmark'
  ]);
  Object.values(people).forEach(person => assert.ok(!oldNames.has(person.displayName), person.displayName));
});

test('the starter upgrade repairs exact stale labels without replacing arbitrary local names', () => {
  assert.match(app, /const revisedStarterDisplayNames = \{/);
  assert.match(app, /'Adolphus of Cambridge'/);
  assert.match(app, /'Arthur Tudor'/);
  assert.match(app, /staleStarterNames\.includes\(saved\.displayName\)/);
  assert.match(app, /period\.source === 'local'/);
});
