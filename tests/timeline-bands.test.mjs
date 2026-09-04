import test from 'node:test';
import assert from 'node:assert/strict';
import { asOfMaskSegments, decadeBandRects, decadeBands } from '../timeline-bands.js';

test('creates alternating bands on fixed calendar decades', () => {
  assert.deepEqual(decadeBands(1420, 1460), [
    { decade: 1420, startYear: 1420, endYear: 1430, tone: 0 },
    { decade: 1430, startYear: 1430, endYear: 1440, tone: 1 },
    { decade: 1440, startYear: 1440, endYear: 1450, tone: 0 },
    { decade: 1450, startYear: 1450, endYear: 1460, tone: 1 }
  ]);
});

test('clips partial first and last decades without shifting their tones', () => {
  assert.deepEqual(decadeBands(1457, 1472), [
    { decade: 1450, startYear: 1457, endYear: 1460, tone: 1 },
    { decade: 1460, startYear: 1460, endYear: 1470, tone: 0 },
    { decade: 1470, startYear: 1470, endYear: 1472, tone: 1 }
  ]);
});

test('handles BCE decades and empty ranges', () => {
  assert.deepEqual(decadeBands(-15, 5), [
    { decade: -20, startYear: -15, endYear: -10, tone: 0 },
    { decade: -10, startYear: -10, endYear: 0, tone: 1 },
    { decade: 0, startYear: 0, endYear: 5, tone: 0 }
  ]);
  assert.deepEqual(decadeBands(1500, 1500), []);
  assert.deepEqual(decadeBands('not-a-year', 1500), []);
});

test('places every colour transition exactly on the matching zero-year tick', () => {
  const yearWidth = 4;
  const xForYear = year => 36 + (year - 1480 + 0.5) * yearWidth;
  const rects = decadeBandRects(1480, 1520, { yearWidth, xForYear });
  const band1490 = rects.find(rect => rect.decade === 1490);
  const band1500 = rects.find(rect => rect.decade === 1500);
  assert.equal(band1500.x, xForYear(1500));
  assert.equal(band1490.x + band1490.width, xForYear(1500));
  assert.notEqual(band1500.x, xForYear(1500) - yearWidth / 2);
});

test('dims only future content with non-overlapping alpha-mask segments', () => {
  assert.deepEqual(asOfMaskSegments(-220, 1000, 350), [
    { x: -220, width: 570, opacity: 1 },
    { x: 350, width: 430, opacity: 0.32 }
  ]);
  assert.deepEqual(asOfMaskSegments(0, 100, -20), [{ x: 0, width: 100, opacity: 0.32 }]);
  assert.deepEqual(asOfMaskSegments(0, 100, 120), [{ x: 0, width: 100, opacity: 1 }]);
  assert.deepEqual(asOfMaskSegments(0, 0, 50), []);
});
