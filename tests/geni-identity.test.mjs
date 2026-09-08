import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalGeniIdentity,
  duplicateGeniIdentityGroups,
  indexPeopleByGeniIdentity,
  remapPeopleByGeniIdentity
} from '../geni-identity.js';

test('canonicalizes public Geni IDs and URLs without treating local IDs as Geni profiles', () => {
  assert.equal(canonicalGeniIdentity('6000000000000000042'), 'profile-g6000000000000000042');
  assert.equal(canonicalGeniIdentity('profile-42'), 'profile-42');
  assert.equal(
    canonicalGeniIdentity('https://www.geni.com/people/Test/6000000000000000042'),
    'profile-g6000000000000000042'
  );
  assert.equal(canonicalGeniIdentity('local-person-42'), '');
  assert.equal(canonicalGeniIdentity('https://example.com/6000000000000000042'), '');
});

test('does not treat another provider’s bare numeric source ID as a Geni identity', () => {
  const people = {
    local: { id: 'local', sourceId: '42', sourceProvider: 'other-service', sourceUrl: 'https://example.com/42' }
  };
  const index = indexPeopleByGeniIdentity(people);
  assert.equal(index.has('profile-42'), false);
});

test('indexes a locally named profile by its linked Geni source ID', () => {
  const people = {
    'local-mary': {
      id: 'local-mary',
      displayName: 'Mary with local edits',
      sourceId: 'profile-g6000000000000000042',
      sourceUrl: 'https://www.geni.com/people/Mary/6000000000000000042'
    }
  };
  const index = indexPeopleByGeniIdentity(people);
  assert.equal(index.get('profile-g6000000000000000042'), 'local-mary');
});

test('reuses an existing local profile and rewrites every imported relationship reference', () => {
  const existing = {
    'local-mary': {
      id: 'local-mary',
      displayName: 'Mary with local edits',
      sourceId: 'profile-g6000000000000000042',
      parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
      marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, geniImmediateFamilyIds: []
    }
  };
  const incoming = {
    'profile-g6000000000000000042': {
      id: 'profile-g6000000000000000042',
      sourceId: 'profile-g6000000000000000042',
      displayName: 'Remote Mary',
      parents: [],
      children: ['profile-g6000000000000000043'],
      partners: ['profile-g6000000000000000044'],
      spouses: ['profile-g6000000000000000044'],
      nonSpouses: [], divorcedSpouses: [],
      marriageYears: { 'profile-g6000000000000000044': '1960' },
      relationshipEndYears: {}, relationshipEndStatuses: {}, geniImmediateFamilyIds: []
    },
    'profile-g6000000000000000043': {
      id: 'profile-g6000000000000000043',
      sourceId: 'profile-g6000000000000000043',
      displayName: 'Child',
      parents: ['profile-g6000000000000000042', 'profile-g6000000000000000044'],
      children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
      marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, geniImmediateFamilyIds: []
    },
    'profile-g6000000000000000044': {
      id: 'profile-g6000000000000000044',
      sourceId: 'profile-g6000000000000000044',
      displayName: 'Spouse',
      parents: [], children: ['profile-g6000000000000000043'],
      partners: ['profile-g6000000000000000042'],
      spouses: ['profile-g6000000000000000042'],
      nonSpouses: [], divorcedSpouses: [],
      marriageYears: { 'profile-g6000000000000000042': '1960' },
      relationshipEndYears: {}, relationshipEndStatuses: {}, geniImmediateFamilyIds: []
    }
  };

  const remapped = remapPeopleByGeniIdentity(incoming, existing);
  assert.equal(remapped.idMap['profile-g6000000000000000042'], 'local-mary');
  assert.ok(remapped.people['local-mary']);
  assert.equal(remapped.people['profile-g6000000000000000042'], undefined);
  assert.deepEqual(remapped.people['local-mary'].children, ['profile-g6000000000000000043']);
  assert.deepEqual(remapped.people['local-mary'].spouses, ['profile-g6000000000000000044']);
  assert.equal(remapped.people['local-mary'].marriageYears['profile-g6000000000000000044'], '1960');
  assert.deepEqual(remapped.people['profile-g6000000000000000043'].parents, [
    'local-mary',
    'profile-g6000000000000000044'
  ]);
  assert.deepEqual(remapped.people['profile-g6000000000000000044'].spouses, ['local-mary']);
});

test('coalesces two incoming aliases of the same Geni profile before merging', () => {
  const incoming = {
    'profile-42': {
      id: 'profile-42', guid: '6000000000000000042', displayName: 'Compact alias',
      parents: [], children: ['child-a'], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
      marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, geniImmediateFamilyIds: []
    },
    'profile-g6000000000000000042': {
      id: 'profile-g6000000000000000042', sourceId: 'profile-g6000000000000000042', displayName: 'Public alias',
      parents: ['parent-a'], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
      marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, geniImmediateFamilyIds: []
    }
  };
  const remapped = remapPeopleByGeniIdentity(incoming);
  assert.deepEqual(Object.keys(remapped.people), ['profile-g6000000000000000042']);
  assert.deepEqual(remapped.people['profile-g6000000000000000042'].parents, ['parent-a']);
  assert.deepEqual(remapped.people['profile-g6000000000000000042'].children, ['child-a']);
});

test('reports duplicate stored profiles linked to the same Geni identity', () => {
  const people = {
    local: { id: 'local', sourceId: 'profile-g6000000000000000042' },
    canonical: { id: 'profile-g6000000000000000042', sourceId: 'profile-g6000000000000000042' },
    other: { id: 'other', sourceId: 'profile-g6000000000000000043' }
  };
  assert.deepEqual(duplicateGeniIdentityGroups(people), [{
    identity: 'profile-g6000000000000000042',
    ids: ['local', 'canonical']
  }]);
});
