from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    "timeline-event-labels.js",
    """    const startYear = Math.max(minYear, rawStartYear);\n    const endYear = Math.min(maxYear, Math.max(rawStartYear, rawEndYear));\n    const anchorX = xForYear(startYear);\n""",
    """    const startYear = Math.max(minYear, rawStartYear);\n    const endYear = Math.min(maxYear, Math.max(rawStartYear, rawEndYear));\n    // A global event is a span, so its label belongs at the midpoint of the\n    // visible band rather than at the first year. Point events naturally keep\n    // their single-year anchor.\n    const anchorYear = startYear + (endYear - startYear) / 2;\n    const anchorX = (xForYear(startYear) + xForYear(endYear)) / 2;\n""",
)

replace_once(
    "timeline-event-labels.js",
    """      startYear,\n      endYear,\n      anchorX,\n""",
    """      startYear,\n      endYear,\n      anchorYear,\n      anchorX,\n""",
)

replace_once(
    "app.js",
    """  const globalEventLabelLaneStep = 22;\n  const globalEventLabelAreaHeight = globalEventLabelLayout.laneCount\n    ? globalEventLabelLayout.laneCount * globalEventLabelLaneStep + 8\n    : 0;\n  const rulerCoreOffset = globalEventLabelAreaHeight;\n""",
    """  const globalEventLabelLaneStep = 22;\n  // Keep the nearest event badge immediately above the year numerals. Extra\n  // collision lanes grow upward, rather than leaving the first badge stranded\n  // at the top of a tall sticky ruler.\n  const rulerCoreOffset = globalEventLabelLayout.laneCount\n    ? 16 + (globalEventLabelLayout.laneCount - 1) * globalEventLabelLaneStep\n    : 0;\n""",
)

replace_once(
    "app.js",
    """      const labelY = 2 + labelGeometry.lane * globalEventLabelLaneStep;\n      const pointerX = labelGeometry.pointerOffset;\n""",
    """      const labelY = rulerCoreOffset - 14 - labelGeometry.lane * globalEventLabelLaneStep;\n      const pointerX = labelGeometry.pointerOffset;\n""",
)

replace_once(
    "app.js",
    """        y2: rulerBaseline,\n        stroke: color\n""",
    """        y2: rulerCoreOffset + 12,\n        stroke: color\n""",
)

replace_once(
    "index.html",
    '<script type="module" src="./app.js?v=129"></script>',
    '<script type="module" src="./app.js?v=130"></script>',
)

Path("tests/timeline-event-labels.test.mjs").write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitEventLabelText,
  layoutGlobalEventLabels
} from '../timeline-event-labels.js';

const xForYear = year => (year - 1900) * 4;

test('packs non-overlapping global event badges into one ruler lane', () => {
  const layout = layoutGlobalEventLabels([
    { name: 'First', startYear: 1910, endYear: 1914 },
    { name: 'Second', startYear: 1950, endYear: 1954 }
  ], { minYear: 1900, maxYear: 2000, xForYear, left: 0, right: 400 });

  assert.equal(layout.laneCount, 1);
  assert.deepEqual(layout.items.map(item => item.lane), [0, 0]);
});

test('anchors each label at the midpoint of its visible event band', () => {
  const layout = layoutGlobalEventLabels([
    { name: 'Whole band', startYear: 1910, endYear: 1920 },
    { name: 'Clipped band', startYear: 1880, endYear: 1920 },
    { name: 'Point event', startYear: 1950, endYear: 1950 }
  ], { minYear: 1900, maxYear: 2000, xForYear, left: 0, right: 400 });

  const byName = Object.fromEntries(layout.items.map(item => [item.name, item]));
  assert.equal(byName['Whole band'].anchorYear, 1915);
  assert.equal(byName['Whole band'].anchorX, 60);
  assert.equal(byName['Clipped band'].anchorYear, 1910);
  assert.equal(byName['Clipped band'].anchorX, 40);
  assert.equal(byName['Point event'].anchorYear, 1950);
  assert.equal(byName['Point event'].anchorX, 200);
});

