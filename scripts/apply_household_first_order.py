from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} block, found {count}")
    return text.replace(old, new, 1)


app_path = Path("app.js")
app = app_path.read_text()

old_visit = r'''    const groupedPartners = new Set();
    orderedGroups.forEach(group => {
      const pendingChildren = group.childIds.filter(childId => !expanded.has(childId));
      if (!pendingChildren.length && !group.partnerId) return;
      const transportedId = group.partnerId ? transportedParent([id, group.partnerId]) : '';
      // A cousin-marriage household is rendered on the non-transported side.
      // The transported spouse retains their primary occurrence in the natal
      // branch; an auxiliary spouse occurrence is inserted below.
      if (transportedId === id) return;
      let householdParentId = id;
      if (group.partnerId) {
        groupedPartners.add(group.partnerId);
        if (!transportedId) {
          const partnerWasPlaced = placed.has(group.partnerId);
          place(group.partnerId, true, id);
          if (partnerWasPlaced && state.collapsedIds.has(group.partnerId)) spouseIds.add(group.partnerId);
          if (!partnerWasPlaced) householdParentId = group.partnerId;
        }
      }
      pendingChildren.forEach(childId => visit(childId, householdParentId));
    });
'''
new_visit = r'''    // Lay out the immediate marriage household before descending into any
    // child's branch. Without this two-pass order, a prolific first marriage
    // can push later spouses below the next sibling branch. The spouse rows now
    // form one chronological block directly below the person; descendants of
    // each union are expanded only after that block has been established.
    const preparedGroups = orderedGroups.map(group => ({
      group,
      pendingChildren: group.childIds.filter(childId => !expanded.has(childId)),
      transportedId: group.partnerId ? transportedParent([id, group.partnerId]) : '',
      householdParentId: id
    }));
    const groupedPartners = new Set();
    preparedGroups.forEach(prepared => {
      const { group, transportedId } = prepared;
      // A cousin-marriage household is rendered on the non-transported side.
      // The transported spouse retains their primary occurrence in the natal
      // branch; an auxiliary spouse occurrence is inserted below.
      if (!group.partnerId || transportedId === id) return;
      groupedPartners.add(group.partnerId);
      if (transportedId) return;
      const partnerWasPlaced = placed.has(group.partnerId);
      place(group.partnerId, true, id);
      if (partnerWasPlaced && state.collapsedIds.has(group.partnerId)) spouseIds.add(group.partnerId);
      if (!partnerWasPlaced) prepared.householdParentId = group.partnerId;
    });
    preparedGroups.forEach(({ pendingChildren, transportedId, householdParentId }) => {
      if (transportedId === id) return;
      pendingChildren.forEach(childId => visit(childId, householdParentId));
    });
'''
app = replace_once(app, old_visit, new_visit, "visit marriage-group")

old_constraints = r'''      // Keep the next sibling below the preceding sibling's immediate
      // household. A spouse root is different: it begins an ordered marriage
      // group, so its complete descendant block must finish before the next
      // spouse group starts. Otherwise contour compaction can put one wife's
      // child among another wife's branch.
      for (let branchIndex = 1; branchIndex < branches.length; branchIndex += 1) {
        const precedingRoot = branches[branchIndex - 1].rootIndex;
        const followingRoot = branches[branchIndex].rootIndex;
        const precedingHousehold = [precedingRoot];
        childrenByIndex.get(precedingRoot).forEach(childIndex => {
          precedingHousehold.push(childIndex);
          if (nodes[childIndex].isSpouse) precedingHousehold.push(...childrenByIndex.get(childIndex));
        });
        const protectsMarriageOrder = nodes[precedingRoot].isSpouse || nodes[followingRoot].isSpouse;
        const uniquePrecedingHousehold = protectsMarriageOrder
          ? branches[branchIndex - 1].indexes
          : unique(precedingHousehold);
'''
new_constraints = r'''      // Keep the next sibling below the preceding sibling's immediate
      // household. Consecutive spouse roots belonging to the same person are
      // the exception: only the preceding spouse row constrains the next one,
      // so all marriages remain contiguous before any descendant subtree.
      // A spouse followed by a different kind of branch still protects its
      // complete descendant block.
      for (let branchIndex = 1; branchIndex < branches.length; branchIndex += 1) {
        const precedingRoot = branches[branchIndex - 1].rootIndex;
        const followingRoot = branches[branchIndex].rootIndex;
        const precedingHousehold = [precedingRoot];
        childrenByIndex.get(precedingRoot).forEach(childIndex => {
          precedingHousehold.push(childIndex);
          if (nodes[childIndex].isSpouse) precedingHousehold.push(...childrenByIndex.get(childIndex));
        });
        const precedingOwner = displayParentByKey.get(nodes[precedingRoot].key);
        const followingOwner = displayParentByKey.get(nodes[followingRoot].key);
        const sharesMarriageOwner = nodes[precedingRoot].isSpouse
          && nodes[followingRoot].isSpouse
          && precedingOwner
          && precedingOwner === followingOwner;
        const protectsMarriageOrder = nodes[precedingRoot].isSpouse || nodes[followingRoot].isSpouse;
        const uniquePrecedingHousehold = sharesMarriageOwner
          ? [precedingRoot]
          : protectsMarriageOrder
            ? branches[branchIndex - 1].indexes
            : unique(precedingHousehold);
'''
app = replace_once(app, old_constraints, new_constraints, "sibling household constraint")

