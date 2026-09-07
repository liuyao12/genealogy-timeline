import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope, descendantPairKey, hiddenBirthReason, profileHasPlaceholderName } from '../descendant-scope.js';

test('keeps one lineal descendant tree plus one formal-spouse layer', () => {
  const people = {
    ancestor: { id: 'ancestor', children: ['root', 'uncle'], parents: [], spouses: [] },
    uncle: { id: 'uncle', children: ['cousin'], parents: ['ancestor'], spouses: [] },
    cousin: { id: 'cousin', children: [], parents: ['uncle'], spouses: [] },
    root: { id: 'root', children: ['daughter'], parents: ['ancestor'], spouses: ['root-spouse'] },
    'root-spouse': { id: 'root-spouse', children: ['daughter'], parents: [], spouses: ['root', 'former-root-spouse'] },
    'former-root-spouse': { id: 'former-root-spouse', children: ['stepchild'], parents: [], spouses: ['root-spouse'] },
    stepchild: { id: 'stepchild', children: [], parents: ['root-spouse', 'former-root-spouse'], spouses: [] },
    daughter: { id: 'daughter', children: [], parents: ['root', 'root-spouse'], spouses: ['daughter-spouse'] },
    'daughter-spouse': { id: 'daughter-spouse', children: [], parents: [], spouses: ['daughter', 'other-spouse'] },
    'other-spouse': { id: 'other-spouse', children: [], parents: [], spouses: ['daughter-spouse'] }
  };

  const scope = computeDescendantScope(people, 'root');
  assert.deepEqual([...scope.descendantIds].sort(), ['daughter', 'root']);
  assert.deepEqual([...scope.allowedIds].sort(), ['daughter', 'daughter-spouse', 'root', 'root-spouse']);
  assert.equal(scope.allowedIds.has('ancestor'), false, 'an unknown-gender parent is not guessed to be the father');
  assert.equal(scope.allowedIds.has('uncle'), false);
  assert.equal(scope.allowedIds.has('cousin'), false);
  assert.equal(scope.allowedIds.has('former-root-spouse'), false);
  assert.equal(scope.allowedIds.has('stepchild'), false);
  assert.equal(scope.allowedIds.has('other-spouse'), false);
  assert.equal(scope.spousePairs.has(descendantPairKey('root', 'root-spouse')), true);
  assert.equal(scope.spousePairs.has(descendantPairKey('root-spouse', 'former-root-spouse')), false);
});

test('keeps a former formal spouse when only divorce metadata survives', () => {
  const people = {
    root: {
      id: 'root', children: [], parents: [], spouses: [], divorcedSpouses: ['former-spouse'],
      relationshipEndStatuses: { 'former-spouse': 'divorced' }
    },
    'former-spouse': { id: 'former-spouse', children: [], parents: [], spouses: [] },
    'former-spouse-other-partner': { id: 'former-spouse-other-partner', children: [], parents: [], spouses: ['former-spouse'] }
  };
  const scope = computeDescendantScope(people, 'root');
  assert.equal(scope.allowedIds.has('former-spouse'), true);
  assert.equal(scope.allowedIds.has('former-spouse-other-partner'), false);
});

test('repairs sparse parent-child links in both directions for one connected layout', () => {
  const people = {
    root: { id: 'root', children: [], parents: [], spouses: [] },
    'child-other-parent': { id: 'child-other-parent', displayName: 'Other parent of child', children: ['child'], parents: [], spouses: [] },
    child: { id: 'child', children: ['grandchild'], parents: ['root', 'child-other-parent'], spouses: [] },
    'grandchild-other-parent': { id: 'grandchild-other-parent', displayName: 'Other parent of grandchild', children: ['grandchild'], parents: [], spouses: [] },
    grandchild: { id: 'grandchild', children: [], parents: ['child', 'grandchild-other-parent'], spouses: [] }
  };
  const scope = computeDescendantScope(people, 'root');
  assert.deepEqual([...scope.descendantIds], ['root', 'child', 'grandchild']);
  assert.deepEqual([...scope.childrenByParent.get('root')], ['child']);
  assert.deepEqual([...scope.parentsByChild.get('child')], ['root']);
  assert.deepEqual([...scope.childrenByParent.get('child')], ['grandchild']);
  assert.deepEqual([...scope.parentsByChild.get('grandchild')], ['child']);
});

