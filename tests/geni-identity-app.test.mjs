import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('immediate-family imports consult every existing public Geni ID', () => {
  assert.match(app, /const existingByGeniId = buildGeniIdentityIndex\(state\.people\)/);
  assert.match(app, /existingByGeniId\.get\(identity\)/);
  assert.match(app, /remapGeniImmediateFamily\([\s\S]*existingByGeniId\)/);
});

test('stitch imports coalesce the combined existing and incoming collections before wiring relations', () => {
  assert.match(app, /const combinedMigration = migrateGeniPeople\(combinedRaw\)/);
  assert.match(app, /state\.people = combinedMigration\.people/);
  assert.match(app, /duplicate Geni record/);
});

test('saved roots and collapsed nodes follow any Geni identity remap', () => {
  assert.match(app, /const savedRootId = migratedPeople\.remapId\(rawSavedRootId\)/);
  assert.match(app, /saved\.collapsedIds\)\.map\(migratedPeople\.remapId\)/);
});
