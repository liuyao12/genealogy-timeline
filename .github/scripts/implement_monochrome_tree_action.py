from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


# JavaScript: the tree is drawn by CSS, never by a platform colour emoji.
app_path = Path('app.js')
app = app_path.read_text()
if app.count("const TREE_ACTION_SYMBOL = '🌳';\n") != 1:
    raise SystemExit('Expected the current tree emoji constant once')
app = app.replace("const TREE_ACTION_SYMBOL = '🌳';\n", '', 1)
if app.count("focus.className = 'person-list-focus';") != 1:
    raise SystemExit('Expected one search-result tree button')
app = app.replace("focus.className = 'person-list-focus';", "focus.className = 'person-list-focus tree-action-button';", 1)
if app.count("focus.className = 'relationship-focus';") != 1:
    raise SystemExit('Expected one relationship tree button')
app = app.replace("focus.className = 'relationship-focus';", "focus.className = 'relationship-focus tree-action-button';", 1)
if app.count("      focus.textContent = TREE_ACTION_SYMBOL;\n") != 2:
    raise SystemExit('Expected two dynamic tree-symbol text assignments')
app = app.replace("      focus.textContent = TREE_ACTION_SYMBOL;\n", '')
if app.count("  els['focus-tree-button'].textContent = TREE_ACTION_SYMBOL;\n") != 1:
    raise SystemExit('Expected the profile tree-symbol text assignment')
app = app.replace("  els['focus-tree-button'].textContent = TREE_ACTION_SYMBOL;\n", '', 1)
if '🌳' in app or 'TREE_ACTION_SYMBOL' in app:
    raise SystemExit('A colour tree emoji or obsolete symbol constant remains in app.js')
app_path.write_text(app)


# Markup: one compact identity row with the action at its right edge.
old_hero = '''          <div class="person-hero">
            <div class="avatar" id="person-avatar">?</div>
            <button class="button secondary person-edit-button" id="edit-person" type="button">Edit</button>
            <button class="close-detail" id="close-detail" type="button" aria-label="Close profile">×</button>
            <span class="eyebrow">Selected profile</span>
            <h2 id="person-heading">Person</h2>
            <p id="person-life">Life dates unknown</p>
            <div class="focus-tree-control">
              <button class="button secondary focus-tree-button" id="focus-tree-button" type="button" aria-pressed="false" aria-label="Show this person’s tree" title="Show this person’s tree">🌳</button>
              <small id="focus-tree-status">Paternal households above · all descendants below</small>
            </div>
          </div>
'''
new_hero = '''          <div class="person-hero">
            <button class="button secondary person-edit-button" id="edit-person" type="button">Edit</button>
            <button class="close-detail" id="close-detail" type="button" aria-label="Close profile">×</button>
            <div class="person-hero-identity">
              <div class="avatar" id="person-avatar">?</div>
              <div class="person-hero-copy">
                <span class="eyebrow">Selected profile</span>
                <h2 id="person-heading">Person</h2>
                <p id="person-life">Life dates unknown</p>
              </div>
              <div class="focus-tree-control">
                <button class="button secondary focus-tree-button tree-action-button" id="focus-tree-button" type="button" aria-pressed="false" aria-label="Show this person’s tree" aria-describedby="focus-tree-status" title="Show this person’s tree"></button>
                <small class="sr-only" id="focus-tree-status">Paternal households above · all descendants below</small>
              </div>
            </div>
          </div>
'''
replace_once('index.html', old_hero, new_hero)
replace_once('index.html', '<link rel="stylesheet" href="./styles.css?v=76">', '<link rel="stylesheet" href="./styles.css?v=77">')
replace_once('index.html', '<script type="module" src="./app.js?v=138"></script>', '<script type="module" src="./app.js?v=139"></script>')


# CSS: one guaranteed monochrome tree silhouette shared by all tree actions.
styles_path = Path('styles.css')
styles = styles_path.read_text()
person_list_old = '''.person-list-focus {
  display: grid; place-items: center; width: 29px; min-width: 29px; height: 27px; margin-right: 5px; padding: 0;
  border: 1px solid #999; border-radius: 6px; background: #fff; color: #111;
  font: 14px/1 "Segoe UI Emoji", "Apple Color Emoji", sans-serif; cursor: pointer;
}
'''
person_list_new = '''.tree-action-button {
  --tree-action-icon-size: 16px;
  display: grid;
  place-items: center;
  padding: 0;
  color: #111;
  line-height: 1;
}
.tree-action-button::before {
  content: '';
  display: block;
  width: var(--tree-action-icon-size);
  height: var(--tree-action-icon-size);
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2 7.5 8h2L6 12.5h2.3L4.5 18h6v4h3v-4h6l-3.8-5.5H18L14.5 8h2Z'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2 7.5 8h2L6 12.5h2.3L4.5 18h6v4h3v-4h6l-3.8-5.5H18L14.5 8h2Z'/%3E%3C/svg%3E") center / contain no-repeat;
}
.person-list-focus {
  --tree-action-icon-size: 15px;
  width: 29px; min-width: 29px; height: 27px; margin-right: 5px;
  border: 1px solid #999; border-radius: 6px; background: #fff; color: #111; cursor: pointer;
}
'''
if styles.count(person_list_old) != 1:
    raise SystemExit(f'Expected one person-list focus block, found {styles.count(person_list_old)}')
