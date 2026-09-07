from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:160]!r}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    'app.js',
    "const SVG_NS = 'http://www.w3.org/2000/svg';\n",
    "const SVG_NS = 'http://www.w3.org/2000/svg';\nconst TREE_ACTION_SYMBOL = '🌳';\n",
)
replace_once(
    'app.js',
    """function selectPerson(id, { center = false } = {}) {
  if (!activeDescendantScope().allowedIds.has(id)) return;
  if (els['events-dialog'].open) els['events-dialog'].close();
  state.selectedId = id;
  state.editingProfileId = '';
  render();
  els['detail-sidebar'].scrollTop = 0;
  if (center) centerTimelinePerson(id);
}
""",
    """function selectPerson(id, { center = false, allowOutsideScope = false } = {}) {
  const inCurrentScope = activeDescendantScope().allowedIds.has(id);
  if (!inCurrentScope && !allowOutsideScope) return;
  if (!state.people[id]) return;
  if (els['events-dialog'].open) els['events-dialog'].close();
  state.selectedId = id;
  state.editingProfileId = '';
  render();
  els['detail-sidebar'].scrollTop = 0;
  if (center && inCurrentScope) centerTimelinePerson(id);
}
""",
)
replace_once(
    'app.js',
    """    button.setAttribute('aria-label', inCurrentScope
      ? `Open ${visibleName(person)}`
      : `Focus tree on ${visibleName(person)}`);
""",
    """    button.setAttribute('aria-label', `Open ${visibleName(person)}`);
""",
)
replace_once('app.js', "scopeNote.textContent = 'Outside current focus tree';", "scopeNote.textContent = 'Outside current tree';")
replace_once(
    'app.js',
    """    button.addEventListener('click', () => {
      if (inCurrentScope) selectPerson(person.id, { center: true });
      else focusFromResult();
    });
""",
    """    button.addEventListener('click', () => {
      if (inCurrentScope) selectPerson(person.id, { center: true });
      else selectPerson(person.id, { allowOutsideScope: true });
    });
""",
)
replace_once(
    'app.js',
    """      if (person.id === state.rootId) {
        focus.textContent = 'Focused';
        focus.disabled = true;
        focus.setAttribute('aria-label', `${displayedName} is the current tree focus`);
      } else {
        focus.textContent = 'Focus';
        focus.setAttribute('aria-label', `Focus tree on ${displayedName}`);
        focus.title = `Show ${displayedName}'s paternal households and descendants`;
        focus.addEventListener('click', focusFromResult);
      }
""",
    """      const alreadyRoot = person.id === state.rootId;
      focus.textContent = TREE_ACTION_SYMBOL;
      focus.disabled = alreadyRoot;
      focus.setAttribute('aria-pressed', String(alreadyRoot));
      focus.title = alreadyRoot
        ? `${displayedName} is the current tree`
        : `Show ${displayedName}'s paternal households and descendants`;
      focus.setAttribute('aria-label', focus.title);
      if (!alreadyRoot) focus.addEventListener('click', focusFromResult);
""",
)
replace_once(
    'app.js',
    """function renderRelationshipHouseholds(person) {
  const container = els['relationship-households'];
  const scope = activeDescendantScope();
  if (!person || !scope.allowedIds.has(person.id)) { container.replaceChildren(); return; }
  const visibility = buildTimelineVisibility();
""",
    """function renderRelationshipHouseholds(person) {
  const container = els['relationship-households'];
  const activeScope = activeDescendantScope();
  if (!person) { container.replaceChildren(); return; }
  const inCurrentScope = activeScope.allowedIds.has(person.id);
  const scope = inCurrentScope ? activeScope : computeDescendantScope(state.people, person.id);
  const visibility = inCurrentScope
    ? buildTimelineVisibility()
    : { visibleIds: new Set(), renderedPartnerPairs: new Set(), childEdgeVisible: () => false };
""",
)
replace_once(
    'app.js',
    "  const makeRow = ({ targetId, kind, visible, label, detail, relationKeys = [], canToggle = true, toggleDisabled = false }) => {\n",
    "  const makeRow = ({ targetId, kind, visible, label, detail, relationKeys = [], canToggle = inCurrentScope, toggleDisabled = false }) => {\n",
)
replace_once(
    'app.js',
    """      const alreadyFocused = targetId === state.rootId;
      focus.textContent = alreadyFocused ? 'Focused' : 'Focus';
      focus.disabled = alreadyFocused || focusTreeTransitionRunning;
      focus.title = alreadyFocused
        ? `${label} is the current tree focus`
        : `Focus on ${label}: father’s line above, all descendants below`;
""",
    """      const alreadyFocused = targetId === state.rootId;
      focus.textContent = TREE_ACTION_SYMBOL;
      focus.disabled = alreadyFocused || focusTreeTransitionRunning;
      focus.setAttribute('aria-pressed', String(alreadyFocused));
      focus.title = alreadyFocused
        ? `${label} is the current tree`
        : `Show ${label}'s tree: father’s line above, all descendants below`;
""",
)
replace_once(
    'app.js',
    """function renderDetails() {
  const scope = activeDescendantScope();
  const person = scope.allowedIds.has(state.selectedId) ? state.people[state.selectedId] : null;
  if (!person && state.selectedId) { state.selectedId = ''; state.editingProfileId = ''; }
""",
    """function renderDetails() {
  const scope = activeDescendantScope();
  const person = state.people[state.selectedId] || null;
  if (!person && state.selectedId) { state.selectedId = ''; state.editingProfileId = ''; }
""",
)
replace_once(
    'app.js',
    """  els['focus-tree-button'].disabled = isTreeFocus || focusTreeTransitionRunning;
  els['focus-tree-button'].setAttribute('aria-pressed', String(isTreeFocus));
  els['focus-tree-button'].textContent = isTreeFocus ? 'Current tree focus' : 'Focus tree here';
""",
    """  els['focus-tree-button'].disabled = isTreeFocus || focusTreeTransitionRunning;
  els['focus-tree-button'].setAttribute('aria-pressed', String(isTreeFocus));
  els['focus-tree-button'].textContent = TREE_ACTION_SYMBOL;
  els['focus-tree-button'].title = isTreeFocus
    ? `${visibleName(person)} is the current tree`
    : `Show ${visibleName(person)}'s paternal households and descendants`;
  els['focus-tree-button'].setAttribute('aria-label', els['focus-tree-button'].title);
""",
)
replace_once('app.js', "  renderGeniFamilyActions(person, scope);\n", "  renderGeniFamilyActions(person, candidateFocusScope);\n")

