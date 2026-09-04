import test from 'node:test';
import assert from 'node:assert/strict';
import { FAMILY_GRAPH_FIELDS } from '../geni-config.js';
import {
  applyUnionToPeople,
  canonicalGeniProfileId,
  profileIdFromGeniInput,
  profileToLineagePerson,
  stableProfileId,
  unionChildRefs
} from '../geni-model.js';
import {
  GeniDescendantImporter,
  familyGraphRecords,
  graphDownwardUnions,
  graphUnionRecords,
  lineageTreeSnapshot
} from '../geni-import-core.js';

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

test('retains only life-event years from a Geni profile', () => {
  const raw = {
    id: 'profile-42',
    guid: '6000000000000000042',
    profile_url: 'https://www.geni.com/people/Test/6000000000000000042',
    display_name: 'Test Person',
    gender: 'female',
    birth: {
      date: { year: 1901, month: 2, day: 3 },
      location: { place_name: 'Beijing' }
    },
    death: {
      date: { year: 1988, month: 4, day: 5 },
      location: { place_name: 'San Francisco' }
    }
  };
  assert.equal(stableProfileId(raw), 'profile-g6000000000000000042');
  const person = profileToLineagePerson(raw, '', '2026-09-03T00:00:00.000Z');
  assert.equal(person.id, 'profile-g6000000000000000042');
  assert.equal(person.displayName, 'Test Person');
  assert.equal(person.birthYear, '1901');
  assert.equal(person.deathYear, '1988');
  assert.equal(person.place, '');
  assert.doesNotMatch(JSON.stringify(person), /Beijing|San Francisco|"month"|"day"/);
});

