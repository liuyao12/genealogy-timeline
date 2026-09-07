from __future__ import annotations

import json
import re
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:140]!r}")
    file_path.write_text(text.replace(old, new, 1))


def regex_replace_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Expected one regex match in {path}, found {count}: {pattern[:140]!r}")
    file_path.write_text(text)


# ---------------------------------------------------------------------------
# 1. Timeline projection: suppress low-information/noisy child branches while
# retaining every record in storage and search.
# ---------------------------------------------------------------------------
replace_once(
    "descendant-scope.js",
    """function normalizedGender(person) {
  const value = String(person?.gender || '').toLowerCase();
  return value === 'm' ? 'male' : value === 'f' ? 'female' : value;
}

""",
    """function normalizedGender(person) {
  const value = String(person?.gender || '').toLowerCase();
  return value === 'm' ? 'male' : value === 'f' ? 'female' : value;
}

function numericYear(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const PLACEHOLDER_NAME_PATTERN = /(?:^|[^\\p{L}\\p{N}])(?:n\\.?\\s*n\\.?|unknown|unnamed)(?=$|[^\\p{L}\\p{N}])/iu;
const STILLBIRTH_PATTERN = /\\b(?:still[\\s-]?born|stillbirth|died (?:in|during) infancy|infant death)\\b/i;

export function profileHasPlaceholderName(person) {
  const name = [
    person?.displayName,
    typeof person?.name === 'string' ? person.name : '',
    person?.firstName,
    person?.lastName
  ].filter(Boolean).join(' ').trim();
  return !name || PLACEHOLDER_NAME_PATTERN.test(name);
}

function profileIndicatesStillbirth(person) {
  return STILLBIRTH_PATTERN.test([
    person?.displayName,
    typeof person?.name === 'string' ? person.name : '',
    person?.note
  ].filter(Boolean).join(' '));
}

function isFormalPartnerPair(records, firstId, secondId) {
  if (!records[firstId] || !records[secondId]) return false;
  return formalSpouseIds(records[firstId]).includes(secondId)
    || formalSpouseIds(records[secondId]).includes(firstId);
}

function isNonFormalPartnerPair(records, firstId, secondId) {
  const first = records[firstId];
  const second = records[secondId];
  if (!first || !second || isFormalPartnerPair(records, firstId, secondId)) return false;
  return ids(first.nonSpouses).includes(secondId)
    || ids(second.nonSpouses).includes(firstId)
    || ids(first.partners).includes(secondId)
    || ids(second.partners).includes(firstId);
}

/**
 * Return the reason a stored child branch should be omitted from the default
 * timeline projection. The record remains searchable and can still be chosen
 * explicitly as the focus.
 */
export function hiddenBirthReason(records = {}, childId = '', parentIds = [], childIds = []) {
  const person = records[childId];
  if (!person) return 'missing-profile';
  if (profileHasPlaceholderName(person)) return 'placeholder-name';
  if (profileIndicatesStillbirth(person)) return 'stillbirth';

  const birthYear = numericYear(person.birthYear);
  const deathYear = person.isLiving ? null : numericYear(person.deathYear);
  const knownChildren = uniqueIds([...(ids(person.children)), ...childIds]).filter(id => records[id]);
  // With year-only dates, a death in the birth year or following calendar year
  // is the conservative interval that can represent infancy. Never suppress a
  // profile carrying descendants, even when one of its dates is erroneous.
  if (!knownChildren.length && birthYear != null && deathYear != null
      && deathYear >= birthYear && deathYear <= birthYear + 1) {
    return 'infant-death';
  }

  const parents = uniqueIds(parentIds).filter(id => records[id]);
  if (parents.length < 2 || parents.some(parentId => profileHasPlaceholderName(records[parentId]))) {
    return 'missing-parent';
  }

  // Adopted and foster children are not classified by their parents' marital
  // relation. Their explicit parentage remains visible when complete.
  if (['adopted', 'foster'].includes(String(person.geniParentage || '').toLowerCase())) return '';

  let hasFormalPair = false;
  let hasNonFormalPair = false;
  for (let first = 0; first < parents.length; first += 1) {
    for (let second = first + 1; second < parents.length; second += 1) {
      hasFormalPair ||= isFormalPartnerPair(records, parents[first], parents[second]);
      hasNonFormalPair ||= isNonFormalPartnerPair(records, parents[first], parents[second]);
    }
  }
  return hasNonFormalPair && !hasFormalPair ? 'non-marital-parentage' : '';
}

"""
)

replace_once(
    "descendant-scope.js",
    """  const descendantIds = new Set();
  const descendantQueue = records[root] ? [root] : [];
  for (let index = 0; index < descendantQueue.length; index += 1) {
    const id = descendantQueue[index];
    if (!records[id] || descendantIds.has(id)) continue;
    descendantIds.add(id);
    (allChildrenByParent.get(id) || []).forEach(childId => descendantQueue.push(childId));
  }
""",
    """  const hiddenBirthReasons = new Map();
  const birthVisibility = new Map([[root, true]]);
  const childMayAppear = childId => {
    if (birthVisibility.has(childId)) return birthVisibility.get(childId);
    const reason = hiddenBirthReason(
      records,
      childId,
      [...(allParentsByChild.get(childId) || [])],
      [...(allChildrenByParent.get(childId) || [])]
    );
    const visible = !reason;
    birthVisibility.set(childId, visible);
    if (reason) hiddenBirthReasons.set(childId, reason);
    return visible;
  };

  const descendantIds = new Set();
  const descendantQueue = records[root] ? [root] : [];
  for (let index = 0; index < descendantQueue.length; index += 1) {
    const id = descendantQueue[index];
    if (!records[id] || descendantIds.has(id)) continue;
    if (id !== root && !childMayAppear(id)) continue;
    descendantIds.add(id);
    (allChildrenByParent.get(id) || []).forEach(childId => descendantQueue.push(childId));
  }
"""
)

