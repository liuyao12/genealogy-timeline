from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Tree projection policy: retain questionable records, but omit them from the
# descendant drawing and stop traversal through them.
# ---------------------------------------------------------------------------
scope_path = Path('descendant-scope.js')
scope = scope_path.read_text()
marker = """/**
 * Compute the one focus tree rooted conceptually at `rootId`.
"""
helpers = r"""function numericYear(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function profileNameValues(person) {
  return [
    person?.displayName,
    typeof person?.name === 'string' ? person.name : '',
    person?.firstName,
    person?.lastName,
    person?.title,
    person?.note,
    ...(Array.isArray(person?.namePeriods) ? person.namePeriods.map(period => period?.name) : [])
  ].filter(Boolean).map(String);
}

function hasPlaceholderName(person) {
  const values = profileNameValues(person);
  const nn = /(?:^|[^\p{L}\p{N}])N\.?\s*\.?\s*N\.?(?:$|[^\p{L}\p{N}])/iu;
  const generic = /^(?:unnamed|unknown|still[-\s]?born|still[-\s]?birth|infant|baby)(?:\s+(?:child|son|daughter|boy|girl))?(?:\s+of\b.*)?$/i;
  return values.some(value => nn.test(value) || generic.test(value.trim()));
}

function parentPairIsFormal(records, parentIds) {
  for (let first = 0; first < parentIds.length; first += 1) {
    for (let second = first + 1; second < parentIds.length; second += 1) {
      const firstId = parentIds[first];
      const secondId = parentIds[second];
      if (formalSpouseIds(records[firstId]).includes(secondId)
        || formalSpouseIds(records[secondId]).includes(firstId)) return true;
    }
  }
  return false;
}

function parentPairIsExplicitlyNonFormal(records, parentIds) {
  for (let first = 0; first < parentIds.length; first += 1) {
    for (let second = first + 1; second < parentIds.length; second += 1) {
      const firstId = parentIds[first];
      const secondId = parentIds[second];
      if (ids(records[firstId]?.nonSpouses).includes(secondId)
        || ids(records[secondId]?.nonSpouses).includes(firstId)) return true;
    }
  }
  return false;
}

export function treeBirthSuppressionReason(records = {}, childId = '', parentsByChild = new Map()) {
  const person = records[childId];
  if (!person) return 'missing-profile';
  const text = profileNameValues(person).join(' ');
  if (hasPlaceholderName(person)) return 'placeholder-name';
  if (/\bstill[-\s]?born\b|\bstill[-\s]?birth\b/i.test(text)) return 'stillbirth';
  const birthYear = numericYear(person.birthYear);
  const deathYear = person.isLiving ? null : numericYear(person.deathYear);
  if (birthYear != null && deathYear != null && deathYear <= birthYear + 1) return 'infant-death';

  const parentIds = orderedParentIds(records, parentsByChild, childId);
  if (parentIds.length < 2) return 'missing-parent';

  const unionStatus = String(person.geniParentUnionStatus || '').toLowerCase().replace(/[\s-]+/g, '_');
  const explicitlyNonMarital = person.geniNonMaritalBirth === true
    || ['partner', 'ex_partner', 'unmarried', 'mistress', 'lover', 'concubine'].includes(unionStatus)
    || /\billegitimate\b|\bnatural\s+(?:son|daughter|child)\b|\bbastard\b/i.test(text);
  if (explicitlyNonMarital) return 'non-marital-parent-union';
  if (!parentPairIsFormal(records, parentIds) && parentPairIsExplicitlyNonFormal(records, parentIds)) {
    return 'non-marital-parent-union';
  }
  return '';
}

"""
if scope.count(marker) != 1:
    raise SystemExit(f'Expected one scope documentation marker, found {scope.count(marker)}')
scope = scope.replace(marker, helpers + marker, 1)

old = """  const descendantIds = new Set();
  const descendantQueue = records[root] ? [root] : [];
"""
new = """  const suppressionReasons = new Map();
  const childIsVisible = childId => {
    if (!records[childId] || childId === root) return Boolean(records[childId]);
    const reason = treeBirthSuppressionReason(records, childId, allParentsByChild);
    if (reason) suppressionReasons.set(childId, reason);
    return !reason;
  };

  const descendantIds = new Set();
  const descendantQueue = records[root] ? [root] : [];
"""
if scope.count(old) != 1:
    raise SystemExit(f'Expected one descendant prelude, found {scope.count(old)}')