test('reconstructs spouse, child, and marriage-year links from a union', () => {
  const people = {
    'profile-a': profileToLineagePerson({ id: 'profile-a', name: 'A' }, 'profile-a'),
    'profile-b': profileToLineagePerson({ id: 'profile-b', name: 'B' }, 'profile-b'),
    'profile-c': profileToLineagePerson({ id: 'profile-c', name: 'C' }, 'profile-c')
  };
  const union = {
    id: 'union-1',
    partners: ['profile-a', 'profile-b'],
    children: ['profile-c'],
    status: 'spouse',
    marriage: {
      date: { year: 1920, month: 6, day: 7 },
      location: { place_name: 'London' }
    }
  };
  applyUnionToPeople(people, union, value => value);
  assert.deepEqual(people['profile-a'].spouses, ['profile-b']);
  assert.deepEqual(people['profile-b'].spouses, ['profile-a']);
  assert.deepEqual(people['profile-c'].parents, ['profile-a', 'profile-b']);
  assert.deepEqual(people['profile-a'].children, ['profile-c']);
  assert.equal(people['profile-a'].marriageYears['profile-b'], '1920');
  assert.doesNotMatch(JSON.stringify(people), /London|"month"|"day"/);
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

function idOf(value) {
  return String(value || '').split('/').filter(Boolean).at(-1) || '';
}

class FakeGraphClient {
  constructor(resources) {
    this.resources = resources;
    this.requestCount = 0;
    this.calls = [];
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }

  profileFor(value) {
    const requested = idOf(value);
    if (this.resources[requested]) return this.resources[requested];
    const compact = requested.replace(/^profile-/, '');
    if (this.resources[`profile-${compact}`]) return this.resources[`profile-${compact}`];
    const guid = compact.replace(/^g/, '');
    return Object.values(this.resources).find(resource => String(resource?.guid || '') === guid) || null;
  }

  unionFor(value) {
    const id = idOf(value);
    return this.resources[id] || this.resources[`union-${id.replace(/^union-/, '')}`] || null;
  }

  graphFor(value) {
    const focus = this.profileFor(value);
    if (!focus) return null;
    const focusId = idOf(focus.id || focus.url);
    const nodes = {};
    const ensureProfile = profileId => {
      const raw = this.profileFor(profileId);
      if (!raw) return null;
      const id = idOf(raw.id || raw.url);
      nodes[id] ||= { ...raw, id, edges: {} };
      nodes[id].edges ||= {};
      return nodes[id];
    };
    ensureProfile(focusId);

    for (const unionRef of focus.unions || []) {
      const union = this.unionFor(unionRef);
      if (!union) continue;
      const unionId = idOf(union.id || union.url || unionRef);
      const edges = {};
      const adopted = new Set((union.adopted_children || []).map(idOf));
      const foster = new Set((union.foster_children || []).map(idOf));
      for (const profileId of union.partners || []) {
        const id = idOf(profileId);
        edges[id] = { rel: 'partner' };
        const node = ensureProfile(id);
        if (node) node.edges[unionId] = { rel: 'partner' };
      }
      for (const profileId of [
        ...(union.children || []),
        ...(union.adopted_children || []),
        ...(union.foster_children || [])
      ]) {
        const id = idOf(profileId);
        const edge = { rel: 'child' };
        if (adopted.has(id)) edge.rel_modifier = 'adopted';
        if (foster.has(id)) edge.rel_modifier = 'foster';
        edges[id] = edge;
        const node = ensureProfile(id);
        if (node) node.edges[unionId] = { ...edge };
      }
      nodes[unionId] = {
        id: unionId,
        status: union.status,
        marriage: union.marriage,
        edges
      };
    }
    return { focus: { ...focus, id: focusId }, nodes };
  }

  async request(path, params = {}) {
    this.requestCount += 1;
    this.calls.push({ path, params: { ...params } });
    if (this.cancelled) throw Object.assign(new Error('stopped'), { code: 'GENI_CANCELLED' });
    if (path === 'profile/immediate-family') {
      const ids = String(params.ids || '').split(',').filter(Boolean);
      return { results: ids.map(id => this.graphFor(`profile-${id}`)).filter(Boolean) };
    }
    const match = decodeURIComponent(path).match(/^(profile-[^/]+)\/immediate-family$/i);
    if (match) return this.graphFor(match[1]) || { error: { message: 'profile not found' } };
    return { error: { message: `unsupported mocked resource ${path}` } };
  }
}

test('parses family-graph edges and follows only unions formed by the focus person', () => {
  const graph = {
    focus: { id: 'profile-3', guid: '6000000000000000003', name: 'Focus' },
    nodes: {
      'profile-3': {
        id: 'profile-3',
        edges: {
          'union-10': { rel: 'child' },
          'union-20': { rel: 'partner' }
        }
      },
      'profile-4': { id: 'profile-4', name: 'Spouse', edges: { 'union-20': { rel: 'partner' } } },
      'profile-5': { id: 'profile-5', name: 'Child', edges: { 'union-20': { rel: 'child' } } },
      'union-10': {
        id: 'union-10',
        status: 'spouse',
        edges: {
          'profile-1': { rel: 'partner' },
          'profile-2': { rel: 'partner' },
          'profile-3': { rel: 'child' }
        }
      },
      'union-20': {
        id: 'union-20',
        status: 'spouse',
        marriage: { date: { year: 1950, month: 1, day: 2 } },
        edges: {
          'profile-3': { rel: 'partner' },
          'profile-4': { rel: 'partner' },
          'profile-5': { rel: 'child' }
        }
      }
    }
  };
  assert.equal(familyGraphRecords(graph).length, 1);
  const unions = graphUnionRecords(graph);
  assert.deepEqual(unions.map(union => union.id), ['union-10', 'union-20']);
  assert.deepEqual(graphDownwardUnions(graph).map(union => union.id), ['union-20']);
  assert.deepEqual(graphDownwardUnions(graph)[0].partners, ['profile-3', 'profile-4']);
  assert.deepEqual(graphDownwardUnions(graph)[0].children, ['profile-5']);
});

test('loads one descendant generation with one family-graph request', async () => {
  const resources = {
    'profile-g6000000000000000001': {
      id: 'profile-1', guid: '6000000000000000001', display_name: 'Root', public: true,
      profile_url: 'https://www.geni.com/people/Root/6000000000000000001',
      birth: { date: { year: 1970, month: 1, day: 2 }, location: { place_name: 'Ignored' } },
      unions: ['union-10']
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
      adopted_children: ['profile-4'], status: 'spouse',
      marriage: { date: { year: 2000, month: 5, day: 6 }, location: { place_name: 'Ignored' } }
    }
  };
  const client = new FakeGraphClient(resources);
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
  assert.equal(root.birthYear, '1970');
  assert.equal(root.marriageYears['profile-g6000000000000000002'], '2000');
  assert.match(pkg.people['profile-g6000000000000000004'].note, /adopted child/);
  assert.equal(client.requestCount, 1);
  assert.match(client.calls[0].path, /immediate-family$/);
  assert.equal(client.calls[0].params.fields, FAMILY_GRAPH_FIELDS);
  assert.doesNotMatch(client.calls[0].params.fields, /location|month|day|birth_date|death_date|marriage_date/);
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

test('pauses only after a complete generation and resumes from its graph checkpoint', async () => {
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

  const firstClient = new FakeGraphClient(resources);
  const first = new GeniDescendantImporter({
    client: firstClient,
    rootInput: '6000000000000000101',
    descendantGenerations: 2,
    maxProfiles: 2
  });
  const paused = await first.run();
  assert.equal(paused.completed, false);
  assert.equal(paused.generations, 1);
  assert.equal(paused.profiles, 3, 'the root generation is retained intact even when it crosses the pause target');
  assert.deepEqual(first.frontier, ['profile-g6000000000000000103']);
  assert.equal(firstClient.requestCount, 1);

  const checkpoint = { ...first.checkpoint(), maxProfiles: 20 };
  const resumedClient = new FakeGraphClient(resources);
  const resumed = new GeniDescendantImporter({
    client: resumedClient,
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
  assert.equal(resumedClient.requestCount, 1);
});

test('chunks a 51-profile generation into one 50-ID graph request and one singleton', async () => {
  const resources = {
    'profile-g6000000000000000200': {
      id: 'profile-200', guid: '6000000000000000200', display_name: 'Root', public: true,
      profile_url: 'https://www.geni.com/people/Root/6000000000000000200', unions: ['union-200']
    },
    'profile-201': {
      id: 'profile-201', guid: '6000000000000000201', display_name: 'Spouse', public: true,
      profile_url: 'https://www.geni.com/people/Spouse/6000000000000000201', unions: ['union-200']
    }
  };
  const children = [];
  for (let index = 0; index < 51; index += 1) {
    const apiId = `profile-${300 + index}`;
    const guid = String(6000000000000000300n + BigInt(index));
    children.push(apiId);
    resources[apiId] = {
      id: apiId,
      guid,
      display_name: `Child ${index + 1}`,
      public: true,
      profile_url: `https://www.geni.com/people/Child-${index + 1}/${guid}`,
      unions: ['union-200']
    };
  }
  resources['union-200'] = {
    id: 'union-200', partners: ['profile-200', 'profile-201'], children, status: 'spouse'
  };

  const client = new FakeGraphClient(resources);
  const importer = new GeniDescendantImporter({
    client,
    rootInput: '6000000000000000200',
    descendantGenerations: 2,
    maxProfiles: 100
  });
  const result = await importer.run();
  assert.equal(result.completed, true);
  assert.equal(result.profiles, 53);
  assert.equal(client.requestCount, 3, 'one root graph plus two requests for the 51-profile frontier');
  const secondGenerationCalls = client.calls.slice(1);
  assert.equal(secondGenerationCalls.filter(call => call.path === 'profile/immediate-family').length, 1);
  assert.equal(String(secondGenerationCalls.find(call => call.path === 'profile/immediate-family')?.params.ids).split(',').length, 50);
  assert.equal(secondGenerationCalls.filter(call => call.path !== 'profile/immediate-family').length, 1);
});
