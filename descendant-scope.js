function ids(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

export function descendantPairKey(firstId, secondId) {
  return `partner:${[String(firstId || ''), String(secondId || '')].sort().join('|')}`;
}

function addChild(adjacency, parentId, childId, people) {
  if (!parentId || !childId || !people[parentId] || !people[childId]) return;
  if (!adjacency.has(parentId)) adjacency.set(parentId, new Set());
  adjacency.get(parentId).add(childId);
}

/**
 * Compute the people who belong to the one descendant tree rooted at rootId.
 *
 * The scope contains:
 *   1. the root and every lineal descendant reachable through parent/child data;
 *   2. formal spouses of those descendants, one affinal layer only.
 *
 * It deliberately does not recurse through a spouse's other marriages,
 * parents, siblings, or children from unrelated unions.
 */
export function computeDescendantScope(people = {}, rootId = '') {
  const records = people && typeof people === 'object' ? people : {};
  const root = String(rootId || '');
  const childrenByParent = new Map();

  Object.entries(records).forEach(([id, person]) => {
    ids(person?.children).forEach(childId => addChild(childrenByParent, id, childId, records));
    ids(person?.parents).forEach(parentId => addChild(childrenByParent, parentId, id, records));
  });

  const descendantIds = new Set();
  const queue = records[root] ? [root] : [];
  while (queue.length) {
    const id = queue.shift();
    if (!records[id] || descendantIds.has(id)) continue;
    descendantIds.add(id);
    (childrenByParent.get(id) || []).forEach(childId => queue.push(childId));
  }

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
    const formalSpouses = new Set([
      ...ids(person?.spouses),
      ...Object.keys(person?.marriageYears || {})
    ]);
    formalSpouses.forEach(spouseId => {
      if (descendantIds.has(id) || descendantIds.has(spouseId)) addSpousePair(id, spouseId);
    });
  });

  const allowedIds = new Set(descendantIds);
  spousePairs.forEach(key => {
    const [firstId, secondId] = key.slice('partner:'.length).split('|');
    allowedIds.add(firstId);
    allowedIds.add(secondId);
  });
  const affinalIds = new Set([...allowedIds].filter(id => !descendantIds.has(id)));

  return {
    rootId: root,
    descendantIds,
    affinalIds,
    allowedIds,
    spousePairs,
    spouseIdsByPerson
  };
}