scope = scope.replace(old, new, 1)

old = """    (allChildrenByParent.get(id) || []).forEach(childId => descendantQueue.push(childId));
"""
new = """    (allChildrenByParent.get(id) || []).forEach(childId => {
      if (childIsVisible(childId)) descendantQueue.push(childId);
    });
"""
if scope.count(old) != 1:
    raise SystemExit(f'Expected one descendant expansion, found {scope.count(old)}')
scope = scope.replace(old, new, 1)

old = """  paternalAncestorIds.forEach(ancestorId => {
    (allChildrenByParent.get(ancestorId) || []).forEach(childId => paternalHouseholdChildIds.add(childId));
  });
"""
new = """  paternalAncestorIds.forEach(ancestorId => {
    (allChildrenByParent.get(ancestorId) || []).forEach(childId => {
      // The direct father chain and current focus remain visible even when an
      // earlier source omitted the other parent; collateral births use the
      // same quality filter as ordinary descendants.
      if (paternalLineSet.has(childId) || descendantIds.has(childId) || childIsVisible(childId)) {
        paternalHouseholdChildIds.add(childId);
      }
    });
  });
"""
if scope.count(old) != 1:
    raise SystemExit(f'Expected one paternal household expansion, found {scope.count(old)}')
scope = scope.replace(old, new, 1)

old = """    allChildrenByParent,
    allParentsByChild
  };
}
"""
new = """    allChildrenByParent,
    allParentsByChild,
    suppressedIds: new Set(suppressionReasons.keys()),
    suppressionReasons
  };
}
"""
if scope.count(old) != 1:
    raise SystemExit(f'Expected one scope return tail, found {scope.count(old)}')
scope = scope.replace(old, new, 1)
scope_path.write_text(scope)

# ---------------------------------------------------------------------------
# Preserve Geni's union classification on children so the tree policy can
# distinguish a non-marital partner union from a formal marriage.
# ---------------------------------------------------------------------------
model_path = Path('geni-model.js')
model = model_path.read_text()
old = """    geniImmediateFamilyLoaded: false,
    geniImmediateFamilyVerifiedAt: '',
    geniImmediateFamilyIds: []
"""
new = """    geniParentUnionStatus: '',
    geniNonMaritalBirth: false,
    geniImmediateFamilyLoaded: false,
    geniImmediateFamilyVerifiedAt: '',
    geniImmediateFamilyIds: []
"""
if model.count(old) != 1:
    raise SystemExit(f'Expected one model profile tail, found {model.count(old)}')
model = model.replace(old, new, 1)

old = """  merged.geniImmediateFamilyLoaded = incoming.geniImmediateFamilyLoaded || existing.geniImmediateFamilyLoaded;
  merged.geniImmediateFamilyVerifiedAt = incoming.geniImmediateFamilyVerifiedAt || existing.geniImmediateFamilyVerifiedAt;
  return merged;
"""
new = """  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(existing.geniParentUnionStatus);
  merged.geniNonMaritalBirth = incoming.geniNonMaritalBirth === true || existing.geniNonMaritalBirth === true;
  merged.geniImmediateFamilyLoaded = incoming.geniImmediateFamilyLoaded || existing.geniImmediateFamilyLoaded;
  merged.geniImmediateFamilyVerifiedAt = incoming.geniImmediateFamilyVerifiedAt || existing.geniImmediateFamilyVerifiedAt;
  return merged;
"""
if model.count(old) != 1:
    raise SystemExit(f'Expected one model merge tail, found {model.count(old)}')
model = model.replace(old, new, 1)

old = """  const formal = ['spouse', 'ex_spouse', 'current', 'ex', 'married', 'divorced', 'annulled'].includes(status) || Boolean(marriageYear);
  const endStatus = status === 'annulled' ? 'annulled'
"""
new = """  const formal = ['spouse', 'ex_spouse', 'current', 'ex', 'married', 'divorced', 'annulled'].includes(status) || Boolean(marriageYear);
  const nonMaritalUnion = !formal
    && ['partner', 'ex_partner', 'unmarried', 'mistress', 'lover', 'concubine'].includes(status);
  const endStatus = status === 'annulled' ? 'annulled'
"""
if model.count(old) != 1:
    raise SystemExit(f'Expected one formal-union block, found {model.count(old)}')
