import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonTimelineEvents,
  childBirthEventKey,
  marriageEventKey,
  normalizePersonEventVisibility,
  personalEventId,
  personalEventKey,
  personEventAgeLabel,
  personEventIsVisible,
  remapPersonEventKey,
  remapPersonEventVisibility,
  setPersonEventVisibility
} from '../person-events.js';

const people = {
  p: {
    id: 'p',
    displayName: 'Pat Example',
    birthYear: '1970',
    children: ['c1', 'c2'],
    partners: ['s'],
    spouses: ['s'],
    divorcedSpouses: ['s'],
    marriageYears: { s: '1995' },
    relationshipEndYears: { s: '2005' },
    relationshipEndStatuses: { s: 'divorced' },
    personalEvents: [{ name: 'Research fellowship', startYear: 1999, endYear: 2002, color: '#1565c0' }]
  },
  s: {
    id: 's',
    displayName: 'Sam Example',
    birthYear: '1971',
    children: ['c1', 'c2'],
    partners: ['p'],
    spouses: ['p'],
    divorcedSpouses: ['p'],
    marriageYears: { p: '1995' },
    relationshipEndYears: { p: '2005' },
    relationshipEndStatuses: { p: 'divorced' }
  },
  c1: { id: 'c1', displayName: 'First Child', birthYear: '1998', parents: ['p', 's'] },
  c2: { id: 'c2', displayName: 'Second Child', birthYear: '2001', parents: ['p', 's'] }
};

test('keeps one simple chronology and folds divorce into the marriage range', () => {
  const events = buildPersonTimelineEvents(people.p, people, { currentYear: 2026 });
  assert.deepEqual(
    events.map(event => [event.kind, event.startYear, event.label]),
    [
      ['marriage', 1995, 'Married Sam Example'],
      ['child-birth', 1998, 'Birth of First Child'],
      ['personal', 1999, 'Research fellowship'],
      ['child-birth', 2001, 'Birth of Second Child']
    ]
  );
  const marriage = events[0];
  assert.equal(marriage.endYear, 2005);
  assert.equal(marriage.endReason, 'divorced');
  assert.equal(marriage.detail, '10 years · divorced');
  assert.equal(events.some(event => event.kind === 'relationship-end'), false);
  assert.deepEqual(events.map(event => personEventAgeLabel(people.p, event)), ['25', '28', '29', '31']);
});

test('uses the spouse death as the marriage endpoint and says why it ended', () => {
  const widowedPeople = structuredClone(people);
  delete widowedPeople.p.relationshipEndYears.s;
  delete widowedPeople.s.relationshipEndYears.p;
  delete widowedPeople.p.relationshipEndStatuses.s;
  delete widowedPeople.s.relationshipEndStatuses.p;
  widowedPeople.p.divorcedSpouses = [];
  widowedPeople.s.divorcedSpouses = [];
  widowedPeople.p.deathYear = '2020';
  widowedPeople.s.deathYear = '2010';
  const marriage = buildPersonTimelineEvents(widowedPeople.p, widowedPeople, { currentYear: 2026 })[0];
  assert.equal(marriage.endYear, 2010);
  assert.equal(marriage.endReason, 'partner-died');
  assert.equal(marriage.detail, '15 years · spouse died');
});

test('ends a marriage at the selected person death without a redundant note', () => {
  const endedPeople = structuredClone(people);
  delete endedPeople.p.relationshipEndYears.s;
  delete endedPeople.s.relationshipEndYears.p;
  delete endedPeople.p.relationshipEndStatuses.s;
  delete endedPeople.s.relationshipEndStatuses.p;
  endedPeople.p.divorcedSpouses = [];
  endedPeople.s.divorcedSpouses = [];
  endedPeople.p.deathYear = '2008';
  endedPeople.s.deathYear = '2015';
  const marriage = buildPersonTimelineEvents(endedPeople.p, endedPeople, { currentYear: 2026 })[0];
  assert.equal(marriage.endYear, 2008);
  assert.equal(marriage.endReason, 'person-died');
  assert.equal(marriage.detail, '13 years');
});

test('uses stable keys for independently switchable timeline marks', () => {
  const events = buildPersonTimelineEvents(people.p, people);
  assert.equal(events[0].key, marriageEventKey('s'));
  assert.equal(events[1].key, childBirthEventKey('c1'));
  assert.equal(events.at(-1).key, childBirthEventKey('c2'));
  const authored = events.find(event => event.kind === 'personal');
  assert.equal(authored.key, personalEventKey(authored.sourceEvent));
  assert.equal(personalEventId(authored.sourceEvent), personalEventId({ ...authored.sourceEvent }));
});

test('showing and hiding a mark does not alter the event or relationship data', () => {
  const person = structuredClone(people.p);
  const key = childBirthEventKey('c1');
  assert.equal(personEventIsVisible(person, key), true);
  setPersonEventVisibility(person, key, false);
  assert.equal(personEventIsVisible(person, key), false);
  assert.deepEqual(person.children, ['c1', 'c2']);
  setPersonEventVisibility(person, key, true);
  assert.equal(personEventIsVisible(person, key), true);
  assert.deepEqual(person.eventVisibility, {});
});

test('normalizes and remaps saved profile-backed event keys', () => {
  assert.deepEqual(normalizePersonEventVisibility({ 'marriage:old': false, bad: 'no' }), { 'marriage:old': false });
  assert.equal(remapPersonEventKey('child-birth:old', id => id === 'old' ? 'new' : id), 'child-birth:new');
  assert.deepEqual(
    remapPersonEventVisibility({ 'marriage:old': false, 'personal:event-a': false }, id => id === 'old' ? 'new' : id),
    { 'marriage:new': false, 'personal:event-a': false }
  );
});

test('omits an undated marriage rather than creating a divorce-only row, but keeps every dated child', () => {
  const undatedPeople = structuredClone(people);
  undatedPeople.p.marriageYears = {};
  undatedPeople.s.marriageYears = {};
  const events = buildPersonTimelineEvents(undatedPeople.p, undatedPeople);
  assert.equal(events.some(event => event.kind === 'marriage'), false);
  assert.equal(events.some(event => event.kind === 'relationship-end'), false);
  assert.deepEqual(
    events.filter(event => event.kind === 'child-birth').map(event => event.relativeId),
    ['c1', 'c2']
  );
});
