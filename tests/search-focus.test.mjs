import test from 'node:test';
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
