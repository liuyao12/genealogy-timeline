import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope, descendantPairKey } from '../descendant-scope.js';

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
    root: { id: 'root', children: [], parents: [], spouses: ['root-spouse'] },
    'root-spouse': { id: 'root-spouse', children: [], parents: [], spouses: ['root'] },
    child: { id: 'child', children: ['grandchild'], parents: ['root', 'root-spouse'], spouses: [] },
    'grandchild-other-parent': { id: 'grandchild-other-parent', children: ['grandchild'], parents: [], spouses: [] },
    grandchild: { id: 'grandchild', children: [], parents: [], spouses: [] }
  };
  const scope = computeDescendantScope(people, 'root');
  assert.deepEqual([...scope.descendantIds], ['root', 'child', 'grandchild']);
  assert.deepEqual([...scope.childrenByParent.get('root')], ['child']);
  assert.deepEqual([...scope.parentsByChild.get('child')].sort(), ['root', 'root-spouse']);
  assert.deepEqual([...scope.childrenByParent.get('child')], ['grandchild']);
  assert.deepEqual([...scope.parentsByChild.get('grandchild')], ['child']);
  assert.deepEqual([...scope.allParentsByChild.get('grandchild')].sort(), ['child', 'grandchild-other-parent']);
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
    'grandchild-other-parent': { id: 'grandchild-other-parent', parents: [], children: ['grandchild'], spouses: [] },
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
    'new-father': { id: 'new-father', gender: 'male', parents: ['new-grandfather'], children: ['new-focus', 'new-focus-sibling'], spouses: ['new-mother'] },
    'new-mother': { id: 'new-mother', gender: 'female', parents: [], children: ['new-focus', 'new-focus-sibling'], spouses: ['new-father'] },
    'new-focus-sibling': { id: 'new-focus-sibling', parents: ['new-father', 'new-mother'], children: [], spouses: [] },
    'new-focus': { id: 'new-focus', gender: 'female', parents: ['new-father', 'new-mother'], children: ['shared-child'], spouses: ['old-root'] },
    'shared-child': { id: 'shared-child', parents: ['old-root', 'new-focus'], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild-other-parent': { id: 'shared-grandchild-other-parent', parents: [], children: ['shared-grandchild'], spouses: [] },
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


test('hides incomplete, infant, placeholder, and non-marital births without deleting their records', () => {
  const people = {
    root: {
      id: 'root', gender: 'male', birthYear: '1970', parents: [],
      children: ['legitimate', 'infant', 'placeholder', 'missing-parent', 'non-marital'],
      partners: ['spouse', 'mistress'], spouses: ['spouse'], nonSpouses: ['mistress'],
      marriageYears: { spouse: '1995' }
    },
    spouse: {
      id: 'spouse', gender: 'female', birthYear: '1972', parents: [],
      children: ['legitimate', 'infant', 'placeholder'], partners: ['root'], spouses: ['root'],
      nonSpouses: [], marriageYears: { root: '1995' }
    },
    mistress: {
      id: 'mistress', gender: 'female', birthYear: '1975', parents: [],
      children: ['non-marital'], partners: ['root'], spouses: [], nonSpouses: ['root']
    },
    legitimate: {
      id: 'legitimate', displayName: 'Legitimate Child', birthYear: '2000', deathYear: '2080',
      parents: ['root', 'spouse'], children: ['legitimate-grandchild'], spouses: []
    },
    'legitimate-grandchild': {
      id: 'legitimate-grandchild', displayName: 'Grandchild', birthYear: '2030', deathYear: '2100',
      parents: ['legitimate', 'grandchild-other-parent'], children: [], spouses: []
    },
    'grandchild-other-parent': {
      id: 'grandchild-other-parent', displayName: 'Other Parent', birthYear: '2002',
      parents: [], children: ['legitimate-grandchild'], spouses: ['legitimate']
    },
    infant: {
      id: 'infant', displayName: 'Infant Child', birthYear: '2001', deathYear: '2002',
      parents: ['root', 'spouse'], children: [], spouses: []
    },
    placeholder: {
      id: 'placeholder', displayName: 'NN, daughter of Root', birthYear: '2003', deathYear: '2070',
      parents: ['root', 'spouse'], children: [], spouses: []
    },
    'missing-parent': {
      id: 'missing-parent', displayName: 'One Parent Child', birthYear: '2004', deathYear: '2070',
      parents: ['root'], children: [], spouses: []
    },
    'non-marital': {
      id: 'non-marital', displayName: 'Non-marital Child', birthYear: '2005', deathYear: '2070',
      parents: ['root', 'mistress'], children: ['hidden-grandchild'], spouses: [],
      geniParentUnionStatus: 'partner', geniNonMaritalBirth: true
    },
    'hidden-grandchild': {
      id: 'hidden-grandchild', displayName: 'Hidden Grandchild', birthYear: '2035', deathYear: '2100',
      parents: ['non-marital', 'hidden-other-parent'], children: [], spouses: []
    },
    'hidden-other-parent': {
      id: 'hidden-other-parent', displayName: 'Hidden Other Parent', birthYear: '2006',
      parents: [], children: ['hidden-grandchild'], spouses: ['non-marital']
    }
  };

  const scope = computeDescendantScope(people, 'root');
  assert.deepEqual([...scope.descendantIds].sort(), ['legitimate', 'legitimate-grandchild', 'root']);
  assert.equal(scope.allowedIds.has('spouse'), true);
  for (const hidden of ['infant', 'placeholder', 'missing-parent', 'non-marital', 'hidden-grandchild', 'mistress']) {
    assert.equal(scope.allowedIds.has(hidden), false, `${hidden} should be omitted from the drawing`);
  }
  assert.equal(scope.suppressionReasons.get('infant'), 'infant-death');
  assert.equal(scope.suppressionReasons.get('placeholder'), 'placeholder-name');
  assert.equal(scope.suppressionReasons.get('missing-parent'), 'missing-parent');
  assert.equal(scope.suppressionReasons.get('non-marital'), 'non-marital-parent-union');
  assert.ok(people['non-marital'], 'hidden records remain stored and searchable');
});

test('keeps a suppressed profile visible when it is explicitly chosen as the focus', () => {
  const people = {
    father: { id: 'father', gender: 'male', parents: [], children: ['focus'], spouses: [] },
    focus: { id: 'focus', displayName: 'NN', birthYear: '1900', deathYear: '1900', parents: ['father'], children: [], spouses: [] }
  };
  const scope = computeDescendantScope(people, 'focus');
  assert.equal(scope.allowedIds.has('focus'), true);
  assert.equal(scope.paternalLineIds.includes('father'), true);
});
