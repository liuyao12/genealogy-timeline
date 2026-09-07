from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


compaction_path = Path('timeline-compaction.js')
compaction = compaction_path.read_text()

source_order_helper = r'''/**
 * Return a topological run order with source order as the tie-breaker.
 *
 * The family traversal has already established the intended top-to-bottom
 * reading order. Keeping that order gives early royal branches their compact
 * rows first; later branches may still share any row whose horizontal ranges
 * do not conflict.
 */
export function sourceFirstRunOrder(runs = [], precedencePairs = []) {
  const runByNode = runIndexByNode(runs);
  const predecessorsByRun = new Map(runs.map((_, runIndex) => [runIndex, new Set()]));

  precedencePairs.forEach(({ upper, lower }) => {
    const upperRun = runByNode.get(upper);
    const lowerRun = runByNode.get(lower);
    if (upperRun == null || lowerRun == null || upperRun === lowerRun) return;
    predecessorsByRun.get(lowerRun).add(upperRun);
  });

  const pending = runs.map((_, runIndex) => runIndex);
  const result = [];
  const finished = new Set();
  while (pending.length) {
    let position = pending.findIndex(runIndex =>
      [...predecessorsByRun.get(runIndex)].every(predecessor => finished.has(predecessor))
    );
    // Keep malformed imported data usable rather than hanging if a cycle
    // nevertheless reaches the layout layer.
    if (position < 0) position = 0;
    const [runIndex] = pending.splice(position, 1);
    result.push(runIndex);
    finished.add(runIndex);
  }
  return result;
}

'''
helper_anchor = '''/**
 * Convert sibling indexes into strict birth-order precedence pairs.
'''
if compaction.count(helper_anchor) != 1:
    raise SystemExit(f'Expected one source-order helper anchor, found {compaction.count(helper_anchor)}')
compaction = compaction.replace(helper_anchor, source_order_helper + helper_anchor, 1)

source_first_packer = r'''

/**
 * Pack fixed-order direct-family runs from the top downward.
 *
 * Source order reflects the genealogical reading order produced by the
 * traversal. Each earlier branch claims the earliest rows that fit its actual
 * x-ranges. A later branch moves down only when it overlaps an already placed
 * node or violates an explicit parent/sibling precedence relation. Members of
 * one direct-family run always move together.
 */
export function packTimelineRunsSourceFirst({
  nodes = [],
  runs = [],
  precedencePairs = [],
  rowStep = 0,
  conflicts = () => false,
  separation = () => rowStep
} = {}) {
  if (!nodes.length || !runs.length) return [];

  const runByNode = runIndexByNode(runs);
  const predecessorsByNode = new Map(nodes.map((_, index) => [index, []]));
  precedencePairs.forEach(pair => {
    if (!predecessorsByNode.has(pair.upper) || !predecessorsByNode.has(pair.lower)) return;
    predecessorsByNode.get(pair.lower).push({
      index: pair.upper,
      gap: Number.isFinite(pair.gap) ? pair.gap : rowStep
    });
  });

  const runOrder = sourceFirstRunOrder(runs, precedencePairs);
  const placed = [];
  const placedSet = new Set();

  runOrder.forEach(runIndex => {
    const run = runs[runIndex].filter(index => nodes[index]);
    if (!run.length) return;
    const offsetByIndex = new Map(run.map((index, offset) => [index, offset * rowStep]));
    let targetTop = 0;

    // Parents and earlier sibling households must remain above this run.
    run.forEach(index => {
      const offset = offsetByIndex.get(index);
      (predecessorsByNode.get(index) || []).forEach(({ index: upperIndex, gap }) => {
        if (runByNode.get(upperIndex) === runIndex || !placedSet.has(upperIndex)) return;
        targetTop = Math.max(targetTop, nodes[upperIndex].y + gap - offset);
      });
    });

    // Search downward for the first position fitting the whole run. Moving the
    // entire run preserves spouse, parent-child, and adjacent-sibling spacing.
    while (true) {
      let nextTop = targetTop;
      for (const index of run) {
        const offset = offsetByIndex.get(index);
        const targetY = targetTop + offset;
        for (const other of placed) {
          if (!conflicts(index, other)) continue;
          const gap = Math.max(0, Number(separation(index, other)) || 0);
          if (Math.abs(targetY - nodes[other].y) + 1e-9 >= gap) continue;
          nextTop = Math.max(nextTop, nodes[other].y + gap - offset);
        }
      }
      if (nextTop <= targetTop + 1e-9) break;
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
if 'export function packTimelineRunsSourceFirst' in compaction:
    raise SystemExit('Source-first packer already exists')
compaction_path.write_text(compaction.rstrip() + source_first_packer + '\n')

replace_once(
    'app.js',
    "import { birthOrderPairs, packTimelineRunsLowerFirst } from './timeline-compaction.js?v=2';",
    "import { birthOrderPairs, packTimelineRunsSourceFirst } from './timeline-compaction.js?v=3';",
)
replace_once(
    'app.js',
    '''  // Convert the structural reading order into explicit precedence pairs.
  // The source traversal is already top-to-bottom; the lower-first packer
  // reverses only allocation priority, never genealogical order.
