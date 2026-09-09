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
  relationshipEndEventKey,
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

test('builds one chronological life-event list from family facts and authored events', () => {
  const events = buildPersonTimelineEvents(people.p, people);
  assert.deepEqual(
    events.map(event => [event.kind, event.startYear, event.label]),
    [
      ['marriage', 1995, 'Married Sam Example'],
      ['child-birth', 1998, 'Birth of First Child'],
      ['personal', 1999, 'Research fellowship'],
      ['child-birth', 2001, 'Birth of Second Child'],
      ['relationship-end', 2005, 'Divorced from Sam Example']
    ]
  );
  assert.deepEqual(events.map(event => personEventAgeLabel(people.p, event)), ['25', '28', '29–32', '31', '35']);
});

test('uses stable keys for independently switchable timeline marks', () => {
  const events = buildPersonTimelineEvents(people.p, people);
  assert.equal(events[0].key, marriageEventKey('s'));
  assert.equal(events[1].key, childBirthEventKey('c1'));
  assert.equal(events.at(-1).key, relationshipEndEventKey('s'));
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

test('omits undated family facts because they cannot make timeline marks', () => {
  const undatedPeople = structuredClone(people);
  undatedPeople.p.marriageYears = {};
  undatedPeople.p.relationshipEndYears = {};
  undatedPeople.s.marriageYears = {};
  undatedPeople.s.relationshipEndYears = {};
  const events = buildPersonTimelineEvents(undatedPeople.p, undatedPeople);
  assert.equal(events.some(event => event.kind === 'marriage'), false);
  assert.equal(events.some(event => event.kind === 'relationship-end'), false);
  assert.equal(events.filter(event => event.kind === 'child-birth').length, 2);
});
