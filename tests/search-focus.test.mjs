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
