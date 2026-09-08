import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
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
  assert.match(html, /\.\/app\.js\?v=144/);
});
