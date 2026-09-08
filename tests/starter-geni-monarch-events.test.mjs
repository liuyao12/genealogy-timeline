import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duplicateGeniIdentityGroups, primaryGeniIdentity } from '../geni-identity.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;

function byName(name) {
  const entries = Object.entries(people).filter(([, person]) => person.displayName === name);
  assert.equal(entries.length, 1, `expected one profile named ${name}`);
  return entries[0];
}

test('every bundled profile is keyed and indexed by a Geni identity', () => {
  assert.equal(Object.keys(starter.idAliases || {}).length, 41);
  assert.equal(Object.keys(people).length, 168);
  for (const [id, person] of Object.entries(people)) {
    assert.match(id, /^profile-g?\d+$/i, `${person.displayName} has a non-Geni key`);
    assert.match(person.sourceId || '', /^profile-g?\d+$/i, `${person.displayName} lacks a Geni sourceId`);
    assert.ok(person.geniAliases?.includes(person.sourceId), `${person.displayName} lacks its sourceId alias`);
    assert.ok(primaryGeniIdentity(person, id), `${person.displayName} is not indexable by Geni identity`);
  }
  assert.deepEqual(duplicateGeniIdentityGroups(people), []);
});

test('Claude is represented once by her Geni profile and retains the Francis I marriage', () => {
  const [claudeId, claude] = byName('Claude, Queen of France and Duchess of Brittany');
  const [francisId, francis] = byName('Francis I, King of France');
  assert.equal(claudeId, 'profile-g6000000003219788110');
  assert.equal(francisId, 'profile-4695498');
  assert.equal(starter.idAliases['royal-france-claude-1499'], claudeId);
  assert.ok(claude.spouses.includes(francisId));
  assert.ok(francis.spouses.includes(claudeId));
  assert.equal(people['royal-france-claude-1499'], undefined);
});

test('all monarch events use one kind, two synchronized groups, and distinct colours', () => {
  const events = Object.values(people).flatMap(person => person.personalEvents || []);
  const monarchEvents = events.filter(event => event.kind === 'monarch-reign');
  assert.equal(monarchEvents.length, 51);
  assert.equal(monarchEvents.every(event => /^Reign(?:\b|\s*·)/i.test(event.name)), true);
  assert.equal(monarchEvents.every(event => ['british', 'other'].includes(event.monarchGroup)), true);
  assert.equal(monarchEvents.every(event => event.color === (event.monarchGroup === 'british' ? '#c62828' : '#3949ab')), true);
  assert.equal(monarchEvents.some(event => event.monarchGroup === 'british'), true);
  assert.equal(monarchEvents.some(event => event.monarchGroup === 'other'), true);
  assert.equal(monarchEvents.some(event => /^Tenure\b/i.test(event.name)), false);
});

test('the application exposes one personal-event toggle and two shared monarch palettes', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="timeline-personal-events-toggle"/);
  assert.match(app, /showPersonalEvents: true/);
  assert.match(app, /DEFAULT_OTHER_MONARCH_EVENT_COLOR = '#3949ab'/);
  assert.match(app, /function setSharedMonarchColor\(group, value\)/);
  assert.match(app, /if \(state\.showPersonalEvents\) group\.append\(personalEventLayer\)/);
});