test('the Henry VII starter scope includes Catherine Parr but excludes her other husbands', () => {
  const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
  const scope = computeDescendantScope(starter.people, starter.rootId);
  const idByName = new Map(Object.entries(starter.people).map(([id, person]) => [person.displayName, id]));
  const catherineParrId = idByName.get('Catherine Parr');
  const johnNevilleId = idByName.get('John Neville, Baron Latimer');

  assert.ok(catherineParrId, 'the starter data should contain Catherine Parr');
  assert.ok(johnNevilleId, 'the starter data should contain John Neville');
  assert.equal(scope.allowedIds.has(catherineParrId), true, 'Henry VIII’s spouse remains in Henry VII’s descendant tree');
  assert.equal(scope.allowedIds.has(johnNevilleId), false, 'a spouse’s unrelated marriage must not open another tree');
});

test('adds complete paternal households but keeps siblings terminal', () => {
  const people = {
    grandfather: { id: 'grandfather', gender: 'male', parents: [], children: ['father', 'uncle'], spouses: ['grandmother', 'grandfather-second-wife'] },
    grandmother: { id: 'grandmother', gender: 'female', parents: [], children: ['father', 'uncle'], spouses: ['grandfather'] },
    'grandfather-second-wife': { id: 'grandfather-second-wife', gender: 'female', parents: [], children: [], spouses: ['grandfather'] },
    uncle: { id: 'uncle', gender: 'male', parents: ['grandfather', 'grandmother'], children: ['cousin'], spouses: ['uncle-spouse'] },
    'uncle-spouse': { id: 'uncle-spouse', gender: 'female', parents: [], children: ['cousin'], spouses: ['uncle'] },
    cousin: { id: 'cousin', parents: ['uncle', 'uncle-spouse'], children: [], spouses: [] },
    father: { id: 'father', gender: 'male', parents: ['grandfather', 'grandmother'], children: ['focus', 'sibling', 'half-sibling'], spouses: ['mother', 'stepmother'] },
    mother: { id: 'mother', gender: 'female', parents: [], children: ['focus', 'sibling'], spouses: ['father'] },
    stepmother: { id: 'stepmother', gender: 'female', parents: [], children: ['half-sibling'], spouses: ['father'] },
    sibling: { id: 'sibling', parents: ['father', 'mother'], children: ['niece'], spouses: ['sibling-spouse'] },
    'sibling-spouse': { id: 'sibling-spouse', parents: [], children: ['niece'], spouses: ['sibling'] },
    niece: { id: 'niece', parents: ['sibling', 'sibling-spouse'], children: [], spouses: [] },
    'half-sibling': { id: 'half-sibling', parents: ['father', 'stepmother'], children: [], spouses: [] },
    focus: { id: 'focus', gender: 'female', parents: ['father', 'mother'], children: ['child'], spouses: ['focus-spouse'] },
    'focus-spouse': { id: 'focus-spouse', gender: 'male', parents: [], children: ['child'], spouses: ['focus'] },
    child: { id: 'child', parents: ['focus', 'focus-spouse'], children: ['grandchild'], spouses: [] },
    'grandchild-other-parent': { id: 'grandchild-other-parent', displayName: 'Other parent of grandchild', parents: [], children: ['grandchild'], spouses: [] },
    grandchild: { id: 'grandchild', parents: ['child', 'grandchild-other-parent'], children: [], spouses: [] }
  };

  const scope = computeDescendantScope(people, 'focus');
  assert.deepEqual(scope.paternalLineIds, ['grandfather', 'father', 'focus']);
  assert.equal(scope.treeRootId, 'grandfather');
  assert.deepEqual([...scope.paternalSiblingIds].sort(), ['half-sibling', 'sibling', 'uncle']);
  assert.deepEqual([...scope.paternalSpouseIds].sort(), ['grandfather-second-wife', 'grandmother', 'mother', 'stepmother']);
  assert.deepEqual([...scope.descendantIds].sort(), ['child', 'focus', 'grandchild']);
  assert.deepEqual([...scope.allowedIds].sort(), [
    'child', 'father', 'focus', 'focus-spouse', 'grandchild', 'grandfather',
    'grandfather-second-wife', 'grandmother', 'half-sibling', 'mother', 'sibling',
    'stepmother', 'uncle'
  ]);
  for (const excluded of ['uncle-spouse', 'cousin', 'sibling-spouse', 'niece']) {
    assert.equal(scope.allowedIds.has(excluded), false, `${excluded} belongs to a sibling's collateral branch`);
  }
  assert.deepEqual([...scope.childrenByParent.get('grandfather')].sort(), ['father', 'uncle']);
  assert.deepEqual([...scope.childrenByParent.get('father')].sort(), ['focus', 'half-sibling', 'sibling']);
  assert.deepEqual([...scope.childrenByParent.get('mother')].sort(), ['focus', 'sibling']);
  assert.deepEqual([...scope.childrenByParent.get('stepmother')], ['half-sibling']);
  assert.deepEqual([...scope.parentsByChild.get('focus')].sort(), ['father', 'mother']);
  assert.deepEqual([...scope.parentsByChild.get('child')].sort(), ['focus', 'focus-spouse']);
  assert.equal(scope.spousePairs.has(descendantPairKey('grandfather', 'grandfather-second-wife')), true);
  assert.equal(scope.spousePairs.has(descendantPairKey('sibling', 'sibling-spouse')), false);
});

