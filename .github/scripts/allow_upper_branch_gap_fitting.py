from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


app_path = Path("app.js")
app = app_path.read_text()
app = app.replace(
    "import { packTimelineRunsLowerFirst } from './timeline-compaction.js?v=1';",
    "import { birthOrderPairs, packTimelineRunsLowerFirst } from './timeline-compaction.js?v=2';",
    1,
)

pattern = re.compile(
    r"  const preferredY = nodes\.map\(node => Math\.max\(0, node\.y\)\);.*?"
    r"(?=  // Consecutive direct relatives form a rigid packing run\.)",
    re.DOTALL,
)
replacement = """  const childrenByIndex = new Map(nodes.map((_, index) => [index, []]));
  const parentIndexByIndex = new Map();
  nodes.forEach((node, index) => {
    const parentIndex = indexByKey.get(displayParentByKey.get(node.key));
    if (parentIndex == null || parentIndex === index) return;
    parentIndexByIndex.set(index, parentIndex);
    childrenByIndex.get(parentIndex).push(index);
  });

  // The traversal has already established the intended household sequence.
  // Preserve only the order of branch roots as a hard vertical invariant. The
  // descendants inside an earlier branch may then occupy unused rows inside a
  // later branch, but can never move or spread that already-packed branch.
  const branchRootPrecedence = [];
  const branchRootPrecedenceKeys = new Set();
  const addBranchRootPrecedence = (upper, lower) => {
    if (upper == null || lower == null || upper === lower) return;
    const key = `${upper}>${lower}`;
    if (branchRootPrecedenceKeys.has(key)) return;
    branchRootPrecedenceKeys.add(key);
    branchRootPrecedence.push({
      upper,
      lower,
      gap: Math.max(
        requiredVerticalSeparation,
        timelineVerticalSeparation(upper, lower, nodes, rowStep)
      )
    });
  };
  const nodeBirthYear = index => numericYear(state.people[nodes[index]?.id]?.birthYear);

  childrenByIndex.forEach(childIndexes => {
    if (childIndexes.length < 2) return;
    const sourceOrder = [...childIndexes].sort((first, second) => first - second);
    const siblingRoots = sourceOrder.filter(index => !nodes[index].isSpouse);
    const siblingRootSet = new Set(siblingRoots);

    // Spouse/household roots retain the chronology produced by the traversal.
    // Pure sibling roots are handled separately by their actual birth years.
    for (let index = 1; index < sourceOrder.length; index += 1) {
      const upper = sourceOrder[index - 1];
      const lower = sourceOrder[index];
      if (siblingRootSet.has(upper) && siblingRootSet.has(lower)) continue;
      addBranchRootPrecedence(upper, lower);
    }

    // Within every displayed sibling set, vertical order is strictly birth
    // order. Equal or unknown years retain deterministic source order.
    birthOrderPairs(siblingRoots, nodeBirthYear).forEach(({ upper, lower }) => {
      addBranchRootPrecedence(upper, lower);
    });
  });
"""
app, count = pattern.subn(replacement, app, count=1)
if count != 1:
    raise SystemExit(f"Expected one stabilizer prelude, found {count}")

old = """  siblingHouseholdConstraints.forEach((precedingGroups, followingIndex) => {
    precedingGroups.flat().forEach(precedingIndex => {
      addPrecedence(
        precedingIndex,
        followingIndex,
        timelineVerticalSeparation(followingIndex, precedingIndex, nodes, rowStep)
      );
    });
  });
"""
new = """  branchRootPrecedence.forEach(({ upper, lower, gap }) => {
    addPrecedence(upper, lower, gap);
  });
"""
if app.count(old) != 1:
    raise SystemExit(f"Expected one sibling constraint conversion block, found {app.count(old)}")
app = app.replace(old, new, 1)
app_path.write_text(app)

compaction_path = Path("timeline-compaction.js")
compaction = compaction_path.read_text()
marker = """/**
 * Pack fixed-order direct-family runs from the bottom upward.
"""
helper = """/**
 * Convert sibling indexes into strict birth-order precedence pairs.
 *
 * The incoming order is retained for equal or unknown years so the result is
 * deterministic and remains compatible with the established household order.
 */
export function birthOrderPairs(indexes = [], birthYearFor = () => null) {
  const sourcePosition = new Map();
  const uniqueIndexes = [];
  indexes.forEach((index, position) => {
    if (sourcePosition.has(index)) return;
    sourcePosition.set(index, position);
    uniqueIndexes.push(index);
  });
  const yearFor = index => {
    const value = Number(birthYearFor(index));
    return Number.isFinite(value) ? value : null;
  };
  uniqueIndexes.sort((first, second) => {
    const firstYear = yearFor(first);
    const secondYear = yearFor(second);
    if (firstYear != null && secondYear != null && firstYear !== secondYear) return firstYear - secondYear;
    if (firstYear != null && secondYear == null) return -1;
    if (firstYear == null && secondYear != null) return 1;
    return sourcePosition.get(first) - sourcePosition.get(second);
  });
  return uniqueIndexes.slice(1).map((lower, index) => ({
    upper: uniqueIndexes[index],
    lower
  }));
}

"""
if compaction.count(marker) != 1:
    raise SystemExit(f"Expected one compaction marker, found {compaction.count(marker)}")
compaction = compaction.replace(marker, helper + marker, 1)
compaction = compaction.replace(
    """ * The lower source branch claims its compact rows first. Earlier/upper branches
 * then move upward around those rows. This is the dual of an ordinary top-down
 * greedy packer, which gives upper branches priority and can split a lower
 * sibling branch merely to fit a late descendant of an upper branch.
""",
    """ * The lower source branch claims and freezes its compact rows first. Earlier
 * branches may then reuse any genuine holes between those rows, but never move
 * or widen the lower branch. This is the dual of an ordinary top-down greedy
 * packer, which gives upper branches priority and can split a lower branch.
""",
    1,
)
compaction_path.write_text(compaction)

replace_once(
    "index.html",
    '<script type="module" src="./app.js?v=133"></script>',
    '<script type="module" src="./app.js?v=134"></script>',
)

test_path = Path("tests/timeline-compaction-priority.test.mjs")
test_text = test_path.read_text()
test_text = test_text.replace(
    """import {
  lowerFirstRunOrder,
  packTimelineRunsLowerFirst
} from '../timeline-compaction.js';
""",
    """import { readFileSync } from 'node:fs';
import {
  birthOrderPairs,
  lowerFirstRunOrder,
  packTimelineRunsLowerFirst
} from '../timeline-compaction.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
""",
    1,
)
test_text += """

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
"""
test_path.write_text(test_text)
