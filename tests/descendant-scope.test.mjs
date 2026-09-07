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
    root: { id: 'root', children: [], parents: [], spouses: [] },
    child: { id: 'child', children: ['grandchild'], parents: ['root'], spouses: [] },
    grandchild: { id: 'grandchild', children: [], parents: [], spouses: [] }
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

test('adds only the direct paternal line above the focus and all descendants below', () => {
  const people = {
    grandfather: { id: 'grandfather', gender: 'male', parents: [], children: ['father', 'uncle'], spouses: ['grandmother'] },
    grandmother: { id: 'grandmother', gender: 'female', parents: [], children: ['father', 'uncle'], spouses: ['grandfather'] },
    uncle: { id: 'uncle', gender: 'male', parents: ['grandfather', 'grandmother'], children: ['cousin'], spouses: [] },
    cousin: { id: 'cousin', parents: ['uncle'], children: [], spouses: [] },
    father: { id: 'father', gender: 'male', parents: ['grandfather', 'grandmother'], children: ['focus', 'sibling'], spouses: ['mother'] },
    mother: { id: 'mother', gender: 'female', parents: [], children: ['focus', 'sibling'], spouses: ['father'] },
    sibling: { id: 'sibling', parents: ['father', 'mother'], children: [], spouses: [] },
    focus: { id: 'focus', gender: 'female', parents: ['father', 'mother'], children: ['child'], spouses: ['focus-spouse'] },
    'focus-spouse': { id: 'focus-spouse', gender: 'male', parents: [], children: ['child'], spouses: ['focus'] },
    child: { id: 'child', parents: ['focus', 'focus-spouse'], children: ['grandchild'], spouses: [] },
    grandchild: { id: 'grandchild', parents: ['child'], children: [], spouses: [] }
  };

  const scope = computeDescendantScope(people, 'focus');
  assert.deepEqual(scope.paternalLineIds, ['grandfather', 'father', 'focus']);
  assert.equal(scope.treeRootId, 'grandfather');
  assert.deepEqual([...scope.descendantIds].sort(), ['child', 'focus', 'grandchild']);
  assert.deepEqual([...scope.linealIds].sort(), ['child', 'father', 'focus', 'grandchild', 'grandfather']);
  assert.deepEqual([...scope.allowedIds].sort(), ['child', 'father', 'focus', 'focus-spouse', 'grandchild', 'grandfather']);
  for (const excluded of ['grandmother', 'mother', 'uncle', 'cousin', 'sibling']) {
    assert.equal(scope.allowedIds.has(excluded), false, `${excluded} is collateral or maternal and must remain outside the focus tree`);
  }
  assert.deepEqual([...scope.childrenByParent.get('grandfather')], ['father']);
  assert.deepEqual([...scope.childrenByParent.get('father')], ['focus']);
  assert.deepEqual([...scope.parentsByChild.get('focus')], ['father']);
  assert.deepEqual([...scope.parentsByChild.get('child')].sort(), ['focus', 'focus-spouse']);
});

test('refocusing on a spouse exchanges paternal ancestry but keeps the shared descendants', () => {
  const people = {
    'old-grandfather': { id: 'old-grandfather', gender: 'male', parents: [], children: ['old-father'], spouses: [] },
    'old-father': { id: 'old-father', gender: 'male', parents: ['old-grandfather'], children: ['old-root'], spouses: [] },
    'old-root': { id: 'old-root', gender: 'male', parents: ['old-father'], children: ['shared-child'], spouses: ['new-focus'] },
    'new-grandfather': { id: 'new-grandfather', gender: 'male', parents: [], children: ['new-father'], spouses: [] },
    'new-father': { id: 'new-father', gender: 'male', parents: ['new-grandfather'], children: ['new-focus', 'new-focus-sibling'], spouses: [] },
    'new-focus-sibling': { id: 'new-focus-sibling', parents: ['new-father'], children: [], spouses: [] },
    'new-focus': { id: 'new-focus', gender: 'female', parents: ['new-father'], children: ['shared-child'], spouses: ['old-root'] },
    'shared-child': { id: 'shared-child', parents: ['old-root', 'new-focus'], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild': { id: 'shared-grandchild', parents: ['shared-child'], children: [], spouses: [] }
  };

  const oldScope = computeDescendantScope(people, 'old-root');
  const newScope = computeDescendantScope(people, 'new-focus');
  assert.deepEqual(oldScope.paternalLineIds, ['old-grandfather', 'old-father', 'old-root']);
  assert.deepEqual(newScope.paternalLineIds, ['new-grandfather', 'new-father', 'new-focus']);
  assert.equal(oldScope.allowedIds.has('new-father'), false);
  assert.equal(newScope.allowedIds.has('old-father'), false);
  assert.equal(newScope.allowedIds.has('old-root'), true, 'the former root becomes the focus person’s spouse');
  assert.equal(newScope.linealIds.has('old-root'), false);
  assert.deepEqual([...oldScope.descendantIds].filter(id => id !== 'old-root').sort(), ['shared-child', 'shared-grandchild']);
  assert.deepEqual([...newScope.descendantIds].filter(id => id !== 'new-focus').sort(), ['shared-child', 'shared-grandchild']);
  assert.deepEqual([...newScope.childrenByParent.get('new-father')], ['new-focus']);
  assert.deepEqual([...newScope.parentsByChild.get('shared-child')].sort(), ['new-focus', 'old-root']);
});
