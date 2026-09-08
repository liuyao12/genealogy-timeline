import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope } from '../descendant-scope.js';
import { primaryGeniIdentity } from '../geni-identity.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;
const idByName = new Map(Object.entries(people).map(([personId, person]) => [person.displayName, personId]));

function id(name) {
  const personId = idByName.get(name);
  assert.ok(personId, `missing profile: ${name}`);
  return personId;
}

function assertParents(childName, fatherName, motherName) {
  const childId = id(childName);
  const expected = [id(fatherName), id(motherName)].sort();
  assert.deepEqual([...people[childId].parents].sort(), expected, `${childName} parents`);
  for (const parentId of expected) {
    assert.ok(people[parentId].children.includes(childId), `${people[parentId].displayName} should list ${childName}`);
  }
}

function assertSpouses(firstName, secondName) {
  const firstId = id(firstName);
  const secondId = id(secondName);
  assert.ok(people[firstId].spouses.includes(secondId), `${firstName} should list ${secondName}`);
  assert.ok(people[secondId].spouses.includes(firstId), `${secondName} should list ${firstName}`);
}

function descendantPath(startName, endName) {
  const startId = id(startName);
  const endId = id(endName);
  const queue = [startId];
  const previous = new Map([[startId, null]]);
  while (queue.length && !previous.has(endId)) {
    const current = queue.shift();
    for (const childId of people[current].children || []) {
      if (!people[childId] || previous.has(childId)) continue;
      previous.set(childId, current);
      queue.push(childId);
    }
  }
  if (!previous.has(endId)) return [];
  const result = [];
  for (let current = endId; current; current = previous.get(current)) result.push(people[current].displayName);
  return result.reverse();
}

function descendantIds(startId) {
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    for (const childId of people[current].children || []) {
      if (!people[childId] || seen.has(childId)) continue;
      seen.add(childId);
      queue.push(childId);
    }
  }
  return seen;
}

test('the expanded starter advances to version 29 with 179 profiles', () => {
  assert.equal(starter.version, 29);
  assert.equal(Object.keys(people).length, 179);
});

test('Caroline of Brunswick and George IV are displayed as first cousins', () => {
  assertParents(
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Frederick, Prince of Wales',
    'Augusta of Saxe-Gotha, Princess of Wales'
  );
  assertParents(
    'George III, King of Great Britain and Ireland',
    'Frederick, Prince of Wales',
    'Augusta of Saxe-Gotha, Princess of Wales'
  );
  assertParents(
    'Caroline of Brunswick',
    'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel',
    'Augusta, Duchess of Brunswick-Wolfenbüttel'
  );
  assertSpouses('Caroline of Brunswick', 'George IV, King of Great Britain and Ireland');
  assertParents(
    'Princess Charlotte of Wales',
    'George IV, King of Great Britain and Ireland',
    'Caroline of Brunswick'
  );
});

test('Darnley and Mary, Queen of Scots have parallel descents from Margaret Tudor', () => {
  assertParents(
    'Margaret Douglas, Countess of Lennox',
    'Archibald Douglas, Earl of Angus',
    'Margaret Tudor, Queen of Scots'
  );
  assertParents(
    'Henry Stuart, Lord Darnley, King consort of Scots',
    'Matthew Stewart, 4th Earl of Lennox',
    'Margaret Douglas, Countess of Lennox'
  );
  assertSpouses('Henry Stuart, Lord Darnley, King consort of Scots', 'Mary, Queen of Scots');
  assert.deepEqual(descendantPath('Margaret Tudor, Queen of Scots', 'Mary, Queen of Scots'), [
    'Margaret Tudor, Queen of Scots',
    'James V, King of Scots',
    'Mary, Queen of Scots'
  ]);
  assert.deepEqual(descendantPath('Margaret Tudor, Queen of Scots', 'Henry Stuart, Lord Darnley, King consort of Scots'), [
    'Margaret Tudor, Queen of Scots',
    'Margaret Douglas, Countess of Lennox',
    'Henry Stuart, Lord Darnley, King consort of Scots'
  ]);
});

