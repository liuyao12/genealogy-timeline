import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope } from '../descendant-scope.js';
import { duplicateGeniIdentityGroups } from '../geni-identity.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;
const root = starter.rootId;

function idContaining(fragment) {
  const matches = Object.entries(people).filter(([, person]) => person.displayName.includes(fragment));
  assert.equal(matches.length, 1, `expected one profile containing ${fragment}`);
  return matches[0][0];
}

function descendantClosure() {
  const found = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const childId of people[current]?.children || []) {
      if (!people[childId] || found.has(childId)) continue;
      found.add(childId);
      queue.push(childId);
    }
  }
  return found;
}

function assertSpousePairDescends(firstFragment, secondFragment, descendants) {
  const firstId = idContaining(firstFragment);
  const secondId = idContaining(secondFragment);
  assert.ok(people[firstId].spouses.includes(secondId), `${firstFragment} should be married to ${secondFragment}`);
  assert.ok(people[secondId].spouses.includes(firstId), `${secondFragment} should be married to ${firstFragment}`);
  assert.ok(descendants.has(firstId), `${firstFragment} should descend from Henry VII`);
  assert.ok(descendants.has(secondId), `${secondFragment} should descend from Henry VII`);
}

test('Caroline of Brunswick and George IV are represented as first cousins', () => {
  const georgeIII = idContaining('George III, King of Great Britain');
  const princessAugusta = idContaining('Augusta, Duchess of Brunswick-Wolfenbüttel');
  const georgeIV = idContaining('George IV, King of Great Britain');
  const caroline = idContaining('Caroline of Brunswick');
  assert.deepEqual(new Set(people[princessAugusta].parents), new Set(people[georgeIII].parents));
  assert.ok(people[georgeIV].parents.includes(georgeIII));
  assert.ok(people[caroline].parents.includes(princessAugusta));
  assert.ok(people[georgeIV].spouses.includes(caroline));
});

test('the Hesse-Kassel gateway makes three additional spouse pairs Henry VII descendants', () => {
  const descendants = descendantClosure();
  assertSpousePairDescends('Adolphus, Duke of Cambridge', 'Augusta, Duchess of Cambridge', descendants);
  assertSpousePairDescends('Edward VII, King of Great Britain', 'Alexandra of Denmark', descendants);
  assertSpousePairDescends('Prince Andrew of Greece and Denmark', 'Princess Alice of Battenberg', descendants);
});

test('the Prussian gateway makes Louis IV and Princess Alice fellow Henry VII descendants', () => {
  const descendants = descendantClosure();
  assertSpousePairDescends('Alice, Grand Duchess of Hesse', 'Louis IV, Grand Duke of Hesse', descendants);
});

test('the Margaret Douglas line keeps both parents of James VI and I in Henry VII descent', () => {
  const descendants = descendantClosure();
  assertSpousePairDescends('Mary, Queen of Scots', 'Lord Darnley', descendants);
});

test('the previously connected dynastic marriages remain represented', () => {
  const descendants = descendantClosure();
  assertSpousePairDescends('William III & II', 'Mary II', descendants);
  assertSpousePairDescends('George V, King of Great Britain', 'Mary of Teck', descendants);
  assertSpousePairDescends('Elizabeth II, Queen of Great Britain', 'Philip, Duke of Edinburgh', descendants);
});

test('every new descent path survives the fragile-birth display filter', () => {
  const scope = computeDescendantScope(people, root);
  for (const fragment of [
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Caroline of Brunswick',
    'Mary, Landgravine of Hesse-Kassel',
    'Augusta, Duchess of Cambridge',
    'Alexandra of Denmark',
    'Prince Andrew of Greece and Denmark',
    'Sophia Dorothea of Hanover, Queen in Prussia',
    'Louis IV, Grand Duke of Hesse',
    'Margaret Douglas, Countess of Lennox',
    'Lord Darnley'
  ]) {
    assert.ok(scope.allowedIds.has(idContaining(fragment)), `${fragment} should remain visible`);
  }
});

test('the expanded profiles all carry unique explicit Geni identities', () => {
  assert.deepEqual(duplicateGeniIdentityGroups(people), []);
  for (const fragment of [
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel',
    'Mary, Landgravine of Hesse-Kassel',
    'Sophia Dorothea of Hanover, Queen in Prussia',
    'Frederick William II, King of Prussia',
    'Margaret Douglas, Countess of Lennox'
  ]) {
    const personId = idContaining(fragment);
    assert.equal(people[personId].sourceId, personId);
    assert.ok(people[personId].geniAliases.includes(personId));
  }
});

test('the starter retains reciprocal complete parentage throughout', () => {
  for (const [personId, person] of Object.entries(people)) {
    const parents = (person.parents || []).filter(parentId => people[parentId]);
    assert.notEqual(parents.length, 1, `${person.displayName} has one recorded parent`);
    for (const parentId of parents) assert.ok(people[parentId].children.includes(personId));
    for (const childId of person.children || []) assert.ok(people[childId].parents.includes(personId));
  }
});
