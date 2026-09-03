import test from 'node:test';
import assert from 'node:assert/strict';
import { decadeBands } from '../timeline-bands.js';

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