test('the Hesse-Kassel branch connects three spouse gateways to George II', () => {
  assertParents(
    'Mary, Landgravine of Hesse-Kassel',
    'George II, King of Great Britain and Ireland',
    'Caroline of Ansbach'
  );
  assertParents(
    'Prince Frederick of Hesse-Kassel',
    'Frederick II, Landgrave of Hesse-Kassel',
    'Mary, Landgravine of Hesse-Kassel'
  );
  assertParents(
    'Augusta, Duchess of Cambridge',
    'Prince Frederick of Hesse-Kassel',
    'Princess Caroline of Nassau-Usingen'
  );
  assertParents(
    'Prince William of Hesse-Kassel',
    'Prince Frederick of Hesse-Kassel',
    'Princess Caroline of Nassau-Usingen'
  );
  assertParents(
    'Louise of Hesse-Kassel, Queen of Denmark',
    'Prince William of Hesse-Kassel',
    'Princess Louise Charlotte of Denmark'
  );

  const descendants = descendantIds(starter.rootId);
  for (const expected of [
    'Augusta, Duchess of Cambridge',
    'Alexandra of Denmark',
    'Prince Andrew of Greece and Denmark',
    'Philip, Duke of Edinburgh'
  ]) assert.ok(descendants.has(id(expected)), `${expected} should now descend from Henry VII in the stored graph`);
});

test('the Henry VII timeline scope contains both branches of each cousin marriage once', () => {
  const scope = computeDescendantScope(people, starter.rootId);
  for (const expected of [
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Caroline of Brunswick',
    'George IV, King of Great Britain and Ireland',
    'Princess Charlotte of Wales',
    'Margaret Douglas, Countess of Lennox',
    'Henry Stuart, Lord Darnley, King consort of Scots',
    'Mary, Queen of Scots',
    'Mary, Landgravine of Hesse-Kassel',
    'Augusta, Duchess of Cambridge',
    'Alexandra of Denmark',
    'Prince Andrew of Greece and Denmark'
  ]) assert.ok(scope.allowedIds.has(id(expected)), `${expected} should be in the focused tree`);
  assert.equal(scope.allowedIds.size, new Set(scope.allowedIds).size);
});

test('every new profile has an explicit Geni identity and every new descendant has two parents', () => {
  const newIds = [
    'profile-g312092994390004595',
    'profile-g311788525210007050',
    'profile-g5145210727590105956',
    'profile-g6000000002435383373',
    'profile-g6000000003858695567',
    'profile-g6000000000048910716',
    'profile-g6000000001847933002',
    'profile-g6000000002447248679',
    'profile-g6000000007329600601',
    'profile-4532996',
    'profile-g6000000002737707932'
  ];
  for (const personId of newIds) {
    const person = people[personId];
    assert.ok(person, personId);
    assert.equal(person.sourceId, personId, `${person.displayName} sourceId`);
    assert.ok(person.geniAliases.includes(personId), `${person.displayName} alias`);
    assert.equal(primaryGeniIdentity(person, personId), personId, `${person.displayName} indexed identity`);
  }
  for (const name of [
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Caroline of Brunswick',
    'Princess Charlotte of Wales',
    'Margaret Douglas, Countess of Lennox',
    'Henry Stuart, Lord Darnley, King consort of Scots',
    'Mary, Landgravine of Hesse-Kassel',
    'Prince Frederick of Hesse-Kassel',
    'Augusta, Duchess of Cambridge',
    'Prince William of Hesse-Kassel',
    'Louise of Hesse-Kassel, Queen of Denmark'
  ]) assert.equal(people[id(name)].parents.length, 2, `${name} must not be suppressed as an incomplete birth`);
});

test('non-marital Charles II descents remain outside the descendant closure', () => {
  const descendants = descendantIds(starter.rootId);
  assert.equal(descendants.has(id('Diana, Princess of Wales')), false);
  assert.equal(descendants.has(id('Camilla, Queen of Great Britain and Northern Ireland')), false);
});