replace_once(
    "descendant-scope.js",
    """    const fatherId = fatherIdFor(records, allParentsByChild, paternalChildId);
    if (!fatherId || paternalSeen.has(fatherId)) break;
""",
    """    const fatherId = fatherIdFor(records, allParentsByChild, paternalChildId);
    if (!fatherId || paternalSeen.has(fatherId) || profileHasPlaceholderName(records[fatherId])) break;
"""
)

replace_once(
    "descendant-scope.js",
    """  paternalAncestorIds.forEach(ancestorId => {
    (allChildrenByParent.get(ancestorId) || []).forEach(childId => paternalHouseholdChildIds.add(childId));
  });
""",
    """  paternalAncestorIds.forEach(ancestorId => {
    (allChildrenByParent.get(ancestorId) || []).forEach(childId => {
      if (childId === root || childMayAppear(childId)) paternalHouseholdChildIds.add(childId);
    });
  });
"""
)

replace_once(
    "descendant-scope.js",
    """  const addSpousePair = (firstId, secondId) => {
    if (!records[firstId] || !records[secondId] || firstId === secondId) return;
""",
    """  const addSpousePair = (firstId, secondId) => {
    if (!records[firstId] || !records[secondId] || firstId === secondId) return;
    if ((firstId !== root && profileHasPlaceholderName(records[firstId]))
        || (secondId !== root && profileHasPlaceholderName(records[secondId]))) return;
"""
)

replace_once(
    "descendant-scope.js",
    """    allChildrenByParent,
    allParentsByChild
  };
}
""",
    """    allChildrenByParent,
    allParentsByChild,
    hiddenBirthReasons,
    hiddenBirthIds: new Set(hiddenBirthReasons.keys())
  };
}
"""
)

# ---------------------------------------------------------------------------
# 2. Shared Geni identity helpers and importer alias coalescing.
# ---------------------------------------------------------------------------
replace_once(
    "geni-model.js",
    """export function extractYear(value) {
""",
    """export function geniIdentityForPerson(person = {}, fallbackId = '') {
  for (const candidate of [
    person?.sourceId,
    person?.source_id,
    person?.profile_url,
    person?.profileUrl,
    person?.sourceUrl,
    person?.id,
    fallbackId
  ]) {
    const identity = profileIdFromGeniInput(candidate);
    if (identity) return identity;
  }
  return '';
}

export function buildGeniIdentityIndex(people = {}) {
  const index = new Map();
  const rank = (id, identity) => {
    if (!/^profile-/i.test(id)) return 0; // Preserve an existing local anchor.
    if (id === identity) return 1;
    return 2;
  };
  Object.entries(people || {}).forEach(([key, person]) => {
    const id = clean(person?.id || key) || key;
    const identity = geniIdentityForPerson(person, id);
    if (!identity) return;
    const current = index.get(identity);
    if (!current || rank(id, identity) < rank(current, identity)) index.set(identity, id);
  });
  return index;
}

export function extractYear(value) {
"""
)

replace_once(
    "geni-model.js",
    """    geniImmediateFamilyIds: []
  };
}
""",
    """    geniImmediateFamilyIds: [],
    geniParentage: ''
  };
}
"""
)

replace_once(
    "geni-model.js",
    """  for (const field of ['displayName', 'firstName', 'lastName', 'title', 'birthYear', 'deathYear', 'place', 'note', 'sourceUrl', 'sourceId', 'sourceProvider']) {
""",
    """  for (const field of ['displayName', 'firstName', 'lastName', 'title', 'birthYear', 'deathYear', 'place', 'note', 'sourceUrl', 'sourceId', 'sourceProvider', 'geniParentage']) {
"""
)

replace_once(
    "geni-import-core.js",
    """} from './geni-model.js?v=2';
""",
    """} from './geni-model.js?v=3';
"""
)

replace_once(
    "geni-import-core.js",
    """  registerProfile(raw, requestedId = '') {
    const rawApiId = refId(raw?.id || raw?.url);
    const stableId = stableProfileId(raw, requestedId || rawApiId);
    if (!stableId) return '';
    const aliases = unique([
      rawApiId,
      apiProfileIdentifier(requestedId),
      canonicalGeniProfileId(requestedId),
      raw?.guid && /^\\d{15,}$/.test(clean(raw.guid)) ? `profile-g${clean(raw.guid)}` : '',
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
""",
    """  registerProfile(raw, requestedId = '') {
    const rawApiId = refId(raw?.id || raw?.url);
    const proposedStableId = stableProfileId(raw, requestedId || rawApiId);
    if (!proposedStableId) return '';
    const aliases = unique([
      proposedStableId,
      rawApiId,
      apiProfileIdentifier(requestedId),
      canonicalGeniProfileId(requestedId),
      raw?.guid && /^\\d{15,}$/.test(clean(raw.guid)) ? `profile-g${clean(raw.guid)}` : '',
      profileIdFromGeniInput(raw?.profile_url)
    ]);
    // The same profile may first arrive as a compact API node and later with a
    // public GUID. Reuse the first stable key instead of creating a duplicate.
    const stableId = aliases.map(alias => this.apiToStable[alias]).find(Boolean) || proposedStableId;
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
      const publicIdentity = stableProfileId(raw, fallback) || stableId;
      const incoming = {
        ...profileToLineagePerson(raw, stableId, this.importedAt),
        id: stableId,
        sourceId: publicIdentity
      };
      this.people[stableId] = mergeLineagePerson(this.people[stableId], incoming);
      added.push(stableId);
    }
    return unique(added);
  }
"""
)

