import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const personEvents = readFileSync(new URL('../person-events.js', import.meta.url), 'utf8');

test('the side panel presents Age, Event followed by year, and Mark columns', () => {
  assert.match(html, /<span class="eyebrow">Life events<\/span>/);
  assert.match(html, /id="personal-events-list"[^>]*aria-label="Chronological life events"/);
  assert.match(app, /\['Age', 'Event', 'Mark'\]/);
  assert.match(app, /years\.className = 'person-event-year'/);
  assert.match(app, /years\.textContent = `· \$\{personEventYearLabel\(event\)\}`/);
  assert.match(css, /\.person-event-title \{[^}]*grid-template-columns: 17px minmax\(0,1fr\) auto auto/);
});

test('ranged events use their beginning age and marriages carry duration and ending context', () => {
  assert.match(personEvents, /return String\(startYear - birthYear\)/);
  assert.match(personEvents, /detail: relationshipDurationDetail\(relationshipYear, endState, formal\)/);
  assert.match(personEvents, /return formal \? 'spouse died' : 'partner died'/);
  assert.match(app, /detail\.className = 'person-event-detail'/);
  assert.match(app, /if \(event\?\.ongoing\) return `\$\{startYear\}–present`/);
});

test('divorce is not emitted or drawn as a separate chronological event', () => {
  assert.doesNotMatch(personEvents, /kind: 'relationship-end'/);
  assert.match(app, /\.filter\(event => \['relationship', 'child-birth'\]\.includes\(event\.kind\)\)/);
  assert.doesNotMatch(html, /relationship-end, and authored marks/);
});

test('every dated child remains an individual birth row', () => {
  assert.match(personEvents, /const childIds = unique\(values\(person\.children\)\)/);
  assert.match(personEvents, /kind: 'child-birth'/);
  assert.match(personEvents, /label: `Birth of \$\{relativeName\(child, birthYear, nameAtYear\)\}`/);
});

test('every row gets an independent Show or Hide mark control', () => {
  assert.match(app, /function personEventVisibilityButton\(person, event, shown\)/);
  assert.match(app, /toggle\.textContent = shown \? 'Hide' : 'Show'/);
  assert.match(app, /setPersonEventVisibility\(person, event\.key, !shown\)/);
  assert.match(html, /One mark per row; family stays connected/);
});

test('event visibility survives normalization, merging, and profile-id remapping', () => {
  assert.match(app, /eventVisibility: normalizePersonEventVisibility/);
  assert.match(app, /merged\.eventVisibility = \{/);
  assert.match(app, /normalized\.eventVisibility = remapPersonEventVisibility/);
  assert.match(app, /person\.eventVisibility = remapPersonEventVisibility/);
});

test('the revised static assets use fresh cache keys', () => {
  assert.match(app, /from '\.\/person-events\.js\?v=2'/);
  assert.match(html, /\.\/styles\.css\?v=80/);
  assert.match(html, /\.\/app\.js\?v=149/);
});
