import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monarchGroupFromProfile } from '../monarch-events.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('classifies British monarchs from their Geni title or display name', () => {
  assert.equal(monarchGroupFromProfile({ display_name: 'Henry VIII', title: 'King of England' }), 'british');
  assert.equal(monarchGroupFromProfile({ displayName: 'Victoria, Queen of the United Kingdom' }), 'british');
  assert.equal(monarchGroupFromProfile({ name: 'James VI and I', detail_strings: { title: 'King of Scots and England' } }), 'british');
});

test('classifies foreign and unidentified Geni reign profiles as other monarchs', () => {
  assert.equal(monarchGroupFromProfile({ display_name: 'Louis XII', title: 'King of France' }), 'other');
  assert.equal(monarchGroupFromProfile({ display_name: 'Charles V', title: 'Holy Roman Emperor' }), 'other');
  assert.equal(monarchGroupFromProfile({ display_name: 'Unidentified ruler' }), 'other');
});

test('does not call a foreign monarch British merely because unrelated prose mentions England', () => {
  assert.equal(monarchGroupFromProfile({
    display_name: 'Foreign King',
    title: 'King of Exampleland',
    note: 'His daughter later became Queen of England.'
  }), 'other');
});

test('Geni reign extraction applies the profile-derived monarch group', () => {
  assert.match(app, /import \{ monarchGroupFromProfile \} from '\.\/monarch-events\.js\?v=1'/);
  assert.match(app, /const monarchGroup = monarchGroupFromProfile\(profile\)/);
  assert.match(app, /\? \{ \.\.\.event, kind: 'monarch-reign', monarchGroup \}/);
  assert.match(html, /\.\/app\.js\?v=151/);
});