model = model.replace(old, new, 1)

old = """    child.geniImmediateFamilyIds = unique([...(child.geniImmediateFamilyIds || []), ...partnerIds]);
    const parentage = adoptedIds.has(childId) ? 'adopted' : fosterIds.has(childId) ? 'foster' : '';
"""
new = """    child.geniImmediateFamilyIds = unique([...(child.geniImmediateFamilyIds || []), ...partnerIds]);
    if (status) child.geniParentUnionStatus = status;
    if (nonMaritalUnion) child.geniNonMaritalBirth = true;
    const parentage = adoptedIds.has(childId) ? 'adopted' : fosterIds.has(childId) ? 'foster' : '';
"""
if model.count(old) != 1:
    raise SystemExit(f'Expected one union child block, found {model.count(old)}')
model = model.replace(old, new, 1)
model_path.write_text(model)

# ---------------------------------------------------------------------------
# App integration: canonical Geni-ID reuse, existing-duplicate consolidation,
# and preservation of the new union-origin fields.
# ---------------------------------------------------------------------------
app_path = Path('app.js')
app = app_path.read_text()
app = app.replace(
    "import { computeDescendantScope } from './descendant-scope.js?v=3';",
    "import { computeDescendantScope } from './descendant-scope.js?v=4';",
    1,
)
app = app.replace(
    "import { graphUnionRecords } from './geni-import-core.js?v=2';",
    "import { graphUnionRecords } from './geni-import-core.js?v=3';\nimport { duplicateGeniIdentityGroups, remapPeopleByGeniIdentity } from './geni-identity.js?v=1';",
    1,
)

old = """    geniImmediateFamilyLoaded: source.geniImmediateFamilyLoaded === true,
    geniImmediateFamilyVerifiedAt: clean(source.geniImmediateFamilyVerifiedAt),
    geniImmediateFamilyIds: uniqueRefs(source.geniImmediateFamilyIds),
    starterProfile: source.starterProfile === true
"""
new = """    geniParentUnionStatus: clean(source.geniParentUnionStatus || source.parentUnionStatus || source.parent_union_status).toLowerCase().replace(/[\\s-]+/g, '_'),
    geniNonMaritalBirth: source.geniNonMaritalBirth === true || source.nonMaritalBirth === true,
    geniImmediateFamilyLoaded: source.geniImmediateFamilyLoaded === true,
    geniImmediateFamilyVerifiedAt: clean(source.geniImmediateFamilyVerifiedAt),
    geniImmediateFamilyIds: uniqueRefs(source.geniImmediateFamilyIds),
    starterProfile: source.starterProfile === true
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one app normalize tail, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses'].forEach(field => {
"""
new = """    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'].forEach(field => {
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one Geni migration reference list, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """    const isSpouseUnion = ['spouse', 'ex_spouse', 'current', 'ex', 'married', 'divorced', 'annulled'].includes(status) || Boolean(marriageYear);
    const relationshipEndStatus = status === 'annulled' ? 'annulled'
