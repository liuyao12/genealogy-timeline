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

old_helpers = """function scopedSpouseIds(person, scope = activeDescendantScope()) {
  return [...(scope.spouseIdsByPerson.get(person?.id) || [])].filter(id => state.people[id]);
}
function scopedHouseholdChildren(personId, partnerId = '', scope = activeDescendantScope()) {
  return householdChildren(personId, partnerId).filter(childId => scope.descendantIds.has(childId));
}
"""
new_helpers = """function scopedSpouseIds(person, scope = activeDescendantScope()) {
  return [...(scope.spouseIdsByPerson.get(person?.id) || [])].filter(id => state.people[id]);
}
function scopedChildIds(personId, scope = activeDescendantScope()) {
  return [...(scope.childrenByParent.get(personId) || [])]
    .filter(id => scope.descendantIds.has(id) && state.people[id]);
}
function scopedParentIds(childId, scope = activeDescendantScope()) {
  return [...(scope.parentsByChild.get(childId) || [])]
    .filter(id => scope.allowedIds.has(id) && state.people[id]);
}
function scopedHouseholdChildren(personId, partnerId = '', scope = activeDescendantScope()) {
  const person = state.people[personId];
  if (!person) return [];
  const formalSpouses = new Set(scopedSpouseIds(person, scope));
  return scopedChildIds(personId, scope).filter(childId => {
    const parentIds = scopedParentIds(childId, scope);
    if (!partnerId) return !parentIds.some(parentId => parentId !== personId && formalSpouses.has(parentId));
    return parentIds.includes(partnerId);
  });
}
"""
app = replace_once(app, old_helpers, new_helpers, "scope relation helpers")

build_start = app.find("function buildTimelineVisibility() {")
build_end = app.find("\nfunction svg(", build_start)
if build_start < 0 or build_end < 0:
    raise RuntimeError("buildTimelineVisibility block not found")
build = app[build_start:build_end]
build = replace_once(
    build,
    "    const parentIds = state.people[childId]?.parents || [];",
    "    const parentIds = scopedParentIds(childId, scope);",
    "visibility repaired parent IDs",
)
build = replace_once(
    build,
    "    state.people[id].children.forEach(childId => {",
    "    scopedChildIds(id, scope).forEach(childId => {",
    "visibility descendant traversal",
)
build = replace_once(
    build,
    "      child.parents.forEach(parentId => {",
    "      scopedParentIds(childId, scope).forEach(parentId => {",
    "visibility ancestor path",
)
build = replace_once(
    build,
    "        (state.people[id]?.children || []).forEach(nextId => {",
    "        scopedChildIds(id, scope).forEach(nextId => {",
    "visibility hidden subtree",
)
app = app[:build_start] + build + app[build_end:]

render_start = app.find("function renderTimeline() {")
render_end = app.find("\nfunction escapeHtml(", render_start)
if render_start < 0 or render_end < 0:
    raise RuntimeError("renderTimeline block not found")