replace_once(
    "geni-import.js",
    """import { clean, profileIdFromGeniInput } from './geni-model.js?v=2';
import { GeniJsonpClient, cryptoId } from './geni-api.js?v=2';
import { GeniDescendantImporter, lineageTreeSnapshot } from './geni-import-core.js?v=2';
""",
    """import { clean, profileIdFromGeniInput } from './geni-model.js?v=3';
import { GeniJsonpClient, cryptoId } from './geni-api.js?v=2';
import { GeniDescendantImporter, lineageTreeSnapshot } from './geni-import-core.js?v=3';
"""
)

replace_once(
    "geni-import.js",
    """      <p class=\"geni-import-note\">The importer retains complete generations, spouses, marriage and divorce dates, and the correct parent union. Adopted and foster children are included and identified in the imported profile note.</p>
""",
    """      <p class=\"geni-import-note\">Profiles are matched to existing nodes by public Geni ID. Complete generations, formal spouses, union dates, and parent unions are retained; low-information child branches stay stored and searchable but are omitted from the timeline.</p>
"""
)

# ---------------------------------------------------------------------------
# 3. App-level identity reconciliation for restore, immediate-family loading,
# stitch imports, and backup imports.
# ---------------------------------------------------------------------------
replace_once(
    "app.js",
    """import { computeDescendantScope } from './descendant-scope.js?v=3';
""",
    """import { computeDescendantScope } from './descendant-scope.js?v=4';
import { buildGeniIdentityIndex, geniIdentityForPerson as geniIdentityForRecord } from './geni-model.js?v=3';
"""
)

replace_once(
    "app.js",
    """function geniProfileIdForPerson(person) {
  for (const candidate of [person?.id, person?.sourceId, person?.sourceUrl]) {
    const id = profileIdFromInput(candidate);
    if (id) return id;
  }
  return '';
}
""",
    """function geniProfileIdForPerson(person) {
  return geniIdentityForRecord(person, person?.id);
}
"""
)

replace_once(
    "app.js",
    """    geniImmediateFamilyIds: uniqueRefs(source.geniImmediateFamilyIds),
    starterProfile: source.starterProfile === true
""",
    """    geniImmediateFamilyIds: uniqueRefs(source.geniImmediateFamilyIds),
    geniParentage: clean(source.geniParentage || source.geni_parentage),
    starterProfile: source.starterProfile === true
"""
)