"""
new = """    const isSpouseUnion = ['spouse', 'ex_spouse', 'current', 'ex', 'married', 'divorced', 'annulled'].includes(status) || Boolean(marriageYear);
    const nonMaritalUnion = !isSpouseUnion
      && ['partner', 'ex_partner', 'unmarried', 'mistress', 'lover', 'concubine'].includes(status);
    const relationshipEndStatus = status === 'annulled' ? 'annulled'
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one side-panel union classification, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """    children.forEach(id => { profileMap[id].parents = unique([...(profileMap[id].parents || []), ...partners]); });
"""
new = """    children.forEach(id => {
      profileMap[id].parents = unique([...(profileMap[id].parents || []), ...partners]);
      if (status) profileMap[id].geniParentUnionStatus = status;
      if (nonMaritalUnion) profileMap[id].geniNonMaritalBirth = true;
    });
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one side-panel child relation line, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  merged.geniImmediateFamilyLoaded = incoming.geniImmediateFamilyLoaded || existing.geniImmediateFamilyLoaded;
  merged.geniImmediateFamilyVerifiedAt = incoming.geniImmediateFamilyVerifiedAt || existing.geniImmediateFamilyVerifiedAt;
  merged.geniImmediateFamilyIds = unique([...incoming.geniImmediateFamilyIds, ...existing.geniImmediateFamilyIds]);
  merged.starterProfile = incoming.starterProfile || existing.starterProfile;
  return merged;
}

async function importFromGeni(input, requestedDepth = 2, options = {}) {
"""
new = """  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(existing.geniParentUnionStatus);
  merged.geniNonMaritalBirth = incoming.geniNonMaritalBirth === true || existing.geniNonMaritalBirth === true;
  merged.geniImmediateFamilyLoaded = incoming.geniImmediateFamilyLoaded || existing.geniImmediateFamilyLoaded;
  merged.geniImmediateFamilyVerifiedAt = incoming.geniImmediateFamilyVerifiedAt || existing.geniImmediateFamilyVerifiedAt;
  merged.geniImmediateFamilyIds = unique([...incoming.geniImmediateFamilyIds, ...existing.geniImmediateFamilyIds]);
  merged.starterProfile = incoming.starterProfile || existing.starterProfile;
  return merged;
}

const GENI_REFERENCE_ARRAY_FIELDS = [
  'parents', 'children', 'partners', 'spouses', 'nonSpouses',
  'divorcedSpouses', 'geniImmediateFamilyIds'
];
const GENI_REFERENCE_MAP_FIELDS = [
  'marriageYears', 'relationshipEndYears', 'relationshipEndStatuses'
];

function remapRelationVisibilityKey(key, replacements) {
  const resolve = id => replacements[id] || id;
  if (key.startsWith('profile:')) return `profile:${resolve(key.slice('profile:'.length))}`;
  if (key.startsWith('child:')) {
    const relation = key.slice('child:'.length);
    const split = relation.lastIndexOf('>');
    if (split < 0) return key;
    return `child:${resolve(relation.slice(0, split))}>${resolve(relation.slice(split + 1))}`;
  }
  if (key.startsWith('partner:')) {
    const ids = key.slice('partner:'.length).split('|').map(resolve).sort();
    return `partner:${ids.join('|')}`;
  }
  return key;
}

function coalesceDuplicateGeniProfiles(preferredId = '') {
  const replacements = {};
  duplicateGeniIdentityGroups(state.people).forEach(({ ids }) => {
    const survivor = [preferredId, state.rootId, state.selectedId]
      .find(id => ids.includes(id))
      || ids.find(id => !/^profile-g?\\d+$/i.test(id))
      || ids[0];
    let merged = state.people[survivor];
    ids.filter(id => id !== survivor).forEach(duplicateId => {
      merged = mergePersonRecords(merged, { ...state.people[duplicateId], id: survivor });
      replacements[duplicateId] = survivor;
      delete state.people[duplicateId];
    });
    state.people[survivor] = merged;
  });
  const duplicateIds = Object.keys(replacements);
  if (!duplicateIds.length) return 0;
  const resolve = id => replacements[id] || id;
  Object.values(state.people).forEach(person => {
    GENI_REFERENCE_ARRAY_FIELDS.forEach(field => {
      person[field] = unique((person[field] || []).map(resolve).filter(id => id && id !== person.id));
    });
    GENI_REFERENCE_MAP_FIELDS.forEach(field => {
      const mapped = {};
      Object.entries(person[field] || {}).forEach(([relativeId, value]) => {
        const targetId = resolve(relativeId);
        if (targetId && targetId !== person.id) mapped[targetId] = value;
      });
      person[field] = mapped;
    });
  });
  state.rootId = resolve(state.rootId);
  state.selectedId = resolve(state.selectedId);
  state.editingProfileId = resolve(state.editingProfileId);
  state.collapsedIds = new Set([...state.collapsedIds].map(resolve));
  if (state.geniImport?.profileId) state.geniImport.profileId = resolve(state.geniImport.profileId);
  const relationVisibility = {};
  Object.entries(state.relationVisibility).forEach(([key, value]) => {
    relationVisibility[remapRelationVisibilityKey(key, replacements)] = value;
  });
  state.relationVisibility = relationVisibility;
  return duplicateIds.length;
}

function mergeGeniRecordsIntoCurrentTree(records) {
  const remapped = remapPeopleByGeniIdentity(records, state.people);
  Object.entries(remapped.people).forEach(([id, person]) => {
    state.people[id] = mergePersonRecords(state.people[id], person);
  });
  return remapped;
}

async function importFromGeni(input, requestedDepth = 2, options = {}) {
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one merge/import boundary, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  let focusId = id;
  if (persistResult) state.ephemeral = false;

  while (queue.length && Object.keys(discovered).length < maxProfiles && requests < maxRequests) {
"""
new = """  let focusId = id;
  if (persistResult) state.ephemeral = false;
  const duplicateProfilesMerged = coalesceDuplicateGeniProfiles(state.selectedId || '');

  while (queue.length && Object.keys(discovered).length < maxProfiles && requests < maxRequests) {
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one legacy Geni import prelude, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """    const rawFocusRef = refId(neighborhood.focusRaw?.id);
    const neighborhoodFocusId = /^profile-/i.test(rawFocusRef) ? rawFocusRef : (rawFocusRef ? `profile-${rawFocusRef}` : '');
