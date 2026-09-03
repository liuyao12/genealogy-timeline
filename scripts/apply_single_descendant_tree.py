from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"{label}: start marker not found")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return text[:start_index] + replacement + text[end_index:]


app_path = Path("app.js")
app = app_path.read_text(encoding="utf-8")

import_line = "import { computeDescendantScope } from './descendant-scope.js?v=1';\n\n"
if not app.startswith(import_line):
    app = import_line + app

partner_anchor = "function allPartnerIds(person) { return unique([...(person?.spouses || []), ...(person?.partners || [])]).filter(id => state.people[id]); }\n"
partner_helpers = """function activeDescendantScope() {
  return computeDescendantScope(state.people, state.rootId);
}
function scopedSpouseIds(person, scope = activeDescendantScope()) {
  return [...(scope.spouseIdsByPerson.get(person?.id) || [])].filter(id => state.people[id]);
}
function scopedHouseholdChildren(personId, partnerId = '', scope = activeDescendantScope()) {
  return householdChildren(personId, partnerId).filter(childId => scope.descendantIds.has(childId));
}
"""
if partner_helpers not in app:
    app = replace_once(app, partner_anchor, partner_anchor + partner_helpers, "scope helper insertion")

new_visibility = r'''function buildTimelineVisibility() {
  const scope = activeDescendantScope();
  const allIds = [...scope.allowedIds];
  // Child visibility belongs to the whole parental household. A descendant
  // can be hidden, but no override is allowed to pull a collateral relative,
  // an ancestor, or a spouse's other family into the active tree.
  const childEdgeVisible = (parentId, childId) => {
    if (!scope.descendantIds.has(childId) || !scope.allowedIds.has(parentId)) return false;
    if (relationOverride(childRelationKey(parentId, childId)) === false) return false;
    const parentIds = state.people[childId]?.parents || [];
    return !parentIds.some(id => relationOverride(childRelationKey(id, childId)) === false);
  };

  const descendantsOfRoot = new Set();
  const descendantQueue = scope.descendantIds.has(state.rootId) ? [state.rootId] : [];
  while (descendantQueue.length) {
    const id = descendantQueue.shift();
    if (descendantsOfRoot.has(id) || !scope.descendantIds.has(id) || !state.people[id]) continue;
    descendantsOfRoot.add(id);
    state.people[id].children.forEach(childId => {
      if (scope.descendantIds.has(childId) && childEdgeVisible(id, childId)) descendantQueue.push(childId);
    });
  }

  const query = clean(els['tree-filter']?.value).toLocaleLowerCase();
  const keywords = query.split(/\s+/).filter(Boolean);
  const matches = allIds.filter(id => keywords.some(keyword => matchesKeyword(state.people[id], keyword)));
  const hasRoot = scope.descendantIds.has(state.rootId);
  const visible = new Set(query ? (hasRoot ? [state.rootId] : matches) : descendantsOfRoot);
  const matchedPartnerPairs = new Set();

  if (query) {
    const pathSeeds = new Set();
    matches.forEach(id => {
      if (descendantsOfRoot.has(id)) {
        visible.add(id);
        pathSeeds.add(id);
        return;
      }
      if (!scope.affinalIds.has(id)) return;
      // A matching spouse is attached only to the descendant whom they married.
      // Their parents, siblings, other spouses, and unrelated children remain
      // outside this root's descendant projection.
      scopedSpouseIds(state.people[id], scope).forEach(partnerId => {
        if (!descendantsOfRoot.has(partnerId)) return;
        const pairKey = partnerRelationKey(id, partnerId);
        visible.add(id);
        visible.add(partnerId);
        pathSeeds.add(partnerId);
        matchedPartnerPairs.add(pairKey);
      });
    });
    const queue = [...pathSeeds];
    while (queue.length) {
      const childId = queue.shift();
      const child = state.people[childId];
      if (!child) continue;
      child.parents.forEach(parentId => {
        if (!descendantsOfRoot.has(parentId) || !childEdgeVisible(parentId, childId) || visible.has(parentId)) return;
        visible.add(parentId);
        queue.push(parentId);
      });
    }
  } else {
    Object.entries(state.relationVisibility).forEach(([key, shown]) => {
      if (shown || !key.startsWith('child:')) return;
      const childId = key.split('>').pop();
      if (!scope.descendantIds.has(childId)) return;
      const queue = [childId];
      while (queue.length) {
        const id = queue.shift();
        if (!visible.delete(id)) continue;
        (state.people[id]?.children || []).forEach(nextId => {
          if (scope.descendantIds.has(nextId)) queue.push(nextId);
        });
      }
    });
  }

  // A manually shown child can be inspected even when it is not part of the
  // current keyword path, but only when it is structurally below this root.
  Object.entries(state.relationVisibility).forEach(([key, shown]) => {
    if (!shown || !key.startsWith('child:')) return;
    const relation = key.slice('child:'.length);
    const split = relation.lastIndexOf('>');
    const parentId = relation.slice(0, split);
    const childId = relation.slice(split + 1);
    if (scope.allowedIds.has(parentId) && scope.descendantIds.has(childId) && visible.has(parentId)) visible.add(childId);
  });
  // Legacy profile overrides are honored only inside the current descendant
  // scope. They can never resurrect an unrelated mini-tree.
  Object.entries(state.relationVisibility).forEach(([key, shown]) => {
    if (!shown || !key.startsWith('profile:')) return;
    const profileId = key.slice('profile:'.length);
    if (scope.allowedIds.has(profileId)) visible.add(profileId);
  });

  const renderedPartnerPairs = new Set();
  scope.spousePairs.forEach(key => {
    const [firstId, secondId] = key.slice('partner:'.length).split('|');
    if (!state.people[firstId] || !state.people[secondId]) return;
    const override = relationOverride(key);
    if (override === false) return;
    const touchesVisibleDescendant = [firstId, secondId].some(id => descendantsOfRoot.has(id) && visible.has(id));
    if (!touchesVisibleDescendant) return;
    const carriesVisibleChild = unique([
      ...scopedHouseholdChildren(firstId, secondId, scope),
      ...scopedHouseholdChildren(secondId, firstId, scope)
    ]).some(childId => visible.has(childId));
    const defaultVisible = !query || carriesVisibleChild;
    if (override === true || matchedPartnerPairs.has(key) || defaultVisible) renderedPartnerPairs.add(key);
  });

  renderedPartnerPairs.forEach(key => {
    const [firstId, secondId] = key.slice('partner:'.length).split('|');
    if (visible.has(firstId) || visible.has(secondId)) {
      visible.add(firstId);
      visible.add(secondId);
    }
  });

  // An affinal profile survives only as the spouse occurrence attached to a
  // visible lineal descendant. This is the boundary that excludes, for
  // example, John Neville's separate marriage tree from Henry VII's view.
  [...visible].forEach(id => {
    if (!scope.allowedIds.has(id)) {
      visible.delete(id);
      return;
    }
    if (!scope.affinalIds.has(id)) return;
    const hasRenderedHousehold = scopedSpouseIds(state.people[id], scope).some(partnerId =>
      descendantsOfRoot.has(partnerId)
      && visible.has(partnerId)
      && renderedPartnerPairs.has(partnerRelationKey(id, partnerId))
    );
    if (!hasRenderedHousehold) visible.delete(id);
  });

  return { visibleIds: visible, renderedPartnerPairs, descendantsOfRoot, childEdgeVisible, scope };
}
'''
app = replace_between(app, "function buildTimelineVisibility() {", "\nfunction svg(", new_visibility, "timeline visibility")

