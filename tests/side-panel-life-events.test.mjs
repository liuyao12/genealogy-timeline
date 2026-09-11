import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const personEvents = readFileSync(new URL('../person-events.js', import.meta.url), 'utf8');
const timelineStart = app.indexOf('formalMarriagePartnerIds(id).forEach');
const timelineEnd = app.indexOf('const childrenShownAtAnotherOccurrence', timelineStart);
const timelineMarks = app.slice(timelineStart, timelineEnd);

test('the side panel presents a vertical Age, Event, and Mark chronology', () => {
  assert.match(html, /<span class="eyebrow">Chronology<\/span>/);
  assert.match(html, /aria-label="Chronological life events"/);
  assert.match(app, /\['Age', 'Event', 'Mark'\]/);
  assert.match(app, /const chronology = personEventSecondLine\(event\)/);
  assert.match(css, /\.person-event-copy::before \{/);
  assert.match(css, /\.person-event-table-header \+ \.person-event-row \.person-event-copy::before/);
  assert.match(css, /\.person-event-row:last-child \.person-event-copy::before/);
});

test('ranged events use their beginning age and marriages carry duration and ending context', () => {
  assert.match(personEvents, /return String\(startYear - birthYear\)/);
  assert.match(personEvents, /detail: relationshipDurationDetail\(relationshipYear, endState, formal\)/);
  assert.match(personEvents, /return formal \? 'spouse died' : 'partner died'/);
  assert.match(app, /detail\.className = 'person-event-detail'/);
});

test('divorce is folded into its marriage instead of becoming a separate row', () => {
  assert.doesNotMatch(personEvents, /kind: 'relationship-end'/);
  assert.doesNotMatch(timelineMarks, /relationship-end/);
});

test('every dated child remains an individual birth row in the side panel', () => {
  assert.match(personEvents, /const childIds = unique\(values\(person\.children\)\)/);
  assert.match(personEvents, /kind: 'child-birth'/);
  assert.match(personEvents, /label: relativeName\(child, birthYear, nameAtYear\)/);
});


test('relationship and child rows use compact names without redundant verbs', () => {
  assert.match(personEvents, /label: partnerName/);
  assert.match(personEvents, /label: relativeName\(child, birthYear, nameAtYear\)/);
  assert.doesNotMatch(personEvents, /`Married \${partnerName}`/);
  assert.doesNotMatch(personEvents, /`Relationship with \${partnerName}`/);
  assert.doesNotMatch(personEvents, /`Birth of \${relativeName/);
});


test('child births do not paint marks across node boxes on the main canvas', () => {
  assert.match(timelineMarks, /\.filter\(event => event\.kind === 'relationship'\)/);
  assert.doesNotMatch(timelineMarks, /child-birth/);
  assert.doesNotMatch(timelineMarks, /family-event-child-birth-line/);
});

test('a child row uses a round branch control rather than a mark button', () => {
  assert.match(app, /function childBranchVisibilityButton\(person, event, shown\)/);
  assert.match(app, /toggle\.setAttribute\('aria-pressed', String\(shown\)\)/);
  assert.match(app, /childBranchRelationKeys\(event\.relativeId\)/);
  assert.match(app, /state\.relationVisibility\[key\] = !shown/);
  assert.match(app, /downstream branch/);
  assert.match(css, /\.person-event-circle-control \{[^}]*border-radius: 50%/s);
  assert.match(css, /\.person-event-circle-control\[aria-pressed=\"false\"\] \{ background: #fff; \}/);
  assert.match(html, /Filled circles are shown; child circles control branches/);
});

test('marriages and authored events retain independent timeline-mark controls', () => {
  assert.match(app, /function personEventVisibilityButton\(person, event, shown\)/);
  assert.match(app, /toggle\.className = 'person-event-visibility person-event-circle-control'/);
  assert.match(app, /toggle\.textContent = ''/);
  assert.match(app, /setPersonEventVisibility\(person, event\.key, !shown\)/);
  assert.match(html, /Show or hide marriage, relationship, and authored-event marks/);
});

test('family event names remain profile navigation controls', () => {
  assert.match(app, /name\.className = 'person-event-relative'/);
  assert.match(app, /selectPerson\(relative\.id, \{ center: true \}\)/);
  assert.match(app, /selectPerson\(relative\.id, \{ allowOutsideScope: true \}\)/);
});

test('event visibility survives normalization, merging, and profile-id remapping', () => {
  assert.match(app, /eventVisibility: normalizePersonEventVisibility/);
  assert.match(app, /merged\.eventVisibility = \{/);
  assert.match(app, /normalized\.eventVisibility = remapPersonEventVisibility/);
  assert.match(app, /person\.eventVisibility = remapPersonEventVisibility/);
});

test('the revised static assets use fresh cache keys', () => {
  assert.match(app, /from '\.\/person-events\.js\?v=4'/);
  assert.match(html, /\.\/styles\.css\?v=82/);
  assert.match(html, /\.\/app\.js\?v=152/);
});