"""
new = """    const neighborhoodFocusId = geniProfileIdForApiProfile(neighborhood.focusRaw, current.id);
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one legacy focus-ID block, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """    Object.entries(discovered).forEach(([profileId, person]) => {
      state.people[profileId] = mergePersonRecords(state.people[profileId], person);
    });
    if (state.geniImport?.profileId === id) {
      state.geniImport.loaded = Object.keys(discovered).length;
      state.geniImport.requests = requests;
    }
    state.rootId = state.rootId || focusId;
    state.selectedId = state.selectedId || focusId;
    if (options.title) state.title = options.title;
    else if (state.title === 'Untitled family') state.title = `${fullName(state.people[focusId] || {})} family`;
"""
new = """    const mergedDiscovery = mergeGeniRecordsIntoCurrentTree(discovered);
    const localFocusId = mergedDiscovery.remapId(focusId);
    if (state.geniImport && [id, localFocusId].includes(state.geniImport.profileId)) {
      state.geniImport.loaded = Object.keys(discovered).length;
      state.geniImport.requests = requests;
    }
    state.rootId = state.rootId || localFocusId;
    state.selectedId = state.selectedId || localFocusId;
    if (options.title) state.title = options.title;
    else if (state.title === 'Untitled family') state.title = `${fullName(state.people[localFocusId] || {})} family`;
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one live Geni incremental merge, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  Object.entries(discovered).forEach(([profileId, person]) => {
    state.people[profileId] = mergePersonRecords(state.people[profileId], person);
  });
  state.rootId = state.rootId || focusId;
  state.selectedId = focusId;
  if (options.title) state.title = options.title;
  else if (state.title === 'Untitled family') state.title = `${fullName(state.people[focusId] || {})} family`;
"""
new = """  const finalMerge = mergeGeniRecordsIntoCurrentTree(discovered);
  const localFocusId = finalMerge.remapId(focusId);
  state.rootId = state.rootId || localFocusId;
  state.selectedId = localFocusId;
  if (options.title) state.title = options.title;
  else if (state.title === 'Untitled family') state.title = `${fullName(state.people[localFocusId] || {})} family`;
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one live Geni final merge, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  toast(`Grew ${Object.keys(discovered).length} live Geni profiles${scopeNote}.${skipNote}${limitNote}`, true);
"""
new = """  const duplicateNote = duplicateProfilesMerged
    ? ` ${duplicateProfilesMerged} pre-existing duplicate Geni profile${duplicateProfilesMerged === 1 ? '' : 's'} consolidated.`
    : '';
  toast(`Grew ${Object.keys(discovered).length} live Geni profiles${scopeNote}.${skipNote}${limitNote}${duplicateNote}`, true);
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one live Geni toast, found {app.count(old)}')
app = app.replace(old, new, 1)

# Immediate-family import: consolidate old duplicates, anchor the selected local
# profile, and reuse every other existing Geni-linked profile.
old = """  const existingFamilyIds = new Set([...person.parents, ...person.children, ...allPartnerIds(person)]);
  const importedAt = new Date().toISOString();
"""
new = """  const duplicateProfilesMerged = coalesceDuplicateGeniProfiles(profileId);
  const currentPerson = state.people[profileId];
  const existingFamilyIds = new Set([...currentPerson.parents, ...currentPerson.children, ...allPartnerIds(currentPerson)]);
  const importedAt = new Date().toISOString();
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one immediate-family prelude, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  const { records, remapId } = remapGeniImmediateFamily(mapped, [
    requestedFocusId,
    remoteFocusId,
    focusRaw?.id,
    focusRaw?.profile_url
  ], profileId, remoteFocusId);
