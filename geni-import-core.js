import {
  DEFAULT_MAX_PROFILES,
  FAMILY_GRAPH_BATCH_SIZE,
  FAMILY_GRAPH_FIELDS
} from './geni-config.js?v=2';
import {
  applyUnionToPeople,
  canonicalGeniProfileId,
  clean,
  mergeLineagePerson,
  profileIdFromGeniInput,
  profileToLineagePerson,
  refId,
  refs,
  stableProfileId,
  unionChildRefs,
  unique
} from './geni-model.js?v=2';
import {
  GeniApiError,
  apiProfileIdentifier,
  chunk,
  cryptoId,
  payloadClassification,
  stripResourcePrefix
} from './geni-api.js?v=2';

function graphCollection(payload) {
  if (payload?.focus && payload?.nodes) return [payload];
  const collection = payload?.results ?? payload?.families ?? payload?.graphs ?? payload;
  if (Array.isArray(collection)) return collection;
  if (!collection || typeof collection !== 'object') return [];
  return Object.values(collection);
}

export function familyGraphRecords(payload) {
  return graphCollection(payload).filter(graph => graph && typeof graph === 'object' && graph.focus && graph.nodes);
}

function graphNodeRecords(graph) {
  if (!graph?.nodes || typeof graph.nodes !== 'object') return [];
  return Object.entries(graph.nodes).map(([key, raw]) => {
    if (!raw || typeof raw !== 'object') return null;
    const id = refId(raw.id || raw.url || key);
    return id ? { ...raw, id } : null;
  }).filter(Boolean);
}

function mergeGraphProfile(previous, incoming) {
  if (!previous) return incoming;
  return {
    ...previous,
    ...incoming,
    edges: incoming.edges || previous.edges,
    birth: incoming.birth || previous.birth,
    death: incoming.death || previous.death
  };
}

export function graphProfileRecords(graph) {
  const byId = new Map();
  const add = raw => {
    if (!raw || typeof raw !== 'object') return;
    const id = refId(raw.id || raw.url);
    if (!/^profile-/i.test(id)) return;
    byId.set(id, mergeGraphProfile(byId.get(id), { ...raw, id }));
  };
  add(graph?.focus);
  graphNodeRecords(graph).forEach(add);
  return [...byId.values()];
}

function edgeEntries(raw) {
  if (!raw?.edges || typeof raw.edges !== 'object') return [];
  return Object.entries(raw.edges).map(([key, edge]) => ({
    id: refId(edge?.id || edge?.url || key),
    rel: clean(edge?.rel || edge?.relationship).toLowerCase(),
    modifier: clean(edge?.rel_modifier?.type || edge?.rel_modifier || edge?.modifier).toLowerCase()
  })).filter(edge => edge.id);
}

export function graphUnionRecords(graph) {
  return graphNodeRecords(graph).filter(raw => /^union-/i.test(raw.id)).map(raw => {
    const partners = [...refs(raw.partners || raw.partner_ids || raw.profiles)];
    const children = [...refs(raw.children || raw.child_ids)];
    const adoptedChildren = [...refs(raw.adopted_children)];
    const fosterChildren = [...refs(raw.foster_children)];
    for (const edge of edgeEntries(raw)) {
      if (!/^profile-/i.test(edge.id)) continue;
      if (edge.rel === 'partner') partners.push(edge.id);
      if (edge.rel === 'child') {
        children.push(edge.id);
        if (edge.modifier.includes('adopt')) adoptedChildren.push(edge.id);
        if (edge.modifier.includes('foster')) fosterChildren.push(edge.id);
      }
    }
    return {
      ...raw,
      id: raw.id,
      partners: unique(partners),
      children: unique(children),
      adopted_children: unique(adoptedChildren),
      foster_children: unique(fosterChildren)
    };
  });
}

function graphFocusApiId(graph) {
  return refId(graph?.focus?.id || graph?.focus?.url);
}

function graphFocusNode(graph) {
  const focusId = graphFocusApiId(graph);
  return graphProfileRecords(graph).find(raw => refId(raw.id || raw.url) === focusId) || graph?.focus || null;
}

export function graphDownwardUnions(graph) {
  const focusId = graphFocusApiId(graph);
  if (!focusId) return [];
  const focusNode = graphFocusNode(graph);
  const partnerUnionIds = new Set(
    edgeEntries(focusNode)
      .filter(edge => /^union-/i.test(edge.id) && edge.rel === 'partner')
      .map(edge => edge.id)
  );
  const unions = graphUnionRecords(graph);
  if (!partnerUnionIds.size) {
    unions.forEach(union => {
      if (refs(union.partners).includes(focusId)) partnerUnionIds.add(union.id);
    });
  }
  return unions.filter(union => partnerUnionIds.has(union.id));
}