regex_replace_once(
    "app.js",
    r"function migrateGeniPeople\(rawPeople\) \{.*?\n\}\n\nfunction migrateRelationVisibility\(rawVisibility\) \{.*?\n\}\n",
    r"""function migrateGeniPeople(rawPeople) {
  const entries = [];
  let migrated = false;
  Object.entries(rawPeople || {}).forEach(([key, source], order) => {
    const record = source && typeof source === 'object' ? source : {};
    const normalized = normalizePerson(record, key);
    const rawNamePeriods = record.namePeriods || record.historicalNames || record.names;
    if (Array.isArray(rawNamePeriods) && normalized.namePeriods.length < rawNamePeriods.filter(Boolean).length) migrated = true;
    if (!clean(record.defaultNamePeriodId || record.default_name_period_id) && normalized.defaultNamePeriodId) migrated = true;
    const originalId = /^profile-/i.test(clean(normalized.id))
      ? canonicalGeniProfileId(normalized.id)
      : clean(normalized.id || key);
    if (originalId !== clean(normalized.id)) migrated = true;
    normalized.id = originalId;
    const identity = geniIdentityForRecord({ ...record, ...normalized, id: originalId }, originalId);
    if (identity && normalized.sourceId !== identity) {
      normalized.sourceId = identity;
      migrated = true;
    }
    entries.push({ key, record, normalized, originalId, identity, order });
  });

  const groupsByIdentity = new Map();
  entries.forEach(entry => {
    if (!entry.identity) return;
    if (!groupsByIdentity.has(entry.identity)) groupsByIdentity.set(entry.identity, []);
    groupsByIdentity.get(entry.identity).push(entry);
  });
  const targetByIdentity = new Map();
  groupsByIdentity.forEach((group, identity) => {
    const localAnchor = group.find(entry => !/^profile-/i.test(entry.originalId));
    const canonicalRecord = group.find(entry => entry.originalId === identity);
    const targetId = localAnchor?.originalId || canonicalRecord?.originalId || identity;
    targetByIdentity.set(identity, targetId);
    if (group.length > 1 || group.some(entry => entry.originalId !== targetId)) migrated = true;
  });

  const targetFor = entry => entry.identity ? targetByIdentity.get(entry.identity) : entry.originalId;
  const idMap = new Map();
  const registerAlias = (value, targetId) => {
    const raw = clean(value);
    if (!raw || !targetId) return;
    idMap.set(raw, targetId);
    const canonical = /^profile-/i.test(raw) ? canonicalGeniProfileId(raw) : raw;
    idMap.set(canonical, targetId);
    const identity = profileIdFromInput(raw);
    if (identity) idMap.set(identity, targetId);
  };
  entries.forEach(entry => {
    const targetId = targetFor(entry);
    [entry.key, entry.originalId, entry.record.id, entry.record.sourceId, entry.record.sourceUrl, entry.identity]
      .forEach(value => registerAlias(value, targetId));
  });
  targetByIdentity.forEach((targetId, identity) => registerAlias(identity, targetId));

  const remapId = value => {
    const raw = clean(value);
    if (!raw) return '';
    const canonical = /^profile-/i.test(raw) ? canonicalGeniProfileId(raw) : raw;
    const identity = profileIdFromInput(raw);
    const remapped = idMap.get(raw) || idMap.get(canonical) || (identity ? idMap.get(identity) : '') || canonical;
    if (remapped !== raw) migrated = true;
    return remapped;
  };
  const remapMap = value => {
    const remapped = {};
    Object.entries(value || {}).forEach(([id, detail]) => {
      const targetId = remapId(id);
      if (targetId) remapped[targetId] = detail;
    });
    return remapped;
  };

  const people = {};
  [...entries].sort((first, second) => {
    const firstPrimary = first.originalId === targetFor(first) ? 0 : 1;
    const secondPrimary = second.originalId === targetFor(second) ? 0 : 1;
    return firstPrimary - secondPrimary || first.order - second.order;
  }).forEach(entry => {
    const targetId = targetFor(entry);
    const normalized = { ...entry.normalized, id: targetId };
    if (entry.identity) normalized.sourceId = entry.identity;
    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'].forEach(field => {
      normalized[field] = unique((normalized[field] || []).map(remapId)).filter(id => id && id !== targetId);
    });
    normalized.marriageYears = remapMap(normalized.marriageYears);
    normalized.relationshipEndYears = remapMap(normalized.relationshipEndYears);
    normalized.relationshipEndStatuses = remapMap(normalized.relationshipEndStatuses);
    people[targetId] = people[targetId] ? mergePersonRecords(people[targetId], normalized) : normalized;
  });

  Object.values(people).forEach(person => {
    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'].forEach(field => {
      person[field] = unique((person[field] || []).map(remapId)).filter(id => id && id !== person.id);
    });
    person.marriageYears = remapMap(person.marriageYears);
    person.relationshipEndYears = remapMap(person.relationshipEndYears);
    person.relationshipEndStatuses = remapMap(person.relationshipEndStatuses);
  });

  return {
    people,
    migrated,
    remapId,
    idMap,
    deduplicatedCount: Math.max(0, entries.length - Object.keys(people).length)
  };
}

function migrateRelationVisibility(rawVisibility, idMap = null) {
  let migrated = false;
  const aliases = idMap instanceof Map
    ? [...idMap.entries()].filter(([from, to]) => from && to && from !== to).sort((a, b) => b[0].length - a[0].length)
    : [];
  const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relationVisibility = Object.fromEntries(Object.entries(rawVisibility || {}).filter(([, value]) => typeof value === 'boolean').map(([key, value]) => {
    let canonicalKey = key.replace(/profile-(\\d{15,})/gi, 'profile-g$1');
    aliases.forEach(([from, to]) => {
      canonicalKey = canonicalKey.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapePattern(from)}(?![\\p{L}\\p{N}])`, 'gu'), to);
    });
    if (canonicalKey !== key) migrated = true;
    return [canonicalKey, value];
  }));
  return { relationVisibility, migrated };
}
""",
    flags=re.S,
)

replace_once(
    "app.js",
    """function applyTreeSnapshot(saved) {
  const savedRootId = /^profile-/i.test(clean(saved.rootId)) ? canonicalGeniProfileId(saved.rootId) : clean(saved.rootId);
  const migratedPeople = migrateGeniPeople(saved.people);
  const migratedVisibility = migrateRelationVisibility(saved.relationVisibility);
""",
    """function applyTreeSnapshot(saved) {
  const rawSavedRootId = /^profile-/i.test(clean(saved.rootId)) ? canonicalGeniProfileId(saved.rootId) : clean(saved.rootId);
  const migratedPeople = migrateGeniPeople(saved.people);
  const savedRootId = migratedPeople.remapId(rawSavedRootId);
  const migratedVisibility = migrateRelationVisibility(saved.relationVisibility, migratedPeople.idMap);
"""
)

replace_once(
    "app.js",
    """  state.people = migratedPeople.people;
  state.collapsedIds = new Set(array(saved.collapsedIds));
""",
    """  state.people = migratedPeople.people;
  state.collapsedIds = new Set(array(saved.collapsedIds).map(migratedPeople.remapId).filter(Boolean));
"""
)

replace_once(
    "app.js",
    """  return migratedPeople.migrated || migratedVisibility.migrated || savedRootId !== clean(saved.rootId);
""",
    """  return migratedPeople.migrated || migratedVisibility.migrated || savedRootId !== rawSavedRootId;
"""
)

