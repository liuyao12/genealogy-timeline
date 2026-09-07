from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    path.write_text(text.replace(old, new, 1))


replace_once(
    Path('/tmp/layout-pairwise-runs/app.js'),
    'if (previousIndex != null && timelineNodesAreImmediateFamily(nodes[previousIndex], nodes[index])) currentRun.push(index);',
    'if (previousIndex != null && currentRun.every(runIndex => timelineNodesAreImmediateFamily(nodes[runIndex], nodes[index]))) currentRun.push(index);',
)
replace_once(
    Path('/tmp/layout-singleton-runs/app.js'),
    '    runs: directRuns,',
    '    runs: nodes.map((_, index) => [index]),',
)

helper_addition = r'''

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
    if (position < 0) position = 0;
    const [runIndex] = pending.splice(position, 1);
    result.push(runIndex);
    finished.add(runIndex);
  }
  return result;
}

export function packTimelineRunsSourceFirst({
  nodes = [], runs = [], precedencePairs = [], rowStep = 0,
  conflicts = () => false, separation = () => rowStep
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
    run.forEach(index => {
      const offset = offsetByIndex.get(index);
      (predecessorsByNode.get(index) || []).forEach(({ index: upperIndex, gap }) => {
        if (runByNode.get(upperIndex) === runIndex || !placedSet.has(upperIndex)) return;
        targetTop = Math.max(targetTop, nodes[upperIndex].y + gap - offset);
      });
    });
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

export function packTimelineRunsAdaptive(options = {}) {
  const nodes = options.nodes || [];
  if (!nodes.length) return 'none';
  const originalY = nodes.map(node => node.y);
  const cloneNodes = () => nodes.map((node, index) => ({ ...node, y: originalY[index] }));
  const lowerNodes = cloneNodes();
  const sourceNodes = cloneNodes();
  packTimelineRunsLowerFirst({ ...options, nodes: lowerNodes });
  packTimelineRunsSourceFirst({ ...options, nodes: sourceNodes });
  const minimumOriginal = Math.min(...originalY);
  const normalizedOriginal = originalY.map(y => y - minimumOriginal);
  const score = candidate => {
    const ys = candidate.map(node => node.y);
    return {
      span: Math.max(...ys) - Math.min(...ys),
      movement: ys.reduce((sum, y, index) => sum + Math.abs(y - normalizedOriginal[index]), 0)
    };
  };
  const lowerScore = score(lowerNodes);
  const sourceScore = score(sourceNodes);
  const chooseSource = sourceScore.span < lowerScore.span - 1e-9
    || (Math.abs(sourceScore.span - lowerScore.span) <= 1e-9 && sourceScore.movement <= lowerScore.movement);
  const chosen = chooseSource ? sourceNodes : lowerNodes;
  nodes.forEach((node, index) => { node.y = chosen[index].y; });
  return chooseSource ? 'source-first' : 'lower-first';
}
'''

for directory, packer in [
    ('/tmp/layout-source-first', 'packTimelineRunsSourceFirst'),
    ('/tmp/layout-adaptive', 'packTimelineRunsAdaptive'),
]:
    root = Path(directory)
    helper_path = root / 'timeline-compaction.js'
    helper_path.write_text(helper_path.read_text() + helper_addition)
    app_path = root / 'app.js'
    replace_once(
        app_path,
        "import { birthOrderPairs, packTimelineRunsLowerFirst } from './timeline-compaction.js?v=2';",
        f"import {{ birthOrderPairs, {packer} }} from './timeline-compaction.js?v=2';",
    )
    replace_once(app_path, 'packTimelineRunsLowerFirst({', f'{packer}({{')
