from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


app_path = Path("app.js")
app = app_path.read_text()
app = app.replace(
    "async function focusTreeOn(personId) {",
    "async function focusTreeOn(personId, { clearSearch = false, centerIfHidden = false } = {}) {",
    1,
)

old = """  const applyFocus = () => {
    applied = true;
    state.rootId = id;
    state.selectedId = id;
    state.editingProfileId = '';
    state.collapsedIds.clear();
    render();
"""
new = """  const applyFocus = () => {
    applied = true;
    state.rootId = id;
    state.selectedId = id;
    state.editingProfileId = '';
    state.collapsedIds.clear();
    if (clearSearch) {
      state.treeFilter = '';
      els['tree-filter'].value = '';
    }
    render();
"""
if app.count(old) != 1:
    raise SystemExit(f"Expected one focus application block, found {app.count(old)}")
app = app.replace(old, new, 1)

old = """    if (oldRect && newNode) {
      const newRect = newNode.getBoundingClientRect();
      viewport.scrollLeft += newRect.left - oldRect.left;
      viewport.scrollTop += newRect.top - oldRect.top;
    }
    persist(`Tree focused on ${fullName(state.people[id])}`);
"""
new = """    if (oldRect && newNode) {
      const newRect = newNode.getBoundingClientRect();
      viewport.scrollLeft += newRect.left - oldRect.left;
      viewport.scrollTop += newRect.top - oldRect.top;
    } else if (centerIfHidden) {
      centerTimelinePerson(id);
    }
    persist(`Tree focused on ${fullName(state.people[id])}`);
"""
if app.count(old) != 1:
    raise SystemExit(f"Expected one focus-position block, found {app.count(old)}")
app = app.replace(old, new, 1)

pattern = re.compile(
    r"function renderPersonList\(\) \{.*?\n\}\n\nfunction updateEventColorPalette",
    re.DOTALL,
)
replacement = r'''function renderPersonList() {
  clearTimelinePersonPreview();
  const scope = activeDescendantScope();
  const keywords = clean(els['tree-filter'].value).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const searching = keywords.length > 0;
  // With no query, this remains a concise list of the active focus tree. Once
  // the user searches, query every profile stored in this tree tab—including
  // ancestors, collateral relatives, and spouses currently outside the focus
  // projection—so any saved person can become the next point of view.
  const candidateIds = searching ? Object.keys(state.people) : [...scope.allowedIds];
  const people = candidateIds.map(id => state.people[id]).filter(Boolean)
    .filter(person => !searching || keywords.some(keyword => matchesKeyword(person, keyword)));
  people.sort((a, b) => visibleName(a).localeCompare(visibleName(b)));
  els['people-count'].textContent = people.length;
  els['people-label'].textContent = searching
    ? (people.length === 1 ? 'stored match' : 'stored matches')
    : (people.length === 1 ? 'profile' : 'profiles');

  const rows = people.map(person => {
    const inCurrentScope = scope.allowedIds.has(person.id);
    const row = document.createElement('div');
    row.className = `person-list-row${person.id === state.selectedId ? ' active' : ''}${searching ? ' search-result' : ''}${inCurrentScope ? '' : ' outside-focus-scope'}`;
    row.dataset.personId = person.id;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'person-list-item';
    button.dataset.gender = person.gender;
    button.dataset.personId = person.id;
    button.setAttribute('aria-label', inCurrentScope
      ? `Open ${visibleName(person)}`
      : `Focus tree on ${visibleName(person)}`);

    const gender = document.createElement('span');
    gender.className = 'person-gender';
    gender.setAttribute('role', 'img');
    gender.setAttribute('aria-label', person.gender === 'male' ? 'Male' : person.gender === 'female' ? 'Female' : 'Gender unknown');
    gender.textContent = person.gender === 'male' ? '♂' : person.gender === 'female' ? '♀' : '·';

    const summary = document.createElement('span');
    const name = document.createElement('strong');
    const displayedName = visibleName(person);
    appendHighlightedName(name, displayedName, keywords);
    const lifespan = document.createElement('small');
    lifespan.textContent = life(person);
    const matchedAlias = keywords.length && !keywords.some(keyword => displayedName.toLocaleLowerCase().includes(keyword))
      ? person.namePeriods.find(period => keywords.some(keyword => period.name.toLocaleLowerCase().includes(keyword)))
      : null;
    summary.append(name);
    if (matchedAlias) {
      const alias = document.createElement('small');
      alias.className = 'person-list-alias';
      alias.append(document.createTextNode('Also known as '));
      appendHighlightedName(alias, matchedAlias.name, keywords);
      summary.append(alias);
    }
    summary.append(lifespan);
    if (searching && !inCurrentScope) {
      const scopeNote = document.createElement('small');
      scopeNote.className = 'person-list-scope';
      scopeNote.textContent = 'Outside current focus tree';
      summary.append(scopeNote);
    }
    button.append(gender, summary);

    const focusFromResult = () => focusTreeOn(person.id, {
      clearSearch: true,
      centerIfHidden: !inCurrentScope
    });
    if (inCurrentScope) {
      button.addEventListener('pointerenter', () => previewTimelinePerson(person.id));
      button.addEventListener('pointerleave', () => clearTimelinePersonPreview(person.id));
      button.addEventListener('focus', () => previewTimelinePerson(person.id));
      button.addEventListener('blur', () => clearTimelinePersonPreview(person.id));
    }
    button.addEventListener('click', () => {
      if (inCurrentScope) selectPerson(person.id, { center: true });
      else focusFromResult();
    });
    row.append(button);

    if (searching) {
      const focus = document.createElement('button');
      focus.type = 'button';
      focus.className = 'person-list-focus';
      focus.dataset.focusPersonId = person.id;
      if (person.id === state.rootId) {
        focus.textContent = 'Focused';
        focus.disabled = true;
        focus.setAttribute('aria-label', `${displayedName} is the current tree focus`);
      } else {
        focus.textContent = 'Focus';
        focus.setAttribute('aria-label', `Focus tree on ${displayedName}`);
        focus.title = `Show ${displayedName}'s paternal households and descendants`;
        focus.addEventListener('click', focusFromResult);
      }
      row.append(focus);
    }
    return row;
  });

  if (!rows.length && searching) {
    const empty = document.createElement('p');
    empty.className = 'people-search-empty';
    empty.textContent = 'No stored profiles match this search.';
    rows.push(empty);
  }
  els['people-list'].replaceChildren(...rows);
}

function updateEventColorPalette'''
app, count = pattern.subn(replacement, app, count=1)
if count != 1:
    raise SystemExit(f"Expected one renderPersonList function, found {count}")
