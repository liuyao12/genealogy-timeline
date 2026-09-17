from pathlib import Path


def replace_once(path, before, after):
    text = path.read_text()
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {before[:80]}')
    path.write_text(text.replace(before, after, 1))


replace_once(Path('app.js'), 'const rowStep = rowHeight * 1.5;', '''// Immediate relatives stay visibly close at every node-height setting.
  // timelineVerticalSeparation adds a further 10 px for everyone else.
  const rowStep = rowHeight + 6;''')
replace_once(Path('app.js'), '// Direct relatives retain the half-node-height row gutter.',
    '// Direct relatives retain a compact six-pixel row gutter.')
replace_once(Path('app.js'), '''  // Intersecting horizontal ranges keep at least half a node height of clear
  // space after both compaction passes, including within rigid family runs.''',
    '''  // Intersecting horizontal ranges keep their relationship-aware clearance
  // after both compaction passes, including within rigid family runs.''')
replace_once(Path('README.md'), '''All overlapping rows keep a minimum clear vertical gap of half the selected node height (14 px for the default 28 px nodes). Unrelated rows retain a further 10 px gutter wherever their complete node ranges overlap horizontally, while obstacles may leave a larger gap. The same minimum applies inside rigid family runs and after the final packing pass.''',
    '''Spouses, parent-child pairs, and siblings (including half-siblings) keep a compact 6 px clear vertical gap at every node-height setting. Everyone else keeps a 16 px minimum gap wherever their complete node ranges overlap horizontally; sharing a spouse alone does not make two people immediate family. At the default 28 px node height these are 34 px and 44 px row-origin distances. Obstacles and intervening branches may leave a larger gap, but consecutive immediate-family runs remain compact after the final packing pass. Browser regression checks distinguish all three immediate-family categories from other pairs at every supported node height.''')
replace_once(Path('index.html'), './app.js?v=153', './app.js?v=154')
for path in Path('tests').glob('*.test.mjs'):
    text = path.read_text()
    updated = text.replace('app\\.js\\?v=153', 'app\\.js\\?v=154')
    if updated != text:
        path.write_text(updated)

p = Path('.github/scripts/check_two_line_chronology.mjs')
replace_once(p, "import assert from 'node:assert/strict';", "import assert from 'node:assert/strict';\nimport { writeFileSync } from 'node:fs';")
text = p.read_text()
start = text.index('  // Check actual packed SVG geometry')
end = text.index('  const profileButton =', start)
text = text[:start] + '''  // Check rendered geometry, not just a shared lower bound. The September
  // 2026 regression gave relatives half-height gaps and passed a collision-only
  // test. Require both compact relatives AND wider unrelated rows at every size.
  const people = (await fetch(new URL('./data/british-royal-line.json', location.href))
    .then(response => response.json())).people;
  const relationship = (a, b) => {
    if (a.personId === b.personId) return 'same-profile';
    const first = people[a.personId], second = people[b.personId];
    if (!first || !second) throw new Error('Geometry check encountered an unknown profile.');
    if (first.spouses.includes(second.id) || second.spouses.includes(first.id)) return 'spouses';
    if (first.parents.includes(second.id) || second.parents.includes(first.id)
      || first.children.includes(second.id) || second.children.includes(first.id)) return 'parent-child';
    if (first.parents.some(id => second.parents.includes(id))) return 'siblings';
    return 'other';
  };
  const spacingChecks = [];
  const down = document.getElementById('timeline-height-down');
  const up = document.getElementById('timeline-height-up');
  while (!down.disabled) down.click();
  for (const expectedHeight of [24, 28, 32, 36, 42]) {
    const boxes = [...document.querySelectorAll('#timeline-canvas .timeline-node')].map(node => {
      const rect = node.querySelector('.lifespan').getBBox();
      const position = node.transform.baseVal.consolidate().matrix;
      return { id: node.dataset.nodeKey, personId: node.dataset.personId,
        x: position.e + rect.x, y: position.f + rect.y, width: rect.width, height: rect.height };
    });
    const minimumByRelationship = {};
    let overlappingPairs = 0;
    for (let first = 0; first < boxes.length; first += 1) {
      if (boxes[first].height !== expectedHeight) throw new Error('Height setting did not update the layout.');
      for (let second = first + 1; second < boxes.length; second += 1) {
        const a = boxes[first], b = boxes[second];
        if (a.x >= b.x + b.width || b.x >= a.x + a.width) continue;
        overlappingPairs += 1;
        const kind = relationship(a, b);
        const gap = Math.abs(a.y - b.y) - expectedHeight;
        minimumByRelationship[kind] = Math.min(minimumByRelationship[kind] ?? Infinity, gap);
        const requiredGap = kind === 'other' ? 16 : 6;
        if (gap + 0.01 < requiredGap) {
          throw new Error('Insufficient relationship-aware clearance: ' + JSON.stringify({ a: a.id, b: b.id, kind, expectedHeight, gap }));
        }
      }
    }
    // Each category must actually be exercised and attain its compact minimum.
    // Checking only >= would fail to catch a return to uniformly large gaps.
    for (const kind of ['spouses', 'parent-child', 'siblings', 'other']) {
      const expectedGap = kind === 'other' ? 16 : 6;
      if (!Number.isFinite(minimumByRelationship[kind])
        || Math.abs(minimumByRelationship[kind] - expectedGap) > 0.01) {
        throw new Error('Compact spacing missing: ' + JSON.stringify({ kind, expectedHeight, expectedGap, minimumByRelationship }));
      }
    }
    spacingChecks.push({ height: expectedHeight, nodes: boxes.length, overlappingPairs, minimumByRelationship });
    if (!up.disabled) up.click();
  }
  down.click(); down.click(); down.click(); // Restore the default 28 px height.
''' + text[end:]
p.write_text(text)
replace_once(p, "console.log('Chronology, circular controls, and half-height branch spacing passed:', JSON.stringify(result.spacingChecks));",
    '''console.log('Chronology, circular controls, and relationship-aware spacing passed:', JSON.stringify(result.spacingChecks));
if (process.env.LINEAGE_REPORT) writeFileSync(process.env.LINEAGE_REPORT, JSON.stringify(result, null, 2) + '\\n');
if (process.env.LINEAGE_SCREENSHOT) {
  await evaluate("document.getElementById('close-detail').click()");
  await sleep(300);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(process.env.LINEAGE_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
}''')
