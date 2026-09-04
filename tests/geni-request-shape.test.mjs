import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function functionBody(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test('selected-profile immediate-family loading uses one graph endpoint', () => {
  const body = functionBody(
    'async function fetchGeniNeighborhood(id)',
    'function geniProfilePayloadRecords'
  );
  assert.match(body, /\/immediate-family/);
  assert.doesNotMatch(body, /fetchGeniProfileDetails/);
  assert.doesNotMatch(body, /fetchGeniUnionDetails/);
  assert.equal((body.match(/fetchGeniJsonp\(/g) || []).length, 1);
});

test('selected-profile graph asks only for year-bearing event objects', () => {
  const body = functionBody(
    'async function fetchGeniNeighborhood(id)',
    'function geniProfilePayloadRecords'
  );
  const start = body.indexOf('const fields = [');
  const end = body.indexOf("].join(',');", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const fields = body.slice(start, end);
  assert.match(fields, /'birth'/);
  assert.match(fields, /'death'/);
  assert.match(fields, /'marriage'/);
  assert.doesNotMatch(fields, /birth_date|death_date|marriage_date|divorce|location|month|day/);
});

test('selected-profile merge strips event detail before normalizing', () => {
  const body = functionBody(
    'async function loadGeniImmediateFamily(profileId)',
    'async function fetchGeniReignEvents'
  );
  assert.match(body, /birth: geniYearOnlyEvent\(raw\.birth\)/);
  assert.match(body, /death: geniYearOnlyEvent\(raw\.death\)/);
  assert.match(body, /place: ''/);
});

test('immediate-family merge does not make a second optional event request', () => {
  const body = functionBody(
    'async function loadGeniImmediateFamily(profileId)',
    'async function fetchGeniReignEvents'
  );
  assert.doesNotMatch(body, /fetchGeniReignEvents\(/);
});

test('JSONP transport classifies Geni rate-limit responses', () => {
  const body = functionBody('function fetchGeniJsonp(path, params = {})', 'function geniUnionPayloadRecords');
  assert.match(body, /GENI_RATE_LIMIT/);
  assert.match(body, /rate\.\?limit/);
});
