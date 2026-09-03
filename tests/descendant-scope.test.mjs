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
  assert.equal(scope.allowedIds.has('ancestor'), false);
  assert.equal(scope.allowedIds.has('uncle'), false);
  assert.equal(scope.allowedIds.has('cousin'), false);
  assert.equal(scope.allowedIds.has('former-root-spouse'), false);
  assert.equal(scope.allowedIds.has('stepchild'), false);
  assert.equal(scope.allowedIds.has('other-spouse'), false);
  assert.equal(scope.spousePairs.has(descendantPairKey('root', 'root-spouse')), true);
  assert.equal(scope.spousePairs.has(descendantPairKey('root-spouse', 'former-root-spouse')), false);
});

test('uses reverse parent links when a parent children array is sparse', () => {
  const people = {
    root: { id: 'root', children: [], parents: [], spouses: [] },
    child: { id: 'child', children: [], parents: ['root'], spouses: [] },
    grandchild: { id: 'grandchild', children: [], parents: ['child'], spouses: [] }
  };
  const scope = computeDescendantScope(people, 'root');
  assert.deepEqual([...scope.descendantIds], ['root', 'child', 'grandchild']);
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
