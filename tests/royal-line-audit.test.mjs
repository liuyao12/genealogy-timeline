import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPersonTimelineEvents, personEventSecondLine } from '../person-events.js';
import { computeDescendantScope } from '../descendant-scope.js';
const data = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url)));
const p = data.people;
const byName = name => {
  const found = Object.values(p).filter(x => x.displayName === name);
  assert.equal(found.length, 1, name);
  return found[0];
};
const descendants = root => {
  const seen = new Set([root]), queue = [root];
  for (const id of queue) for (const child of p[id].children) if (!seen.has(child)) { seen.add(child); queue.push(child); }
  return seen;
};
const year = value => value === '' || value == null ? null : Number(value);

test('every profile has valid reciprocal relations, plausible dates, and an acyclic ancestry', () => {
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    assert.ok(!visiting.has(id), `ancestry cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of p[id].children) visit(child);
    visiting.delete(id); visited.add(id);
  }
  for (const [id, x] of Object.entries(p)) {
    assert.equal(x.id, id);
    assert.ok(x.sourceUrl.startsWith('https://'));
    assert.ok(x.parents.length <= 2, x.displayName);
    const birth = year(x.birthYear), death = year(x.deathYear);
    if (death != null) { assert.ok(death >= birth); assert.equal(x.isLiving, false); }
    for (const field of ['parents', 'children', 'spouses', 'partners']) {
      assert.equal(new Set(x[field]).size, x[field].length);
      const reverse = { parents: 'children', children: 'parents', spouses: 'spouses', partners: 'partners' }[field];
      for (const relative of x[field]) {
        assert.ok(p[relative], `${id} -> ${relative}`);
        assert.ok(p[relative][reverse].includes(id), `${id} -> ${relative} not reciprocal`);
      }
    }
    for (const parentId of x.parents) {
      const parent = p[parentId], born = year(parent.birthYear), died = year(parent.deathYear);
      if (birth != null && born != null) assert.ok(birth - born >= 12, `${x.displayName}: parent too young`);
      if (birth != null && died != null) assert.ok(birth <= died + (parent.gender === 'male' ? 1 : 0), `${x.displayName}: parent deceased`);
    }
    for (const [spouseId, date] of Object.entries(x.marriageYears)) {
      if (!date) continue;
      assert.equal(p[spouseId].marriageYears[id], date);
      assert.ok(year(date) >= birth);
      if (death != null) assert.ok(year(date) <= death);
    }
    for (const event of x.personalEvents) {
      assert.ok(event.startYear >= birth);
      if (death != null) assert.ok(event.endYear <= death);
    }
    visit(id);
  }
});

test('Frederick the Great is childless and Wilhelm II descends through his brother and Queen Victoria', () => {
  const great = byName('Frederick II the Great, King of Prussia');
  const augustus = byName('Prince Augustus William of Prussia');
  const kaiser = byName('Wilhelm II, German Emperor and King of Prussia');
  assert.deepEqual(great.children, []);
  assert.deepEqual(great.parents, augustus.parents);
  assert.ok(descendants(augustus.id).has(kaiser.id));
  assert.ok(descendants(byName('Victoria, Queen of Great Britain and Ireland, Empress of India').id).has(kaiser.id));
  assert.ok(computeDescendantScope(p, data.rootId).allowedIds.has(great.id));
  assert.ok(computeDescendantScope(p, data.rootId).allowedIds.has(kaiser.id));
  assert.equal(kaiser.personalEvents.at(-1).endYear, 1918);
  assert.equal(kaiser.deathYear, '1941');
});

test('the principal British and Danish households have their full child lists', () => {
  for (const [name, count] of [
    ['George II, King of Great Britain and Ireland', 8],
    ['George III, King of Great Britain and Ireland', 15],
    ['Victoria, Queen of Great Britain and Ireland, Empress of India', 9],
    ['Edward VII, King of Great Britain and Ireland', 6],
    ['George V, King of Great Britain and Northern Ireland', 6],
    ['George VI, King of Great Britain and Northern Ireland', 2],
    ['Elizabeth II, Queen of Great Britain and Northern Ireland', 4],
    ['Christian IX, King of Denmark', 6],
    ['Alice, Grand Duchess of Hesse and by Rhine', 7],
  ]) assert.equal(byName(name).children.length, count, name);
});

test('consort gateways reach the principal later royal lines without treating succession as parentage', () => {
  for (const [from, to] of [
    ['Louis XIII, King of France and Navarre', 'Louis Philippe I, King of the French'],
    ['Philip II, King of Spain', 'Felipe VI, King of Spain'],
    ['Manuel I, King of Portugal', 'Manuel II, King of Portugal'],
    ['Frederick III, King of Denmark and Norway', 'Frederik X, King of Denmark'],
    ['Frederick William I, King in Prussia', 'Carl XVI Gustaf, King of Sweden'],
    ['Frederick William I, King in Prussia', 'Willem-Alexander, King of the Netherlands'],
    ['Christian IX, King of Denmark', 'Haakon VIII, King of Norway'],
    ['Victoria, Queen of Great Britain and Ireland, Empress of India', 'Michael I, King of Romania'],
    ['Victoria, Queen of Great Britain and Ireland, Empress of India', 'Constantine II, King of the Hellenes'],
  ]) assert.ok(descendants(byName(from).id).has(byName(to).id), `${from} -> ${to}`);
  assert.equal(byName('Louis XVII, titular King of France').personalEvents.length, 0);
  assert.ok(!byName('Charles XIV John, King of Sweden and Norway').parents.includes(byName('Charles XIII, King of Sweden and Norway').id));
});

// These inherited unions previously defaulted to a spouse's death instead of
// their researched ending (or explicitly uncertain annulment year).
test('historical annulments and separations have explicit chronology endings', () => {
  for (const [name, spouseName, expected] of [
    ['Margaret Tudor, Queen of Scots', 'Archibald Douglas, Earl of Angus', 'married 1514; annulled 1527'],
    ['Louis XII, King of France', 'Jeanne of France', 'married 1476; annulled 1498'],
    ['George IV, King of Great Britain and Ireland', 'Maria Fitzherbert', 'married 1785; ended 1811'],
    ['Charles Brandon, Duke of Suffolk', 'Margaret Neville', 'married 1507; annulled (year unknown)'],
  ]) {
    const spouse = byName(spouseName);
    const event = buildPersonTimelineEvents(byName(name), p).find(e => e.relativeId === spouse.id && e.kind === 'marriage');
    assert.ok(event, name);
    assert.equal(personEventSecondLine(event), expected);
  }
});