regex_replace_once(
    "app.js",
    r"function remapGeniImmediateFamily\(mapped, focusAliases, localFocusId, remoteFocusId\) \{.*?\n\}\n\nasync function loadGeniImmediateFamily",
    r"""function remapGeniImmediateFamily(mapped, focusAliases, localFocusId, remoteFocusId, existingByGeniId = new Map()) {
  const focusIdentityAliases = new Set(focusAliases.flatMap(value => {
    const normalized = normalizedGeniReference(value);
    const identity = profileIdFromInput(value) || profileIdFromInput(normalized);
    return [normalized, identity].filter(Boolean);
  }));
  const targetByRemoteId = new Map();
  const registerRemoteAlias = (value, targetId) => {
    const normalized = normalizedGeniReference(value);
    if (normalized) targetByRemoteId.set(normalized, targetId);
    const identity = profileIdFromInput(value) || profileIdFromInput(normalized);
    if (identity) targetByRemoteId.set(identity, targetId);
  };

  Object.entries(mapped || {}).forEach(([key, raw]) => {
    if (!raw) return;
    const originalId = normalizedGeniReference(key || raw.id);
    const identity = geniIdentityForRecord({ ...raw, id: originalId }, originalId) || profileIdFromInput(originalId);
    const isFocus = focusIdentityAliases.has(originalId) || (identity && focusIdentityAliases.has(identity));
    const targetId = isFocus
      ? localFocusId
      : (identity && existingByGeniId.get(identity)) || originalId;
    [originalId, identity, raw.id, raw.profile_url, raw.sourceId].forEach(value => registerRemoteAlias(value, targetId));
  });
  focusAliases.forEach(value => registerRemoteAlias(value, localFocusId));
  registerRemoteAlias(remoteFocusId, localFocusId);

  const remapId = value => {
    const id = normalizedGeniReference(value);
    const identity = profileIdFromInput(value) || profileIdFromInput(id);
    return targetByRemoteId.get(id)
      || (identity && (targetByRemoteId.get(identity) || existingByGeniId.get(identity)))
      || id;
  };
  const remapMap = value => Object.fromEntries(
    Object.entries(value || {}).map(([id, detail]) => [remapId(id), detail]).filter(([id]) => id)
  );
  const records = {};
  Object.entries(mapped || {}).forEach(([key, raw]) => {
    const originalId = normalizedGeniReference(key || raw?.id);
    const identity = geniIdentityForRecord({ ...raw, id: originalId }, originalId) || profileIdFromInput(originalId);
    const targetId = remapId(originalId);
    if (!targetId || !raw) return;
    const record = {
      ...raw,
      id: targetId,
      parents: unique(uniqueRefs(raw.parents).map(remapId)),
      children: unique(uniqueRefs(raw.children).map(remapId)),
      partners: unique(uniqueRefs(raw.partners).map(remapId)),
      spouses: unique(uniqueRefs(raw.spouses).map(remapId)),
      nonSpouses: unique(uniqueRefs(raw.nonSpouses).map(remapId)),
      divorcedSpouses: unique(uniqueRefs(raw.divorcedSpouses).map(remapId)),
      marriageYears: remapMap(raw.marriageYears),
      relationshipEndYears: remapMap(raw.relationshipEndYears),
      relationshipEndStatuses: remapMap(raw.relationshipEndStatuses),
      sourceId: identity || (focusIdentityAliases.has(originalId) ? remoteFocusId : originalId)
    };
    const previous = records[targetId];
    if (previous) {
      ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses'].forEach(field => {
        record[field] = unique([...(previous[field] || []), ...(record[field] || [])]);
      });
      record.marriageYears = { ...(previous.marriageYears || {}), ...(record.marriageYears || {}) };
      record.relationshipEndYears = { ...(previous.relationshipEndYears || {}), ...(record.relationshipEndYears || {}) };
      record.relationshipEndStatuses = { ...(previous.relationshipEndStatuses || {}), ...(record.relationshipEndStatuses || {}) };
    }
    records[targetId] = record;
  });
  return { records, remapId };
}

async function loadGeniImmediateFamily""",
    flags=re.S,
)

replace_once(
    "app.js",
    """  const { records, remapId } = remapGeniImmediateFamily(mapped, [
    requestedFocusId,
    remoteFocusId,
    focusRaw?.id,
    focusRaw?.profile_url
  ], profileId, remoteFocusId);
""",
    """  const existingByGeniId = buildGeniIdentityIndex(state.people);
  const { records, remapId } = remapGeniImmediateFamily(mapped, [
    requestedFocusId,
    remoteFocusId,
    focusRaw?.id,
    focusRaw?.profile_url
  ], profileId, remoteFocusId, existingByGeniId);
"""
)

replace_once(
    "app.js",
    """  ['firstName', 'lastName', 'displayName', 'title', 'birthYear', 'deathYear', 'place', 'note'].forEach(field => {
""",
    """  ['firstName', 'lastName', 'displayName', 'title', 'birthYear', 'deathYear', 'place', 'note', 'geniParentage'].forEach(field => {
"""
)