styles_path = Path('styles.css')
styles = styles_path.read_text()
old = """.person-list-focus {
  min-width: 43px; height: 25px; margin-right: 5px; padding: 0 7px; border: 1px solid #999;
  border-radius: 6px; background: #fff; color: #111; font-size: 9px; font-weight: 700; cursor: pointer;
}
"""
new = """.person-list-focus {
  display: grid; place-items: center; width: 29px; min-width: 29px; height: 27px; margin-right: 5px; padding: 0;
  border: 1px solid #999; border-radius: 6px; background: #fff; color: #111;
  font: 14px/1 "Segoe UI Emoji", "Apple Color Emoji", sans-serif; cursor: pointer;
}
"""
if styles.count(old) != 1: raise SystemExit('person-list-focus CSS did not match once')
styles = styles.replace(old, new, 1)
styles = styles.replace(
    ".person-list-focus:disabled { border-color: #ccc; background: transparent; color: #777; cursor: default; }",
    ".person-list-focus[aria-pressed=\"true\"] { border-color: #111; background: #111; color: #fff; }\n.person-list-focus:disabled { cursor: default; opacity: .68; }",
    1,
)
styles = styles.replace(
    ".focus-tree-button { min-height: 31px; padding: 0 12px; font-size: 10px; }",
    ".focus-tree-button { display: grid; place-items: center; width: 36px; min-width: 36px; min-height: 34px; padding: 0; font: 17px/1 \"Segoe UI Emoji\", \"Apple Color Emoji\", sans-serif; }",
    1,
)
styles = styles.replace(
    ".relationship-focus { min-width: 42px; height: 25px; padding: 0 7px; border: 1px solid #999; border-radius: 6px; background: #fff; color: #111; cursor: pointer; font-size: 8px; font-weight: 700; }",
    ".relationship-focus { display: grid; place-items: center; width: 27px; min-width: 27px; height: 25px; padding: 0; border: 1px solid #999; border-radius: 6px; background: #fff; color: #111; cursor: pointer; font: 13px/1 \"Segoe UI Emoji\", \"Apple Color Emoji\", sans-serif; }",
    1,
)
styles = styles.replace(
    ".relationship-focus:disabled { border-color: #ccc; background: #f4f4f4; color: #999; cursor: default; }",
    ".relationship-focus[aria-pressed=\"true\"] { border-color: #111; background: #111; color: #fff; }\n.relationship-focus:disabled { cursor: default; opacity: .68; }",
    1,
)
styles_path.write_text(styles)