app = replace_once(
    app,
    "  const { visibleIds, renderedPartnerPairs, descendantsOfRoot, childEdgeVisible } = visibility;",
    "  const { visibleIds, renderedPartnerPairs, descendantsOfRoot, childEdgeVisible, scope } = visibility;",
    "timeline visibility destructuring",
)
app = replace_once(
    app,
    "  const renderedPartnerIds = id => allPartnerIds(state.people[id]).filter(partnerId => renderedPartnerPairs.has(partnerRelationKey(id, partnerId)));",
    "  const renderedPartnerIds = id => scopedSpouseIds(state.people[id], scope).filter(partnerId => renderedPartnerPairs.has(partnerRelationKey(id, partnerId)));",
    "scoped rendered spouses",
)
app = replace_once(
    app,
    "  const people = Object.values(state.people).filter(person => visibleIds.has(person.id) && numericYear(person.birthYear) != null);",
    """  const datedVisibleDescendants = new Set([...descendantsOfRoot].filter(id =>
    visibleIds.has(id) && numericYear(state.people[id]?.birthYear) != null
  ));
  const people = Object.values(state.people).filter(person => {
    if (!visibleIds.has(person.id) || numericYear(person.birthYear) == null) return false;
    if (descendantsOfRoot.has(person.id)) return true;
    return scopedSpouseIds(person, scope).some(partnerId =>
      datedVisibleDescendants.has(partnerId)
      && renderedPartnerPairs.has(partnerRelationKey(person.id, partnerId))
    );
  });""",
    "dated active-tree people",
)

