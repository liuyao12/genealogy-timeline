from pathlib import Path
import re


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1))


def regex_replace_once(path, pattern, replacement):
    file = Path(path)
    text = file.read_text()
    text, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Expected one regex match in {path}, found {count}: {pattern[:140]!r}")
    file.write_text(text)


# A person can be known simultaneously by a compact API node ID and a public
# GUID. Index every recognized alias, while preferring the public GUID as the
# durable source identity.
regex_replace_once(
    'geni-model.js',
    r"export function geniIdentityForPerson\(person = \{\}, fallbackId = ''\) \{.*?\n\}\n\nexport function buildGeniIdentityIndex\(people = \{\}\) \{.*?\n\}\n",
    """export function geniAliasesForPerson(person = {}, fallbackId = '') {
  return unique([
    person?.sourceId,
    person?.source_id,
    person?.profile_url,
    person?.profileUrl,
    person?.sourceUrl,
    person?.id,
    fallbackId
  ].map(profileIdFromGeniInput).filter(Boolean));
}

export function geniIdentityForPerson(person = {}, fallbackId = '') {
  const aliases = geniAliasesForPerson(person, fallbackId);
  return aliases.find(alias => /^profile-g\\d{15,}$/i.test(alias)) || aliases[0] || '';
}

export function buildGeniIdentityIndex(people = {}) {
  const index = new Map();
  const rank = (id, alias) => {
    if (!/^profile-/i.test(id)) return 0; // Preserve an existing local anchor.
    if (id === alias) return 1;
    return 2;
  };
  Object.entries(people || {}).forEach(([key, person]) => {
    const id = clean(person?.id || key) || key;
    for (const alias of geniAliasesForPerson(person, id)) {
      const current = index.get(alias);
      if (!current || rank(id, alias) < rank(current, alias)) index.set(alias, id);
    }
  });
  return index;
}
"""
)

replace_once(
    'app.js',
    "import { buildGeniIdentityIndex, geniIdentityForPerson as geniIdentityForRecord } from './geni-model.js?v=3';",
    "import { buildGeniIdentityIndex, geniAliasesForPerson as geniAliasesForRecord, geniIdentityForPerson as geniIdentityForRecord } from './geni-model.js?v=3';"
)
replace_once(
    'app.js',
    "import { graphUnionRecords } from './geni-import-core.js?v=2';",
    "import { graphUnionRecords } from './geni-import-core.js?v=3';"
)

