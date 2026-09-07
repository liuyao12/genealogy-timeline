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

function formalSpouseIds(person) {
  const formallyEndedPartners = Object.entries(person?.relationshipEndStatuses || {})
    .filter(([, status]) => ['annulled', 'divorced'].includes(String(status || '').toLowerCase()))
    .map(([partnerId]) => partnerId);
  return uniqueIds([
    ...ids(person?.spouses),
    ...ids(person?.divorcedSpouses),
    ...Object.keys(person?.marriageYears || {}),
    ...formallyEndedPartners
  ]);
}

/**
 * Compute the one focus tree rooted conceptually at `rootId`.
 *
 * The projection contains:
 *   1. the focus person and every lineal descendant reachable through
 *      parent/child data;
 *   2. the focus person's direct paternal line, continuing as far upward as
 *      the stored data identifies a father;
 *   3. every formal spouse and every direct child of each paternal ancestor,
 *      so each generation appears as a complete paternal household;
 *   4. formal spouses of the focus person and descendants, one affinal layer.
 *
 * Siblings in the paternal households are terminal in this projection: their
 * own spouses and descendants do not open collateral mini-trees. Choosing one
 * of them as the focus recomputes the projection from that person's viewpoint.
 * Parent/child indexes are repaired in both directions in memory so sparse
 * imported records do not split a focus tree into detached components.
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
  const paternalLineSet = new Set(paternalLineIds);
  const paternalAncestorIds = new Set(paternalLineFromFocus.slice(1));
  const treeRootId = paternalLineIds[0] || root;

  // Add every direct child of every paternal ancestor. These are the focus
  // person's paternal siblings, uncles/aunts, great-uncles/aunts, and so on.
  // They remain terminal unless one of them is explicitly chosen as the focus.
  const paternalHouseholdChildIds = new Set();
  paternalAncestorIds.forEach(ancestorId => {
    (allChildrenByParent.get(ancestorId) || []).forEach(childId => paternalHouseholdChildIds.add(childId));
  });
  const paternalSiblingIds = new Set(
    [...paternalHouseholdChildIds].filter(id => !paternalLineSet.has(id) && !descendantIds.has(id))
  );

  // `linealIds` is retained as the renderer's structural-node set. It now also
  // contains the terminal siblings displayed beside each paternal generation.
  const linealIds = new Set([...paternalAncestorIds, ...paternalSiblingIds, ...descendantIds]);
  const spouseOwnerIds = new Set([...paternalAncestorIds, ...descendantIds]);

  const spousePairs = new Set();
  const spouseIdsByPerson = new Map();
  const paternalSpouseIds = new Set();
  const addSpousePair = (firstId, secondId) => {
    if (!records[firstId] || !records[secondId] || firstId === secondId) return;
    const key = descendantPairKey(firstId, secondId);
    spousePairs.add(key);
    if (!spouseIdsByPerson.has(firstId)) spouseIdsByPerson.set(firstId, new Set());
    if (!spouseIdsByPerson.has(secondId)) spouseIdsByPerson.set(secondId, new Set());
    spouseIdsByPerson.get(firstId).add(secondId);
    spouseIdsByPerson.get(secondId).add(firstId);
    if (paternalAncestorIds.has(firstId)) paternalSpouseIds.add(secondId);
    if (paternalAncestorIds.has(secondId)) paternalSpouseIds.add(firstId);
  };

  // Read spouse facts from both directions. A pair is included only when one
  // member owns a household here: a paternal ancestor, the focus person, or a
  // descendant. Siblings' marriages stay outside the projection.
  Object.entries(records).forEach(([id, person]) => {
    formalSpouseIds(person).forEach(spouseId => {
      if (spouseOwnerIds.has(id) || spouseOwnerIds.has(spouseId)) addSpousePair(id, spouseId);
    });
  });

  const allowedIds = new Set(linealIds);
  spousePairs.forEach(key => {
    const [firstId, secondId] = key.slice('partner:'.length).split('|');
    allowedIds.add(firstId);
    allowedIds.add(secondId);
  });
  const affinalIds = new Set([...allowedIds].filter(id => !linealIds.has(id)));
  const paternalHouseholdIds = new Set([
    ...paternalAncestorIds,
    ...paternalSiblingIds,
    ...paternalSpouseIds
  ]);

  // Project the repaired graph down to this focus tree. Descendants retain all
  // in-scope parents. Every child in a paternal household likewise retains all
  // in-scope parents, grouping siblings under the correct ancestor and spouse.
  const childrenByParent = new Map();
  const parentsByChild = new Map();
  const projectedChildIds = new Set([...descendantIds, ...paternalHouseholdChildIds]);
  projectedChildIds.forEach(childId => {
    (allParentsByChild.get(childId) || []).forEach(parentId => {
      if (allowedIds.has(parentId)) addParentChild(childrenByParent, parentsByChild, parentId, childId, records);
    });
  });
  // Preserve the father chain even when a sparse record exposes only an
  // explicit father field and no reciprocal parent/child array.
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
    paternalHouseholdChildIds,
    paternalSiblingIds,
    paternalSpouseIds,
    paternalHouseholdIds,
    spouseOwnerIds,
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