render = app[render_start:render_end]
render = replace_once(
    render,
    "    state.people[id].children.forEach(childId => {",
    "    scopedChildIds(id, scope).forEach(childId => {",
    "active lineage traversal",
)
render = replace_once(
    render,
    "  people.forEach(person => person.parents.forEach(parentId => {",
    "  people.forEach(person => scopedParentIds(person.id, scope).forEach(parentId => {",
    "layout parent index",
)
render = replace_once(
    render,
    "  const lineageRoots = people.filter(person => activeLineageIds.has(person.id)\n    && !person.parents.some(id => datedIds.has(id) && activeLineageIds.has(id)));\n  const roots = (lineageRoots.length ? lineageRoots : people.filter(person => !person.parents.some(id => datedIds.has(id))))",
    "  const lineageRoots = people.filter(person => activeLineageIds.has(person.id)\n    && !scopedParentIds(person.id, scope).some(id => datedIds.has(id) && activeLineageIds.has(id)));\n  const roots = (lineageRoots.length ? lineageRoots : people.filter(person => !scopedParentIds(person.id, scope).some(id => datedIds.has(id))))",
    "layout roots",
)
render = replace_once(
    render,
    "      const otherParent = state.people[childId]?.parents.find(parentId => parentId !== id && datedIds.has(parentId) && renderedPartnerPairs.has(partnerRelationKey(id, parentId))) || '';",
    "      const otherParent = scopedParentIds(childId, scope).find(parentId => parentId !== id && datedIds.has(parentId) && renderedPartnerPairs.has(partnerRelationKey(id, parentId))) || '';",
    "household co-parent",
)
render = replace_once(
    render,
    "    let parentIds = child.parents.filter(id => datedIds.has(id) && childEdgeVisible(id, child.id) && !state.collapsedIds.has(id));",
    "    let parentIds = scopedParentIds(child.id, scope).filter(id => datedIds.has(id) && childEdgeVisible(id, child.id) && !state.collapsedIds.has(id));",
    "family parent IDs",
)
render = replace_once(
    render,
    "    const hasControlHere = state.people[id]?.children.some(childId =>\n      !childrenShownAtAnotherOccurrence.has(childId) && expandableIds.has(childId) && childEdgeVisible(id, childId)\n    );",
    "    const hasControlHere = scopedChildIds(id, scope).some(childId =>\n      !childrenShownAtAnotherOccurrence.has(childId) && expandableIds.has(childId) && childEdgeVisible(id, childId)\n    );",
    "incoming connector control",
)
render = replace_once(
    render,
    "    const hasChildren = person.children.some(childId =>\n      !childrenShownAtAnotherOccurrence.has(childId) && expandableIds.has(childId) && childEdgeVisible(id, childId)\n    );",
    "    const hasChildren = scopedChildIds(id, scope).some(childId =>\n      !childrenShownAtAnotherOccurrence.has(childId) && expandableIds.has(childId) && childEdgeVisible(id, childId)\n    );",
    "node child control",
)
app = app[:render_start] + render + app[render_end:]

relationship_start = app.find("function renderRelationshipHouseholds(person) {")
relationship_end = app.find("\nfunction renderDetails() {", relationship_start)
if relationship_start < 0 or relationship_end < 0:
    raise RuntimeError("renderRelationshipHouseholds block not found")
relationship = app[relationship_start:relationship_end]
relationship = replace_once(
    relationship,
    "  const ungroupedChildren = person.children.filter(id => scope.descendantIds.has(id) && state.people[id] && !assignedChildren.has(id)).sort(byBirth);",
    "  const ungroupedChildren = scopedChildIds(person.id, scope).filter(id => !assignedChildren.has(id)).sort(byBirth);",
    "relationship ungrouped children",
)
relationship = replace_once(
    relationship,
    "  const parentIds = person.parents.filter(id => scope.allowedIds.has(id) && state.people[id]).sort(byBirth);",
    "  const parentIds = scopedParentIds(person.id, scope).sort(byBirth);",
    "relationship parents",
)
relationship = replace_once(
    relationship,
    "      const childRelationKeys = state.people[childId].parents\n        .filter(parentId => scope.allowedIds.has(parentId) && state.people[parentId])\n        .map(parentId => childRelationKey(parentId, childId));",
    "      const childRelationKeys = scopedParentIds(childId, scope)\n        .map(parentId => childRelationKey(parentId, childId));",
    "relationship child parent keys",
)
app = app[:relationship_start] + relationship + app[relationship_end:]

app_path.write_text(app, encoding="utf-8")

index_path = Path("index.html")
index = index_path.read_text(encoding="utf-8")
index = replace_once(index, '<script type="module" src="./app.js?v=115"></script>', '<script type="module" src="./app.js?v=116"></script>', "app cache version")
index_path.write_text(index, encoding="utf-8")