# Coalesce records by connected alias components, not just one selected ID.
# This handles an old compact source ID and a new public GUID for the same raw
# Geni node, while preserving a locally named node as the stable target.
regex_replace_once(
    'app.js',
    r"function migrateGeniPeople\(rawPeople\) \{.*?\n\}\n\nfunction migrateRelationVisibility",
    """function migrateGeniPeople(rawPeople) {
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
    const aliases = geniAliasesForRecord({ ...record, ...normalized, id: originalId }, originalId);
    entries.push({ key, record, normalized, originalId, aliases, order, targetId: originalId, identity: '' });
  });

  const parent = entries.map((_, index) => index);
  const find = index => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (first, second) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };
  const aliasOwner = new Map();
  entries.forEach((entry, index) => {
    entry.aliases.forEach(alias => {
      if (aliasOwner.has(alias)) union(index, aliasOwner.get(alias));
      else aliasOwner.set(alias, index);
    });
  });

  const groups = new Map();
  entries.forEach((entry, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(entry);
  });
  groups.forEach(group => {
    const aliases = unique(group.flatMap(entry => entry.aliases));
    const identity = aliases.find(alias => /^profile-g\\d{15,}$/i.test(alias)) || aliases[0] || '';
    const localAnchor = group.find(entry => !/^profile-/i.test(entry.originalId));
    const canonicalRecord = group.find(entry => entry.originalId === identity);
    const targetId = localAnchor?.originalId || canonicalRecord?.originalId || identity || group[0].originalId;
    group.forEach(entry => {
      entry.targetId = targetId;
      entry.identity = identity;
      if (entry.originalId !== targetId || (identity && entry.normalized.sourceId !== identity)) migrated = true;
    });
    if (group.length > 1) migrated = true;
  });

  const idMap = new Map();
  const registerAlias = (value, targetId) => {
    const raw = clean(value);
    if (!raw || !targetId) return;
    idMap.set(raw, targetId);
    const canonical = /^profile-/i.test(raw) ? canonicalGeniProfileId(raw) : raw;
    idMap.set(canonical, targetId);
    geniAliasesForRecord({ id: raw, sourceId: raw }, raw).forEach(alias => idMap.set(alias, targetId));
  };
  entries.forEach(entry => {
    [entry.key, entry.originalId, entry.record.id, entry.record.sourceId, entry.record.sourceUrl, entry.identity, ...entry.aliases]
      .forEach(value => registerAlias(value, entry.targetId));
  });

  const remapId = value => {
    const raw = clean(value);
    if (!raw) return '';
    const canonical = /^profile-/i.test(raw) ? canonicalGeniProfileId(raw) : raw;
    const aliases = geniAliasesForRecord({ id: raw, sourceId: raw }, raw);
    const remapped = idMap.get(raw)
      || idMap.get(canonical)
      || aliases.map(alias => idMap.get(alias)).find(Boolean)
      || canonical;
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
    const firstPrimary = first.originalId === first.targetId ? 0 : 1;
    const secondPrimary = second.originalId === second.targetId ? 0 : 1;
    return firstPrimary - secondPrimary || first.order - second.order;
  }).forEach(entry => {
    const normalized = { ...entry.normalized, id: entry.targetId };
    if (entry.identity) normalized.sourceId = entry.identity;
    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'].forEach(field => {
      normalized[field] = unique((normalized[field] || []).map(remapId)).filter(id => id && id !== entry.targetId);
    });
    normalized.marriageYears = remapMap(normalized.marriageYears);
    normalized.relationshipEndYears = remapMap(normalized.relationshipEndYears);
    normalized.relationshipEndStatuses = remapMap(normalized.relationshipEndStatuses);
    people[entry.targetId] = people[entry.targetId]
      ? mergePersonRecords(people[entry.targetId], normalized)
      : normalized;
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

function migrateRelationVisibility"""
)

# Immediate-family results use all aliases to find an existing local node.
regex_replace_once(
    'app.js',
    r"function remapGeniImmediateFamily\(mapped, focusAliases, localFocusId, remoteFocusId, existingByGeniId = new Map\(\)\) \{.*?\n\}\n\nasync function loadGeniImmediateFamily",
    """function remapGeniImmediateFamily(mapped, focusAliases, localFocusId, remoteFocusId, existingByGeniId = new Map()) {
  const focusIdentityAliases = new Set(focusAliases.flatMap(value => {
    const normalized = normalizedGeniReference(value);
    return unique([normalized, ...geniAliasesForRecord({ id: value, sourceId: value }, value)]);
  }));
  const targetByRemoteId = new Map();
  const registerRemoteAlias = (value, targetId) => {
    const normalized = normalizedGeniReference(value);
    if (normalized) targetByRemoteId.set(normalized, targetId);
    geniAliasesForRecord({ id: value, sourceId: value }, value).forEach(alias => targetByRemoteId.set(alias, targetId));
  };

  Object.entries(mapped || {}).forEach(([key, raw]) => {
    if (!raw) return;
    const originalId = normalizedGeniReference(key || raw.id);
    const aliases = geniAliasesForRecord({ ...raw, id: originalId }, originalId);
    const identity = geniIdentityForRecord({ ...raw, id: originalId }, originalId);
    const isFocus = [originalId, ...aliases].some(alias => focusIdentityAliases.has(alias));
    const targetId = isFocus
      ? localFocusId
      : aliases.map(alias => existingByGeniId.get(alias)).find(Boolean) || originalId;
    [originalId, identity, raw.id, raw.profile_url, raw.sourceId, ...aliases]
      .forEach(value => registerRemoteAlias(value, targetId));
  });
  focusAliases.forEach(value => registerRemoteAlias(value, localFocusId));
  registerRemoteAlias(remoteFocusId, localFocusId);

  const remapId = value => {
    const id = normalizedGeniReference(value);
    const aliases = geniAliasesForRecord({ id: value, sourceId: value }, value);
    return targetByRemoteId.get(id)
      || aliases.map(alias => targetByRemoteId.get(alias) || existingByGeniId.get(alias)).find(Boolean)
      || id;
  };
  const remapMap = value => Object.fromEntries(
    Object.entries(value || {}).map(([id, detail]) => [remapId(id), detail]).filter(([id]) => id)
  );
  const records = {};
  Object.entries(mapped || {}).forEach(([key, raw]) => {
    const originalId = normalizedGeniReference(key || raw?.id);
    const identity = geniIdentityForRecord({ ...raw, id: originalId }, originalId);
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

async function loadGeniImmediateFamily"""
)

