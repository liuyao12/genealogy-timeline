from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    "descendant-scope.js",
    """function fatherIdFor(records, parentsByChild, childId) {
  const person = records[childId];
  const parents = orderedParentIds(records, parentsByChild, childId);
  const explicitFather = String(person?.fatherId || person?.father_id || '');
  if (explicitFather && parents.includes(explicitFather)) return explicitFather;
  return parents.find(parentId => normalizedGender(records[parentId]) === 'male') || '';
}

/**
""",
    """function fatherIdFor(records, parentsByChild, childId) {
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
""",
)

replace_once(
    "descendant-scope.js",
    """ * The visible lineal structure contains:
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
""",
    """ * The projection contains:
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
""",
)

replace_once(
    "descendant-scope.js",
    """  const paternalLineIds = [...paternalLineFromFocus].reverse();
  const paternalAncestorIds = new Set(paternalLineFromFocus.slice(1));
  const linealIds = new Set([...paternalAncestorIds, ...descendantIds]);
  const treeRootId = paternalLineIds[0] || root;

  const spousePairs = new Set();
  const spouseIdsByPerson = new Map();
""",
    """  const paternalLineIds = [...paternalLineFromFocus].reverse();
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
""",
)

replace_once(
    "descendant-scope.js",
    """    spouseIdsByPerson.get(firstId).add(secondId);
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
""",
    """    spouseIdsByPerson.get(firstId).add(secondId);
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
""",
)

replace_once(
    "descendant-scope.js",
    """  const affinalIds = new Set([...allowedIds].filter(id => !linealIds.has(id)));

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
""",
    """  const affinalIds = new Set([...allowedIds].filter(id => !linealIds.has(id)));
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
""",
)

replace_once(
    "descendant-scope.js",
    """    paternalLineIds,
    fatherByChild,
    linealIds,
""",
    """    paternalLineIds,
    fatherByChild,
    paternalHouseholdChildIds,
    paternalSiblingIds,
    paternalSpouseIds,
    paternalHouseholdIds,
    spouseOwnerIds,
    linealIds,
""",
)

