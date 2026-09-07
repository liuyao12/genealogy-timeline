import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { graphUnionRecords } from '../geni-import-core.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function functionSource(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return appSource.slice(start, end);
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function refId(value) {
  if (typeof value === 'string') return clean(value).split('/').filter(Boolean).at(-1) || '';
  return clean(value?.id || value?.url).split('/').filter(Boolean).at(-1) || '';
}

function canonicalGeniProfileId(value) {
  const raw = clean(value);
  const explicit = raw.match(/^profile-(g?)(\d+)$/i);
  if (explicit) {
    const [, prefix, digits] = explicit;
    return `profile-${prefix || digits.length >= 15 ? 'g' : ''}${digits}`;
  }
  const compact = raw.match(/^(g?)(\d+)$/i);
  if (!compact) return raw;
  const [, prefix, digits] = compact;
  return `profile-${prefix || digits.length >= 15 ? 'g' : ''}${digits}`;
}

function profileIdFromInput(input) {
  const raw = clean(input);
  const match = raw.match(/profile-g?\d+|g?\d{15,}/i);
  return match ? canonicalGeniProfileId(match[0]) : '';
}

function geniProfileIdForApiProfile(profile, fallbackId = '') {
  const guid = clean(profile?.guid);
  if (/^\d{15,}$/.test(guid)) return canonicalGeniProfileId(guid);
  return profileIdFromInput(profile?.profile_url) || canonicalGeniProfileId(fallbackId || refId(profile?.id || profile?.url));
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

function uniqueRefs(values) {
  const candidates = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? [values]
      : values && typeof values === 'object' && (values.id || values.url)
        ? [values]
        : values && typeof values === 'object'
          ? Object.entries(values).map(([key, value]) => (
            typeof value === 'string' || (value && typeof value === 'object' && (value.id || value.url)) ? value : key
          ))
          : [];
  return unique(candidates.map(refId).filter(Boolean));
}

function geniGraphNodeRecords(nodes) {
  return Object.entries(nodes || {}).map(([key, node]) => (
    node && typeof node === 'object' ? { ...node, id: refId(node.id || node.url || key) } : null
  )).filter(Boolean);
}

test('side-panel relationship inference reads Geni union.edges', () => {
  const inferSource = functionSource(
    'function inferRelationsFromUnions(nodes, preferredIds = {})',
    'function refId(value)'
  );
  const nodes = {
    'profile-1': {
      id: 'profile-1',
      guid: '6000000000000000001',
      name: 'Focus',
      edges: { 'union-10': { rel: 'partner' } }
    },
    'profile-2': {
      id: 'profile-2',
      guid: '6000000000000000002',
      name: 'Spouse',
      edges: { 'union-10': { rel: 'partner' } }
    },
    'profile-3': {
      id: 'profile-3',
      guid: '6000000000000000003',
      name: 'Child',
      edges: { 'union-10': { rel: 'child' } }
    },
    'union-10': {
      id: 'union-10',
      status: 'spouse',
      marriage: { date: { year: 2001 } },
      edges: {
        'profile-1': { rel: 'partner' },
        'profile-2': { rel: 'partner' },
        'profile-3': { rel: 'child' }
      }
    }
  };
  const context = {
    nodes,
    preferredIds: { 'profile-1': 'local-focus' },
    result: null,
    graphUnionRecords,
    clean,
    refId,
    canonicalGeniProfileId,
    geniProfileIdForApiProfile,
    unique,
    uniqueRefs,
    geniGraphNodeRecords
  };
  vm.runInNewContext(`${inferSource}\nresult = inferRelationsFromUnions(nodes, preferredIds);`, context);

  const spouseId = 'profile-g6000000000000000002';
  const childId = 'profile-g6000000000000000003';
  assert.ok(context.result['local-focus'].spouses.includes(spouseId));
  assert.ok(context.result['local-focus'].children.includes(childId));
  assert.ok(context.result[spouseId].spouses.includes('local-focus'));
  assert.ok(context.result[childId].parents.includes('local-focus'));
  assert.ok(context.result[childId].parents.includes(spouseId));
  assert.equal(context.result['local-focus'].marriageYears[spouseId], '2001');
});

test('selected-profile graph preserves the focus node edges when merging focus details', () => {
  const body = functionSource(
    'async function fetchGeniNeighborhood(id)',
    'function geniProfilePayloadRecords'
  );
  assert.match(body, /edges:\s*graphNodes\[rawFocusId\]\?\.edges\s*\|\|\s*focusRaw\?\.edges/);
});


test('a previously saved profile set with no family links surfaces a repair action', () => {
  const body = functionSource(
    'function renderGeniFamilyActions(person, scope)',
    'function renderDetails()'
  );
  assert.match(body, /needsRelationshipRepair/);
  assert.match(body, /Repair saved Geni family links/);
  assert.match(body, /Repair family links from Geni/);
  assert.match(body, /linked && \(!verifiedAt \|\| needsRelationshipRepair\)/);
});
