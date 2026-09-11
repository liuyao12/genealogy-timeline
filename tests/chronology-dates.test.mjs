import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonTimelineEvents, personEventSecondLine } from '../person-events.js';

function marriage({ start = 1558, end, status, selfDeath, spouseDeath } = {}) {
  const people = {
    a: { id: 'a', spouses: ['b'], marriageYears: { b: start }, deathYear: selfDeath,
      relationshipEndYears: { b: end }, relationshipEndStatuses: { b: status } },
    b: { id: 'b', displayName: 'Spouse', deathYear: spouseDeath }
  };
  return personEventSecondLine(buildPersonTimelineEvents(people.a, people)[0]);
}

test('marriage dates describe divorce, annulment, and either death endpoint', () => {
  assert.equal(marriage({ end: 1560, status: 'divorced' }), 'married 1558; divorced 1560');
  assert.equal(marriage({ spouseDeath: 1580, selfDeath: 1590 }), 'married 1558; spouse died 1580');
  assert.equal(marriage({ spouseDeath: 1590, selfDeath: 1580 }), 'married 1558; died 1580');
  assert.equal(marriage({ start: 1540, end: 1540, status: 'annulled' }), 'married 1540; annulled 1540');
  assert.equal(marriage({ start: 1558, spouseDeath: 1558 }), 'married 1558; spouse died 1558');
});

test('unknown divorce years are explicit and never replaced by a later death', () => {
  assert.equal(marriage({ status: 'divorced', spouseDeath: 1580 }), 'married 1558; divorced (year unknown)');
  assert.equal(marriage(), 'married 1558');
});

test('children, point events, and ranged events have calendar details', () => {
  assert.equal(personEventSecondLine({ kind: 'child-birth', startYear: 1559 }), 'born 1559');
  assert.equal(personEventSecondLine({ kind: 'personal', startYear: 1559, endYear: 1559 }), '1559');
  assert.equal(personEventSecondLine({ kind: 'personal', startYear: 1559, endYear: 1560 }), '1559–1560 · 1 year');
  assert.equal(personEventSecondLine({ kind: 'personal', startYear: 1559, endYear: 1580 }), '1559–1580 · 21 years');
  assert.equal(personEventSecondLine({ kind: 'marriage', startYear: 2004, ongoing: true }), 'married 2004; ongoing');
});