"""
new = """  const focusRemap = remapGeniImmediateFamily(mapped, [
    requestedFocusId,
    remoteFocusId,
    focusRaw?.id,
    focusRaw?.profile_url
  ], profileId, remoteFocusId);
  let records = focusRemap.records;
  const remapId = focusRemap.remapId;
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one immediate-family focus remap, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  const existingIds = new Set(Object.keys(state.people));
"""
new = """  const identityRemap = remapPeopleByGeniIdentity(records, state.people, {
    [requestedFocusId]: profileId,
    [remoteFocusId]: profileId,
    [normalizedGeniReference(focusRaw?.id)]: profileId,
    [normalizedGeniReference(focusRaw?.profile_url)]: profileId
  });
  records = identityRemap.people;

  const existingIds = new Set(Object.keys(state.people));
"""
# There are several existingIds declarations; this exact insertion point occurs
# once immediately after the immediate-family fallback record.
if app.count(old) < 1:
    raise SystemExit('No existingIds declaration found')
anchor = """  if (!records[profileId]) {
    records[profileId] = {
      ...focusRaw,
      id: profileId,
      sourceId: remoteFocusId,
      parents: uniqueRefs(focusRaw?.parents).map(remapId),
      children: uniqueRefs(focusRaw?.children).map(remapId),
      partners: uniqueRefs(focusRaw?.partners).map(remapId),
      spouses: uniqueRefs(focusRaw?.spouses).map(remapId),
      nonSpouses: uniqueRefs(focusRaw?.nonSpouses).map(remapId),
      divorcedSpouses: uniqueRefs(focusRaw?.divorcedSpouses).map(remapId)
    };
  }

  const existingIds = new Set(Object.keys(state.people));
"""
replacement = anchor.replace("  const existingIds", new + "  const existingIds", 1)
if app.count(anchor) != 1:
    raise SystemExit(f'Expected one immediate-family fallback block, found {app.count(anchor)}')
app = app.replace(anchor, replacement, 1)

old = """  toast(`Geni checked ${receivedIds.length} union-linked family profiles; ${countSummary}.${updateSummary} ${dateSummary}${outsideSummary}`, true);
"""
new = """  const duplicateSummary = duplicateProfilesMerged
    ? ` ${duplicateProfilesMerged} pre-existing duplicate Geni profile${duplicateProfilesMerged === 1 ? '' : 's'} consolidated.`
    : '';
  toast(`Geni checked ${receivedIds.length} union-linked family profiles; ${countSummary}.${updateSummary} ${dateSummary}${outsideSummary}${duplicateSummary}`, true);
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one immediate-family toast, found {app.count(old)}')
app = app.replace(old, new, 1)

# Stitch imports—including the standalone descendant importer when merging into
# the current tab—must resolve public Geni IDs before inserting any profile.
old = """  const importedAt = new Date().toISOString();
  const incomingPeople = migrateGeniPeople(normalizeStitchPeople(payload.people)).people;
  const incomingIds = Object.keys(incomingPeople);
  if (!incomingIds.length) throw new Error('The AI import contains no profiles.');
  const previousIds = new Set(Object.keys(state.people));
"""
new = """  const importedAt = new Date().toISOString();
  const duplicateProfilesMerged = coalesceDuplicateGeniProfiles();
  const migratedIncomingPeople = migrateGeniPeople(normalizeStitchPeople(payload.people)).people;
  const preparedIncoming = remapPeopleByGeniIdentity(migratedIncomingPeople, state.people);
  const incomingPeople = preparedIncoming.people;
  const incomingIds = Object.keys(incomingPeople);
  if (!incomingIds.length) throw new Error('The AI import contains no profiles.');
  const previousIds = new Set(Object.keys(state.people));
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one stitch import prelude, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  const focusId = clean(payload.focusId);
  if (!state.rootId || !state.people[state.rootId]) state.rootId = state.people[clean(payload.rootId)] ? clean(payload.rootId) : incomingIds[0];
  if (state.people[focusId]) state.selectedId = focusId;
"""
new = """  const focusId = preparedIncoming.remapId(clean(payload.focusId));
  const importedRootId = preparedIncoming.remapId(clean(payload.rootId));
  if (!state.rootId || !state.people[state.rootId]) state.rootId = state.people[importedRootId] ? importedRootId : incomingIds[0];
  if (state.people[focusId]) state.selectedId = focusId;
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one stitch focus block, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  toast(`Stitched ${newCount} new and ${updatedCount} matching profile${updatedCount === 1 ? '' : 's'} into this tree.${missingNote}`, true);
"""
new = """  const duplicateNote = duplicateProfilesMerged
    ? ` ${duplicateProfilesMerged} earlier duplicate Geni profile${duplicateProfilesMerged === 1 ? '' : 's'} consolidated.`
    : '';
  toast(`Stitched ${newCount} new and ${updatedCount} matching profile${updatedCount === 1 ? '' : 's'} into this tree.${missingNote}${duplicateNote}`, true);
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one stitch toast, found {app.count(old)}')
app = app.replace(old, new, 1)

old = """  Object.assign(person, link);
  persist('Geni profile linked');
