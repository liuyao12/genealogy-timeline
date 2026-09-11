import test from 'node:test';
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
  assert.equal(data.version, 31);
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
    assert.equal(birth.label, 'Charlotte Augusta of Wales');
    assert.equal(birth.startYear, 1796);
    assert.equal(personEventAgeLabel(parent, birth), age);
  }
});

test('the stillborn child is not added as a visible descendant of Princess Charlotte', () => {
  assert.deepEqual(charlotte.children, []);
});
