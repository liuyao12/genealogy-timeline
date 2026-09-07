import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  birthOrderPairs,
  lowerFirstRunOrder,
  packTimelineRunsLowerFirst
} from '../timeline-compaction.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('orders ready runs from the visually lowest source branch upward', () => {
  const runs = [[0], [1], [2], [3], [4], [5]];
  const precedencePairs = [
    { upper: 0, lower: 1, gap: 42 },
    { upper: 1, lower: 2, gap: 42 },
    { upper: 0, lower: 3, gap: 42 },
    { upper: 3, lower: 4, gap: 42 },
    { upper: 4, lower: 5, gap: 42 }
  ];
  assert.deepEqual(lowerFirstRunOrder(runs, precedencePairs), [5, 4, 3, 2, 1, 0]);
});

test('keeps a lower sibling branch compact and makes the upper branch absorb the gap', () => {
  // Source order is one upper branch (0,1,2), then one lower branch (3,4,5).
  // The late upper descendant 2 conflicts with the middle lower node 4. A
  // top-down greedy layout puts 2 between 3 and 4; lower-first packing gives
  // 3,4,5 consecutive rows and lets the upper branch spread instead.
  const rowStep = 42;
  const nodes = Array.from({ length: 6 }, (_, index) => ({ key: String(index), y: index * rowStep }));
  const runs = [[0], [1], [2], [3], [4], [5]];
  const precedencePairs = [
    { upper: 0, lower: 1, gap: rowStep },
    { upper: 1, lower: 2, gap: rowStep },
    { upper: 0, lower: 3, gap: rowStep },
    { upper: 3, lower: 4, gap: rowStep },
    { upper: 4, lower: 5, gap: rowStep }
  ];
  const conflictKey = (first, second) => [first, second].sort((a, b) => a - b).join('|');
  const conflicts = new Set([conflictKey(2, 4)]);

  const order = packTimelineRunsLowerFirst({
    nodes,
    runs,
    precedencePairs,
    rowStep,
    conflicts: (first, second) => conflicts.has(conflictKey(first, second)),
    separation: () => rowStep
  });

  assert.deepEqual(order, [5, 4, 3, 2, 1, 0]);
  assert.deepEqual(nodes.map(node => node.y), [0, 84, 126, 42, 84, 126]);
  assert.equal(nodes[4].y - nodes[3].y, rowStep);
  assert.equal(nodes[5].y - nodes[4].y, rowStep);
  assert.ok(nodes[1].y - nodes[0].y > rowStep, 'the earlier upper branch, not the lower branch, absorbs the extra row');
});

test('moves every member of a direct-family run together', () => {
  const rowStep = 42;
  const nodes = [
    { key: 'upper', y: 0 },
    { key: 'lower-parent', y: 42 },
    { key: 'lower-spouse', y: 84 },
    { key: 'lower-child', y: 126 }
  ];
  const runs = [[0], [1, 2, 3]];
  packTimelineRunsLowerFirst({
    nodes,
    runs,
    precedencePairs: [{ upper: 0, lower: 1, gap: rowStep }],
    rowStep,
    conflicts: () => true,
    separation: () => rowStep
  });
  assert.equal(nodes[2].y - nodes[1].y, rowStep);
  assert.equal(nodes[3].y - nodes[2].y, rowStep);
});


test('fits an upper branch into a frozen lower-branch gap without widening it', () => {
  const rowStep = 42;
  // 0→1 is the earlier/upper branch; 2→3→4 is the later/lower branch.
  // A larger collision gap between 3 and 4 creates one reusable row. Node 1
  // should occupy that row after the lower branch is frozen.
  const nodes = Array.from({ length: 5 }, (_, index) => ({ key: String(index), y: index * rowStep }));
  const runs = [[0], [1], [2], [3], [4]];
  const precedencePairs = [
    { upper: 0, lower: 1, gap: rowStep },
    { upper: 0, lower: 2, gap: rowStep },
    { upper: 2, lower: 3, gap: rowStep },
    { upper: 3, lower: 4, gap: rowStep }
  ];
  const key = (first, second) => [first, second].sort((a, b) => a - b).join('|');
  const conflicts = new Set([key(3, 4), key(1, 4)]);

  packTimelineRunsLowerFirst({
    nodes,
    runs,
    precedencePairs,
    rowStep,
    conflicts: (first, second) => conflicts.has(key(first, second)),
    separation: (first, second) => key(first, second) === key(3, 4) ? rowStep * 2 : rowStep
  });

  assert.deepEqual(nodes.map(node => node.y), [0, 126, 42, 84, 168]);
  assert.equal(nodes[3].y - nodes[2].y, rowStep);
  assert.equal(nodes[4].y - nodes[3].y, rowStep * 2, 'the frozen lower gap must not widen');
  assert.equal(nodes[1].y, nodes[3].y + rowStep, 'the upper branch should occupy the existing hole');
  assert.ok(nodes[0].y < nodes[2].y, 'the earlier-born branch root must remain above the later root');
});

test('creates strict sibling precedence in birth order', () => {
  const years = new Map([[10, 1908], [11, 1901], [12, 1905], [13, null], [14, 1905]]);
  assert.deepEqual(
    birthOrderPairs([10, 11, 12, 13, 14], index => years.get(index)),
    [
      { upper: 11, lower: 12 },
      { upper: 12, lower: 14 },
      { upper: 14, lower: 10 },
      { upper: 10, lower: 13 }
    ]
  );
});

test('the renderer constrains branch roots, not whole sibling subtrees', () => {
  assert.match(appSource, /const branchRootPrecedence = \[\]/);
  assert.match(appSource, /birthOrderPairs\(siblingRoots, nodeBirthYear\)/);
  assert.doesNotMatch(appSource, /siblingHouseholdConstraints/);
});