regex_replace_once(
    "app.js",
    r"function stitchImport\(payload\) \{.*?\n\}\n\nfunction importBackup",
    r"""function stitchImport(payload) {
  if (payload?.schema !== 'lineage-stitch' || Number(payload.version) !== 1) {
    throw new Error('This is not a lineage-stitch version 1 package.');
  }
  const importedAt = new Date().toISOString();
  const incomingMigration = migrateGeniPeople(normalizeStitchPeople(payload.people));
  const incomingPeople = Object.fromEntries(Object.entries(incomingMigration.people).map(([id, person]) => [
    id,
    normalizePerson({ ...person, importedAt: person.importedAt || importedAt }, id)
  ]));
  if (!Object.keys(incomingPeople).length) throw new Error('The AI import contains no profiles.');

  const previousIds = new Set(Object.keys(state.people));
  const combinedRaw = {};
  Object.entries(state.people).forEach(([id, person], index) => {
    combinedRaw[`existing-${index}-${id}`] = { ...person, id: person.id || id };
  });
  Object.entries(incomingPeople).forEach(([id, person], index) => {
    combinedRaw[`incoming-${index}-${id}`] = { ...person, id: person.id || id };
  });
  const combinedMigration = migrateGeniPeople(combinedRaw);
  state.people = combinedMigration.people;
  state.rootId = combinedMigration.remapId(state.rootId);
  state.selectedId = combinedMigration.remapId(state.selectedId);
  state.collapsedIds = new Set([...state.collapsedIds].map(combinedMigration.remapId).filter(Boolean));
  state.relationVisibility = migrateRelationVisibility(state.relationVisibility, combinedMigration.idMap).relationVisibility;

  const incomingIds = unique(Object.keys(incomingPeople).map(combinedMigration.remapId)).filter(id => state.people[id]);
  const missingRefs = new Set();
  const existingRef = id => {
    if (state.people[id]) return true;
    missingRefs.add(id);
    return false;
  };
  incomingIds.forEach(id => {
    const person = state.people[id];
    person.parents = person.parents.filter(existingRef);
    person.children = person.children.filter(existingRef);
    person.partners = person.partners.filter(existingRef);
    person.spouses = person.spouses.filter(existingRef);
    person.nonSpouses = person.nonSpouses.filter(existingRef);
    person.divorcedSpouses = person.divorcedSpouses.filter(existingRef);
    person.parents.forEach(parentId => { state.people[parentId].children = unique([...state.people[parentId].children, id]); });
    person.children.forEach(childId => { state.people[childId].parents = unique([...state.people[childId].parents, id]); });
    person.partners.forEach(partnerId => { state.people[partnerId].partners = unique([...state.people[partnerId].partners, id]); });
    person.nonSpouses.forEach(partnerId => {
      state.people[partnerId].partners = unique([...state.people[partnerId].partners, id]);
      state.people[partnerId].nonSpouses = unique([...state.people[partnerId].nonSpouses, id]);
    });
    person.spouses.forEach(spouseId => {
      state.people[spouseId].partners = unique([...state.people[spouseId].partners, id]);
      state.people[spouseId].spouses = unique([...state.people[spouseId].spouses, id]);
      person.partners = unique([...person.partners, spouseId]);
      const marriageYear = clean(person.marriageYears[spouseId]);
      if (marriageYear && !clean(state.people[spouseId].marriageYears[id])) state.people[spouseId].marriageYears[id] = marriageYear;
    });
  });

  if (Array.isArray(payload.globalEvents)) {
    const combined = [...state.globalEvents, ...normalizeGlobalEvents(payload.globalEvents)];
    state.globalEvents = combined.filter((event, index) => combined.findIndex(other => other.id === event.id) === index);
  }
  const focusId = combinedMigration.remapId(incomingMigration.remapId(clean(payload.focusId)));
  const importedRootId = combinedMigration.remapId(incomingMigration.remapId(clean(payload.rootId)));
  if (!state.rootId || !state.people[state.rootId]) state.rootId = state.people[importedRootId] ? importedRootId : incomingIds[0];
  if (state.people[focusId]) state.selectedId = focusId;
  state.manualTree = true;
  persist('AI research stitched into this tree');
  render();
  const newCount = incomingIds.filter(id => !previousIds.has(id)).length;
  const updatedCount = incomingIds.length - newCount;
  const missingNote = missingRefs.size ? ` ${missingRefs.size} dangling reference${missingRefs.size === 1 ? '' : 's'} omitted.` : '';
  const dedupeNote = combinedMigration.deduplicatedCount
    ? ` ${combinedMigration.deduplicatedCount} duplicate Geni record${combinedMigration.deduplicatedCount === 1 ? '' : 's'} coalesced by public ID.`
    : '';
  toast(`Stitched ${newCount} new and ${updatedCount} matching profile${updatedCount === 1 ? '' : 's'} into this tree.${dedupeNote}${missingNote}`, true);
  return { newCount, updatedCount, missingCount: missingRefs.size, deduplicatedCount: combinedMigration.deduplicatedCount };
}

function importBackup""",
    flags=re.S,
)

replace_once(
    "app.js",
    """  state.treeFilter = clean(payload.treeFilter || payload.db?.treeFilter);
  state.relationVisibility = migrateRelationVisibility(payload.relationVisibility || payload.db?.relationVisibility).relationVisibility;
  const people = migrateGeniPeople(rawPeople).people;
""",
    """  state.treeFilter = clean(payload.treeFilter || payload.db?.treeFilter);
  const migratedPeople = migrateGeniPeople(rawPeople);
  state.relationVisibility = migrateRelationVisibility(payload.relationVisibility || payload.db?.relationVisibility, migratedPeople.idMap).relationVisibility;
  const people = migratedPeople.people;
"""
)

replace_once(
    "app.js",
    """  const importedRootId = clean(payload.activeRootId || payload.db?.activeRootId);
  state.rootId = (/^profile-/i.test(importedRootId) ? canonicalGeniProfileId(importedRootId) : importedRootId) || Object.keys(people)[0] || '';
""",
    """  const importedRootId = clean(payload.activeRootId || payload.db?.activeRootId);
  state.rootId = migratedPeople.remapId(importedRootId) || Object.keys(people)[0] || '';
"""
)