styles = styles.replace(person_list_old, person_list_new, 1)

hero_old = '''.person-hero { position: relative; padding: 24px 22px 20px; border-bottom: 1px solid var(--line); background: #fff; text-align: center; }
.avatar { width: 62px; height: 62px; display: grid; place-items: center; margin: 0 auto 12px; border: 1px solid #000; border-radius: 50%; background: #fff; font: 700 19px Georgia, serif; color: #000; }
.close-detail { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 7px; background: transparent; color: #555; font-size: 21px; cursor: pointer; }
.person-hero .close-detail { position: absolute; right: 13px; top: 12px; }
.person-edit-button { position: absolute; left: 13px; top: 12px; min-height: 29px; padding: 0 10px; }
.person-hero h2 { margin: 6px 0 3px; font: 650 21px Georgia, serif; }
.person-hero p { margin: 0; color: var(--muted); font-size: 11px; }
.focus-tree-control { display: grid; justify-items: center; gap: 5px; margin-top: 13px; }
.focus-tree-button { display: grid; place-items: center; width: 36px; min-width: 36px; min-height: 34px; padding: 0; font: 17px/1 "Segoe UI Emoji", "Apple Color Emoji", sans-serif; }
.focus-tree-button[aria-pressed="true"] { border-color: #111; background: #111; color: #fff; cursor: default; transform: none; }
.focus-tree-control small { max-width: 285px; color: #666; font-size: 8px; line-height: 1.35; }
'''
hero_new = '''.person-hero { position: relative; padding: 44px 18px 16px; border-bottom: 1px solid var(--line); background: #fff; }
.person-hero-identity { display: grid; grid-template-columns: 54px minmax(0, 1fr) 36px; align-items: center; gap: 11px; width: 100%; }
.person-hero-copy { min-width: 0; text-align: left; }
.avatar { width: 54px; height: 54px; display: grid; place-items: center; margin: 0; border: 1px solid #000; border-radius: 50%; background: #fff; font: 700 18px Georgia, serif; color: #000; }
.close-detail { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 7px; background: transparent; color: #555; font-size: 21px; cursor: pointer; }
.person-hero .close-detail { position: absolute; right: 12px; top: 10px; }
.person-edit-button { position: absolute; left: 12px; top: 10px; min-height: 29px; padding: 0 10px; }
.person-hero h2 { margin: 4px 0 2px; overflow-wrap: anywhere; font: 650 19px/1.15 Georgia, serif; }
.person-hero p { margin: 0; color: var(--muted); font-size: 11px; }
.focus-tree-control { display: grid; place-items: center; align-self: center; margin: 0; }
.focus-tree-button { --tree-action-icon-size: 18px; width: 36px; min-width: 36px; min-height: 34px; }
.focus-tree-button[aria-pressed="true"] { border-color: #111; background: #111; color: #fff; cursor: default; transform: none; }
'''
if styles.count(hero_old) != 1:
    raise SystemExit(f'Expected one person hero block, found {styles.count(hero_old)}')
styles = styles.replace(hero_old, hero_new, 1)

relationship_old = '''.relationship-focus { display: grid; place-items: center; width: 27px; min-width: 27px; height: 25px; padding: 0; border: 1px solid #999; border-radius: 6px; background: #fff; color: #111; cursor: pointer; font: 13px/1 "Segoe UI Emoji", "Apple Color Emoji", sans-serif; }
'''
relationship_new = '''.relationship-focus { --tree-action-icon-size: 14px; width: 27px; min-width: 27px; height: 25px; border: 1px solid #999; border-radius: 6px; background: #fff; color: #111; cursor: pointer; }
'''
if styles.count(relationship_old) != 1:
    raise SystemExit(f'Expected one relationship focus block, found {styles.count(relationship_old)}')
styles = styles.replace(relationship_old, relationship_new, 1)
if 'Segoe UI Emoji' in styles or 'Apple Color Emoji' in styles:
    raise SystemExit('Colour-emoji font declarations remain in styles.css')
styles_path.write_text(styles)


