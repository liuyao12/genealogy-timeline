import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBritishRoyalPlaceName } from '../royal-title-style.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;
const sovereignUnitedKingdom = /\b(?:King|Queen)(?:\s+consort)?\s+of\s+(?:the\s+)?United Kingdom\b/i;

test('normalizes sovereign and consort titles to compact geographical names', () => {
  assert.equal(
    normalizeBritishRoyalPlaceName('George IV, King of the United Kingdom', 1820),
    'George IV, King of Great Britain and Ireland'
  );
  assert.equal(
    normalizeBritishRoyalPlaceName('George VI, King of the United Kingdom and Emperor of India', 1936),
    'George VI, King of Great Britain and Northern Ireland, Emperor of India'
  );
  assert.equal(
    normalizeBritishRoyalPlaceName('Mary, Queen consort of the United Kingdom', 1910),
    'Mary, Queen consort of Great Britain and Ireland'
  );
});

test('does not rewrite United Kingdom as a princely byname', () => {
  assert.equal(
    normalizeBritishRoyalPlaceName('Princess Alice of the United Kingdom', 1843),
    'Princess Alice of the United Kingdom'
  );
});

test('the bundled example contains no United Kingdom sovereign-title phrases', () => {
  assert.equal(starter.version, 31);
  for (const person of Object.values(people)) {
    for (const field of ['displayName', 'title', 'lastName', 'note']) {
      assert.doesNotMatch(String(person[field] || ''), sovereignUnitedKingdom, `${person.displayName} ${field}`);
    }
    for (const period of person.namePeriods || []) {
      assert.doesNotMatch(period.name, sovereignUnitedKingdom, `${person.displayName} ${period.id}`);
    }
  }
  const alice = people['profile-g6000000000703284437'];
  assert.ok(alice.namePeriods.some(period => period.name === 'Princess Alice of the United Kingdom'));
});

test('George V and Queen Mary change geographical style in 1927', () => {
  const george = people['profile-g6000000000701511040'];
  const mary = people['profile-g6000000001324056123'];
  assert.deepEqual(
    george.namePeriods.filter(period => ['george-v-name-1910', 'george-v-name-1927'].includes(period.id)).map(period => [period.id, period.name, period.startYear, period.endYear]),
    [
      ['george-v-name-1910', 'George V, King of Great Britain and Ireland, Emperor of India', 1910, 1927],
      ['george-v-name-1927', 'George V, King of Great Britain and Northern Ireland, Emperor of India', 1927, 1936]
    ]
  );
  assert.equal(george.defaultNamePeriodId, 'george-v-name-1927');
  assert.ok(mary.namePeriods.some(period => period.id === 'mary-teck-name-1910' && period.name.includes('Great Britain and Ireland')));
  assert.ok(mary.namePeriods.some(period => period.id === 'mary-teck-name-1927' && period.name.includes('Great Britain and Northern Ireland')));
});

test('future imports and old saved trees pass through the same title normalizer', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /import \{ normalizeBritishRoyalPlaceName \} from '\.\/royal-title-style\.js\?v=1'/);
  assert.match(app, /const name = normalizeBritishRoyalPlaceName\(rawName, startYear \?\? endYear\)/);
  assert.match(app, /title: normalizeBritishRoyalPlaceName/);
  assert.match(app, /note: normalizeBritishRoyalPlaceName/);
  assert.match(html, /\.\/app\.js\?v=152/);
});