# Preserve adopted/foster modifiers in the immediate-family parser too.
replace_once(
    'app.js',
    """    const children = uniqueRefs(union.children || union.child_ids).map(id => aliases[id] || canonicalGeniProfileId(id)).filter(id => profileMap[id]);
  const marriageYear = clean(
""",
    """    const children = uniqueRefs(union.children || union.child_ids).map(id => aliases[id] || canonicalGeniProfileId(id)).filter(id => profileMap[id]);
    const adoptedChildren = new Set(uniqueRefs(union.adopted_children).map(id => aliases[id] || canonicalGeniProfileId(id)));
    const fosterChildren = new Set(uniqueRefs(union.foster_children).map(id => aliases[id] || canonicalGeniProfileId(id)));
  const marriageYear = clean(
"""
)
replace_once(
    'app.js',
    """    children.forEach(id => { profileMap[id].parents = unique([...(profileMap[id].parents || []), ...partners]); });
  });
""",
    """    children.forEach(id => {
      profileMap[id].parents = unique([...(profileMap[id].parents || []), ...partners]);
      if (adoptedChildren.has(id)) profileMap[id].geniParentage = 'adopted';
      else if (fosterChildren.has(id)) profileMap[id].geniParentage = 'foster';
    });
  });
"""
)

# Expanded pure tests for compact/public alias equivalence.
replace_once(
    'tests/geni-import.test.mjs',
    """  buildGeniIdentityIndex,
  canonicalGeniProfileId,
""",
    """  buildGeniIdentityIndex,
  canonicalGeniProfileId,
  geniAliasesForPerson,
  geniIdentityForPerson,
"""
)
with Path('tests/geni-import.test.mjs').open('a') as handle:
    handle.write(r'''

test('prefers the public GUID while indexing both compact and public Geni aliases', () => {
  const compactId = 'profile-42';
  const publicId = 'profile-g6000000000000000042';
  const person = {
    id: 'local-anchor',
    sourceId: compactId,
    sourceUrl: 'https://www.geni.com/people/Same-Person/6000000000000000042'
  };
  assert.deepEqual(geniAliasesForPerson(person), [compactId, publicId]);
  assert.equal(geniIdentityForPerson(person), publicId);
  const index = buildGeniIdentityIndex({ 'local-anchor': person });
  assert.equal(index.get(compactId), 'local-anchor');
  assert.equal(index.get(publicId), 'local-anchor');
});
''')

with Path('tests/geni-identity-app.test.mjs').open('a') as handle:
    handle.write(r'''

test('saved-tree migration groups records by overlapping compact and public aliases', () => {
  assert.match(app, /const aliases = geniAliasesForRecord\(\{ \.\.\.record, \.\.\.normalized, id: originalId \}, originalId\)/);
  assert.match(app, /if \(aliasOwner\.has\(alias\)\) union\(index, aliasOwner\.get\(alias\)\)/);
  assert.match(app, /aliases\.map\(alias => existingByGeniId\.get\(alias\)\)\.find\(Boolean\)/);
});

test('the app uses the current graph parser and preserves adopted or foster modifiers', () => {
  assert.match(app, /geni-import-core\.js\?v=3/);
  assert.match(app, /profileMap\[id\]\.geniParentage = 'adopted'/);
  assert.match(app, /profileMap\[id\]\.geniParentage = 'foster'/);
});
''')
