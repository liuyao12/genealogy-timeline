import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope } from '../descendant-scope.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;
const idByName = new Map(Object.entries(people).map(([id, person]) => [person.displayName, id]));

function id(name) {
  const found = idByName.get(name);
  assert.ok(found, `missing profile: ${name}`);
  return found;
}

function names(ids) {
  return new Set([...ids].map(personId => people[personId]?.displayName).filter(Boolean));
}

function assertChild(parentName, childName) {
  const parentId = id(parentName);
  const childId = id(childName);
  assert.ok(people[parentId].children.includes(childId), `${parentName} should list ${childName} as a child`);
  assert.ok(people[childId].parents.includes(parentId), `${childName} should list ${parentName} as a parent`);
}

function assertSpouses(firstName, secondName) {
  const firstId = id(firstName);
  const secondId = id(secondName);
  assert.ok(people[firstId].spouses.includes(secondId), `${firstName} should list ${secondName} as a spouse`);
  assert.ok(people[secondId].spouses.includes(firstId), `${secondName} should list ${firstName} as a spouse`);
}

function descendantPath(startName, endName) {
  const startId = id(startName);
  const endId = id(endName);
  const queue = [startId];
  const previous = new Map([[startId, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === endId) break;
    for (const childId of people[current].children || []) {
      if (!people[childId] || previous.has(childId)) continue;
      previous.set(childId, current);
      queue.push(childId);
    }
  }
  if (!previous.has(endId)) return [];
  const path = [];
  for (let current = endId; current; current = previous.get(current)) path.push(current);
  return path.reverse().map(personId => people[personId].displayName);
}

test('the expanded bundled example advances to version 26', () => {
  assert.equal(starter.version, 27);
  assert.equal(Object.keys(people).length, 168);
});

test('Louis XII reaches Francis II through the direct Valois descent', () => {
  assert.deepEqual(descendantPath('Louis XII, King of France', 'Francis II, King of France'), [
    'Louis XII, King of France',
    'Claude, Queen of France and Duchess of Brittany',
    'Henry II, King of France',
    'Francis II, King of France'
  ]);

  const frenchScope = computeDescendantScope(people, id('Louis XII, King of France'));
  const visible = names(frenchScope.allowedIds);
  for (const expected of [
    'Claude, Queen of France and Duchess of Brittany',
    'Francis I, King of France',
    'Henry II, King of France',
    "Catherine de' Medici, Queen of France",
    'Madeleine of Valois',
    'Francis II, King of France',
    'Elisabeth of Valois',
    'Charles IX, King of France',
    'Henry III, King of France',
    'Margaret of Valois, Queen of France and Navarre'
  ]) assert.ok(visible.has(expected), `${expected} should appear in Louis XII’s refocused tree`);
});

test('the Valois gateway continues into the Bourbon family of Henrietta Maria', () => {
  assertChild('Henry II, King of France', 'Margaret of Valois, Queen of France and Navarre');
  assertSpouses('Margaret of Valois, Queen of France and Navarre', 'Henry IV, King of France and Navarre');
  assertSpouses('Henry IV, King of France and Navarre', "Marie de' Medici, Queen of France");
  assertChild('Henry IV, King of France and Navarre', 'Louis XIII, King of France and Navarre');
  assertChild('Henry IV, King of France and Navarre', 'Henrietta Maria of France');
});

test('Philip II and Maria Manuela are represented as double first cousins', () => {
  for (const child of ['John III, King of Portugal', 'Isabella of Portugal, Holy Roman Empress and Queen of Spain']) {
    assertChild('Manuel I, King of Portugal', child);
    assertChild('Maria of Aragon, Queen of Portugal', child);
  }
  for (const child of ['Charles V, Holy Roman Emperor and King of Spain', 'Catherine of Austria, Queen of Portugal']) {
    assertChild('Philip I, King of Castile', child);
    assertChild('Joanna I, Queen of Castile and Aragon', child);
  }
  assertChild('Charles V, Holy Roman Emperor and King of Spain', 'Philip II, King of Spain');
  assertChild('Isabella of Portugal, Holy Roman Empress and Queen of Spain', 'Philip II, King of Spain');
  assertChild('John III, King of Portugal', 'Maria Manuela, Princess of Portugal');
  assertChild('Catherine of Austria, Queen of Portugal', 'Maria Manuela, Princess of Portugal');
  assertChild('Philip II, King of Spain', 'Carlos, Prince of Asturias');

  const portugueseScope = computeDescendantScope(people, id('Manuel I, King of Portugal'));
  const visible = names(portugueseScope.allowedIds);
  for (const expected of ['Philip II, King of Spain', 'Maria Manuela, Princess of Portugal', 'Carlos, Prince of Asturias']) {
    assert.ok(visible.has(expected), `${expected} should appear in Manuel I’s refocused tree`);
  }
});

test('the older Danish gateway relates Anne of Denmark to Prince George of Denmark', () => {
  assertChild('Frederick II, King of Denmark and Norway', 'Anne of Denmark');
  assertChild('Frederick II, King of Denmark and Norway', 'Christian IV, King of Denmark and Norway');
  assertChild('Christian IV, King of Denmark and Norway', 'Frederick III, King of Denmark and Norway');
  assertChild('Frederick III, King of Denmark and Norway', 'Prince George of Denmark, Duke of Cumberland');
});

test('the Glücksburg gateway relates Alexandra of Denmark to Prince Philip', () => {
  assertChild('Christian IX, King of Denmark', 'Alexandra of Denmark');
  assertChild('Christian IX, King of Denmark', 'George I, King of the Hellenes');
  assertChild('George I, King of the Hellenes', 'Prince Andrew of Greece and Denmark');
  assertChild('Prince Andrew of Greece and Denmark', 'Philip, Duke of Edinburgh');

  const danishScope = computeDescendantScope(people, id('Christian IX, King of Denmark'));
  const visible = names(danishScope.allowedIds);
  for (const expected of [
    'Alexandra of Denmark',
    'George I, King of the Hellenes',
    'Prince Andrew of Greece and Denmark',
    'Philip, Duke of Edinburgh'
  ]) assert.ok(visible.has(expected), `${expected} should appear in Christian IX’s refocused tree`);
});

test('the Palatinate and Orange gateways include their parent generations', () => {
  assertChild('Frederick IV, Elector Palatine', 'Frederick V, Elector Palatine and King of Bohemia');
  assertChild('Louise Juliana of Nassau, Electress Palatine', 'Frederick V, Elector Palatine and King of Bohemia');
  assertChild('Frederick Henry, Prince of Orange', 'William II, Prince of Orange');
  assertChild('Amalia of Solms-Braunfels, Princess of Orange', 'William II, Prince of Orange');
});

test('the Hesse gateway joins Louis IV and Louis Mountbatten in one family', () => {
  assertChild('Louis II, Grand Duke of Hesse and by Rhine', 'Prince Charles of Hesse and by Rhine');
  assertChild('Louis II, Grand Duke of Hesse and by Rhine', 'Prince Alexander of Hesse and by Rhine');
  assertChild('Prince Charles of Hesse and by Rhine', 'Louis IV, Grand Duke of Hesse and by Rhine');
  assertChild('Prince Alexander of Hesse and by Rhine', 'Louis Mountbatten, 1st Marquess of Milford Haven');

  const hesseScope = computeDescendantScope(people, id('Louis II, Grand Duke of Hesse and by Rhine'));
  const visible = names(hesseScope.allowedIds);
  for (const expected of [
    'Louis IV, Grand Duke of Hesse and by Rhine',
    'Louis Mountbatten, 1st Marquess of Milford Haven',
    'Victoria Mountbatten, Marchioness of Milford Haven',
    'Princess Alice of Battenberg',
    'Philip, Duke of Edinburgh'
  ]) assert.ok(visible.has(expected), `${expected} should appear in Louis II’s refocused tree`);
});

test('all expanded family links are reciprocal and point to stored profiles', () => {
  for (const [personId, person] of Object.entries(people)) {
    for (const parentId of person.parents || []) {
      assert.ok(people[parentId], `${person.displayName} has a missing parent ${parentId}`);
      assert.ok(people[parentId].children.includes(personId), `${people[parentId].displayName} is missing child ${person.displayName}`);
    }
    for (const childId of person.children || []) {
      assert.ok(people[childId], `${person.displayName} has a missing child ${childId}`);
      assert.ok(people[childId].parents.includes(personId), `${people[childId].displayName} is missing parent ${person.displayName}`);
    }
    for (const spouseId of person.spouses || []) {
      assert.ok(people[spouseId], `${person.displayName} has a missing spouse ${spouseId}`);
      assert.ok(people[spouseId].spouses.includes(personId), `${people[spouseId].displayName} is missing spouse ${person.displayName}`);
    }
  }
});


test('a refocused bundled example remains eligible for starter upgrades', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function upgradeBundledBritishRoyalLine()');
  const end = app.indexOf('function migrateGeniPeople', start);
  assert.ok(start >= 0 && end > start, 'starter upgrade function should exist');
  const upgrade = app.slice(start, end);
  assert.match(upgrade, /const hasBundledRoot = state\.people\[starterRootId\]\?\.starterProfile === true/);
  assert.match(upgrade, /starterProfiles\.length >= 10/);
  assert.doesNotMatch(upgrade, /state\.rootId === starterRootId/);
});