function graphAliases(graph) {
  const focus = graph?.focus || {};
  const guid = clean(focus.guid);
  return unique([
    refId(focus.id || focus.url),
    profileIdFromGeniInput(focus.profile_url),
    /^\d{15,}$/.test(guid) ? `profile-g${guid}` : ''
  ]);
}

export class GeniDescendantImporter {
  constructor({ client, rootInput, descendantGenerations = 4, allDescendants = false, maxProfiles = DEFAULT_MAX_PROFILES, destination = 'new', checkpoint = null, onProgress = () => {} } = {}) {
    if (!client) throw new Error('A Geni API client is required.');
    this.client = client;
    this.onProgress = onProgress;
    this.importedAt = checkpoint?.importedAt || new Date().toISOString();
    this.rootInput = checkpoint?.rootInput || clean(rootInput);
    this.rootRequestId = checkpoint?.rootRequestId || profileIdFromGeniInput(this.rootInput);
    if (!this.rootRequestId) throw new Error('Enter a valid public Geni profile URL or ID.');
    this.descendantGenerations = Number.isFinite(Number(checkpoint?.descendantGenerations))
      ? Math.max(1, Number(checkpoint.descendantGenerations))
      : Math.max(1, Number(descendantGenerations) || 4);
    this.allDescendants = checkpoint?.allDescendants === true || allDescendants === true;
    this.maxProfiles = Math.max(1, Number(checkpoint?.maxProfiles || maxProfiles) || DEFAULT_MAX_PROFILES);
    this.destination = checkpoint?.destination === 'merge' || destination === 'merge' ? 'merge' : 'new';
    this.people = structuredClone(checkpoint?.people || {});
    this.apiToStable = { ...(checkpoint?.apiToStable || {}) };
    this.stableToApi = { ...(checkpoint?.stableToApi || {}) };
    this.frontier = unique(checkpoint?.frontier?.length ? checkpoint.frontier : [this.rootRequestId]);
    this.processed = new Set(checkpoint?.processed || []);
    this.generation = Math.max(0, Number(checkpoint?.generation) || 0);
    this.rootId = clean(checkpoint?.rootId);
    this.treeId = clean(checkpoint?.treeId);
    this.restrictedProfiles = new Set(checkpoint?.restrictedProfiles || []);
    this.restrictedUnions = new Set(checkpoint?.restrictedUnions || []);
    this.profileCacheByApi = new Map();
    this.profileCacheByStable = new Map();
    this.cancelled = false;
    this.pauseReason = '';
  }

  cancel() {
    this.cancelled = true;
    this.client.cancel();
  }

  resolveStableId = value => {
    const id = refId(value) || clean(value);
    if (!id) return '';
    if (this.apiToStable[id]) return this.apiToStable[id];
    const canonical = /^profile-/i.test(id) ? canonicalGeniProfileId(id) : id;
    if (this.apiToStable[canonical]) return this.apiToStable[canonical];
    if (this.people[canonical]) return canonical;
    return '';
  };

  registerProfile(raw, requestedId = '') {
    const rawApiId = refId(raw?.id || raw?.url);
    const stableId = stableProfileId(raw, requestedId || rawApiId);
    if (!stableId) return '';
    const aliases = unique([
      rawApiId,
      apiProfileIdentifier(requestedId),
      canonicalGeniProfileId(requestedId),
      raw?.guid && /^\d{15,}$/.test(clean(raw.guid)) ? `profile-g${clean(raw.guid)}` : '',
      profileIdFromGeniInput(raw?.profile_url)
    ]);
    for (const alias of aliases) if (alias) this.apiToStable[alias] = stableId;
    if (rawApiId) this.stableToApi[stableId] = rawApiId;
    this.profileCacheByStable.set(stableId, raw);
    for (const alias of aliases) if (alias) this.profileCacheByApi.set(alias, raw);
    return stableId;
  }

  addProfiles(records, requestedId = '') {
    const added = [];
    for (const raw of records) {
      const fallback = requestedId || refId(raw?.id || raw?.url);
      const stableId = this.registerProfile(raw, fallback);
      if (!stableId || raw?.public === false) continue;
      const incoming = profileToLineagePerson(raw, stableId, this.importedAt);
      this.people[stableId] = mergeLineagePerson(this.people[stableId], incoming);
      added.push(stableId);
    }
    return unique(added);
  }

