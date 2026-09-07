from __future__ import annotations

import json
import re
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:140]!r}")
    file_path.write_text(text.replace(old, new, 1))


# Search results are profile-openers only. Changing the root belongs to the
# monochrome tree action in the selected profile's side panel.
app_path = Path("app.js")
app = app_path.read_text()

focus_helper = """    const focusFromResult = () => focusTreeOn(person.id, {
      clearSearch: true,
      centerIfHidden: !inCurrentScope
    });
"""
if app.count(focus_helper) != 1:
    raise SystemExit(f"Expected one search focus helper, found {app.count(focus_helper)}")
app = app.replace(focus_helper, "", 1)

search_action_pattern = re.compile(
    r"\n    if \(searching\) \{\n"
    r"      const focus = document\.createElement\('button'\);.*?"
    r"      row\.append\(focus\);\n"
    r"    \}\n",
    re.DOTALL,
)
app, count = search_action_pattern.subn("\n", app, count=1)
if count != 1:
    raise SystemExit(f"Expected one inline search tree-action block, found {count}")

old_listener = "els['focus-tree-button'].addEventListener('click', () => focusTreeOn(state.selectedId));"
new_listener = "els['focus-tree-button'].addEventListener('click', () => focusTreeOn(state.selectedId, { clearSearch: true, centerIfHidden: true }));"
if app.count(old_listener) != 1:
    raise SystemExit(f"Expected one side-panel tree listener, found {app.count(old_listener)}")
app = app.replace(old_listener, new_listener, 1)

# Versioned starter-name repairs update only exact legacy labels. Arbitrary
# local edits remain untouched.
map_anchor = """  const revisedImperialNamePeriods = {
    [canonicalGeniProfileId('6000000001651648070')]: ['edward-vii-name-1901', 'Edward VII, King of the United Kingdom'],
    [canonicalGeniProfileId('6000000000701511040')]: ['george-v-name-1910', 'George V, King of the United Kingdom'],
    [canonicalGeniProfileId('5031922362950130285')]: ['edward-viii-name-1936', 'Edward VIII, King of the United Kingdom'],
    [canonicalGeniProfileId('6000000001217955606')]: ['george-vi-name-1936', 'George VI, King of the United Kingdom']
  };
"""
map_replacement = map_anchor + """  const revisedStarterDisplayNames = {
    [canonicalGeniProfileId('6000000003409427757')]: ['Arthur Tudor'],
    [canonicalGeniProfileId('6000000000307240333')]: ['Adolphus of Cambridge', 'Prince Adolphus of Cambridge', 'Adolphus Frederick of Cambridge'],
    [canonicalGeniProfileId('4087038607800049893')]: ['Edward of Kent', 'Prince Edward of Kent'],
    [canonicalGeniProfileId('6000000001260403655')]: ['Augusta of Cambridge', 'Princess Augusta of Cambridge'],
    [canonicalGeniProfileId('6000000003245250586')]: ['Mary Adelaide of Cambridge', 'Princess Mary Adelaide of Cambridge'],
    [canonicalGeniProfileId('6000000001543481636')]: ['Francis of Teck', 'Prince Francis of Teck']
  };
"""
if app.count(map_anchor) != 1:
    raise SystemExit(f"Expected one starter-name migration anchor, found {app.count(map_anchor)}")
app = app.replace(map_anchor, map_replacement, 1)

migration_anchor = """    if (saved.starterProfile && (saved.displayName === oldGeneratedName || wasReducedBySparseGeniRefresh) && bundled.displayName !== saved.displayName) {
      merged.displayName = bundled.displayName;
    }
"""
migration_replacement = migration_anchor + """    const staleStarterNames = revisedStarterDisplayNames[id] || [];
    if (saved.starterProfile && staleStarterNames.includes(saved.displayName)) {
      merged.displayName = bundled.displayName;
      merged.title = bundled.title;
      merged.namePeriods = normalizeNamePeriods([
        ...bundled.namePeriods,
        ...(saved.namePeriods || []).filter(period => period.source === 'local')
      ]);
      merged.defaultNamePeriodId = bundled.defaultNamePeriodId;
    }
"""
if app.count(migration_anchor) != 1:
    raise SystemExit(f"Expected one starter display-name migration block, found {app.count(migration_anchor)}")
app = app.replace(migration_anchor, migration_replacement, 1)
app_path.write_text(app)

# The sole visible correction needed in the current 127-profile catalogue is
# Arthur. Other territorial forms such as Catherine of Aragon or Anne of
# Denmark are names, while titled peers already use “Name, Title”. Adolphus is
# already correct in the bundle; the version bump activates the stale-cache
# repair above for existing local copies.
data_path = Path("data/british-royal-line.json")
data = json.loads(data_path.read_text())
data["version"] = max(25, int(data.get("version") or 0))
arthur = data["people"]["profile-g6000000003409427757"]
arthur["displayName"] = "Arthur, Prince of Wales"
arthur["title"] = "Prince of Wales"
arthur["note"] = "Prince of Wales; eldest son of Henry VII"
arthur["namePeriods"] = [
    {
        "id": "arthur-wales-name-1486",
        "name": "Arthur Tudor",
        "startYear": 1486,
        "endYear": 1489,
        "sourceUrl": "https://www.npg.org.uk/collections/search/person/mp15191/arthur-prince-of-wales",
    },
    {
        "id": "arthur-wales-name-1489",
        "name": "Arthur, Prince of Wales",
        "startYear": 1489,
        "endYear": 1502,
        "sourceUrl": "https://www.npg.org.uk/collections/search/person/mp15191/arthur-prince-of-wales",
    },
]
arthur["defaultNamePeriodId"] = "arthur-wales-name-1489"
data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