replace_once(
    "app.js",
    "import { computeDescendantScope } from './descendant-scope.js?v=2';",
    "import { computeDescendantScope } from './descendant-scope.js?v=3';",
)
replace_once(
    "app.js",
    """  // Keep this set separate from the full lineal projection. Spouse attachment
  // belongs to the focus person and descendants, never to paternal ancestors.
""",
    """  // Keep descendants separate from the complete paternal-household tree.
  // Spouses attach to the focus/descendants and to every paternal ancestor,
  // while siblings remain terminal structural nodes.
""",
)
replace_once(
    "app.js",
    """  // The visible lineal spine starts with the oldest known father-line ancestor,
  // reaches the focus person, and then opens into every descendant branch.
""",
    """  // The visible structure starts with the oldest known paternal household,
  // includes every ancestor's spouses and children, reaches the focus person,
  // and then opens into every descendant branch.
""",
)
replace_once(
    "app.js",
    """      // A matching spouse is attached only to the descendant whom they married.
      // Their parents, siblings, other spouses, and unrelated children remain
      // outside this focus tree.
      scopedSpouseIds(state.people[id], scope).forEach(partnerId => {
        if (!descendantsOfRoot.has(partnerId)) return;
""",
    """      // A matching spouse is attached only to the household owner whom they
      // married. Their own parents, siblings, other spouses, and unrelated
      // children remain outside this focus tree.
      scopedSpouseIds(state.people[id], scope).forEach(partnerId => {
        if (!scope.spouseOwnerIds.has(partnerId) || !linealFromTreeRoot.has(partnerId)) return;
""",
)
replace_once(
    "app.js",
    """    const touchesVisibleDescendant = [firstId, secondId].some(id => descendantsOfRoot.has(id) && visible.has(id));
    if (!touchesVisibleDescendant) return;
""",
    """    const touchesVisibleHouseholdOwner = [firstId, secondId]
      .some(id => scope.spouseOwnerIds.has(id) && visible.has(id));
    if (!touchesVisibleHouseholdOwner) return;
""",
)
replace_once(
    "app.js",
    """  // An affinal profile survives only as the spouse occurrence attached to a
  // visible focus/descendant. This excludes a spouse's unrelated marriage tree.
""",
    """  // An affinal profile survives only as the spouse occurrence attached to a
  // visible focus, descendant, or paternal ancestor. This still excludes the
  // spouse's own unrelated marriage tree.
""",
)
replace_once(
    "app.js",
    """    const hasRenderedHousehold = scopedSpouseIds(state.people[id], scope).some(partnerId =>
      descendantsOfRoot.has(partnerId)
      && visible.has(partnerId)
""",
    """    const hasRenderedHousehold = scopedSpouseIds(state.people[id], scope).some(partnerId =>
      scope.spouseOwnerIds.has(partnerId)
      && visible.has(partnerId)
""",
)
replace_once(
    "app.js",
    """  const datedVisibleDescendants = new Set([...descendantsOfRoot].filter(id =>
    visibleIds.has(id) && numericYear(state.people[id]?.birthYear) != null
  ));
""",
    """  const datedVisibleSpouseOwners = new Set([...scope.spouseOwnerIds].filter(id =>
    visibleIds.has(id) && numericYear(state.people[id]?.birthYear) != null
  ));
""",
)
replace_once(
    "app.js",
    """      datedVisibleDescendants.has(partnerId)
""",
    """      datedVisibleSpouseOwners.has(partnerId)
""",
)
replace_once(
    "app.js",
    """  const paternalCount = candidateFocusScope.paternalAncestorIds.size;
  const descendantCount = Math.max(0, candidateFocusScope.descendantIds.size - 1);
""",
    """  const paternalCount = candidateFocusScope.paternalAncestorIds.size;
  const paternalSpouseCount = candidateFocusScope.paternalSpouseIds.size;
  const paternalSiblingCount = candidateFocusScope.paternalSiblingIds.size;
  const descendantCount = Math.max(0, candidateFocusScope.descendantIds.size - 1);
""",
)
replace_once(
    "app.js",
    """  els['focus-tree-status'].textContent = isTreeFocus
    ? `${paternalCount ? `${paternalCount} father-line ancestor${paternalCount === 1 ? '' : 's'} above` : 'No known father-line ancestors'} · ${descendantCount} descendant${descendantCount === 1 ? '' : 's'} below`
    : `Show this person’s father line above and all ${descendantCount} known descendant${descendantCount === 1 ? '' : 's'} below.`;
""",
    """  const paternalSummary = paternalCount
    ? `${paternalCount} paternal ancestor${paternalCount === 1 ? '' : 's'}, ${paternalSpouseCount} spouse${paternalSpouseCount === 1 ? '' : 's'}, ${paternalSiblingCount} sibling${paternalSiblingCount === 1 ? '' : 's'}`
    : 'No known paternal households above';
  els['focus-tree-status'].textContent = isTreeFocus
    ? `${paternalSummary} · ${descendantCount} descendant${descendantCount === 1 ? '' : 's'} below`
    : `Show ${paternalSummary.toLowerCase()} and all ${descendantCount} known descendant${descendantCount === 1 ? '' : 's'} below.`;
""",
)

replace_once(
    "index.html",
    "Father’s line above · all descendants below",
    "Paternal households above · all descendants below",
)
replace_once(
    "index.html",
    '<link rel="stylesheet" href="./styles.css?v=73">',
    '<link rel="stylesheet" href="./styles.css?v=74">',
)
replace_once(
    "index.html",
    '<script type="module" src="./app.js?v=131"></script>',
    '<script type="module" src="./app.js?v=132"></script>',
)

