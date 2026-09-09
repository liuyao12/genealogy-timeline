import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('the side panel presents one three-column chronological life-event table', () => {
  assert.match(html, /<span class="eyebrow">Life events<\/span>/);
  assert.match(html, /id="personal-events-list"[^>]*aria-label="Chronological life events"/);
  assert.match(app, /\['Age', 'Event', 'Mark'\]/);
  assert.match(app, /buildPersonTimelineEvents\(person, state\.people, \{ nameAtYear \}\)/);
  assert.match(css, /\.person-event-table-header, \.person-event-row \{ display: grid; grid-template-columns: 36px minmax\(0,1fr\) 46px/);
});

test('every row gets an independent Show or Hide mark control', () => {
  assert.match(app, /function personEventVisibilityButton\(person, event, shown\)/);
  assert.match(app, /toggle\.textContent = shown \? 'Hide' : 'Show'/);
  assert.match(app, /setPersonEventVisibility\(person, event\.key, !shown\)/);
  assert.match(html, /Marks only; family stays connected/);
});

test('the timeline respects visibility for authored and family-derived marks', () => {
  assert.match(app, /visiblePersonalEvents = person\.personalEvents\.filter\(event => personEventIsVisible\(person, personalEventKey\(event\)\)\)/);
  assert.match(app, /class: 'personal-event-mark', 'data-event-key': eventKey/);
  assert.match(app, /class: `family-event-mark \$\{event\.kind\}/);
  assert.match(app, /personEventIsVisible\(state\.people\[parentId\], eventKey\)/);
  assert.match(app, /'data-event-key': marriage\.eventKey/);
  assert.match(app, /'data-event-key': eventKey/);
});

test('event visibility survives normalization, merging, and profile-id remapping', () => {
  assert.match(app, /eventVisibility: normalizePersonEventVisibility/);
  assert.match(app, /merged\.eventVisibility = \{/);
  assert.match(app, /normalized\.eventVisibility = remapPersonEventVisibility/);
  assert.match(app, /person\.eventVisibility = remapPersonEventVisibility/);
});

test('the revised static assets use fresh cache keys', () => {
  assert.match(html, /\.\/styles\.css\?v=79/);
  assert.match(html, /\.\/app\.js\?v=148/);
});
