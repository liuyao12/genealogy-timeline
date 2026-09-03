export function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

export function refId(value) {
  if (typeof value === 'string') return clean(value).split('/').filter(Boolean).at(-1) || '';
  return clean(value?.id || value?.url).split('/').filter(Boolean).at(-1) || '';
}

export function refs(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : value && typeof value === 'object' && (value.id || value.url)
        ? [value]
        : value && typeof value === 'object'
          ? Object.entries(value).map(([key, item]) => item && typeof item === 'object' ? item : key)
          : [];
  return unique(values.map(refId).filter(Boolean));
}

export function canonicalGeniProfileId(value) {
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

export function profileIdFromGeniInput(input) {
  const raw = clean(input);
  if (!raw) return '';
  const direct = raw.match(/profile-g?\d+/i);
  if (direct) return canonicalGeniProfileId(direct[0]);
  if (/^g?\d+$/i.test(raw)) return canonicalGeniProfileId(raw);
  try {
    const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
    if (!/(^|\.)geni\.com$/i.test(url.hostname)) return '';
    const pathParts = url.pathname.split('/').filter(Boolean);
    const candidate = [...pathParts].reverse().find(part => /^g?\d+$/i.test(part) || /^profile-g?\d+$/i.test(part));
    return candidate ? canonicalGeniProfileId(candidate) : '';
  } catch {
    return '';
  }
}

export function extractYear(value) {
  const candidates = [
    value?.date?.year,
    value?.year,
    value?.date,
    value?.start?.year,
    value?.start_year,
    value
  ];
  for (const candidate of candidates) {
    const match = clean(candidate).match(/-?\d{3,4}/);
    if (match) return match[0];
  }
  return '';
}

function validGeniUrl(value) {
  try {
    const url = new URL(clean(value));
    return /^https?:$/.test(url.protocol) && /(^|\.)geni\.com$/i.test(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

export function stableProfileId(raw, fallbackId = '') {
  const guid = clean(raw?.guid);
  if (/^\d{15,}$/.test(guid)) return `profile-g${guid}`;
  const publicId = profileIdFromGeniInput(raw?.profile_url);
  if (publicId) return publicId;
  return canonicalGeniProfileId(fallbackId || refId(raw?.id || raw?.url));
}

function displayNameForProfile(raw) {
  return clean(raw?.display_name || raw?.name)
    || [raw?.first_name, raw?.middle_name, raw?.last_name].map(clean).filter(Boolean).join(' ')
    || 'Unnamed Geni profile';
}

export function profileToLineagePerson(raw, fallbackId = '', importedAt = new Date().toISOString()) {
  const id = stableProfileId(raw, fallbackId);
  const birth = raw?.birth || {};
  const death = raw?.death || {};
  return {
    id,
    displayName: displayNameForProfile(raw),
    firstName: clean(raw?.first_name),
    lastName: clean(raw?.last_name || raw?.maiden_name),
    title: clean(raw?.title),
    gender: ['male', 'female'].includes(clean(raw?.gender).toLowerCase()) ? clean(raw.gender).toLowerCase() : 'unknown',
    birthYear: extractYear(raw?.birth_date_parts) || extractYear(birth) || extractYear(raw?.birth_date),
    deathYear: extractYear(raw?.death_date_parts) || extractYear(death) || extractYear(raw?.death_date),
    isLiving: raw?.is_alive === true,
    place: clean(raw?.birth?.location?.place_name || raw?.birth?.location?.city),
    note: '',
    parents: [],
    children: [],
    partners: [],
    spouses: [],
    nonSpouses: [],
    divorcedSpouses: [],
    marriageYears: {},
    relationshipEndYears: {},
    relationshipEndStatuses: {},
    sourceUrl: validGeniUrl(raw?.profile_url) || `https://www.geni.com/profile/index/${id.replace(/^profile-g?/i, '')}`,
    sourceId: id,
    sourceProvider: 'geni',
    importedAt,
    geniImmediateFamilyLoaded: false,
    geniImmediateFamilyVerifiedAt: '',
    geniImmediateFamilyIds: []
  };
}

export function mergeLineagePerson(existing, incoming) {
  if (!existing) return structuredClone(incoming);
  const merged = { ...incoming, ...existing, id: existing.id || incoming.id };
  for (const field of ['displayName', 'firstName', 'lastName', 'title', 'birthYear', 'deathYear', 'place', 'note', 'sourceUrl', 'sourceId', 'sourceProvider']) {
    if (!clean(existing[field]) && clean(incoming[field])) merged[field] = incoming[field];
  }
  if (!['male', 'female'].includes(existing.gender) && ['male', 'female'].includes(incoming.gender)) merged.gender = incoming.gender;
  merged.isLiving = existing.isLiving === true || (!clean(existing.deathYear) && incoming.isLiving === true);
  for (const field of ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds']) {
    merged[field] = unique([...(incoming[field] || []), ...(existing[field] || [])]);
  }
  merged.marriageYears = { ...(incoming.marriageYears || {}), ...(existing.marriageYears || {}) };
  merged.relationshipEndYears = { ...(incoming.relationshipEndYears || {}), ...(existing.relationshipEndYears || {}) };
  merged.relationshipEndStatuses = { ...(incoming.relationshipEndStatuses || {}), ...(existing.relationshipEndStatuses || {}) };
  merged.geniImmediateFamilyLoaded = incoming.geniImmediateFamilyLoaded || existing.geniImmediateFamilyLoaded;
  merged.geniImmediateFamilyVerifiedAt = incoming.geniImmediateFamilyVerifiedAt || existing.geniImmediateFamilyVerifiedAt;
  return merged;
}

function relationshipYear(event, legacy) {
  return extractYear(event) || extractYear(legacy);
}

export function unionChildRefs(union) {
  return unique([
    ...refs(union?.children || union?.child_ids),
    ...refs(union?.adopted_children),
    ...refs(union?.foster_children)
  ]);
}

export function applyUnionToPeople(people, union, resolveStableId) {
  const partnerIds = unique(refs(union?.partners || union?.partner_ids || union?.profiles).map(resolveStableId).filter(id => people[id]));
  const childIds = unique(unionChildRefs(union).map(resolveStableId).filter(id => people[id]));
  const adoptedIds = new Set(refs(union?.adopted_children).map(resolveStableId));
  const fosterIds = new Set(refs(union?.foster_children).map(resolveStableId));
  const marriageYear = relationshipYear(union?.marriage, union?.marriage_date);
  const divorceYear = relationshipYear(union?.divorce, union?.divorce_date);
  const status = clean(union?.status || union?.relationship_status || union?.type).toLowerCase().replace(/[\s-]+/g, '_');
  const formal = ['spouse', 'ex_spouse', 'current', 'ex', 'married', 'divorced', 'annulled'].includes(status) || Boolean(marriageYear);
  const endStatus = status === 'annulled' ? 'annulled'
    : union?.divorce || divorceYear || status === 'divorced' ? 'divorced'
      : ['ex_spouse', 'ex'].includes(status) ? 'ended' : '';

  for (const partnerId of partnerIds) {
    const partner = people[partnerId];
    const others = partnerIds.filter(id => id !== partnerId);
    partner.partners = unique([...(partner.partners || []), ...others]);
    const relationField = formal ? 'spouses' : 'nonSpouses';
    partner[relationField] = unique([...(partner[relationField] || []), ...others]);
    partner.children = unique([...(partner.children || []), ...childIds]);
    for (const otherId of others) {
      if (marriageYear) partner.marriageYears[otherId] = marriageYear;
      if (endStatus) {
        partner.relationshipEndStatuses[otherId] = endStatus;
        if (divorceYear) partner.relationshipEndYears[otherId] = divorceYear;
        if (formal) partner.divorcedSpouses = unique([...(partner.divorcedSpouses || []), otherId]);
      }
    }
    partner.geniImmediateFamilyIds = unique([...(partner.geniImmediateFamilyIds || []), ...others, ...childIds]);
  }

  for (const childId of childIds) {
    const child = people[childId];
    child.parents = unique([...(child.parents || []), ...partnerIds]);
    child.geniImmediateFamilyIds = unique([...(child.geniImmediateFamilyIds || []), ...partnerIds]);
    const parentage = adoptedIds.has(childId) ? 'adopted' : fosterIds.has(childId) ? 'foster' : '';
    if (parentage) {
      child.geniParentage = parentage;
      const note = clean(child.note);
      const marker = `Geni relationship: ${parentage} child.`;
      if (!note.includes(marker)) child.note = [note, marker].filter(Boolean).join('\n');
    }
  }

  return { partnerIds, childIds, formal, marriageYear, divorceYear, endStatus };
}
