import test from 'node:test';
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
