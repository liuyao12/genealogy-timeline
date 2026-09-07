import test from 'node:test';
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
  const byName = Object.fromEntries(layout.items.map(item => [item.name, item]));
  assert.equal(byName['Long event one'].anchorX, 56);
  assert.equal(byName['Long event two'].anchorX, 60);
  assert.equal(byName['Long event three'].anchorX, 64);
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