  async fetchFamilyGraphs(ids) {
    const requested = unique(ids.map(apiProfileIdentifier).filter(Boolean));
    const results = [];
    for (const batch of chunk(requested, FAMILY_GRAPH_BATCH_SIZE)) {
      results.push(...await this.fetchFamilyGraphBatchResilient(batch));
    }
    return results;
  }

  async fetchFamilyGraphBatchResilient(ids) {
    if (!ids.length) return [];
    let payload;
    try {
      payload = ids.length === 1
        ? await this.client.request(`${encodeURIComponent(ids[0])}/immediate-family`, {
          fields: FAMILY_GRAPH_FIELDS,
          only_ids: 'true'
        })
        : await this.client.request('profile/immediate-family', {
          ids: ids.map(id => stripResourcePrefix(id, 'profile')).join(','),
          fields: FAMILY_GRAPH_FIELDS,
          only_ids: 'true'
        });
    } catch (error) {
      if (['GENI_INVALID_ACCESS_TOKEN', 'GENI_REQUEST_LIMIT', 'GENI_CANCELLED', 'GENI_RATE_LIMIT'].includes(error?.code)) throw error;
      return this.splitOrRestrictFamilyGraphBatch(ids);
    }

    const classification = payloadClassification(payload);
    if (classification) {
      if (classification.code === 'GENI_INVALID_ACCESS_TOKEN') {
        throw new GeniApiError(classification.message, classification.code, { payload });
      }
      if (classification.code === 'GENI_RATE_LIMIT') {
        throw new GeniApiError(classification.message, classification.code, { retryable: true, payload });
      }
      return this.splitOrRestrictFamilyGraphBatch(ids);
    }

    const graphs = familyGraphRecords(payload);
    if (!graphs.length) return this.splitOrRestrictFamilyGraphBatch(ids);

    const remaining = new Set(ids);
    const matched = [];
    for (let index = 0; index < graphs.length; index += 1) {
      const graph = graphs[index];
      const aliases = new Set(graphAliases(graph));
      let requestedId = [...remaining].find(id => aliases.has(id));
      if (!requestedId && graphs.length === ids.length) requestedId = ids[index];
      if (!requestedId) requestedId = remaining.values().next().value;
      if (!requestedId) continue;
      remaining.delete(requestedId);
      matched.push({ requestedId, graph });
    }

    if (remaining.size) {
      const missing = [...remaining];
      if (ids.length > 1) matched.push(...await this.fetchFamilyGraphs(missing));
      else missing.forEach(id => this.restrictedProfiles.add(id));
    }
    return matched;
  }

  async splitOrRestrictFamilyGraphBatch(ids) {
    if (ids.length > 1) {
      const middle = Math.ceil(ids.length / 2);
      return [
        ...await this.fetchFamilyGraphBatchResilient(ids.slice(0, middle)),
        ...await this.fetchFamilyGraphBatchResilient(ids.slice(middle))
      ];
    }
    this.restrictedProfiles.add(ids[0]);
    return [];
  }

  profilesForUnion(graph, union) {
    const byApiId = new Map(graphProfileRecords(graph).map(raw => [refId(raw.id || raw.url), raw]));
    const needed = unique([
      graphFocusApiId(graph),
      ...refs(union.partners),
      ...unionChildRefs(union)
    ]);
    return needed.map(id => byApiId.get(id)).filter(Boolean);
  }