''',
    '''  // Convert the structural reading order into explicit precedence pairs.
  // The source-first packer preserves that family reading order while still
  // allowing unrelated, horizontally disjoint branches to share rows.
''',
)
replace_once('app.js', '  packTimelineRunsLowerFirst({', '  packTimelineRunsSourceFirst({')
replace_once(
    'index.html',
    '<script type="module" src="./app.js?v=135"></script>',
    '<script type="module" src="./app.js?v=136"></script>',
)

replace_once(
    'tests/timeline-compaction-priority.test.mjs',
    '''import {
  birthOrderPairs,
  lowerFirstRunOrder,
  packTimelineRunsLowerFirst
} from '../timeline-compaction.js';
''',
    '''import {
  birthOrderPairs,
  lowerFirstRunOrder,
  packTimelineRunsLowerFirst,
  packTimelineRunsSourceFirst,
  sourceFirstRunOrder
} from '../timeline-compaction.js';
''',
)
replace_once(
    'tests/timeline-compaction-priority.test.mjs',
    '''test('keeps a lower sibling branch compact and makes the upper branch absorb the gap', () => {
''',
    '''test('orders ready runs in the established top-to-bottom source order', () => {
  const runs = [[0], [1], [2], [3], [4], [5]];
  const precedencePairs = [
    { upper: 0, lower: 1, gap: 42 },
    { upper: 1, lower: 2, gap: 42 },
    { upper: 0, lower: 3, gap: 42 },
    { upper: 3, lower: 4, gap: 42 },
    { upper: 4, lower: 5, gap: 42 }
  ];
  assert.deepEqual(sourceFirstRunOrder(runs, precedencePairs), [0, 1, 2, 3, 4, 5]);
});

test('keeps a lower sibling branch compact and makes the upper branch absorb the gap', () => {
''',
)
replace_once(
    'tests/timeline-compaction-priority.test.mjs',
    '''test('moves every member of a direct-family run together', () => {
''',
    '''test('source-first packing keeps the earlier branch compact and lets a later branch absorb a collision', () => {
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

  const order = packTimelineRunsSourceFirst({
    nodes,
    runs,
    precedencePairs,
    rowStep,
    conflicts: (first, second) => conflicts.has(conflictKey(first, second)),
    separation: () => rowStep
  });

  assert.deepEqual(order, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(nodes.map(node => node.y), [0, 42, 84, 42, 126, 168]);
  assert.equal(nodes[1].y - nodes[0].y, rowStep);
  assert.equal(nodes[2].y - nodes[1].y, rowStep, 'the earlier branch remains compact');
  assert.ok(nodes[4].y - nodes[3].y > rowStep, 'the later branch absorbs the collision row');
});

test('moves every member of a direct-family run together', () => {
''',
)
replace_once(
    'tests/timeline-compaction-priority.test.mjs',
    '''test('the renderer constrains branch roots, not whole sibling subtrees', () => {
  assert.match(appSource, /const branchRootPrecedence = \[\]/);
  assert.match(appSource, /birthOrderPairs\(siblingRoots, nodeBirthYear\)/);
  assert.doesNotMatch(appSource, /siblingHouseholdConstraints/);
});
''',
    '''test('the renderer constrains branch roots, not whole sibling subtrees', () => {
  assert.match(appSource, /const branchRootPrecedence = \[\]/);
  assert.match(appSource, /birthOrderPairs\(siblingRoots, nodeBirthYear\)/);
  assert.doesNotMatch(appSource, /siblingHouseholdConstraints/);
});

test('the renderer gives established source order priority during compaction', () => {
  assert.match(appSource, /import \{ birthOrderPairs, packTimelineRunsSourceFirst \}/);
  assert.match(appSource, /packTimelineRunsSourceFirst\(\{/);
  assert.doesNotMatch(appSource, /packTimelineRunsLowerFirst\(\{/);
});
''',
)