test('stacks colliding event badges without moving their band-midpoint anchors', () => {
  const layout = layoutGlobalEventLabels([
    { name: 'Long event one', startYear: 1910, endYear: 1918 },
    { name: 'Long event two', startYear: 1911, endYear: 1919 },
    { name: 'Long event three', startYear: 1912, endYear: 1920 }
  ], { minYear: 1900, maxYear: 2000, xForYear, left: 0, right: 400 });

  assert.equal(layout.laneCount, 3);
  assert.deepEqual(layout.items.map(item => item.lane), [0, 1, 2]);
  assert.deepEqual(layout.items.map(item => item.anchorX), [56, 60, 64]);
});

test('clamps a badge to the ruler while keeping its pointer on the band midpoint', () => {
  const layout = layoutGlobalEventLabels([
    { name: 'Event at the left edge', startYear: 1900, endYear: 1905 }
  ], { minYear: 1900, maxYear: 2000, xForYear, left: 0, right: 400 });
  const [item] = layout.items;

  assert.equal(item.left, 0);
  assert.equal(item.anchorYear, 1902.5);
  assert.equal(item.centerX + item.pointerOffset, item.anchorX);
  assert.ok(item.pointerOffset < 0);
});

test('ignores events outside the visible timeline range', () => {
  const layout = layoutGlobalEventLabels([
    { name: 'Before', startYear: 1800, endYear: 1810 },
    { name: 'Visible', startYear: 1950, endYear: 1960 },
    { name: 'After', startYear: 2100, endYear: 2110 }
  ], { minYear: 1900, maxYear: 2000, xForYear, left: 0, right: 400 });

  assert.deepEqual(layout.items.map(item => item.name), ['Visible']);
});

test('shortens labels that exceed the badge width', () => {
  const shortened = fitEventLabelText('A very long global event label', 36, value => value.length * 6);
  assert.ok(shortened.endsWith('…'));
  assert.ok(shortened.length < 'A very long global event label'.length);
});
""")

Path("tests/timeline-ruler-layout.test.mjs").write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('global event labels render as pointed badges centered over event bands', () => {
  assert.match(app, /layoutGlobalEventLabels/);
  assert.match(app, /global-event-label-box/);
  assert.match(app, /global-event-label-text/);
  assert.match(app, /global-event-label-pointer/);
  assert.doesNotMatch(app, /class: 'global-event-label', x: x \\+ 4, y: 56/);
});

test('event-label lanes are bottom-aligned immediately above the year numerals', () => {
  assert.match(app, /const rulerCoreOffset = globalEventLabelLayout\\.laneCount[\\s\\S]*?16 \\+ \\(globalEventLabelLayout\\.laneCount - 1\\) \\* globalEventLabelLaneStep/);
  assert.match(app, /const labelY = rulerCoreOffset - 14 - labelGeometry\\.lane \\* globalEventLabelLaneStep/);
  assert.match(app, /y2: rulerCoreOffset \\+ 12/);
});

test('the first timeline row sits directly below the dynamic ruler baseline', () => {
  assert.match(app, /const rulerHeight = rulerBaseline \\+ 1;/);
  assert.match(app, /const top = rulerHeight;/);
  assert.match(app, /contentTop: top/);
  assert.match(app, /ruler\\.style\\.marginBottom = `-\\$\\{rulerHeight\\}px`/);
});

test('image export crops the former blank timeline header below the ruler', () => {
  assert.match(app, /const contentTop = Math\\.max\\(0, Number\\(timelineRulerGeometry\\?\\.contentTop\\) \\|\\| 0\\);/);
  assert.match(app, /y: timelineBox\\.y \\+ TIMELINE_PAN_MARGIN\\.top \\+ contentTop/);
  assert.match(app, /height: timelineBox\\.height - TIMELINE_PAN_MARGIN\\.top - TIMELINE_PAN_MARGIN\\.bottom - contentTop/);
});

test('event badges use the same rounded box and pointer vocabulary as the As-of label', () => {
  assert.match(styles, /\\.global-event-label-box/);
  assert.match(styles, /\\.global-event-label-pointer/);
  assert.match(styles, /\\.global-event-label-text/);
  assert.match(styles, /\\.timeline-ruler \\{[^}]*height: 44px;[^}]*margin-bottom: -44px;/s);
});
""")