# ---------------------------------------------------------------------------
# 4. Repair the four legitimate George III / Charlotte parent links before the
# incomplete-parent rule is enabled in the starter example.
# ---------------------------------------------------------------------------
data_path = Path("data/british-royal-line.json")
data = json.loads(data_path.read_text())
data["version"] = 27
people = data["people"]
charlotte_id = "profile-g6000000003891728922"
child_ids = [
    "profile-g4137986493320052463",
    "profile-g4137989648200126749",
    "profile-g4087038607800049893",
    "profile-g6000000000307240333",
]
charlotte = people[charlotte_id]
charlotte["children"] = list(dict.fromkeys([*charlotte.get("children", []), *child_ids]))
for child_id in child_ids:
    child = people[child_id]
    child["parents"] = list(dict.fromkeys([*child.get("parents", []), charlotte_id]))
data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

# Cache keys for all changed browser modules.
replace_once(
    "index.html",
    '<script type="module" src="./geni-import.js?v=2"></script>',
    '<script type="module" src="./geni-import.js?v=3"></script>',
)
replace_once(
    "index.html",
    '<script type="module" src="./app.js?v=141"></script>',
    '<script type="module" src="./app.js?v=142"></script>',
)

# Existing version assertions.
replace_once(
    "tests/royal-name-style.test.mjs",
    "assert.equal(starter.version, 26);",
    "assert.equal(starter.version, 27);",
)
replace_once(
    "tests/foreign-royal-branches.test.mjs",
    "assert.equal(starter.version, 26);",
    "assert.equal(starter.version, 27);",
)

# Expanded pure regression coverage.
replace_once(
    "tests/descendant-scope.test.mjs",
    "import { computeDescendantScope, descendantPairKey } from '../descendant-scope.js';",
    "import { computeDescendantScope, descendantPairKey, hiddenBirthReason, profileHasPlaceholderName } from '../descendant-scope.js';",
)
with Path("tests/descendant-scope.test.mjs").open("a") as handle:
    handle.write(r'''

test('hides non-marital, incomplete, placeholder, stillborn, and infant child branches without deleting them', () => {
  const person = (id, overrides = {}) => ({
    id, displayName: id, birthYear: '1900', deathYear: '1980', gender: 'unknown',
    parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
    marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, ...overrides
  });
  const people = {
    root: person('root', {
      displayName: 'Root', gender: 'male', children: ['legitimate', 'nonmarital', 'missing', 'nn-child', 'stillborn', 'infant', 'next-year-infant', 'survivor'],
      partners: ['wife', 'mistress'], spouses: ['wife'], nonSpouses: ['mistress'], marriageYears: { wife: '1899' }
    }),
    wife: person('wife', {
      displayName: 'Wife', gender: 'female', children: ['legitimate', 'nn-child', 'stillborn', 'infant', 'next-year-infant', 'survivor'],
      partners: ['root'], spouses: ['root'], marriageYears: { root: '1899' }
    }),
    mistress: person('mistress', {
      displayName: 'Mistress', gender: 'female', children: ['nonmarital'], partners: ['root'], nonSpouses: ['root']
    }),
    legitimate: person('legitimate', { displayName: 'Legitimate Child', parents: ['root', 'wife'] }),
    nonmarital: person('nonmarital', {
      displayName: 'Non-marital Child', parents: ['root', 'mistress'], children: ['hidden-grandchild']
    }),
    'hidden-grandchild': person('hidden-grandchild', { displayName: 'Hidden Grandchild', parents: ['nonmarital', 'grandchild-parent'] }),
    'grandchild-parent': person('grandchild-parent', { displayName: 'Grandchild Parent', children: ['hidden-grandchild'] }),
    missing: person('missing', { displayName: 'One-parent Child', parents: ['root'] }),
    'nn-parent': person('nn-parent', { displayName: 'NN', children: ['nn-parent-child'], partners: ['root'] }),
    'nn-parent-child': person('nn-parent-child', { displayName: 'Child of NN', parents: ['root', 'nn-parent'] }),
    'nn-child': person('nn-child', { displayName: 'NN son of Root', parents: ['root', 'wife'] }),
    stillborn: person('stillborn', { displayName: 'Stillborn daughter', birthYear: '1902', deathYear: '1902', parents: ['root', 'wife'] }),
    infant: person('infant', { displayName: 'Infant One', birthYear: '1903', deathYear: '1903', parents: ['root', 'wife'] }),
    'next-year-infant': person('next-year-infant', { displayName: 'Infant Two', birthYear: '1904', deathYear: '1905', parents: ['root', 'wife'] }),
    survivor: person('survivor', { displayName: 'Young Survivor', birthYear: '1906', deathYear: '1908', parents: ['root', 'wife'] })
  };
  people.root.children.push('nn-parent-child');

  assert.equal(profileHasPlaceholderName(people['nn-parent']), true);
  assert.equal(profileHasPlaceholderName(people['nn-child']), true);
  assert.equal(hiddenBirthReason(people, 'nonmarital', ['root', 'mistress']), 'non-marital-parentage');
  assert.equal(hiddenBirthReason(people, 'missing', ['root']), 'missing-parent');
  assert.equal(hiddenBirthReason(people, 'nn-parent-child', ['root', 'nn-parent']), 'missing-parent');
  assert.equal(hiddenBirthReason(people, 'stillborn', ['root', 'wife']), 'stillbirth');
  assert.equal(hiddenBirthReason(people, 'infant', ['root', 'wife']), 'infant-death');
  assert.equal(hiddenBirthReason(people, 'next-year-infant', ['root', 'wife']), 'infant-death');
  assert.equal(hiddenBirthReason(people, 'survivor', ['root', 'wife']), '');

  const scope = computeDescendantScope(people, 'root');
  for (const visible of ['root', 'wife', 'legitimate', 'survivor']) assert.equal(scope.allowedIds.has(visible), true, visible);
  for (const hidden of ['nonmarital', 'hidden-grandchild', 'missing', 'nn-parent-child', 'nn-child', 'stillborn', 'infant', 'next-year-infant']) {
    assert.equal(scope.allowedIds.has(hidden), false, hidden);
  }
  assert.equal(scope.hiddenBirthReasons.get('nonmarital'), 'non-marital-parentage');
  assert.equal(scope.hiddenBirthReasons.get('missing'), 'missing-parent');
  assert.equal(Object.keys(people).length, 14, 'suppression must not delete stored profiles');

  const explicitFocus = computeDescendantScope(people, 'nonmarital');
  assert.equal(explicitFocus.allowedIds.has('nonmarital'), true, 'an explicitly selected hidden profile remains focusable');
  assert.equal(explicitFocus.allowedIds.has('hidden-grandchild'), true, 'its otherwise valid descendants remain available when focused directly');
});

test('the George III children retain both parents before incomplete-parent filtering', () => {
  const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
  const idByName = new Map(Object.entries(starter.people).map(([id, person]) => [person.displayName, id]));
  const georgeId = idByName.get('George III, King of Great Britain and Ireland');
  const charlotteId = idByName.get('Charlotte of Mecklenburg-Strelitz');
  const scope = computeDescendantScope(starter.people, starter.rootId);
  for (const name of ['George IV, King of the United Kingdom', 'William IV, King of the United Kingdom', 'Edward, Duke of Kent', 'Adolphus, Duke of Cambridge']) {
    const childId = idByName.get(name);
    assert.ok(childId, name);
    assert.deepEqual(new Set(starter.people[childId].parents), new Set([georgeId, charlotteId]), `${name} parents`);
    assert.equal(scope.descendantIds.has(childId), true, `${name} should remain in the British line`);
  }
});
''')