  async processNextGeneration() {
    if (this.cancelled) throw new GeniApiError('Geni import stopped.', 'GENI_CANCELLED');
    const currentRequestIds = unique(this.frontier).filter(id => !this.processed.has(this.resolveStableId(id) || id));
    if (!currentRequestIds.length) {
      this.frontier = [];
      return;
    }

    this.onProgress({
      phase: 'generation',
      generation: this.generation,
      frontier: currentRequestIds.length,
      profiles: Object.keys(this.people).length
    });

    const graphResults = await this.fetchFamilyGraphs(currentRequestIds);
    const downwardUnions = new Map();
    const currentStableIds = [];

    for (const { requestedId, graph } of graphResults) {
      const focusRaw = graphFocusNode(graph);
      if (!focusRaw) {
        this.restrictedProfiles.add(requestedId);
        continue;
      }
      const focusIds = this.addProfiles([focusRaw], requestedId);
      const focusStableId = focusIds[0] || this.resolveStableId(requestedId) || this.registerProfile(focusRaw, requestedId);
      if (!focusStableId || !this.people[focusStableId]) continue;
      currentStableIds.push(focusStableId);
      if (!this.rootId && requestedId === this.rootRequestId) this.rootId = focusStableId;

      for (const union of graphDownwardUnions(graph)) {
        this.addProfiles(this.profilesForUnion(graph, union));
        downwardUnions.set(union.id, union);
      }
    }

    if (!this.rootId) this.rootId = currentStableIds[0] || this.resolveStableId(this.rootRequestId);
    if (!this.rootId || !this.people[this.rootId]) {
      throw new Error('Geni did not return the selected public profile.');
    }

    const nextFrontier = [];
    for (const union of downwardUnions.values()) {
      const relation = applyUnionToPeople(this.people, union, this.resolveStableId);
      nextFrontier.push(...relation.childIds);
    }

    for (const focusStableId of unique(currentStableIds)) {
      const focus = this.people[focusStableId];
      focus.geniImmediateFamilyLoaded = true;
      focus.geniImmediateFamilyVerifiedAt = this.importedAt;
    }

    currentRequestIds.forEach(id => this.processed.add(this.resolveStableId(id) || id));
    currentStableIds.forEach(id => this.processed.add(id));
    this.generation += 1;
    const continueByDepth = this.allDescendants || this.generation < this.descendantGenerations;
    this.frontier = continueByDepth
      ? unique(nextFrontier).filter(id => !this.processed.has(this.resolveStableId(id) || id))
      : [];

    if (Object.keys(this.people).length >= this.maxProfiles && this.frontier.length) {
      this.pauseReason = `The ${this.maxProfiles}-profile pause target was reached after completing the current generation.`;
    }
  }

  async run() {
    while (this.frontier.length && !this.pauseReason) {
      await this.processNextGeneration();
      this.onProgress({
        phase: 'checkpoint',
        generation: this.generation,
        frontier: this.frontier.length,
        profiles: Object.keys(this.people).length,
        requests: this.client.requestCount
      });
      if (this.cancelled) throw new GeniApiError('Geni import stopped.', 'GENI_CANCELLED');
    }
    return {
      completed: !this.frontier.length && !this.pauseReason,
      pauseReason: this.pauseReason,
      profiles: Object.keys(this.people).length,
      requests: this.client.requestCount,
      generations: this.generation,
      restrictedProfiles: this.restrictedProfiles.size,
      restrictedUnions: this.restrictedUnions.size
    };
  }

  checkpoint() {
    return {
      version: 2,
      rootInput: this.rootInput,
      rootRequestId: this.rootRequestId,
      rootId: this.rootId,
      descendantGenerations: this.descendantGenerations,
      allDescendants: this.allDescendants,
      maxProfiles: this.maxProfiles,
      destination: this.destination,
      importedAt: this.importedAt,
      generation: this.generation,
      frontier: this.frontier,
      processed: [...this.processed],
      people: this.people,
      apiToStable: this.apiToStable,
      stableToApi: this.stableToApi,
      restrictedProfiles: [...this.restrictedProfiles],
      restrictedUnions: [...this.restrictedUnions],
      treeId: this.treeId
    };
  }

  package() {
    const knownIds = new Set(Object.keys(this.people));
    const people = Object.fromEntries(Object.entries(this.people).map(([id, source]) => {
      const person = structuredClone(source);
      for (const field of ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds']) {
        person[field] = unique(person[field]).filter(relativeId => knownIds.has(relativeId));
      }
      for (const field of ['marriageYears', 'relationshipEndYears', 'relationshipEndStatuses']) {
        person[field] = Object.fromEntries(Object.entries(person[field] || {}).filter(([relativeId]) => knownIds.has(relativeId)));
      }
      return [id, person];
    }));
    return {
      schema: 'lineage-stitch',
      version: 1,
      focusId: this.rootId,
      rootId: this.rootId,
      people
    };
  }
}

function sanitizedTreePackage(pkg) {
  return Object.fromEntries(Object.entries(pkg.people || {}).map(([id, person]) => [id, structuredClone(person)]));
}

export function lineageTreeSnapshot(pkg, { id = `tree-${cryptoId()}`, title = '' } = {}) {
  const root = pkg.people?.[pkg.rootId];
  const rootName = clean(root?.displayName || [root?.firstName, root?.lastName].filter(Boolean).join(' ')) || 'Geni descendant tree';
  return {
    id,
    title: clean(title) || `${rootName} descendants`,
    rootId: pkg.rootId,
    people: sanitizedTreePackage(pkg),
    globalEvents: [],
    reignColor: '#c62828',
    timelineYearWidth: 4,
    timelineNodeHeight: 28,
    asOfYear: null,
    treeFilter: '',
    relationVisibility: {},
    starterDataVersion: 0,
    manualTree: false,
    collapsedIds: [],
    zoom: 1,
    viewportLeft: 0,
    viewportTop: 0
  };
}