test('refocusing on a spouse exchanges paternal ancestry but keeps the shared descendants', () => {
  const people = {
    'old-grandfather': { id: 'old-grandfather', gender: 'male', parents: [], children: ['old-father'], spouses: [] },
    'old-father': { id: 'old-father', gender: 'male', parents: ['old-grandfather'], children: ['old-root'], spouses: [] },
    'old-root': { id: 'old-root', gender: 'male', parents: ['old-father'], children: ['shared-child'], spouses: ['new-focus'] },
    'new-grandfather': { id: 'new-grandfather', gender: 'male', parents: [], children: ['new-father'], spouses: [] },
    'new-father': { id: 'new-father', gender: 'male', parents: ['new-grandfather'], children: ['new-focus', 'new-focus-sibling'], spouses: [] },
    'new-mother': { id: 'new-mother', displayName: 'New mother', parents: [], children: ['new-focus', 'new-focus-sibling'], spouses: [] },
    'new-focus-sibling': { id: 'new-focus-sibling', parents: ['new-father', 'new-mother'], children: [], spouses: [] },
    'new-focus': { id: 'new-focus', gender: 'female', parents: ['new-father', 'new-mother'], children: ['shared-child'], spouses: ['old-root'] },
    'shared-child': { id: 'shared-child', parents: ['old-root', 'new-focus'], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild-other-parent': { id: 'shared-grandchild-other-parent', displayName: 'Other parent of shared grandchild', parents: [], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild': { id: 'shared-grandchild', parents: ['shared-child', 'shared-grandchild-other-parent'], children: [], spouses: [] }
  };

  const oldScope = computeDescendantScope(people, 'old-root');
  const newScope = computeDescendantScope(people, 'new-focus');
  assert.deepEqual(oldScope.paternalLineIds, ['old-grandfather', 'old-father', 'old-root']);
  assert.deepEqual(newScope.paternalLineIds, ['new-grandfather', 'new-father', 'new-focus']);
  assert.equal(oldScope.allowedIds.has('new-father'), false);
  assert.equal(newScope.allowedIds.has('old-father'), false);
  assert.equal(newScope.allowedIds.has('new-focus-sibling'), true, 'all children of the new focus’s father remain visible');
  assert.equal(newScope.allowedIds.has('old-root'), true, 'the former root becomes the focus person’s spouse');
  assert.equal(newScope.linealIds.has('old-root'), false);
  assert.deepEqual([...oldScope.descendantIds].filter(id => id !== 'old-root').sort(), ['shared-child', 'shared-grandchild']);
  assert.deepEqual([...newScope.descendantIds].filter(id => id !== 'new-focus').sort(), ['shared-child', 'shared-grandchild']);
  assert.deepEqual([...newScope.childrenByParent.get('new-father')].sort(), ['new-focus', 'new-focus-sibling']);
  assert.deepEqual([...newScope.parentsByChild.get('shared-child')].sort(), ['new-focus', 'old-root']);
});


test('hides non-marital, incomplete, placeholder, stillborn, and infant child branches without deleting them', () => {
  const person = (id, overrides = {}) => ({
    id, displayName: id, birthYear: '1900', deathYear: '1980', gender: 'unknown',
    parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
    marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, ...overrides
  });
  const people = {
    root: person('root', {
      displayName: 'Root', gender: 'male', children: ['legitimate', 'nonmarital', 'missing', 'nn-child', 'stillborn', 'infant', 'next-year-infant', 'survivor'],
      partners: ['wife', 'mistress'], spouses: ['wife'], nonSpouses: ['mistress'], marriageYears: { wife: '1899' }
    }),
    wife: person('wife', {
      displayName: 'Wife', gender: 'female', children: ['legitimate', 'nn-child', 'stillborn', 'infant', 'next-year-infant', 'survivor'],
      partners: ['root'], spouses: ['root'], marriageYears: { root: '1899' }
    }),
    mistress: person('mistress', {
      displayName: 'Mistress', gender: 'female', children: ['nonmarital'], partners: ['root'], nonSpouses: ['root']
    }),
    legitimate: person('legitimate', { displayName: 'Legitimate Child', parents: ['root', 'wife'] }),
    nonmarital: person('nonmarital', {
      displayName: 'Non-marital Child', parents: ['root', 'mistress'], children: ['hidden-grandchild']
    }),
    'hidden-grandchild': person('hidden-grandchild', { displayName: 'Hidden Grandchild', parents: ['nonmarital', 'grandchild-parent'] }),
    'grandchild-parent': person('grandchild-parent', { displayName: 'Grandchild Parent', children: ['hidden-grandchild'] }),
    missing: person('missing', { displayName: 'One-parent Child', parents: ['root'] }),
    'nn-parent': person('nn-parent', { displayName: 'NN', children: ['nn-parent-child'], partners: ['root'] }),
    'nn-parent-child': person('nn-parent-child', { displayName: 'Child of Placeholder Parent', parents: ['root', 'nn-parent'] }),
    'nn-child': person('nn-child', { displayName: 'NN son of Root', parents: ['root', 'wife'] }),
    stillborn: person('stillborn', { displayName: 'Stillborn daughter', birthYear: '1902', deathYear: '1902', parents: ['root', 'wife'] }),
    infant: person('infant', { displayName: 'Infant One', birthYear: '1903', deathYear: '1903', parents: ['root', 'wife'] }),
    'next-year-infant': person('next-year-infant', { displayName: 'Infant Two', birthYear: '1904', deathYear: '1905', parents: ['root', 'wife'] }),
    survivor: person('survivor', { displayName: 'Young Survivor', birthYear: '1906', deathYear: '1908', parents: ['root', 'wife'] })
  };
  people.root.children.push('nn-parent-child');

  assert.equal(profileHasPlaceholderName(people['nn-parent']), true);
  assert.equal(profileHasPlaceholderName(people['nn-child']), true);
  assert.equal(hiddenBirthReason(people, 'nonmarital', ['root', 'mistress']), 'non-marital-parentage');
  assert.equal(hiddenBirthReason(people, 'missing', ['root']), 'missing-parent');
  assert.equal(hiddenBirthReason(people, 'nn-parent-child', ['root', 'nn-parent']), 'missing-parent');
  assert.equal(hiddenBirthReason(people, 'stillborn', ['root', 'wife']), 'stillbirth');
  assert.equal(hiddenBirthReason(people, 'infant', ['root', 'wife']), 'infant-death');
  assert.equal(hiddenBirthReason(people, 'next-year-infant', ['root', 'wife']), 'infant-death');
  assert.equal(hiddenBirthReason(people, 'survivor', ['root', 'wife']), '');

  const scope = computeDescendantScope(people, 'root');
  for (const visible of ['root', 'wife', 'legitimate', 'survivor']) assert.equal(scope.allowedIds.has(visible), true, visible);
  for (const hidden of ['nonmarital', 'hidden-grandchild', 'missing', 'nn-parent-child', 'nn-child', 'stillborn', 'infant', 'next-year-infant']) {
    assert.equal(scope.allowedIds.has(hidden), false, hidden);
  }
  assert.equal(scope.hiddenBirthReasons.get('nonmarital'), 'non-marital-parentage');
  assert.equal(scope.hiddenBirthReasons.get('missing'), 'missing-parent');
  assert.equal(Object.keys(people).length, 15, 'suppression must not delete stored profiles');

  const explicitFocus = computeDescendantScope(people, 'nonmarital');
  assert.equal(explicitFocus.allowedIds.has('nonmarital'), true, 'an explicitly selected hidden profile remains focusable');
  assert.equal(explicitFocus.allowedIds.has('hidden-grandchild'), true, 'its otherwise valid descendants remain available when focused directly');
});

test('the George III children retain both parents before incomplete-parent filtering', () => {
  const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
  const idByName = new Map(Object.entries(starter.people).map(([id, person]) => [person.displayName, id]));
  const georgeId = idByName.get('George III, King of Great Britain and Ireland');
  const charlotteId = idByName.get('Charlotte of Mecklenburg-Strelitz');
  const scope = computeDescendantScope(starter.people, starter.rootId);
  for (const name of ['George IV, King of the United Kingdom', 'William IV, King of the United Kingdom', 'Edward, Duke of Kent', 'Adolphus, Duke of Cambridge']) {
    const childId = idByName.get(name);
    assert.ok(childId, name);
    assert.deepEqual(new Set(starter.people[childId].parents), new Set([georgeId, charlotteId]), `${name} parents`);
    assert.equal(scope.descendantIds.has(childId), true, `${name} should remain in the British line`);
  }
});
