function ids(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

export function descendantPairKey(firstId, secondId) {
  return `partner:${[String(firstId || ''), String(secondId || '')].sort().join('|')}`;
}

function addParentChild(childrenByParent, parentsByChild, parentId, childId, people) {
  if (!parentId || !childId || !people[parentId] || !people[childId]) return;
  if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, new Set());
  if (!parentsByChild.has(childId)) parentsByChild.set(childId, new Set());
  childrenByParent.get(parentId).add(childId);
  parentsByChild.get(childId).add(parentId);
}

function normalizedGender(person) {
  const value = String(person?.gender || '').toLowerCase();
  return value === 'm' ? 'male' : value === 'f' ? 'female' : value;
}

function orderedParentIds(records, parentsByChild, childId) {
  const person = records[childId];
  return uniqueIds([
    ...ids(person?.parents),
    ...[person?.fatherId, person?.father_id, person?.motherId, person?.mother_id],
    ...(parentsByChild.get(childId) || [])
  ]).filter(parentId => records[parentId]);
}

function fatherIdFor(records, parentsByChild, childId) {
  const person = records[childId];
  const parents = orderedParentIds(records, parentsByChild, childId);
  const explicitFather = String(person?.fatherId || person?.father_id || '');
  if (explicitFather && parents.includes(explicitFather)) return explicitFather;
  return parents.find(parentId => normalizedGender(records[parentId]) === 'male') || '';
}

/**
 * Compute the one focus tree rooted conceptually at `rootId`.
 *
 * The visible lineal structure contains:
 *   1. the focus person and every lineal descendant reachable through
 *      parent/child data;
 *   2. the focus person's direct paternal line (father, paternal grandfather,
 *      and so on), without opening the ancestors' collateral branches;
 *   3. formal spouses of the focus person and descendants, one affinal layer.
 *
 * A focus change therefore keeps the selected person's descendants while
 * exchanging the paternal chain above them. It deliberately does not recurse
 * through a spouse's parents, siblings, other marriages, or unrelated children.
 * Parent/child indexes are repaired in both directions in memory so sparse
 * imported records do not split one focus tree into detached mini-trees.
 */
export function computeDescendantScope(people = {}, rootId = '') {
  const records = people && typeof people === 'object' ? people : {};
  const root = String(rootId || '');
  const allChildrenByParent = new Map();
  const allParentsByChild = new Map();

  Object.entries(records).forEach(([id, person]) => {
    ids(person?.children).forEach(childId => addParentChild(allChildrenByParent, allParentsByChild, id, childId, records));
    ids(person?.parents).forEach(parentId => addParentChild(allChildrenByParent, allParentsByChild, parentId, id, records));
    const explicitFather = String(person?.fatherId || person?.father_id || '');
    const explicitMother = String(person?.motherId || person?.mother_id || '');
    if (explicitFather) addParentChild(allChildrenByParent, allParentsByChild, explicitFather, id, records);
    if (explicitMother) addParentChild(allChildrenByParent, allParentsByChild, explicitMother, id, records);
  });

  const descendantIds = new Set();
  const descendantQueue = records[root] ? [root] : [];
  for (let index = 0; index < descendantQueue.length; index += 1) {
    const id = descendantQueue[index];
    if (!records[id] || descendantIds.has(id)) continue;
    descendantIds.add(id);
    (allChildrenByParent.get(id) || []).forEach(childId => descendantQueue.push(childId));
  }

  // Walk one direct father chain. Requiring an explicitly male (or explicitly
  // designated) parent avoids guessing when imported parent roles are unknown.
  const fatherByChild = new Map();
  const paternalLineFromFocus = records[root] ? [root] : [];
  const paternalSeen = new Set(paternalLineFromFocus);
  let paternalChildId = root;
  while (records[paternalChildId]) {
    const fatherId = fatherIdFor(records, allParentsByChild, paternalChildId);
    if (!fatherId || paternalSeen.has(fatherId)) break;
    fatherByChild.set(paternalChildId, fatherId);
    paternalLineFromFocus.push(fatherId);
    paternalSeen.add(fatherId);
    paternalChildId = fatherId;
  }
  const paternalLineIds = [...paternalLineFromFocus].reverse();
  const paternalAncestorIds = new Set(paternalLineFromFocus.slice(1));
  const linealIds = new Set([...paternalAncestorIds, ...descendantIds]);
  const treeRootId = paternalLineIds[0] || root;

  const spousePairs = new Set();
  const spouseIdsByPerson = new Map();
  const addSpousePair = (firstId, secondId) => {
    if (!records[firstId] || !records[secondId] || firstId === secondId) return;
    const key = descendantPairKey(firstId, secondId);
    spousePairs.add(key);
    if (!spouseIdsByPerson.has(firstId)) spouseIdsByPerson.set(firstId, new Set());
    if (!spouseIdsByPerson.has(secondId)) spouseIdsByPerson.set(secondId, new Set());
    spouseIdsByPerson.get(firstId).add(secondId);
    spouseIdsByPerson.get(secondId).add(firstId);
  };

  Object.entries(records).forEach(([id, person]) => {
    const formallyEndedPartners = Object.entries(person?.relationshipEndStatuses || {})
      .filter(([, status]) => ['annulled', 'divorced'].includes(String(status || '').toLowerCase()))
      .map(([partnerId]) => partnerId);
    const formalSpouses = new Set([
      ...ids(person?.spouses),
      ...ids(person?.divorcedSpouses),
      ...Object.keys(person?.marriageYears || {}),
      ...formallyEndedPartners
    ]);
    formalSpouses.forEach(spouseId => {
      // Ancestors are shown only as the direct paternal line. Their other
      // marriages must not open additional households above the focus.
      if (descendantIds.has(id) || descendantIds.has(spouseId)) addSpousePair(id, spouseId);
    });
  });

  const allowedIds = new Set(linealIds);
  spousePairs.forEach(key => {
    const [firstId, secondId] = key.slice('partner:'.length).split('|');
    allowedIds.add(firstId);
    allowedIds.add(secondId);
  });
  const affinalIds = new Set([...allowedIds].filter(id => !linealIds.has(id)));

  // Project the repaired relationship graph down to the one focus tree. All
  // descendants keep every parent who is in scope; ancestors keep only the
  // single father-child edge that leads to the focus.
  const childrenByParent = new Map();
  const parentsByChild = new Map();
  descendantIds.forEach(childId => {
    (allParentsByChild.get(childId) || []).forEach(parentId => {
      if (allowedIds.has(parentId)) addParentChild(childrenByParent, parentsByChild, parentId, childId, records);
    });
  });
  fatherByChild.forEach((fatherId, childId) => {
    addParentChild(childrenByParent, parentsByChild, fatherId, childId, records);
  });

  return {
    rootId: root,
    treeRootId,
    descendantIds,
    paternalAncestorIds,
    paternalLineIds,
    fatherByChild,
    linealIds,
    affinalIds,
    allowedIds,
    spousePairs,
    spouseIdsByPerson,
    childrenByParent,
    parentsByChild,
    allChildrenByParent,
    allParentsByChild
  };
}