# Restore full-width search result rows now that they have no trailing action.
styles_path = Path("styles.css")
styles = styles_path.read_text()
search_styles_pattern = re.compile(
    r"\.person-list-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto; align-items: center; border-radius: 8px; \}\n"
    r"\.person-list-row:hover, \.person-list-row:focus-within, \.person-list-row\.active \{ background: var\(--green-pale\); \}\n"
    r"\.person-list-row \.person-list-item \{ min-width: 0; background: transparent; \}\n"
    r"\.person-list-row \.person-list-item:hover, \.person-list-row \.person-list-item\.active \{ background: transparent; \}\n"
    r"\.person-list-row\.search-result \.person-list-item \{ border-radius: 8px 0 0 8px; \}\n"
    r"\.person-list-focus \{.*?\n"
    r"\.person-list-focus:disabled \{ cursor: default; opacity: \.68; \}\n",
    re.DOTALL,
)
search_styles_replacement = """.person-list-row { display: block; border-radius: 8px; }
.person-list-row:hover, .person-list-row:focus-within, .person-list-row.active { background: var(--green-pale); }
.person-list-row .person-list-item { min-width: 0; background: transparent; }
.person-list-row .person-list-item:hover, .person-list-row .person-list-item.active { background: transparent; }
"""
styles, count = search_styles_pattern.subn(search_styles_replacement, styles, count=1)
if count != 1:
    raise SystemExit(f"Expected one search-result action style block, found {count}")
styles_path.write_text(styles)

# Cache bust the changed app, styles, and starter data loading path.
replace_once("index.html", '<link rel="stylesheet" href="./styles.css?v=77">', '<link rel="stylesheet" href="./styles.css?v=78">')
replace_once("index.html", '<script type="module" src="./app.js?v=139"></script>', '<script type="module" src="./app.js?v=140"></script>')

Path("tests/search-focus.test.mjs").write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('an active search queries every profile stored in the tree tab', () => {
  assert.match(app, /const candidateIds = searching \? Object\.keys\(state\.people\) : \[\.\.\.scope\.allowedIds\]/);
  assert.match(app, /Outside current tree/);
  assert.match(html, /placeholder="Search all stored people"/);
});

test('search results open profiles without exposing a tree action', () => {
  assert.doesNotMatch(app, /person-list-focus/);
  assert.doesNotMatch(app, /focusFromResult/);
  assert.doesNotMatch(styles, /\.person-list-focus/);
  assert.match(app, /button\.addEventListener\('click', \(\) => \{[\s\S]*?selectPerson\(person\.id/);
});

test('clicking a hidden result opens its side panel without changing the tree', () => {
  assert.match(app, /function selectPerson\(id, \{ center = false, allowOutsideScope = false \} = \{\}\)/);
  assert.match(app, /else selectPerson\(person\.id, \{ allowOutsideScope: true \}\);/);
  assert.match(app, /const person = state\.people\[state\.selectedId\] \|\| null/);
});

test('the side-panel tree action clears search and centers a hidden selected profile', () => {
  assert.match(app, /async function focusTreeOn\(personId\) \{\s*const \{ clearSearch = false, centerIfHidden = false \} = arguments\[1\] \|\| \{\};/);
  assert.match(app, /els\['focus-tree-button'\]\.addEventListener\('click', \(\) => focusTreeOn\(state\.selectedId, \{ clearSearch: true, centerIfHidden: true \}\)\);/);
  assert.match(app, /if \(clearSearch\) \{[\s\S]*?state\.treeFilter = '';[\s\S]*?els\['tree-filter'\]\.value = '';/);
  assert.match(app, /else if \(centerIfHidden\) \{\s*centerTimelinePerson\(id\);/);
});
""")

Path("tests/royal-name-style.test.mjs").write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const people = data.people;
const defaultName = person => person.namePeriods.find(period => period.id === person.defaultNamePeriodId)?.name || person.displayName;

test('the bundled title holders use the Name, Title style', () => {
  assert.ok(data.version >= 25);
  const expectations = new Map([
    ['profile-g6000000003409427757', 'Arthur, Prince of Wales'],
    ['profile-g6000000000307240333', 'Adolphus, Duke of Cambridge'],
    ['profile-g4087038607800049893', 'Edward, Duke of Kent'],
    ['profile-g6000000001260403655', 'Augusta, Duchess of Cambridge'],
    ['profile-g6000000003245250586', 'Mary Adelaide, Duchess of Teck'],
    ['profile-g6000000001543481636', 'Francis, Duke of Teck']
  ]);
  expectations.forEach((expected, id) => assert.equal(defaultName(people[id]), expected, id));
  assert.equal(people['profile-g6000000003409427757'].title, 'Prince of Wales');
});

test('the starter upgrade repairs exact stale territorial labels without touching arbitrary local names', () => {
  assert.match(app, /const revisedStarterDisplayNames = \{/);
  assert.match(app, /'Adolphus of Cambridge'/);
  assert.match(app, /'Arthur Tudor'/);
  assert.match(app, /staleStarterNames\.includes\(saved\.displayName\)/);
  assert.match(app, /period\.source === 'local'/);
});
""")
