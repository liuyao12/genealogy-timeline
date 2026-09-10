import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = app.indexOf('function renderRelationshipHouseholds(person) {');
const end = app.indexOf('\nfunction renderGeniFamily', start);
const section = app.slice(start, end > start ? end : app.length);

test('the former immediate-family list is reduced to parentage', () => {
  assert.ok(start >= 0, 'parentage renderer should exist');
  assert.match(section, /const parentIds = unique\(person\.parents\)/);
  assert.match(section, /heading\.textContent = 'Parents'/);
  assert.match(section, /No parents recorded in this tree/);
  assert.doesNotMatch(section, /allPartnerIds\(person\)/);
  assert.doesNotMatch(section, /householdChildren/);
  assert.doesNotMatch(section, /kind: 'spouse'/);
  assert.doesNotMatch(section, /kind: 'child'/);
  assert.doesNotMatch(section, /Children without another recorded parent/);
});

test('parent rows remain usable profile-navigation controls', () => {
  assert.match(section, /row\.setAttribute\('role', 'button'\)/);
  assert.match(section, /selectPerson\(parentId, \{ center: true \}\)/);
  assert.match(section, /selectPerson\(parentId, \{ allowOutsideScope: true \}\)/);
});

test('the side-panel copy describes parentage rather than a duplicated family list', () => {
  assert.match(html, /<span class="eyebrow">Parentage<\/span>/);
  assert.match(html, /Parents recorded for this profile/);
  assert.match(html, /Parents in this tree/);
  assert.match(html, /id="known-family-count">0 parents/);
  assert.match(app, /knownParentIds\.length} parent/);
  assert.match(html, /\.\/app\.js\?v=151/);
});
