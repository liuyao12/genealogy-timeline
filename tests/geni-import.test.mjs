import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyUnionToPeople,
  canonicalGeniProfileId,
  profileIdFromGeniInput,
  profileToLineagePerson,
  stableProfileId,
  unionChildRefs
} from '../geni-model.js';
import { GeniDescendantImporter, lineageTreeSnapshot } from '../geni-import-core.js';

test('normalizes public Geni profile IDs and URLs', () => {
  assert.equal(canonicalGeniProfileId('6000000003760873898'), 'profile-g6000000003760873898');
  assert.equal(canonicalGeniProfileId('profile-123456'), 'profile-123456');
  assert.equal(profileIdFromGeniInput('g6000000003760873898'), 'profile-g6000000003760873898');
  assert.equal(
    profileIdFromGeniInput('https://www.geni.com/people/Henry-VII/6000000003760873898'),
    'profile-g6000000003760873898'
  );
  assert.equal(profileIdFromGeniInput('https://example.com/6000000003760873898'), '');
});

test('maps a Geni profile to the Lineage schema using the public GUID', () => {
  const raw = {
    id: 'profile-42',
    guid: '6000000000000000042',
    profile_url: 'https://www.geni.com/people/Test/6000000000000000042',
    display_name: 'Test Person',
    first_name: 'Test',
    last_name: 'Person',
    gender: 'female',
    birth: { date: { year: 1901 }, location: { place_name: 'Beijing' } },
    death_date_parts: { year: 1988 }
  };
  assert.equal(stableProfileId(raw), 'profile-g6000000000000000042');
  const person = profileToLineagePerson(raw, '', '2026-09-03T00:00:00.000Z');
  assert.equal(person.id, 'profile-g6000000000000000042');
  assert.equal(person.displayName, 'Test Person');
  assert.equal(person.birthYear, '1901');
  assert.equal(person.deathYear, '1988');
  assert.equal(person.place, 'Beijing');
  assert.equal(person.sourceProvider, 'geni');
});

test('reconstructs spouse, child, marriage, and divorce links from a union', () => {
  const people = {
    'profile-a': profileToLineagePerson({ id: 'profile-a', name: 'A' }, 'profile-a'),
    'profile-b': profileToLineagePerson({ id: 'profile-b', name: 'B' }, 'profile-b'),
    'profile-c': profileToLineagePerson({ id: 'profile-c', name: 'C' }, 'profile-c')
  };
  const union = {
    id: 'union-1',
    partners: ['profile-a', 'profile-b'],
    children: ['profile-c'],
    status: 'ex_spouse',
    marriage: { date: { year: 1920 } },
    divorce: { date: { year: 1930 } }
  };
  applyUnionToPeople(people, union, value => value);
  assert.deepEqual(people['profile-a'].spouses, ['profile-b']);
  assert.deepEqual(people['profile-b'].spouses, ['profile-a']);
  assert.deepEqual(people['profile-c'].parents, ['profile-a', 'profile-b']);
  assert.deepEqual(people['profile-a'].children, ['profile-c']);
  assert.equal(people['profile-a'].marriageYears['profile-b'], '1920');
  assert.equal(people['profile-a'].relationshipEndYears['profile-b'], '1930');
  assert.equal(people['profile-a'].relationshipEndStatuses['profile-b'], 'divorced');
});

test('includes adopted and foster children even when Geni lists them separately', () => {
  const people = Object.fromEntries(['parent-a', 'parent-b', 'adopted', 'foster'].map(id => [
    `profile-${id}`,
    profileToLineagePerson({ id: `profile-${id}`, name: id }, `profile-${id}`)
  ]));
  const union = {
    id: 'union-2',
    partners: ['profile-parent-a', 'profile-parent-b'],
    adopted_children: ['profile-adopted'],
    foster_children: ['profile-foster'],
    status: 'spouse'
  };
  assert.deepEqual(unionChildRefs(union), ['profile-adopted', 'profile-foster']);
  applyUnionToPeople(people, union, value => value);
  assert.deepEqual(people['profile-adopted'].parents, ['profile-parent-a', 'profile-parent-b']);
  assert.deepEqual(people['profile-foster'].parents, ['profile-parent-a', 'profile-parent-b']);
  assert.match(people['profile-adopted'].note, /adopted child/);
  assert.match(people['profile-foster'].note, /foster child/);
});

class FakeClient {
  constructor(resources) {
    this.resources = resources;
    this.requestCount = 0;
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }

  lookup(id) {
    if (this.resources[id]) return this.resources[id];
    const guid = String(id).match(/^profile-g(\d+)$/i)?.[1];
    return guid ? Object.values(this.resources).find(resource => String(resource?.guid) === guid) : undefined;
  }

  async request(path, params = {}) {
    this.requestCount += 1;
    if (this.cancelled) throw Object.assign(new Error('stopped'), { code: 'GENI_CANCELLED' });
    if (path === 'profile') {
      const ids = String(params.ids || '').split(',').filter(Boolean).map(id => `profile-${id}`);
      return { results: ids.map(id => this.lookup(id)).filter(Boolean) };
    }
    if (path === 'union') {
      const ids = String(params.ids || '').split(',').filter(Boolean).map(id => `union-${id}`);
      return { results: ids.map(id => this.lookup(id)).filter(Boolean) };
    }
    return this.lookup(decodeURIComponent(path)) || { error: { message: 'not found' } };
  }
}