# Geni model/import regressions.
replace_once(
    "tests/geni-import.test.mjs",
    """  applyUnionToPeople,
  canonicalGeniProfileId,
""",
    """  applyUnionToPeople,
  buildGeniIdentityIndex,
  canonicalGeniProfileId,
"""
)
with Path("tests/geni-import.test.mjs").open("a") as handle:
    handle.write(r'''

test('indexes an existing local node by its public Geni identity', () => {
  const identity = 'profile-g6000000000000099001';
  const index = buildGeniIdentityIndex({
    'local-anchor': {
      id: 'local-anchor', displayName: 'Locally named person', sourceId: identity, sourceProvider: 'geni'
    },
    [identity]: {
      id: identity, displayName: 'Duplicate remote record', sourceId: identity, sourceProvider: 'geni'
    }
  });
  assert.equal(index.get(identity), 'local-anchor', 'an existing local anchor should receive later Geni data');
});

test('records a partner-only Geni union as non-spousal parentage', () => {
  const people = Object.fromEntries(['parent-a', 'parent-b', 'child'].map(name => {
    const id = `profile-${name}`;
    return [id, profileToLineagePerson({ id, name }, id)];
  }));
  applyUnionToPeople(people, {
    id: 'union-partner',
    partners: ['profile-parent-a', 'profile-parent-b'],
    children: ['profile-child'],
    status: 'partner'
  }, value => value);
  assert.deepEqual(people['profile-child'].parents.sort(), ['profile-parent-a', 'profile-parent-b']);
  assert.deepEqual(people['profile-parent-a'].nonSpouses, ['profile-parent-b']);
  assert.deepEqual(people['profile-parent-a'].spouses, []);
});

test('the descendant importer coalesces compact and public aliases for one Geni profile', () => {
  const client = { requestCount: 0, cancel() {} };
  const importer = new GeniDescendantImporter({ client, rootInput: 'profile-42' });
  importer.addProfiles([{ id: 'profile-42', display_name: 'Same Person', public: true }]);
  importer.addProfiles([{
    id: 'profile-42', guid: '6000000000000000042', public: true,
    display_name: 'Same Person', profile_url: 'https://www.geni.com/people/Same-Person/6000000000000000042'
  }]);
  assert.deepEqual(Object.keys(importer.people), ['profile-42']);
  assert.equal(importer.people['profile-42'].id, 'profile-42');
  assert.equal(importer.people['profile-42'].sourceId, 'profile-g6000000000000000042');
  assert.equal(importer.apiToStable['profile-g6000000000000000042'], 'profile-42');
});
''')

Path("tests/geni-identity-app.test.mjs").write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('immediate-family imports consult every existing public Geni ID', () => {
  assert.match(app, /const existingByGeniId = buildGeniIdentityIndex\(state\.people\)/);
  assert.match(app, /existingByGeniId\.get\(identity\)/);
  assert.match(app, /remapGeniImmediateFamily\([\s\S]*existingByGeniId\)/);
});

test('stitch imports coalesce the combined existing and incoming collections before wiring relations', () => {
  assert.match(app, /const combinedMigration = migrateGeniPeople\(combinedRaw\)/);
  assert.match(app, /state\.people = combinedMigration\.people/);
  assert.match(app, /duplicate Geni record/);
});

test('saved roots and collapsed nodes follow any Geni identity remap', () => {
  assert.match(app, /const savedRootId = migratedPeople\.remapId\(rawSavedRootId\)/);
  assert.match(app, /saved\.collapsedIds\)\.map\(migratedPeople\.remapId\)/);
});
''')
