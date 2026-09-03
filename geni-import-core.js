import {
  DEFAULT_MAX_PROFILES,
  PROFILE_BATCH_SIZE,
  PROFILE_FIELDS,
  UNION_BATCH_SIZE,
  UNION_FIELDS
} from './geni-config.js?v=1';
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
} from './geni-model.js?v=1';
import {
  GeniApiError,
  apiProfileIdentifier,
  chunk,
  cryptoId,
  payloadClassification,
  profileRecords,
  stripResourcePrefix,
  unionRecords
} from './geni-api.js?v=1';

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
    this.unionCache = new Map();
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

  async fetchProfiles(ids) {
    const requested = unique(ids.map(apiProfileIdentifier).filter(Boolean));
    const missing = requested.filter(id => !this.profileCacheByApi.has(id) && !this.profileCacheByStable.has(this.apiToStable[id]));
    for (const batch of chunk(missing, PROFILE_BATCH_SIZE)) await this.fetchProfileBatchResilient(batch);
    const result = [];
    for (const id of requested) {
      const stableId = this.apiToStable[id] || (this.people[id] ? id : '');
      const raw = this.profileCacheByApi.get(id) || this.profileCacheByStable.get(stableId);
      if (raw) result.push(raw);
    }
    return [...new Set(result)];
  }

  async fetchProfileBatchResilient(ids) {
    if (!ids.length) return;
    let payload;
    try {
      payload = ids.length === 1
        ? await this.client.request(encodeURIComponent(ids[0]), { fields: PROFILE_FIELDS, only_ids: 'true' })
        : await this.client.request('profile', {
          ids: ids.map(id => stripResourcePrefix(id, 'profile')).join(','),
          fields: PROFILE_FIELDS,
          only_ids: 'true'
        });
    } catch (error) {
      if (['GENI_INVALID_ACCESS_TOKEN', 'GENI_REQUEST_LIMIT', 'GENI_CANCELLED', 'GENI_RATE_LIMIT'].includes(error?.code)) throw error;
      if (ids.length > 1) {
        const middle = Math.ceil(ids.length / 2);
        await this.fetchProfileBatchResilient(ids.slice(0, middle));
        await this.fetchProfileBatchResilient(ids.slice(middle));
        return;
      }
      this.restrictedProfiles.add(ids[0]);
      return;
    }
    const classification = payloadClassification(payload);
    if (classification) {
      if (classification.code === 'GENI_INVALID_ACCESS_TOKEN') throw new GeniApiError(classification.message, classification.code);
      if (ids.length > 1) {
        const middle = Math.ceil(ids.length / 2);
        await this.fetchProfileBatchResilient(ids.slice(0, middle));
        await this.fetchProfileBatchResilient(ids.slice(middle));
      } else this.restrictedProfiles.add(ids[0]);
      return;
    }
    const records = profileRecords(payload);
    records.forEach(raw => this.registerProfile(raw, ids.length === 1 ? ids[0] : ''));
    const unresolved = ids.filter(id => !this.profileCacheByApi.has(id) && !this.apiToStable[id]);
    if (unresolved.length && ids.length > 1) {
      for (const group of chunk(unresolved, Math.max(1, Math.floor(unresolved.length / 2)))) {
        await this.fetchProfileBatchResilient(group);
      }
    } else unresolved.forEach(id => this.restrictedProfiles.add(id));
  }

  async fetchUnions(ids) {
    const requested = unique(ids.map(refId).filter(id => /^union-/i.test(id)));
    const missing = requested.filter(id => !this.unionCache.has(id));
    for (const batch of chunk(missing, UNION_BATCH_SIZE)) await this.fetchUnionBatchResilient(batch);
    return requested.map(id => this.unionCache.get(id)).filter(Boolean);
  }

  async fetchUnionBatchResilient(ids) {
    if (!ids.length) return;
    let payload;
    try {
      payload = ids.length === 1
        ? await this.client.request(encodeURIComponent(ids[0]), { fields: UNION_FIELDS, only_ids: 'true' })
        : await this.client.request('union', {
          ids: ids.map(id => stripResourcePrefix(id, 'union')).join(','),
          fields: UNION_FIELDS,
          only_ids: 'true'
        });
    } catch (error) {
      if (['GENI_INVALID_ACCESS_TOKEN', 'GENI_REQUEST_LIMIT', 'GENI_CANCELLED', 'GENI_RATE_LIMIT'].includes(error?.code)) throw error;
      if (ids.length > 1) {
        const middle = Math.ceil(ids.length / 2);
        await this.fetchUnionBatchResilient(ids.slice(0, middle));
        await this.fetchUnionBatchResilient(ids.slice(middle));
        return;
      }
      this.restrictedUnions.add(ids[0]);
      return;
    }
    const classification = payloadClassification(payload);
    if (classification) {
      if (classification.code === 'GENI_INVALID_ACCESS_TOKEN') throw new GeniApiError(classification.message, classification.code);
      if (ids.length > 1) {
        const middle = Math.ceil(ids.length / 2);
        await this.fetchUnionBatchResilient(ids.slice(0, middle));
        await this.fetchUnionBatchResilient(ids.slice(middle));
      } else this.restrictedUnions.add(ids[0]);
      return;
    }
    unionRecords(payload).forEach(raw => {
      const id = refId(raw.id || raw.url);
      if (id) this.unionCache.set(id, { ...raw, id });
    });
    const unresolved = ids.filter(id => !this.unionCache.has(id));
    if (unresolved.length && ids.length > 1) {
      for (const group of chunk(unresolved, Math.max(1, Math.floor(unresolved.length / 2)))) {
        await this.fetchUnionBatchResilient(group);
      }
    } else unresolved.forEach(id => this.restrictedUnions.add(id));
  }

  addProfiles(records, requestedIds = []) {
    const added = [];
    records.forEach((raw, index) => {
      const fallback = requestedIds[index] || refId(raw.id || raw.url);
      const stableId = this.registerProfile(raw, fallback);
      if (!stableId || raw.public === false) return;
      const incoming = profileToLineagePerson(raw, stableId, this.importedAt);
      this.people[stableId] = mergeLineagePerson(this.people[stableId], incoming);
      added.push(stableId);
    });
    return unique(added);
  }

  async processNextGeneration() {
    if (this.cancelled) throw new GeniApiError('Geni import stopped.', 'GENI_CANCELLED');
    const currentRequestIds = unique(this.frontier).filter(id => !this.processed.has(this.resolveStableId(id) || id));
    if (!currentRequestIds.length) {
      this.frontier = [];
      return;
    }
    this.onProgress({ phase: 'generation', generation: this.generation, frontier: currentRequestIds.length, profiles: Object.keys(this.people).length });
    const currentRawProfiles = await this.fetchProfiles(currentRequestIds);
    const currentStableIds = this.addProfiles(currentRawProfiles, currentRequestIds);
    if (!this.rootId) this.rootId = currentStableIds[0] || this.resolveStableId(this.rootRequestId);
    if (!this.rootId || !this.people[this.rootId]) throw new Error('Geni did not return the selected public profile.');

    const unionIds = unique(currentRawProfiles.flatMap(raw => refs(raw.unions)));
    const unions = await this.fetchUnions(unionIds);
    const currentSet = new Set(currentStableIds);
    const downwardUnions = unions.filter(union => refs(union.partners).some(partnerRef => currentSet.has(this.resolveStableId(partnerRef))));
    const relatedRequestIds = unique(downwardUnions.flatMap(union => [...refs(union.partners), ...unionChildRefs(union)]).filter(id => /^profile-/i.test(id)));
    const relatedRawProfiles = await this.fetchProfiles(relatedRequestIds);
    this.addProfiles(relatedRawProfiles, relatedRequestIds);

    // Apply every returned union that can be resolved among retained profiles.
    // This includes the current generation's parental unions, which is what
    // restores parent links when an import resumes at a later generation.
    const relations = new Map();
    for (const union of unions) relations.set(refId(union.id || union.url), applyUnionToPeople(this.people, union, this.resolveStableId));

    const nextFrontier = [];
    for (const union of downwardUnions) {
      const relation = relations.get(refId(union.id || union.url)) || { partnerIds: [] };
      for (const childRef of unionChildRefs(union)) {
        const childStableId = this.resolveStableId(childRef);
        if (childStableId && this.people[childStableId]) nextFrontier.push(childStableId);
        else if (/^profile-/i.test(childRef) && !this.restrictedProfiles.has(childRef)) nextFrontier.push(childRef);
      }
      for (const partnerId of relation.partnerIds) {
        if (currentSet.has(partnerId)) {
          this.people[partnerId].geniImmediateFamilyLoaded = true;
          this.people[partnerId].geniImmediateFamilyVerifiedAt = this.importedAt;
        }
      }
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
      version: 1,
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
