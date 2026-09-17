import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { birthOrderPairs, packTimelineRunsSourceFirst } from '../timeline-compaction.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = source.indexOf('function timelineNodeRange(');
const end = source.indexOf('// D3\'s tidy tree', start);
assert.ok(start >= 0 && end > start, 'production layout helpers must be present');
const rowStepExpression = source.slice(source.indexOf('function renderTimeline()'))
  .match(/const rowStep = ([^;]+);/)?.[1];
assert.ok(rowStepExpression, 'read the actual renderer row step, not a test copy');

function layout(people, ids, rowHeight, parentPairs = [], ranges = {}) {
  const context = { state: { people }, birthOrderPairs, packTimelineRunsSourceFirst,
    numericYear: value => Number.parseInt(value, 10), rowHeight };
  const helpers = runInNewContext(`${source.slice(start, end)}\n({
    immediate: timelineNodesAreImmediateFamily,
    stabilize: stabilizeTimelineOrder,
    rowStep: ${rowStepExpression}
  })`, context);
  const nodes = ids.map((id, index) => ({ id, key: id, x: ranges[id]?.x ?? 0,
    occupancyWidth: ranges[id]?.width ?? 100, y: index * helpers.rowStep }));
  helpers.stabilize(nodes, new Map(parentPairs), rowHeight, helpers.rowStep, new Map());
  return { nodes, helpers };
}

const person = (id, data = {}) => ({ id, spouses: [], parents: [], children: [], birthYear: '1900', ...data });
const pairs = {
  spouses: [person('a', { spouses: ['b'] }), person('b', { spouses: ['a'] })],
  'parent and child': [person('a', { children: ['b'] }), person('b', { parents: ['a'] })],
  'one-sided parent link': [person('a'), person('b', { parents: ['a'] })],
  siblings: [person('a', { parents: ['p', 'q'] }), person('b', { parents: ['p', 'q'] })],
  'half siblings': [person('a', { parents: ['p', 'q'] }), person('b', { parents: ['p', 'r'] })],
  unrelated: [person('a'), person('b')],
  'co-spouses': [person('a', { spouses: ['p'] }), person('b', { spouses: ['p'] })],
  'grandparent and grandchild': [person('a', { children: ['p'] }), person('b', { parents: ['p'] })],
  cousins: [person('a', { parents: ['p'] }), person('b', { parents: ['q'] })]
};
const immediateKinds = new Set(['spouses', 'parent and child', 'one-sided parent link', 'siblings', 'half siblings']);
for (const height of [24, 28, 32, 36, 42]) {
  for (const [kind, pair] of Object.entries(pairs)) {
    test(`${height}px nodes: ${kind} retain ${immediateKinds.has(kind) ? 6 : 16}px of clear space`, () => {
      const people = Object.fromEntries(pair.map(p => [p.id, p]));
      const { nodes, helpers } = layout(people, ['a', 'b'], height);
      assert.equal(helpers.immediate(nodes[0], nodes[1]), immediateKinds.has(kind));
      assert.equal(Math.abs(nodes[1].y - nodes[0].y) - height, immediateKinds.has(kind) ? 6 : 16);
    });
  }
  test(`${height}px nodes: compaction preserves a close family run beside an unrelated run`, () => {
    const people = {
      a: person('a', { spouses: ['b'], children: ['c', 'd'] }),
      b: person('b', { spouses: ['a'], children: ['c', 'd'] }),
      c: person('c', { parents: ['a', 'b'] }),
      d: person('d', { parents: ['a', 'b'] }),
      e: person('e')
    };
    const { nodes } = layout(people, ['a', 'b', 'c', 'd', 'e'], height,
      [['b', 'a'], ['c', 'b'], ['d', 'b']]);
    for (let i = 1; i <= 3; i++) assert.equal(nodes[i].y - nodes[i - 1].y - height, 6);
    assert.equal(nodes[4].y - nodes[3].y - height, 16);
  });
}

test('horizontally disjoint unrelated branches can still reuse a row', () => {
  const people = { a: person('a'), b: person('b') };
  const { nodes } = layout(people, ['a', 'b'], 28, [], { b: { x: 200 } });
  assert.equal(nodes[0].y, nodes[1].y);
});