"""
new = """  Object.assign(person, link);
  const duplicatesMerged = coalesceDuplicateGeniProfiles(person.id);
  persist(duplicatesMerged ? 'Geni profile linked and duplicate merged' : 'Geni profile linked');
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one link-selected block, found {app.count(old)}')
app = app.replace(old, new, 1)
app_path.write_text(app)

# ---------------------------------------------------------------------------
# Module cache versions and the descendant-import explanatory note.
# ---------------------------------------------------------------------------
core_path = Path('geni-import-core.js')
core = core_path.read_text().replace("from './geni-model.js?v=2';", "from './geni-model.js?v=3';", 1)
core_path.write_text(core)

import_path = Path('geni-import.js')
import_text = import_path.read_text()
import_text = import_text.replace("from './geni-model.js?v=2';", "from './geni-model.js?v=3';", 1)
import_text = import_text.replace("from './geni-import-core.js?v=2';", "from './geni-import-core.js?v=3';", 1)
import_text = import_text.replace(
    "The importer retains complete generations, spouses, marriage and divorce dates, and the correct parent union. Adopted and foster children are included and identified in the imported profile note.",
    "The importer retains complete generations and union data. NN placeholders, one-parent births, non-marital partner births, stillbirths, and infant deaths remain searchable but are omitted from the timeline; adopted and foster children remain identified.",
    1,
)
import_path.write_text(import_text)

index_path = Path('index.html')
index = index_path.read_text()
index = index.replace('<script type="module" src="./geni-import.js?v=2"></script>', '<script type="module" src="./geni-import.js?v=3"></script>', 1)
index = index.replace('<script type="module" src="./app.js?v=141"></script>', '<script type="module" src="./app.js?v=142"></script>', 1)
index_path.write_text(index)

