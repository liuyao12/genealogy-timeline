import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('global event labels render as pointed badges centered over event bands', () => {
  assert.match(app, /layoutGlobalEventLabels/);
  assert.match(app, /global-event-label-box/);
  assert.match(app, /global-event-label-text/);
  assert.match(app, /global-event-label-pointer/);
  assert.doesNotMatch(app, /class: 'global-event-label', x: x \+ 4, y: 56/);
});

test('event-label lanes are bottom-aligned immediately above the year numerals', () => {
  assert.match(app, /const rulerCoreOffset = globalEventLabelLayout\.laneCount[\s\S]*?16 \+ \(globalEventLabelLayout\.laneCount - 1\) \* globalEventLabelLaneStep/);
  assert.match(app, /const labelY = rulerCoreOffset - 14 - labelGeometry\.lane \* globalEventLabelLaneStep/);
  assert.match(app, /y2: rulerCoreOffset \+ 12/);
});

test('the first timeline row sits directly below the dynamic ruler baseline', () => {
  assert.match(app, /const rulerHeight = rulerBaseline \+ 1;/);
  assert.match(app, /const top = rulerHeight;/);
  assert.match(app, /contentTop: top/);
  assert.match(app, /ruler\.style\.marginBottom = `-\$\{rulerHeight\}px`/);
});

test('image export crops the former blank timeline header below the ruler', () => {
  assert.match(app, /const contentTop = Math\.max\(0, Number\(timelineRulerGeometry\?\.contentTop\) \|\| 0\);/);
  assert.match(app, /y: timelineBox\.y \+ TIMELINE_PAN_MARGIN\.top \+ contentTop/);
  assert.match(app, /height: timelineBox\.height - TIMELINE_PAN_MARGIN\.top - TIMELINE_PAN_MARGIN\.bottom - contentTop/);
});

test('event badges use the same rounded box and pointer vocabulary as the As-of label', () => {
  assert.match(styles, /\.global-event-label-box/);
  assert.match(styles, /\.global-event-label-pointer/);
  assert.match(styles, /\.global-event-label-text/);
  assert.match(styles, /\.timeline-ruler \{[^}]*height: 44px;[^}]*margin-bottom: -44px;/s);
});