app_path.write_text(app)

replace_once(
    "index.html",
    '<input id="tree-filter" type="search" placeholder="Filter names or titles · e.g. king queen">',
    '<input id="tree-filter" type="search" placeholder="Search all stored people" aria-label="Search all stored people">',
)
replace_once(
    "index.html",
    '<link rel="stylesheet" href="./styles.css?v=74">',
    '<link rel="stylesheet" href="./styles.css?v=75">',
)
replace_once(
    "index.html",
    '<script type="module" src="./app.js?v=134"></script>',
    '<script type="module" src="./app.js?v=135"></script>',
)

styles_path = Path("styles.css")
styles = styles_path.read_text()
anchor = ".person-list-item small { display: block; margin-top: 3px; color: var(--muted); font-size: 10px; }\n"
addition = r'''.person-list-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; border-radius: 8px; }
.person-list-row:hover, .person-list-row:focus-within, .person-list-row.active { background: var(--green-pale); }
.person-list-row .person-list-item { min-width: 0; background: transparent; }
.person-list-row .person-list-item:hover, .person-list-row .person-list-item.active { background: transparent; }
.person-list-row.search-result .person-list-item { border-radius: 8px 0 0 8px; }
.person-list-focus {
  min-width: 43px; height: 25px; margin-right: 5px; padding: 0 7px; border: 1px solid #999;
  border-radius: 6px; background: #fff; color: #111; font-size: 9px; font-weight: 700; cursor: pointer;
}
.person-list-row.outside-focus-scope .person-list-focus { border-color: #000; background: #000; color: #fff; }
.person-list-focus:hover:not(:disabled) { transform: translateY(-1px); }
.person-list-focus:focus-visible { outline: 2px solid #000; outline-offset: 2px; }
.person-list-focus:disabled { border-color: #ccc; background: transparent; color: #777; cursor: default; }
.person-list-scope { color: #333 !important; font-weight: 650; }
.people-search-empty { margin: 12px 6px; color: var(--muted); font-size: 10px; line-height: 1.45; }
'''
if styles.count(anchor) != 1:
    raise SystemExit(f"Expected one person-list style anchor, found {styles.count(anchor)}")
styles_path.write_text(styles.replace(anchor, anchor + addition, 1))

Path("tests/search-focus.test.mjs").write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('an active search queries every profile stored in the tree tab', () => {
  assert.match(app, /const candidateIds = searching \? Object\.keys\(state\.people\) : \[\.\.\.scope\.allowedIds\]/);
  assert.match(app, /Outside current focus tree/);
  assert.match(html, /placeholder="Search all stored people"/);
});

test('search results expose a direct focus action', () => {
  assert.match(app, /focus\.className = 'person-list-focus'/);
  assert.match(app, /focus\.dataset\.focusPersonId = person\.id/);
  assert.match(app, /focusTreeOn\(person\.id, \{[\s\S]*?clearSearch: true,[\s\S]*?centerIfHidden: !inCurrentScope/);
  assert.match(styles, /\.person-list-focus/);
  assert.match(styles, /\.outside-focus-scope \.person-list-focus/);
});

test('focusing a hidden search result clears the query and centers its new tree', () => {
  assert.match(app, /async function focusTreeOn\(personId, \{ clearSearch = false, centerIfHidden = false \} = \{\}\)/);
  assert.match(app, /if \(clearSearch\) \{[\s\S]*?state\.treeFilter = '';[\s\S]*?els\['tree-filter'\]\.value = '';/);
  assert.match(app, /else if \(centerIfHidden\) \{\s*centerTimelinePerson\(id\);/);
});
''')
