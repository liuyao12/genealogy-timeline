import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const people = data.people;
const defaultName = person => person.namePeriods.find(period => period.id === person.defaultNamePeriodId)?.name || person.displayName;

test('the bundled title holders use the Name, Title style', () => {
  assert.ok(data.version >= 25);
  const expectations = new Map([
    ['profile-g6000000003409427757', 'Arthur, Prince of Wales'],
    ['profile-g6000000000307240333', 'Adolphus, Duke of Cambridge'],
    ['profile-g4087038607800049893', 'Edward, Duke of Kent'],
    ['profile-g6000000001260403655', 'Augusta, Duchess of Cambridge'],
    ['profile-g6000000003245250586', 'Mary Adelaide, Duchess of Teck'],
    ['profile-g6000000001543481636', 'Francis, Duke of Teck']
  ]);
  expectations.forEach((expected, id) => assert.equal(defaultName(people[id]), expected, id));
  assert.equal(people['profile-g6000000003409427757'].title, 'Prince of Wales');
});

test('the starter upgrade repairs exact stale territorial labels without touching arbitrary local names', () => {
  assert.match(app, /const revisedStarterDisplayNames = \{/);
  assert.match(app, /'Adolphus of Cambridge'/);
  assert.match(app, /'Arthur Tudor'/);
  assert.match(app, /staleStarterNames\.includes\(saved\.displayName\)/);
  assert.match(app, /period\.source === 'local'/);
});
