from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


module = r'''function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

function runIndexByNode(runs) {
  const result = new Map();
  runs.forEach((run, runIndex) => run.forEach(index => result.set(index, runIndex)));
  return result;
}

/**
 * Return a reverse topological order, breaking ties by later source order.
 * Later runs represent visually lower branches because the family traversal is
 * depth-first and top-to-bottom before compaction.
 */
export function lowerFirstRunOrder(runs = [], precedencePairs = []) {
  const runByNode = runIndexByNode(runs);
  const successorsByRun = new Map(runs.map((_, runIndex) => [runIndex, new Set()]));

  precedencePairs.forEach(({ upper, lower }) => {
    const upperRun = runByNode.get(upper);
    const lowerRun = runByNode.get(lower);
    if (upperRun == null || lowerRun == null || upperRun === lowerRun) return;
    successorsByRun.get(upperRun).add(lowerRun);
  });

  const pending = runs.map((_, runIndex) => runIndex).reverse();
  const result = [];
  const finished = new Set();
  while (pending.length) {
    let position = pending.findIndex(runIndex =>
      [...successorsByRun.get(runIndex)].every(successor => finished.has(successor))
    );
    // The family graph should be acyclic. Keep malformed imported data usable
    // rather than hanging if a cycle nevertheless reaches the layout layer.
    if (position < 0) position = 0;
    const [runIndex] = pending.splice(position, 1);
    result.push(runIndex);
    finished.add(runIndex);
  }
  return result;
}

/**
 * Pack fixed-order direct-family runs from the bottom upward.
 *
 * The lower source branch claims its compact rows first. Earlier/upper branches
 * then move upward around those rows. This is the dual of an ordinary top-down
 * greedy packer, which gives upper branches priority and can split a lower
 * sibling branch merely to fit a late descendant of an upper branch.
 */
export function packTimelineRunsLowerFirst({
  nodes = [],
  runs = [],
  precedencePairs = [],
  rowStep = 0,
  conflicts = () => false,
  separation = () => rowStep
} = {}) {
  if (!nodes.length || !runs.length) return [];

  const runByNode = runIndexByNode(runs);
  const followersByNode = new Map(nodes.map((_, index) => [index, []]));
  precedencePairs.forEach(pair => {
    if (!followersByNode.has(pair.upper) || !followersByNode.has(pair.lower)) return;
    followersByNode.get(pair.upper).push({
      index: pair.lower,
      gap: Number.isFinite(pair.gap) ? pair.gap : rowStep
    });
  });

  const runOrder = lowerFirstRunOrder(runs, precedencePairs);
  const placed = [];
  const placedSet = new Set();

  runOrder.forEach(runIndex => {
    const run = runs[runIndex].filter(index => nodes[index]);
    if (!run.length) return;
    const offsetByIndex = new Map(run.map((index, offset) => [index, offset * rowStep]));
    const runSpan = Math.max(0, (run.length - 1) * rowStep);

    // All branches begin against the same provisional floor. Coordinates may
    // be negative during this pass; one final translation restores y >= 0.
    let targetTop = -runSpan;

    // Parents and earlier sibling households must remain above every already
    // placed child/following branch. Moving farther upward preserves this.
    run.forEach(index => {
      const offset = offsetByIndex.get(index);
      (followersByNode.get(index) || []).forEach(({ index: lowerIndex, gap }) => {
        if (runByNode.get(lowerIndex) === runIndex || !placedSet.has(lowerIndex)) return;
        targetTop = Math.min(targetTop, nodes[lowerIndex].y - gap - offset);
      });
    });

    // Search upward for the nearest position fitting the whole direct-family
    // run. A collision moves every member together, never opening a gap inside
    // the run that an upper branch could occupy.
    while (true) {
      let nextTop = targetTop;
      for (const index of run) {
        const offset = offsetByIndex.get(index);
        const targetY = targetTop + offset;
        for (const other of placed) {
          if (!conflicts(index, other)) continue;
          const gap = Math.max(0, Number(separation(index, other)) || 0);
          if (Math.abs(targetY - nodes[other].y) + 1e-9 >= gap) continue;
          nextTop = Math.min(nextTop, nodes[other].y - gap - offset);
        }
      }
      if (nextTop >= targetTop - 1e-9) break;
      targetTop = nextTop;
    }

    run.forEach(index => {
      nodes[index].y = rounded(targetTop + offsetByIndex.get(index));
      placed.push(index);
      placedSet.add(index);
    });
  });

  const minimumY = Math.min(...nodes.map(node => node.y));
  nodes.forEach(node => { node.y = rounded(node.y - minimumY); });
  return runOrder;
}
'''
Path('timeline-compaction.js').write_text(module)

app_path = Path('app.js')
app = app_path.read_text()
import_anchor = "import { layoutGlobalEventLabels } from './timeline-event-labels.js?v=1';\n"
if app.count(import_anchor) != 1:
    raise SystemExit(f'Expected one compaction import anchor, found {app.count(import_anchor)}')
app = app.replace(
    import_anchor,
    import_anchor + "import { packTimelineRunsLowerFirst } from './timeline-compaction.js?v=1';\n",
    1,
)

function_start = app.index('function stabilizeTimelineOrder(')
start_marker = '  const runByIndex = new Map();'
end_marker = "\n}\n\n// D3's tidy tree gains its compactness"
block_start = app.index(start_marker, function_start)
block_end = app.index(end_marker, block_start)
replacement = r'''  // Convert the structural reading order into explicit precedence pairs.
  // The source traversal is already top-to-bottom; the lower-first packer
  // reverses only allocation priority, never genealogical order.
  const precedencePairs = [];
  const precedenceKeys = new Set();
  const addPrecedence = (upper, lower, gap) => {
    if (upper == null || lower == null || upper === lower) return;
    const key = `${upper}>${lower}:${gap}`;
    if (precedenceKeys.has(key)) return;
    precedenceKeys.add(key);
    precedencePairs.push({ upper, lower, gap });
  };
  parentIndexByIndex.forEach((parentIndex, childIndex) => {
    addPrecedence(parentIndex, childIndex, rowStep);
  });
  siblingHouseholdConstraints.forEach((precedingGroups, followingIndex) => {
    precedingGroups.flat().forEach(precedingIndex => {
      addPrecedence(
        precedingIndex,
        followingIndex,
        timelineVerticalSeparation(followingIndex, precedingIndex, nodes, rowStep)
      );
    });
  });

  packTimelineRunsLowerFirst({
    nodes,
    runs: directRuns,
    precedencePairs,
    rowStep,
    conflicts: (index, other) =>
      timelineRowsConflict(index, other, ranges, horizontalRangesByKey, nodes),
    separation: (index, other) => Math.max(
      requiredVerticalSeparation,
      timelineVerticalSeparation(index, other, nodes, rowStep)
    )
  });
'''
app = app[:block_start] + replacement + app[block_end:]
app_path.write_text(app)

replace_once(
    'index.html',
    '<script type="module" src="./app.js?v=132"></script>',
    '<script type="module" src="./app.js?v=133"></script>',
)

test = r'''import test from 'node:test';
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
'''
Path('tests/timeline-compaction-priority.test.mjs').write_text(test)
