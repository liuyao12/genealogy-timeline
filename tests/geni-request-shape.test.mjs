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
