function rounded(value) {
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
    const rawValue = birthYearFor(index);
    if (rawValue == null || rawValue === '') return null;
    const value = Number(rawValue);
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

/**
 * Pack fixed-order direct-family runs from the bottom upward.
 *
 * The lower source branch claims and freezes its compact rows first. Earlier
 * branches may then reuse any genuine holes between those rows, but never move
 * or widen the lower branch. This is the dual of an ordinary top-down greedy
 * packer, which gives upper branches priority and can split a lower branch.
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