marker_start = app.find("    // An affinal profile can have another recorded marriage")
marker_end = app.find("    const childrenShownAtAnotherOccurrence", marker_start)
if marker_start < 0 or marker_end < 0:
    raise RuntimeError("outside-marriage marker block not found")
marker_block = app[marker_start:marker_end]
marker_block = marker_block.replace(
    "    // An affinal profile can have another recorded marriage whose other\n"
    "    // person is outside this tree. Keep its dated fact visible without drawing\n"
    "    // a connector to a profile that is not present.\n",
    "    // Keep marriage markers inside the root's descendant scope. A spouse's\n"
    "    // other family belongs to a different descendant-tree view.\n",
)
marker_block = marker_block.replace("      allPartnerIds(person).forEach(partnerId => {", "      scopedSpouseIds(person, scope).forEach(partnerId => {")
app = app[:marker_start] + marker_block + app[marker_end:]

relationship_start = app.find("function renderRelationshipHouseholds(person) {")
relationship_end = app.find("\nfunction renderDetails() {", relationship_start)
if relationship_start < 0 or relationship_end < 0:
    raise RuntimeError("relationship household function not found")
relationship = app[relationship_start:relationship_end]
relationship = replace_once(
    relationship,
    "  const container = els['relationship-households'];\n  if (!person) { container.replaceChildren(); return; }\n  const visibility = buildTimelineVisibility();",
    "  const container = els['relationship-households'];\n  const scope = activeDescendantScope();\n  if (!person || !scope.allowedIds.has(person.id)) { container.replaceChildren(); return; }\n  const visibility = buildTimelineVisibility();",
    "relationship scope setup",
)
relationship = replace_once(relationship, "  const partnerIds = allPartnerIds(person).sort", "  const partnerIds = scopedSpouseIds(person, scope).sort", "relationship spouse list")
relationship = replace_once(relationship, "householdChildren(person.id, firstId).map", "scopedHouseholdChildren(person.id, firstId, scope).map", "first spouse child year")
relationship = replace_once(relationship, "householdChildren(person.id, secondId).map", "scopedHouseholdChildren(person.id, secondId, scope).map", "second spouse child year")
relationship = replace_once(relationship, "    const children = householdChildren(person.id, partnerId).sort(byBirth);", "    const children = scopedHouseholdChildren(person.id, partnerId, scope).sort(byBirth);", "relationship household children")
relationship = replace_once(
    relationship,
    "  const ungroupedChildren = person.children.filter(id => state.people[id] && !assignedChildren.has(id)).sort(byBirth);",
    "  const ungroupedChildren = person.children.filter(id => scope.descendantIds.has(id) && state.people[id] && !assignedChildren.has(id)).sort(byBirth);",
    "scoped ungrouped children",
)
relationship = replace_once(
    relationship,
    "  const parentIds = person.parents.filter(id => state.people[id]).sort(byBirth);",
    "  const parentIds = person.parents.filter(id => scope.allowedIds.has(id) && state.people[id]).sort(byBirth);",
    "scoped parents",
)
relationship = replace_once(
    relationship,
    "        .filter(parentId => state.people[parentId])",
    "        .filter(parentId => scope.allowedIds.has(parentId) && state.people[parentId])",
    "scoped child relation keys",
)
app = app[:relationship_start] + relationship + app[relationship_end:]

