from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new), encoding='utf-8')


replace_once(
    'app.js',
    "  const returnedIds = unique(person.geniImmediateFamilyIds).filter(id => state.people[id]);\n  const outsideCount = returnedIds.filter(id => !scope.allowedIds.has(id)).length;",
    "  const returnedIds = unique(person.geniImmediateFamilyIds).filter(id => state.people[id]);\n  const linkedFamilyIds = new Set([...person.parents, ...person.children, ...allPartnerIds(person)]);\n  const needsRelationshipRepair = Boolean(\n    verifiedAt && returnedIds.length && !returnedIds.some(id => linkedFamilyIds.has(id))\n  );\n  const outsideCount = returnedIds.filter(id => !scope.allowedIds.has(id)).length;",
)

replace_once(
    'app.js',
    "  } else if (linked && verifiedAt) {\n    els['geni-family-heading'].textContent = 'Keep immediate family current';",
    "  } else if (linked && verifiedAt && needsRelationshipRepair) {\n    els['geni-family-heading'].textContent = 'Repair saved Geni family links';\n    els['geni-family-status'].textContent = 'An earlier import saved the profiles but not their union links. Refresh once to connect them and show them here.';\n    els['geni-family-badge'].textContent = 'Repair';\n  } else if (linked && verifiedAt) {\n    els['geni-family-heading'].textContent = 'Keep immediate family current';",
)

replace_once(
    'app.js',
    "  els['geni-family-primary'].textContent = importingThisProfile\n    ? 'Loading immediate family…'\n    : verifiedAt\n      ? (state.geniAccessToken ? 'Refresh immediate family from Geni' : 'Authorize Geni & refresh family')\n      : (state.geniAccessToken ? 'Load immediate family from Geni' : 'Authorize Geni & load family');",
    "  els['geni-family-primary'].textContent = importingThisProfile\n    ? 'Loading immediate family…'\n    : needsRelationshipRepair\n      ? (state.geniAccessToken ? 'Repair family links from Geni' : 'Authorize Geni & repair family links')\n      : verifiedAt\n        ? (state.geniAccessToken ? 'Refresh immediate family from Geni' : 'Authorize Geni & refresh family')\n        : (state.geniAccessToken ? 'Load immediate family from Geni' : 'Authorize Geni & load family');",
)

replace_once(
    'app.js',
    "  const manualNeedsGeniCheck = linked && !verifiedAt;",
    "  const manualNeedsGeniCheck = linked && (!verifiedAt || needsRelationshipRepair);",
)

replace_once('index.html', './app.js?v=127', './app.js?v=128')

path = Path('tests/geni-sidepanel-family.test.mjs')
text = path.read_text(encoding='utf-8')
addition = """

test('a previously saved profile set with no family links surfaces a repair action', () => {
  const body = functionSource(
    'function renderGeniFamilyActions(person, scope)',
    'function renderDetails()'
  );
  assert.match(body, /needsRelationshipRepair/);
  assert.match(body, /Repair saved Geni family links/);
  assert.match(body, /Repair family links from Geni/);
  assert.match(body, /linked && \(!verifiedAt \|\| needsRelationshipRepair\)/);
});
"""
if "a previously saved profile set with no family links surfaces a repair action" in text:
    raise SystemExit('repair regression test already exists')
path.write_text(text + addition, encoding='utf-8')
