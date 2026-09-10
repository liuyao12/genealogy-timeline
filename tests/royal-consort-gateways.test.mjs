import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope } from '../descendant-scope.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;

function text(person) {
  return [person.displayName, person.title, person.note, ...(person.namePeriods || []).map(period => period.name)]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

function find(fragment, birthYear) {
  const query = fragment.toLocaleLowerCase();
  const matches = Object.values(people).filter(person =>
    String(person.birthYear) === String(birthYear) && text(person).includes(query)
  );
  assert.equal(matches.length, 1, `expected one ${fragment} born ${birthYear}, found ${matches.map(person => person.displayName).join(' | ')}`);
  return matches[0];
}

function assertChild(child, father, mother) {
  assert.deepEqual(new Set(child.parents), new Set([father.id, mother.id]), `${child.displayName} parentage`);
  assert.ok(father.children.includes(child.id), `${father.displayName} should list ${child.displayName}`);
  assert.ok(mother.children.includes(child.id), `${mother.displayName} should list ${child.displayName}`);
}

function assertSpouses(first, second) {
  assert.ok(first.spouses.includes(second.id), `${first.displayName} should list ${second.displayName}`);
  assert.ok(second.spouses.includes(first.id), `${second.displayName} should list ${first.displayName}`);
}

function descendantPath(start, finish) {
  const queue = [start.id];
  const previous = new Map([[start.id, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === finish.id) break;
    for (const childId of people[current].children || []) {
      if (!people[childId] || previous.has(childId)) continue;
      previous.set(childId, current);
      queue.push(childId);
    }
  }
  if (!previous.has(finish.id)) return [];
  const result = [];
  for (let current = finish.id; current; current = previous.get(current)) result.push(people[current]);
  return result.reverse();
}

test('the audited royal starter advances to version 31', () => {
  assert.equal(starter.version, 31);
  assert.ok(Object.keys(people).length >= 240);
});

test('Frederick the Great belongs to the Henry VII descendant graph rather than an isolated profile', () => {
  const henryVII = people[starter.rootId];
  const frederick = find('Frederick the Great', 1712);
  const frederickWilliam = find('Frederick William I', 1688);
  const sophiaDorothea = find('Sophia Dorothea of Hanover', 1687);
  const elisabethChristine = find('Elisabeth Christine', 1715);
  assertChild(frederick, frederickWilliam, sophiaDorothea);
  assertSpouses(frederick, elisabethChristine);
  assert.match(frederick.title, /Frederick the Great/i);
  const path = descendantPath(henryVII, frederick).map(person => person.displayName);
  assert.ok(path.length > 5, 'Frederick II should have a complete descent from Henry VII');
  assert.ok(path.some(name => /George I/.test(name)));
  assert.ok(path.some(name => /Sophia Dorothea/.test(name)));
});

test('the Prussian siblings connect Brunswick, Sweden, and the Prussian succession', () => {
  const parents = [find('Frederick William I', 1688), find('Sophia Dorothea of Hanover', 1687)];
  for (const child of [
    find('Frederick the Great', 1712),
    find('Wilhelmine of Prussia', 1709),
    find('Augustus William', 1722),
    find('Philippine Charlotte', 1716),
    find('Louisa Ulrika', 1720)
  ]) assertChild(child, ...parents);

  assertChild(find('Frederick William II', 1744), find('Augustus William', 1722), find('Luise of Brunswick', 1722));
  assertChild(find('Charles William Ferdinand', 1735), find('Charles I, Duke of Brunswick', 1713), find('Philippine Charlotte', 1716));
  assertChild(find('Gustav III', 1746), find('Adolf Frederick', 1710), find('Louisa Ulrika', 1720));
  assertChild(find('Charles XIII', 1748), find('Adolf Frederick', 1710), find('Louisa Ulrika', 1720));
});

test('Queen Charlotte’s Mecklenburg family reaches Prussia, Germany, Russia, and Greece', () => {
  assertChild(find('Charlotte of Mecklenburg-Strelitz', 1744), find('Charles Louis Frederick', 1708), find('Elisabeth Albertine', 1713));
  assertChild(find('Charles II, Grand Duke of Mecklenburg', 1741), find('Charles Louis Frederick', 1708), find('Elisabeth Albertine', 1713));
  assertChild(find('Louise of Mecklenburg-Strelitz', 1776), find('Charles II, Grand Duke of Mecklenburg', 1741), find('Friederike of Hesse-Darmstadt', 1752));
  assertChild(find('Alexandra Feodorovna', 1798), find('Frederick William III', 1770), find('Louise of Mecklenburg-Strelitz', 1776));
  assertChild(find('Konstantin Nikolaevich', 1827), find('Nicholas I', 1796), find('Alexandra Feodorovna', 1798));
  assertChild(find('Olga Constantinovna', 1851), find('Konstantin Nikolaevich', 1827), find('Alexandra of Saxe-Altenburg', 1830));
  assertChild(find('Wilhelm II', 1859), find('Frederick III', 1831), find('Victoria, Princess Royal', 1840));
});

test('the Catholic Monarchs join Catherine of Aragon to the Portuguese and Habsburg gateways', () => {
  const isabella = find('Isabella I', 1451);
  const ferdinand = find('Ferdinand II', 1452);
  for (const child of [
    find('Isabella of Aragon', 1470),
    find('Maria of Aragon', 1482),
    find('Joanna I', 1479),
    find('Catherine of Aragon', 1485)
  ]) assertChild(child, isabella, ferdinand);

  assertChild(find('Maria of Austria', 1528), find('Charles V', 1500), find('Isabella of Portugal', 1503));
  assertChild(find('Anna of Austria', 1549), find('Maximilian II', 1527), find('Maria of Austria', 1528));
  assertChild(find('Elisabeth of Austria', 1554), find('Maximilian II', 1527), find('Maria of Austria', 1528));
  assertSpouses(find('Elisabeth of Austria', 1554), find('Charles IX', 1550));
});

test('Catherine of Braganza sits inside a traceable Portuguese succession', () => {
  const john = find('John IV', 1604);
  const luisa = find('Luisa de Guzmán', 1613);
  for (const child of [find('Catherine of Braganza', 1638), find('Afonso VI', 1643), find('Peter II', 1648)]) {
    assertChild(child, john, luisa);
  }
  assertChild(find('John V', 1689), find('Peter II', 1648), find('Maria Sophia of Neuburg', 1666));
});

test('the Danish consort line exposes the Frederick II–Sophie cousin marriage', () => {
  const frederickI = find('Frederick I', 1471);
  assertChild(find('Christian III', 1503), frederickI, find('Anna of Brandenburg', 1487));
  assertChild(find('Elizabeth of Denmark', 1524), frederickI, find('Sophie of Pomerania', 1498));
  assertChild(find('Frederick II', 1534), find('Christian III', 1503), find('Dorothea of Saxe-Lauenburg', 1511));
  assertChild(find('Sophie of Mecklenburg-Güstrow', 1557), find('Ulrich III', 1527), find('Elizabeth of Denmark', 1524));
  assertSpouses(find('Frederick II', 1534), find('Sophie of Mecklenburg-Güstrow', 1557));
});

test('the Orange and Palatinate gateways share William the Silent', () => {
  const william = find('William the Silent', 1533);
  assertChild(find('Louise Juliana', 1576), william, find('Charlotte of Bourbon', 1546));
  assertChild(find('Frederick Henry', 1584), william, find('Louise de Coligny', 1555));
});

test('Mary of Guise’s Bourbon ancestry meets the line of Henry IV', () => {
  const francis = find('Francis, Count of Vendôme', 1470);
  const marie = find('Marie of Luxembourg', 1472);
  assertChild(find('Antoinette de Bourbon', 1494), francis, marie);
  assertChild(find('Charles, Duke of Vendôme', 1489), francis, marie);
  assertChild(find('Mary of Guise', 1515), find('Claude, Duke of Guise', 1496), find('Antoinette de Bourbon', 1494));
  assertChild(find('Antoine', 1518), find('Charles, Duke of Vendôme', 1489), find('Françoise', 1490));
  assertChild(find('Henry IV', 1553), find('Antoine', 1518), find('Jeanne', 1528));
});

test('the other British consort gateways have complete continental parentage', () => {
  const cases = [
    ['Anne of Cleves', 1515, 'John III, Duke of Cleves', 1490, 'Maria of Jülich-Berg', 1491],
    ['Mary of Modena', 1658, 'Alfonso IV', 1634, 'Laura Martinozzi', 1639],
    ['Caroline of Ansbach', 1683, 'John Frederick', 1654, 'Eleonore Erdmuthe', 1662],
    ['Augusta of Saxe-Gotha', 1719, 'Frederick II, Duke of Saxe-Gotha', 1676, 'Magdalena Augusta', 1679],
    ['Adelaide of Saxe-Meiningen', 1792, 'George I, Duke of Saxe-Meiningen', 1761, 'Louise Eleonore', 1763]
  ];
  for (const [childName, childYear, fatherName, fatherYear, motherName, motherYear] of cases) {
    assertChild(find(childName, childYear), find(fatherName, fatherYear), find(motherName, motherYear));
  }
});

test('the audited starter has reciprocal links, no one-parent births, and unique Geni identities', () => {
  const identities = new Map();
  for (const [personId, person] of Object.entries(people)) {
    assert.notEqual((person.parents || []).length, 1, `${person.displayName} has only one parent`);
    assert.match(personId, /^profile-g?\d+$/i);
    assert.match(person.sourceId || '', /^profile-g?\d+$/i);
    assert.ok(person.geniAliases?.includes(person.sourceId));
    for (const alias of person.geniAliases || []) {
      const previous = identities.get(alias);
      assert.ok(!previous || previous === personId, `${alias} belongs to both ${previous} and ${personId}`);
      identities.set(alias, personId);
    }
    for (const parentId of person.parents || []) assert.ok(people[parentId].children.includes(personId));
    for (const childId of person.children || []) assert.ok(people[childId].parents.includes(personId));
    for (const spouseId of person.spouses || []) assert.ok(people[spouseId].spouses.includes(personId));
  }
});

test('major audited roots expose connected descendant scopes', () => {
  for (const [fragment, year, required] of [
    ['Sophia Dorothea of Hanover', 1687, ['Frederick II', 'Louisa Ulrika', 'Frederick William II']],
    ['Charles Louis Frederick', 1708, ['Charlotte of Mecklenburg', 'Louise of Mecklenburg', 'Alexandra Feodorovna']],
    ['Isabella I', 1451, ['Catherine of Aragon', 'Anna of Austria', 'Elisabeth of Austria']],
    ['John IV', 1604, ['Catherine of Braganza', 'John V']]
  ]) {
    const scope = computeDescendantScope(people, find(fragment, year).id);
    const visible = [...scope.allowedIds].map(id => people[id]?.displayName || '').join(' | ');
    for (const name of required) assert.match(visible, new RegExp(name, 'i'));
  }
});