render_details_start = app.find("function renderDetails() {")
render_details_end = app.find("\nfunction renderParentOptions() {", render_details_start)
if render_details_start < 0 or render_details_end < 0:
    raise RuntimeError("renderDetails function not found")
render_details = app[render_details_start:render_details_end]
render_details = replace_once(
    render_details,
    "function renderDetails() {\n  const person = state.people[state.selectedId];",
    "function renderDetails() {\n  const scope = activeDescendantScope();\n  const person = scope.allowedIds.has(state.selectedId) ? state.people[state.selectedId] : null;\n  if (!person && state.selectedId) { state.selectedId = ''; state.editingProfileId = ''; }",
    "scoped detail panel",
)
app = app[:render_details_start] + render_details + app[render_details_end:]

new_parent_options = '''function renderParentOptions() {
  const scope = activeDescendantScope();
  const people = [...scope.allowedIds].map(id => state.people[id]).filter(Boolean)
    .sort((a, b) => visibleName(a).localeCompare(visibleName(b)));
  const options = ['<option value="">No profile selected</option>', ...people.map(person => `<option value="${escapeHtml(person.id)}">${escapeHtml(visibleName(person))}</option>`)].join('');
  els['parent-select'].innerHTML = options;
}
'''
app = replace_between(app, "function renderParentOptions() {", "\nfunction renderTreeTabs() {", new_parent_options, "parent options")

person_list_start = app.find("function renderPersonList() {")
person_list_end = app.find("\nfunction updateEventColorPalette", person_list_start)
if person_list_start < 0 or person_list_end < 0:
    raise RuntimeError("renderPersonList function not found")
person_list = app[person_list_start:person_list_end]
person_list = replace_once(
    person_list,
    "  const keywords = clean(els['tree-filter'].value).toLocaleLowerCase().split(/\\s+/).filter(Boolean);\n  const people = Object.values(state.people).filter(person => !keywords.length || keywords.some(keyword => matchesKeyword(person, keyword)));",
    "  const scope = activeDescendantScope();\n  const keywords = clean(els['tree-filter'].value).toLocaleLowerCase().split(/\\s+/).filter(Boolean);\n  const people = [...scope.allowedIds].map(id => state.people[id]).filter(Boolean)\n    .filter(person => !keywords.length || keywords.some(keyword => matchesKeyword(person, keyword)));",
    "scoped people list",
)
app = app[:person_list_start] + person_list + app[person_list_end:]

app = replace_once(
    app,
    "function selectPerson(id, { center = false } = {}) {\n  if (els['events-dialog'].open) els['events-dialog'].close();",
    "function selectPerson(id, { center = false } = {}) {\n  if (!activeDescendantScope().allowedIds.has(id)) return;\n  if (els['events-dialog'].open) els['events-dialog'].close();",
    "selection scope guard",
)
app = replace_once(
    app,
    "function render() {\n  const count = Object.keys(state.people).length;",
    "function render() {\n  const count = activeDescendantScope().allowedIds.size;",
    "scoped render count",
)

app_path.write_text(app, encoding="utf-8")

index_path = Path("index.html")
index = index_path.read_text(encoding="utf-8")
index = replace_once(index, '<script type="module" src="./app.js?v=114"></script>', '<script type="module" src="./app.js?v=115"></script>', "app cache version")
index_path.write_text(index, encoding="utf-8")