test('loads one descendant generation with batched profile and union requests', async () => {
  const resources = {
    'profile-g6000000000000000001': {
      id: 'profile-1', guid: '6000000000000000001', display_name: 'Root', public: true,
      profile_url: 'https://www.geni.com/people/Root/6000000000000000001', unions: ['union-10']
    },
    'profile-2': {
      id: 'profile-2', guid: '6000000000000000002', display_name: 'Spouse', public: true,
      profile_url: 'https://www.geni.com/people/Spouse/6000000000000000002', unions: ['union-10']
    },
    'profile-3': {
      id: 'profile-3', guid: '6000000000000000003', display_name: 'Child', public: true,
      profile_url: 'https://www.geni.com/people/Child/6000000000000000003', unions: ['union-10']
    },
    'profile-4': {
      id: 'profile-4', guid: '6000000000000000004', display_name: 'Adopted Child', public: true,
      profile_url: 'https://www.geni.com/people/Adopted/6000000000000000004', unions: ['union-10']
    },
    'union-10': {
      id: 'union-10', partners: ['profile-1', 'profile-2'], children: ['profile-3'],
      adopted_children: ['profile-4'], status: 'spouse', marriage: { date: { year: 2000 } }
    }
  };
  const client = new FakeClient(resources);
  const importer = new GeniDescendantImporter({
    client,
    rootInput: '6000000000000000001',
    descendantGenerations: 1,
    maxProfiles: 50
  });
  const result = await importer.run();
  const pkg = importer.package();
  assert.equal(result.completed, true);
  assert.equal(result.generations, 1);
  assert.equal(Object.keys(pkg.people).length, 4);
  const root = pkg.people['profile-g6000000000000000001'];
  assert.deepEqual(root.children.sort(), [
    'profile-g6000000000000000003',
    'profile-g6000000000000000004'
  ]);
  assert.deepEqual(pkg.people['profile-g6000000000000000003'].parents.sort(), [
    'profile-g6000000000000000001',
    'profile-g6000000000000000002'
  ]);
  assert.match(pkg.people['profile-g6000000000000000004'].note, /adopted child/);
  assert.equal(client.requestCount, 3);
});

test('creates a valid Lineage tree-tab snapshot', () => {
  const person = profileToLineagePerson({
    id: 'profile-1', guid: '6000000000000000001', display_name: 'Root'
  });
  const pkg = {
    rootId: person.id,
    people: { [person.id]: person }
  };
  const snapshot = lineageTreeSnapshot(pkg, { id: 'tree-test' });
  assert.equal(snapshot.id, 'tree-test');
  assert.equal(snapshot.rootId, person.id);
  assert.equal(snapshot.title, 'Root descendants');
  assert.equal(snapshot.people[person.id].sourceProvider, 'geni');
});

test('pauses only after retaining a complete generation and resumes from its checkpoint', async () => {
  const resources = {
    'profile-g6000000000000000101': {
      id: 'profile-101', guid: '6000000000000000101', display_name: 'Root', public: true,
      profile_url: 'https://www.geni.com/people/Root/6000000000000000101', unions: ['union-110']
    },
    'profile-102': {
      id: 'profile-102', guid: '6000000000000000102', display_name: 'Spouse', public: true,
      profile_url: 'https://www.geni.com/people/Spouse/6000000000000000102', unions: ['union-110']
    },
    'profile-103': {
      id: 'profile-103', guid: '6000000000000000103', display_name: 'Child', public: true,
      profile_url: 'https://www.geni.com/people/Child/6000000000000000103', unions: ['union-110', 'union-120']
    },
    'profile-104': {
      id: 'profile-104', guid: '6000000000000000104', display_name: 'Child spouse', public: true,
      profile_url: 'https://www.geni.com/people/Child-Spouse/6000000000000000104', unions: ['union-120']
    },
    'profile-105': {
      id: 'profile-105', guid: '6000000000000000105', display_name: 'Grandchild', public: true,
      profile_url: 'https://www.geni.com/people/Grandchild/6000000000000000105', unions: ['union-120']
    },
    'union-110': {
      id: 'union-110', partners: ['profile-101', 'profile-102'], children: ['profile-103'], status: 'spouse'
    },
    'union-120': {
      id: 'union-120', partners: ['profile-103', 'profile-104'], children: ['profile-105'], status: 'spouse'
    }
  };

  const first = new GeniDescendantImporter({
    client: new FakeClient(resources),
    rootInput: '6000000000000000101',
    descendantGenerations: 2,
    maxProfiles: 2
  });
  const paused = await first.run();
  assert.equal(paused.completed, false);
  assert.equal(paused.generations, 1);
  assert.equal(paused.profiles, 3, 'the root generation is retained intact even when it crosses the pause target');
  assert.deepEqual(first.frontier, ['profile-g6000000000000000103']);

  const checkpoint = { ...first.checkpoint(), maxProfiles: 20 };
  const resumed = new GeniDescendantImporter({
    client: new FakeClient(resources),
    checkpoint,
    rootInput: checkpoint.rootInput
  });
  const completed = await resumed.run();
  const pkg = resumed.package();
  assert.equal(completed.completed, true);
  assert.equal(completed.generations, 2);
  assert.equal(Object.keys(pkg.people).length, 5);
  assert.deepEqual(pkg.people['profile-g6000000000000000105'].parents.sort(), [
    'profile-g6000000000000000103',
    'profile-g6000000000000000104'
  ]);
});