replace_once(
    "styles.css",
    """.timeline-node.focus .lifespan-outline { stroke: #111; stroke-width: 3.1; }
.timeline-node.focus .timeline-label:not(.timeline-label-halo) { font-weight: 600; }
.timeline-node.selected .lifespan-outline { stroke-width: 3.4; }
""",
    """.timeline-node.focus .lifespan-outline { stroke-width: 4.4; }
.timeline-node.focus.male .lifespan-outline { stroke: #69a9cf; }
.timeline-node.focus.female .lifespan-outline { stroke: #e580b5; }
.timeline-node.focus.unknown .lifespan-outline { stroke: #777; }
.timeline-node.focus .timeline-label:not(.timeline-label-halo) { font-weight: 600; }
.timeline-node.selected .lifespan-outline { stroke-width: 3.4; }
.timeline-node.focus.selected .lifespan-outline { stroke-width: 4.8; }
""",
)

# Replace the old direct-line-only scope test with the complete household rule.
test_path = Path("tests/descendant-scope.test.mjs")
test_text = test_path.read_text()
pattern = re.compile(
    r"test\('adds only the direct paternal line above the focus and all descendants below', \(\) => \{.*?\n\}\);\n\n(?=test\('refocusing on a spouse)",
    re.S,
)
replacement = """test('adds complete paternal households but keeps siblings terminal', () => {
  const people = {
    grandfather: { id: 'grandfather', gender: 'male', parents: [], children: ['father', 'uncle'], spouses: ['grandmother', 'grandfather-second-wife'] },
    grandmother: { id: 'grandmother', gender: 'female', parents: [], children: ['father', 'uncle'], spouses: ['grandfather'] },
    'grandfather-second-wife': { id: 'grandfather-second-wife', gender: 'female', parents: [], children: [], spouses: ['grandfather'] },
    uncle: { id: 'uncle', gender: 'male', parents: ['grandfather', 'grandmother'], children: ['cousin'], spouses: ['uncle-spouse'] },
    'uncle-spouse': { id: 'uncle-spouse', gender: 'female', parents: [], children: ['cousin'], spouses: ['uncle'] },
    cousin: { id: 'cousin', parents: ['uncle', 'uncle-spouse'], children: [], spouses: [] },
    father: { id: 'father', gender: 'male', parents: ['grandfather', 'grandmother'], children: ['focus', 'sibling', 'half-sibling'], spouses: ['mother', 'stepmother'] },
    mother: { id: 'mother', gender: 'female', parents: [], children: ['focus', 'sibling'], spouses: ['father'] },
    stepmother: { id: 'stepmother', gender: 'female', parents: [], children: ['half-sibling'], spouses: ['father'] },
    sibling: { id: 'sibling', parents: ['father', 'mother'], children: ['niece'], spouses: ['sibling-spouse'] },
    'sibling-spouse': { id: 'sibling-spouse', parents: [], children: ['niece'], spouses: ['sibling'] },
    niece: { id: 'niece', parents: ['sibling', 'sibling-spouse'], children: [], spouses: [] },
    'half-sibling': { id: 'half-sibling', parents: ['father', 'stepmother'], children: [], spouses: [] },
    focus: { id: 'focus', gender: 'female', parents: ['father', 'mother'], children: ['child'], spouses: ['focus-spouse'] },
    'focus-spouse': { id: 'focus-spouse', gender: 'male', parents: [], children: ['child'], spouses: ['focus'] },
    child: { id: 'child', parents: ['focus', 'focus-spouse'], children: ['grandchild'], spouses: [] },
    grandchild: { id: 'grandchild', parents: ['child'], children: [], spouses: [] }
  };

  const scope = computeDescendantScope(people, 'focus');
  assert.deepEqual(scope.paternalLineIds, ['grandfather', 'father', 'focus']);
  assert.equal(scope.treeRootId, 'grandfather');
  assert.deepEqual([...scope.paternalSiblingIds].sort(), ['half-sibling', 'sibling', 'uncle']);
  assert.deepEqual([...scope.paternalSpouseIds].sort(), ['grandfather-second-wife', 'grandmother', 'mother', 'stepmother']);
  assert.deepEqual([...scope.descendantIds].sort(), ['child', 'focus', 'grandchild']);
  assert.deepEqual([...scope.allowedIds].sort(), [
    'child', 'father', 'focus', 'focus-spouse', 'grandchild', 'grandfather',
    'grandfather-second-wife', 'grandmother', 'half-sibling', 'mother', 'sibling',
    'stepmother', 'uncle'
  ]);
  for (const excluded of ['uncle-spouse', 'cousin', 'sibling-spouse', 'niece']) {
    assert.equal(scope.allowedIds.has(excluded), false, `${excluded} belongs to a sibling's collateral branch`);
  }
  assert.deepEqual([...scope.childrenByParent.get('grandfather')].sort(), ['father', 'uncle']);
  assert.deepEqual([...scope.childrenByParent.get('father')].sort(), ['focus', 'half-sibling', 'sibling']);
  assert.deepEqual([...scope.childrenByParent.get('mother')].sort(), ['focus', 'sibling']);
  assert.deepEqual([...scope.childrenByParent.get('stepmother')], ['half-sibling']);
  assert.deepEqual([...scope.parentsByChild.get('focus')].sort(), ['father', 'mother']);
  assert.deepEqual([...scope.parentsByChild.get('child')].sort(), ['focus', 'focus-spouse']);
  assert.equal(scope.spousePairs.has(descendantPairKey('grandfather', 'grandfather-second-wife')), true);
  assert.equal(scope.spousePairs.has(descendantPairKey('sibling', 'sibling-spouse')), false);
});

"""
test_text, count = pattern.subn(replacement, test_text, count=1)
if count != 1:
    raise SystemExit(f"Expected one paternal-scope test block, found {count}")