replace_once(
    'index.html',
    '<button class="button secondary focus-tree-button" id="focus-tree-button" type="button" aria-pressed="false">Focus tree here</button>',
    '<button class="button secondary focus-tree-button" id="focus-tree-button" type="button" aria-pressed="false" aria-label="Show this person’s tree" title="Show this person’s tree">🌳</button>',
)
replace_once('index.html', '<script type="module" src="./app.js?v=137"></script>', '<script type="module" src="./app.js?v=138"></script>')
replace_once('index.html', '<link rel="stylesheet" href="./styles.css?v=75">', '<link rel="stylesheet" href="./styles.css?v=76">')

search_test = Path('tests/search-focus.test.mjs')
text = search_test.read_text()
text = text.replace("assert.match(app, /Outside current focus tree/);", "assert.match(app, /Outside current tree/);", 1)
old = """test('search results expose a direct focus action', () => {
  assert.match(app, /focus\\.className = 'person-list-focus'/);
  assert.match(app, /focus\\.dataset\\.focusPersonId = person\\.id/);
  assert.match(app, /focusTreeOn\\(person\\.id, \\{[\\s\\S]*?clearSearch: true,[\\s\\S]*?centerIfHidden: !inCurrentScope/);
  assert.match(styles, /\\.person-list-focus/);
  assert.match(styles, /\\.outside-focus-scope \\.person-list-focus/);
});

test('focusing a hidden search result clears the query and centers its new tree', () => {
"""
new = """test('search results expose a tree-symbol action', () => {
  assert.match(app, /const TREE_ACTION_SYMBOL = '🌳'/);
  assert.match(app, /focus\\.className = 'person-list-focus'/);
  assert.match(app, /focus\\.dataset\\.focusPersonId = person\\.id/);
  assert.match(app, /focus\\.textContent = TREE_ACTION_SYMBOL/);
  assert.match(app, /focusTreeOn\\(person\\.id, \\{[\\s\\S]*?clearSearch: true,[\\s\\S]*?centerIfHidden: !inCurrentScope/);
  assert.match(styles, /\\.person-list-focus/);
  assert.match(styles, /\\.outside-focus-scope \\.person-list-focus/);
});

test('clicking a hidden result opens its side panel without changing the tree', () => {
  assert.match(app, /function selectPerson\\(id, \\{ center = false, allowOutsideScope = false \\} = \\{\\}\\)/);
  assert.match(app, /else selectPerson\\(person\\.id, \\{ allowOutsideScope: true \\}\\);/);
  assert.doesNotMatch(app, /else focusFromResult\\(\\);/);
  assert.match(app, /const person = state\\.people\\[state\\.selectedId\\] \\|\\| null/);
});

test('using the tree symbol on a hidden result clears the query and centers its new tree', () => {
"""
if text.count(old) != 1: raise SystemExit('search tests did not match once')
search_test.write_text(text.replace(old, new, 1))

focus_test = Path('tests/focus-tree-ui.test.mjs')
text = focus_test.read_text()
text = text.replace(
    """test('the selected profile exposes a persistent focus-tree action', () => {
  assert.match(html, /id=\"focus-tree-button\"/);
""",
    """test('the selected profile exposes a persistent tree-symbol action', () => {
  assert.match(html, /id=\"focus-tree-button\"[^>]*>🌳<\\/button>/);
  assert.match(app, /els\\['focus-tree-button'\\]\\.textContent = TREE_ACTION_SYMBOL/);
""",
    1,
)
text = text.replace(
    """test('spouse rows offer a one-click focus change', () => {
  assert.match(app, /className = 'relationship-focus'/);
""",
    """test('spouse rows offer a one-click tree-symbol change', () => {
  assert.match(app, /className = 'relationship-focus'/);
  assert.match(app, /focus\\.textContent = TREE_ACTION_SYMBOL/);
""",
    1,
)
focus_test.write_text(text)
