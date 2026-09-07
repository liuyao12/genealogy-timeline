import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lowerFirstRunOrder,
  packTimelineRunsLowerFirst
} from '../timeline-compaction.js';

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