# Small source-level regressions are kept explicit and readable.
Path('tests/focus-tree-ui.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('the selected profile exposes a persistent monochrome tree action', () => {
  assert.match(html, /class="button secondary focus-tree-button tree-action-button"/);
  assert.match(html, /id="focus-tree-button"[^>]*><\/button>/);
  assert.match(html, /class="sr-only" id="focus-tree-status"/);
  assert.doesNotMatch(app, /TREE_ACTION_SYMBOL|🌳/);
  assert.match(styles, /\.tree-action-button::before/);
  assert.match(styles, /-webkit-mask: url\("data:image\/svg\+xml/);
  assert.match(app, /function focusTreeOn\(personId\)/);
  assert.match(app, /state\.rootId = id/);
  assert.match(app, /Tree focused on/);
});

test('spouse rows offer a one-click monochrome tree action', () => {
  assert.match(app, /className = 'relationship-focus tree-action-button'/);
  assert.match(app, /focus\.dataset\.focusPersonId = targetId/);
  assert.match(app, /focusTreeOn\(targetId\)/);
  assert.match(styles, /\.relationship-focus/);
});

test('the profile hero keeps the tree action beside the identity instead of on its own row', () => {
  assert.match(html, /class="person-hero-identity"/);
  assert.match(html, /class="person-hero-copy"/);
  assert.match(styles, /\.person-hero-identity \{ display: grid; grid-template-columns: 54px minmax\(0, 1fr\) 36px;/);
  assert.match(styles, /\.focus-tree-control \{ display: grid; place-items: center; align-self: center; margin: 0;/);
  assert.doesNotMatch(styles, /\.focus-tree-control \{[^}]*margin-top:/);
});

test('focus changes use named View Transitions and preserve the chosen node position', () => {
  assert.match(app, /document\.startViewTransition\(applyFocus\)/);
  assert.match(app, /timelineViewTransitionName/);
  assert.match(app, /group\.style\.viewTransitionName/);
  assert.match(app, /viewport\.scrollTop \+= newRect\.top - oldRect\.top/);
  assert.match(styles, /::view-transition-group\(\*\)/);
});

test('the timeline starts at the oldest known paternal ancestor', () => {
  assert.match(app, /const lineageStartId = scope\.treeRootId \|\| state\.rootId/);
  assert.match(app, /scope\.linealIds\.has\(person\.id\)/);
  assert.match(app, /const preferredTreeRootId = datedIds\.has\(scope\.treeRootId\)/);
  assert.match(app, /scope\.paternalAncestorIds\.has\(id\)/);
});

test('focus emphasis uses a thicker gender-coloured outline rather than black', () => {
  assert.match(styles, /\.timeline-node\.focus\.male \.lifespan-outline \{ stroke: #69a9cf; \}/);
  assert.match(styles, /\.timeline-node\.focus\.female \.lifespan-outline \{ stroke: #e580b5; \}/);
  assert.match(styles, /\.timeline-node\.focus\.selected \.lifespan-outline \{ stroke-width: 4\.8; \}/);
  assert.doesNotMatch(styles, /\.timeline-node\.focus \.lifespan-outline \{ stroke: #111/);
});

test('the renderer attaches spouses to paternal ancestors as well as descendants', () => {
  assert.match(app, /scope\.spouseOwnerIds\.has\(partnerId\)/);
  assert.match(app, /datedVisibleSpouseOwners/);
  assert.match(app, /candidateFocusScope\.paternalSpouseIds\.size/);
  assert.match(app, /candidateFocusScope\.paternalSiblingIds\.size/);
});
''')

Path('tests/search-focus.test.mjs').write_text(r'''import test from 'node:test';
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

test('search results expose a monochrome tree action', () => {
  assert.doesNotMatch(app, /TREE_ACTION_SYMBOL|🌳/);
  assert.match(app, /focus\.className = 'person-list-focus tree-action-button'/);
  assert.match(app, /focus\.dataset\.focusPersonId = person\.id/);
  assert.match(styles, /\.tree-action-button::before/);
  assert.match(app, /focusTreeOn\(person\.id, \{[\s\S]*?clearSearch: true,[\s\S]*?centerIfHidden: !inCurrentScope/);
  assert.match(styles, /\.person-list-focus/);
  assert.match(styles, /\.outside-focus-scope \.person-list-focus/);
});

test('clicking a hidden result opens its side panel without changing the tree', () => {
  assert.match(app, /function selectPerson\(id, \{ center = false, allowOutsideScope = false \} = \{\}\)/);
  assert.match(app, /else selectPerson\(person\.id, \{ allowOutsideScope: true \}\);/);
  assert.doesNotMatch(app, /else focusFromResult\(\);/);
  assert.match(app, /const person = state\.people\[state\.selectedId\] \|\| null/);
});

test('using the tree symbol on a hidden result clears the query and centers its new tree', () => {
  assert.match(app, /async function focusTreeOn\(personId\) \{\s*const \{ clearSearch = false, centerIfHidden = false \} = arguments\[1\] \|\| \{\};/);
  assert.match(app, /if \(clearSearch\) \{[\s\S]*?state\.treeFilter = '';[\s\S]*?els\['tree-filter'\]\.value = '';/);
  assert.match(app, /else if \(centerIfHidden\) \{\s*centerTimelinePerson\(id\);/);
});
''')
