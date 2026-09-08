from pathlib import Path


APP = Path('app.js')
TEST = Path('tests/side-panel-immediate-family.test.mjs')


def replace_once(text: str, old: str, new: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, found {count}: {old[:180]!r}')
    return text.replace(old, new, 1)


text = APP.read_text(encoding='utf-8')

# The side panel is an inspector of the selected profile, not a second view of
# the currently focused descendant scope. Keep the scope only for calculating
# which rows are presently visible on the timeline; build the rows themselves
# from every relationship already stored on the profile.
text = replace_once(
    text,
    "const partnerIds = scopedSpouseIds(person, scope).sort((firstId, secondId) => {",
    "const partnerIds = allPartnerIds(person).sort((firstId, secondId) => {",
)
text = replace_once(
    text,
    "const firstChildYear = Math.min(...scopedHouseholdChildren(person.id, firstId, scope).map(id => numericYear(state.people[id]?.birthYear) ?? 9999), 9999);",
    "const firstChildYear = Math.min(...householdChildren(person.id, firstId).map(id => numericYear(state.people[id]?.birthYear) ?? 9999), 9999);",
)
text = replace_once(
    text,
    "const secondChildYear = Math.min(...scopedHouseholdChildren(person.id, secondId, scope).map(id => numericYear(state.people[id]?.birthYear) ?? 9999), 9999);",
    "const secondChildYear = Math.min(...householdChildren(person.id, secondId).map(id => numericYear(state.people[id]?.birthYear) ?? 9999), 9999);",
)
text = replace_once(
    text,
    "const children = scopedHouseholdChildren(person.id, partnerId, scope).sort(byBirth);",
    "const children = householdChildren(person.id, partnerId).sort(byBirth);",
)
text = replace_once(
    text,
    "const ungroupedChildren = scopedChildIds(person.id, scope).filter(id => !assignedChildren.has(id)).sort(byBirth);",
    "const ungroupedChildren = unique(person.children).filter(id => state.people[id] && !assignedChildren.has(id)).sort(byBirth);",
)
text = replace_once(
    text,
    "const parentIds = scopedParentIds(person.id, scope).sort(byBirth);",
    "const parentIds = unique(person.parents).filter(id => state.people[id]).sort(byBirth);",
)
text = replace_once(
    text,
    "const childRelationKeys = scopedParentIds(childId, scope)\n        .map(parentId => childRelationKey(parentId, childId));",
    "const childRelationKeys = unique(state.people[childId]?.parents).filter(parentId => state.people[parentId])\n        .map(parentId => childRelationKey(parentId, childId));",
)

APP.write_text(text, encoding='utf-8')

TEST.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = app.indexOf('function renderRelationshipHouseholds(person) {');
const end = app.indexOf('\nfunction renderGeniFamily', start);
const section = app.slice(start, end > start ? end : app.length);

test('the side panel lists the selected profile complete stored immediate family', () => {
  assert.ok(start >= 0, 'relationship-household renderer should exist');
  assert.match(section, /const partnerIds = allPartnerIds\(person\)/);
  assert.match(section, /householdChildren\(person\.id, firstId\)/);
  assert.match(section, /householdChildren\(person\.id, secondId\)/);
  assert.match(section, /const children = householdChildren\(person\.id, partnerId\)/);
  assert.match(section, /const ungroupedChildren = unique\(person\.children\)/);
  assert.match(section, /const parentIds = unique\(person\.parents\)/);
  assert.match(section, /unique\(state\.people\[childId\]\?\.parents\)/);
  assert.doesNotMatch(section, /const partnerIds = scopedSpouseIds/);
  assert.doesNotMatch(section, /const children = scopedHouseholdChildren/);
  assert.doesNotMatch(section, /const ungroupedChildren = scopedChildIds/);
  assert.doesNotMatch(section, /const parentIds = scopedParentIds/);
});
""", encoding='utf-8')