# ---------------------------------------------------------------------------
# Permanent regression tests.
# ---------------------------------------------------------------------------
scope_test_path = Path('tests/descendant-scope.test.mjs')
scope_test = scope_test_path.read_text()
if "hides incomplete, infant, placeholder, and non-marital births" not in scope_test:
    scope_test += r"""

test('hides incomplete, infant, placeholder, and non-marital births without deleting their records', () => {
  const people = {
    root: {
      id: 'root', gender: 'male', birthYear: '1970', parents: [],
      children: ['legitimate', 'infant', 'placeholder', 'missing-parent', 'non-marital'],
      partners: ['spouse', 'mistress'], spouses: ['spouse'], nonSpouses: ['mistress'],
      marriageYears: { spouse: '1995' }
    },
    spouse: {
      id: 'spouse', gender: 'female', birthYear: '1972', parents: [],
      children: ['legitimate', 'infant', 'placeholder'], partners: ['root'], spouses: ['root'],
      nonSpouses: [], marriageYears: { root: '1995' }
    },
    mistress: {
      id: 'mistress', gender: 'female', birthYear: '1975', parents: [],
      children: ['non-marital'], partners: ['root'], spouses: [], nonSpouses: ['root']
    },
    legitimate: {
      id: 'legitimate', displayName: 'Legitimate Child', birthYear: '2000', deathYear: '2080',
      parents: ['root', 'spouse'], children: ['legitimate-grandchild'], spouses: []
    },
    'legitimate-grandchild': {
      id: 'legitimate-grandchild', displayName: 'Grandchild', birthYear: '2030', deathYear: '2100',
      parents: ['legitimate', 'grandchild-other-parent'], children: [], spouses: []
    },
    'grandchild-other-parent': {
      id: 'grandchild-other-parent', displayName: 'Other Parent', birthYear: '2002',
      parents: [], children: ['legitimate-grandchild'], spouses: ['legitimate']
    },
    infant: {
      id: 'infant', displayName: 'Infant Child', birthYear: '2001', deathYear: '2002',
      parents: ['root', 'spouse'], children: [], spouses: []
    },
    placeholder: {
      id: 'placeholder', displayName: 'NN, daughter of Root', birthYear: '2003', deathYear: '2070',
      parents: ['root', 'spouse'], children: [], spouses: []
    },
    'missing-parent': {
      id: 'missing-parent', displayName: 'One Parent Child', birthYear: '2004', deathYear: '2070',
      parents: ['root'], children: [], spouses: []
    },
    'non-marital': {
      id: 'non-marital', displayName: 'Non-marital Child', birthYear: '2005', deathYear: '2070',
      parents: ['root', 'mistress'], children: ['hidden-grandchild'], spouses: [],
      geniParentUnionStatus: 'partner', geniNonMaritalBirth: true
    },
    'hidden-grandchild': {
      id: 'hidden-grandchild', displayName: 'Hidden Grandchild', birthYear: '2035', deathYear: '2100',
      parents: ['non-marital', 'hidden-other-parent'], children: [], spouses: []
    },
    'hidden-other-parent': {
      id: 'hidden-other-parent', displayName: 'Hidden Other Parent', birthYear: '2006',
      parents: [], children: ['hidden-grandchild'], spouses: ['non-marital']
    }
  };

  const scope = computeDescendantScope(people, 'root');
  assert.deepEqual([...scope.descendantIds].sort(), ['legitimate', 'legitimate-grandchild', 'root']);
  assert.equal(scope.allowedIds.has('spouse'), true);
  for (const hidden of ['infant', 'placeholder', 'missing-parent', 'non-marital', 'hidden-grandchild', 'mistress']) {
    assert.equal(scope.allowedIds.has(hidden), false, `${hidden} should be omitted from the drawing`);
  }
  assert.equal(scope.suppressionReasons.get('infant'), 'infant-death');
  assert.equal(scope.suppressionReasons.get('placeholder'), 'placeholder-name');
  assert.equal(scope.suppressionReasons.get('missing-parent'), 'missing-parent');
  assert.equal(scope.suppressionReasons.get('non-marital'), 'non-marital-parent-union');
  assert.ok(people['non-marital'], 'hidden records remain stored and searchable');
});

test('keeps a suppressed profile visible when it is explicitly chosen as the focus', () => {
  const people = {
    father: { id: 'father', gender: 'male', parents: [], children: ['focus'], spouses: [] },
    focus: { id: 'focus', displayName: 'NN', birthYear: '1900', deathYear: '1900', parents: ['father'], children: [], spouses: [] }
  };
  const scope = computeDescendantScope(people, 'focus');
  assert.equal(scope.allowedIds.has('focus'), true);
  assert.equal(scope.paternalLineIds.includes('father'), true);
});
"""
    scope_test_path.write_text(scope_test)

geni_test_path = Path('tests/geni-import.test.mjs')
geni_test = geni_test_path.read_text()
if "marks children of an explicit Geni partner union as non-marital" not in geni_test:
    insertion = r"""

test('marks children of an explicit Geni partner union as non-marital', () => {
  const people = Object.fromEntries(['parent-a', 'parent-b', 'child'].map(id => [
    `profile-${id}`,
    profileToLineagePerson({ id: `profile-${id}`, name: id }, `profile-${id}`)
  ]));
  applyUnionToPeople(people, {
    id: 'union-partner',
    partners: ['profile-parent-a', 'profile-parent-b'],
    children: ['profile-child'],
    status: 'partner'
  }, value => value);
  assert.deepEqual(people['profile-parent-a'].nonSpouses, ['profile-parent-b']);
  assert.equal(people['profile-child'].geniParentUnionStatus, 'partner');
  assert.equal(people['profile-child'].geniNonMaritalBirth, true);
});
"""
    anchor = "\ntest('includes adopted and foster children even when Geni lists them separately', () => {"
    if geni_test.count(anchor) != 1:
        raise SystemExit(f'Expected one adopted-child test anchor, found {geni_test.count(anchor)}')
    geni_test = geni_test.replace(anchor, insertion + anchor, 1)
    geni_test_path.write_text(geni_test)
