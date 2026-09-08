function clean(value) {
  return value == null ? '' : String(value).trim();
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

/**
 * Return the canonical public Lineage ID represented by a Geni ID or URL.
 * Compact API node IDs remain compact; public GUIDs receive the `g` marker.
 */
export function canonicalGeniIdentity(value) {
  const raw = clean(value);
  if (!raw) return '';
  if (/^https?:/i.test(raw) || raw.includes('://')) {
    try {
      const url = new URL(raw);
      if (!/(^|\.)geni\.com$/i.test(url.hostname)) return '';
      const part = [...url.pathname.split('/').filter(Boolean)].reverse()
        .find(item => /^(?:profile-)?g?\d+$/i.test(item));
      return part ? canonicalGeniIdentity(part) : '';
    } catch {
      return '';
    }
  }
  const match = raw.match(/^(?:profile-)?(g?)(\d+)$/i);
  if (!match) return '';
  const [, prefix, digits] = match;
  return `profile-${prefix || digits.length >= 15 ? 'g' : ''}${digits}`;
}

export function geniIdentityCandidates(person = {}, fallbackId = '') {
  const guid = clean(person?.guid);
  const provider = clean(person?.sourceProvider || person?.source_provider || person?.provenance?.provider).toLowerCase();
  const urls = [person?.profile_url, person?.profileUrl, person?.sourceUrl, person?.url]
    .map(canonicalGeniIdentity).filter(Boolean);
  // `geniAliases` keeps both the compact API node ID and the public GUID when
  // Geni exposes them together. Either form can therefore match an older
  // starter record or a later API response.
  const explicitAliases = unique([
    ...(Array.isArray(person?.geniAliases) ? person.geniAliases : []),
    ...(Array.isArray(person?.geni_ids) ? person.geni_ids : [])
  ]).map(canonicalGeniIdentity).filter(Boolean);
  const allowBareId = provider === 'geni' || urls.length > 0 || /^\d{15,}$/.test(guid);
  const idCandidate = value => {
    const raw = clean(value);
    if (/^profile-g?\d+$/i.test(raw)) return canonicalGeniIdentity(raw);
    return allowBareId && /^g?\d+$/i.test(raw) ? canonicalGeniIdentity(raw) : '';
  };
  const candidates = [
    ...explicitAliases,
    idCandidate(person?.sourceId),
    idCandidate(person?.source_id),
    ...urls,
    idCandidate(person?.id),
    idCandidate(fallbackId)
  ].filter(Boolean);
  if (/^\d{15,}$/.test(guid)) candidates.unshift(`profile-g${guid}`);
  return unique(candidates);
}

export function primaryGeniIdentity(person = {}, fallbackId = '') {
  const candidates = geniIdentityCandidates(person, fallbackId);
  return candidates.find(id => /^profile-g\d{15,}$/i.test(id)) || candidates[0] || '';
}

export function indexPeopleByGeniIdentity(people = {}) {
  const index = new Map();
  Object.entries(people || {}).forEach(([localId, person]) => {
    const candidates = geniIdentityCandidates(person, localId);
    const primary = primaryGeniIdentity(person, localId);
    for (const identity of [primary, ...candidates]) {
      if (identity && !index.has(identity)) index.set(identity, localId);
    }
  });
  return index;
}

export function duplicateGeniIdentityGroups(people = {}) {
  const groups = new Map();
  Object.entries(people || {}).forEach(([localId, person]) => {
    const identity = primaryGeniIdentity(person, localId);
    if (!identity) return;
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(localId);
  });
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([identity, ids]) => ({ identity, ids }));
}

const ARRAY_REFERENCE_FIELDS = [
  'parents', 'children', 'partners', 'spouses', 'nonSpouses',
  'divorcedSpouses', 'geniImmediateFamilyIds'
];
const MAP_REFERENCE_FIELDS = [
  'marriageYears', 'relationshipEndYears', 'relationshipEndStatuses'
];