# The spouse refocus now retains that spouse's paternal sibling.
test_text = test_text.replace(
    """  assert.equal(newScope.allowedIds.has('old-father'), false);
  assert.equal(newScope.allowedIds.has('old-root'), true, 'the former root becomes the focus person’s spouse');
""",
    """  assert.equal(newScope.allowedIds.has('old-father'), false);
  assert.equal(newScope.allowedIds.has('new-focus-sibling'), true, 'all children of the new focus’s father remain visible');
  assert.equal(newScope.allowedIds.has('old-root'), true, 'the former root becomes the focus person’s spouse');
""",
    1,
)
test_path.write_text(test_text)

focus_test = Path("tests/focus-tree-ui.test.mjs")
focus_text = focus_test.read_text()
focus_text += """

test('focus emphasis uses a thicker gender-coloured outline rather than black', () => {
  assert.match(styles, /\\.timeline-node\\.focus\\.male \\.lifespan-outline \\{ stroke: #69a9cf; \\}/);
  assert.match(styles, /\\.timeline-node\\.focus\\.female \\.lifespan-outline \\{ stroke: #e580b5; \\}/);
  assert.match(styles, /\\.timeline-node\\.focus\\.selected \\.lifespan-outline \\{ stroke-width: 4\\.8; \\}/);
  assert.doesNotMatch(styles, /\\.timeline-node\\.focus \\.lifespan-outline \\{ stroke: #111/);
});

test('the renderer attaches spouses to paternal ancestors as well as descendants', () => {
  assert.match(app, /scope\\.spouseOwnerIds\\.has\\(partnerId\\)/);
  assert.match(app, /datedVisibleSpouseOwners/);
  assert.match(app, /candidateFocusScope\\.paternalSpouseIds\\.size/);
  assert.match(app, /candidateFocusScope\\.paternalSiblingIds\\.size/);
});
"""
focus_test.write_text(focus_text)