old_runs = r'''  const directRuns = [];
  nodes.forEach((_, index) => {
    const currentRun = directRuns.at(-1);
    const previousIndex = currentRun?.at(-1);
    if (previousIndex != null && timelineNodesAreImmediateFamily(nodes[previousIndex], nodes[index])) currentRun.push(index);
    else directRuns.push([index]);
  });
'''
new_runs = r'''  const directRuns = [];
  nodes.forEach((_, index) => {
    const currentRun = directRuns.at(-1);
    const previousIndex = currentRun?.at(-1);
    const previousOwner = previousIndex == null ? '' : displayParentByKey.get(nodes[previousIndex].key);
    const currentOwner = displayParentByKey.get(nodes[index].key);
    const sharesMarriageOwner = previousIndex != null
      && nodes[previousIndex].isSpouse
      && nodes[index].isSpouse
      && previousOwner
      && previousOwner === currentOwner;
    if (previousIndex != null && (timelineNodesAreImmediateFamily(nodes[previousIndex], nodes[index]) || sharesMarriageOwner)) currentRun.push(index);
    else directRuns.push([index]);
  });
'''
app = replace_once(app, old_runs, new_runs, "direct family run")

old_transport = r'''  const insertTransportedOccurrence = (key, family, transportedId) => {
    const associationKey = familyPersonKey(key, transportedId);
    if (occurrenceKeyByFamilyPerson.has(associationKey)) return occurrenceKeyByFamilyPerson.get(associationKey);
    const otherParentId = family.parents.find(id => id !== transportedId);
    const copyKey = `transport:${key}:${transportedId}`;
    const childIndexes = family.children.map(childId => layoutEntries.findIndex(entry => entry.key === childId)).filter(index => index >= 0);
    const otherParentIndex = layoutEntries.findIndex(entry => entry.key === otherParentId);
    const insertAt = childIndexes.length ? Math.min(...childIndexes) : Math.max(0, otherParentIndex + 1);
    layoutEntries.splice(insertAt, 0, { key: copyKey, id: transportedId, isSpouse: true, isTransportedCopy: true, familyKey: key });
    occurrenceKeyByFamilyPerson.set(associationKey, copyKey);
    return copyKey;
  };
'''
new_transport = r'''  const insertTransportedOccurrence = (key, family, transportedId) => {
    const associationKey = familyPersonKey(key, transportedId);
    if (occurrenceKeyByFamilyPerson.has(associationKey)) return occurrenceKeyByFamilyPerson.get(associationKey);
    const otherParentId = family.parents.find(id => id !== transportedId);
    const copyKey = `transport:${key}:${transportedId}`;
    const otherParentIndex = layoutEntries.findIndex(entry => entry.key === otherParentId);
    const marriageYear = marriageYearFor(otherParentId, transportedId) ?? Number.POSITIVE_INFINITY;
    const spouseSlots = layoutEntries.map((entry, index) => ({
      entry,
      index,
      ownerId: displayParentByKey.get(entry.key),
      marriageYear: marriageYearFor(otherParentId, entry.id) ?? Number.POSITIVE_INFINITY
    })).filter(slot => slot.entry.isSpouse && slot.ownerId === otherParentId);
    const laterSpouse = spouseSlots.find(slot => slot.marriageYear > marriageYear);
    const insertAt = laterSpouse
      ? laterSpouse.index
      : spouseSlots.length
        ? Math.max(...spouseSlots.map(slot => slot.index)) + 1
        : Math.max(0, otherParentIndex + 1);
    layoutEntries.splice(insertAt, 0, { key: copyKey, id: transportedId, isSpouse: true, isTransportedCopy: true, familyKey: key });
    if (otherParentId) displayParentByKey.set(copyKey, otherParentId);
    occurrenceKeyByFamilyPerson.set(associationKey, copyKey);
    return copyKey;
  };
'''
app = replace_once(app, old_transport, new_transport, "transported spouse insertion")

app_path.write_text(app)

index_path = Path("index.html")
index = index_path.read_text()
index = replace_once(index, 'src="./app.js?v=117"', 'src="./app.js?v=118"', "app cache version")
index_path.write_text(index)