function mergeIncomingRecords(previous, incoming) {
  if (!previous) return incoming;
  const merged = { ...previous, ...incoming, id: previous.id || incoming.id };
  for (const field of ARRAY_REFERENCE_FIELDS) {
    merged[field] = unique([...(previous[field] || []), ...(incoming[field] || [])]);
  }
  for (const field of MAP_REFERENCE_FIELDS) {
    merged[field] = { ...(previous[field] || {}), ...(incoming[field] || {}) };
  }
  merged.geniAliases = unique([...(previous.geniAliases || []), ...(incoming.geniAliases || [])]);
  merged.geniNonMaritalBirth = previous.geniNonMaritalBirth === true || incoming.geniNonMaritalBirth === true;
  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(previous.geniParentUnionStatus);
  return merged;
}

/**
 * Remap imported Geni records onto local IDs already linked to the same public
 * Geni identity. Every relationship reference is rewritten in the same pass,
 * so a reused profile cannot leave a parallel disconnected mini-tree behind.
 */
export function remapPeopleByGeniIdentity(incomingPeople = {}, existingPeople = {}, forcedIdentityTargets = {}) {
  const existingIndex = indexPeopleByGeniIdentity(existingPeople);
  const forced = forcedIdentityTargets instanceof Map
    ? forcedIdentityTargets
    : new Map(Object.entries(forcedIdentityTargets || {}));
  const idMap = {};
  const incomingIdentityTargets = new Map();

  Object.entries(incomingPeople || {}).forEach(([incomingId, person]) => {
    const candidates = geniIdentityCandidates(person, incomingId);
    const primary = primaryGeniIdentity(person, incomingId);
    const forcedTarget = [incomingId, primary, ...candidates]
      .map(value => forced.get(value) || forced.get(canonicalGeniIdentity(value)))
      .find(Boolean);
    const existingTarget = [primary, ...candidates]
      .map(identity => existingIndex.get(identity))
      .find(Boolean);
    const incomingTarget = [primary, ...candidates]
      .map(identity => incomingIdentityTargets.get(identity))
      .find(Boolean);
    const targetId = clean(forcedTarget || existingTarget || incomingTarget || primary || incomingId);
    idMap[incomingId] = targetId;
    if (person?.id) idMap[clean(person.id)] = targetId;
    for (const identity of candidates) {
      idMap[identity] = targetId;
      incomingIdentityTargets.set(identity, targetId);
    }
  });

  const remapId = value => {
    const raw = clean(value);
    if (!raw) return '';
    if (idMap[raw]) return idMap[raw];
    const identity = canonicalGeniIdentity(raw);
    return idMap[identity] || incomingIdentityTargets.get(identity) || existingIndex.get(identity) || raw;
  };

  const records = {};
  Object.entries(incomingPeople || {}).forEach(([incomingId, source]) => {
    if (!source || typeof source !== 'object') return;
    const targetId = remapId(incomingId || source.id);
    if (!targetId) return;
    const identity = primaryGeniIdentity(source, incomingId);
    const record = { ...source, id: targetId };
    for (const field of ARRAY_REFERENCE_FIELDS) {
      record[field] = unique((source[field] || []).map(remapId).filter(Boolean));
    }
    for (const field of MAP_REFERENCE_FIELDS) {
      const mapped = {};
      Object.entries(source[field] || {}).forEach(([relativeId, value]) => {
        const targetRelativeId = remapId(relativeId);
        if (targetRelativeId) mapped[targetRelativeId] = value;
      });
      record[field] = mapped;
    }
    if (identity) record.sourceId = identity;
    record.geniAliases = unique([
      ...(source.geniAliases || []).map(canonicalGeniIdentity),
      ...geniIdentityCandidates(source, incomingId),
      identity
    ].filter(Boolean));
    records[targetId] = mergeIncomingRecords(records[targetId], record);
  });

  return {
    people: records,
    idMap,
    remapId,
    existingIdentityIndex: existingIndex
  };
}
