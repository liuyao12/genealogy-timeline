import assert from 'node:assert/strict';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const port = Number(process.argv[3] || 9222);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function json(url, options = {}) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Could not reach ${url}`);
}

const targetInfo = await json(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`,
  { method: 'PUT' }
);
const socket = new WebSocket(targetInfo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function waitFor(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

await send('Page.enable');
await send('Runtime.enable');
await waitFor("document.readyState === 'complete' && document.querySelector('#timeline-canvas')");

await evaluate(`(() => {
  const relationDefaults = () => ({
    parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
    marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {},
    namePeriods: [], personalEvents: [], geniImmediateFamilyIds: []
  });
  const person = (id, displayName, gender, birthYear, deathYear, relations = {}) => ({
    ...relationDefaults(), id, displayName, gender, birthYear, deathYear,
    sourceProvider: 'json', ...relations
  });
  const people = {
    root: person('root', 'Root ancestor', 'male', '1900', '1980', {
      children: ['lineal'], partners: ['root-spouse'], spouses: ['root-spouse'],
      marriageYears: { 'root-spouse': '1925' }
    }),
    'root-spouse': person('root-spouse', 'Root spouse', 'female', '1902', '1985', {
      children: ['lineal'], partners: ['root'], spouses: ['root'], marriageYears: { root: '1925' }
    }),
    lineal: person('lineal', 'Lineal spouse', 'male', '1930', '2000', {
      parents: ['root', 'root-spouse'], children: ['shared-child'],
      partners: ['selected'], spouses: ['selected'], marriageYears: { selected: '1952' }
    }),
    selected: person('selected', 'Selected profile', 'female', '1932', '2010', {
      children: ['shared-child', 'other-child'],
      partners: ['lineal', 'other-spouse'], spouses: ['lineal', 'other-spouse'],
      marriageYears: { lineal: '1952', 'other-spouse': '1958' }
    }),
    'other-spouse': person('other-spouse', 'Other spouse', 'male', '1928', '1998', {
      children: ['other-child'], partners: ['selected'], spouses: ['selected'],
      marriageYears: { selected: '1958' }
    }),
    'shared-child': person('shared-child', 'Shared child', 'female', '1954', '2020', {
      parents: ['lineal', 'selected']
    }),
    'other-child': person('other-child', 'Other child', 'male', '1960', '2021', {
      parents: ['selected', 'other-spouse']
    })
  };
  const workspace = {
    version: 1,
    activeTreeId: 'side-panel-test',
    trees: [{
      id: 'side-panel-test', title: 'Side-panel complete-family test', rootId: 'root', people,
      globalEvents: [], reignColor: '#c62828', otherMonarchColor: '#3949ab',
      timelineYearWidth: 4, timelineNodeHeight: 28, asOfYear: null, lastAsOfYear: null,
      showPersonalEvents: true, showDecadeBands: true, treeFilter: '', relationVisibility: {},
      starterDataVersion: 0, manualTree: true, collapsedIds: [], zoom: 1,
      viewportLeft: 0, viewportTop: 0
    }]
  };
  localStorage.setItem('lineage-tree-workspace-v1', JSON.stringify(workspace));
  location.reload();
  return true;
})()`);

await waitFor("document.readyState === 'complete' && document.querySelector('.timeline-node[data-person-id=\"selected\"]')");

await evaluate(`(() => {
  const node = document.querySelector('.timeline-node[data-person-id="selected"]');
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
})()`);
await waitFor("document.querySelector('#person-heading')?.textContent.includes('Selected profile')");

const result = await evaluate(`(() => {
  const workspace = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
  const tree = workspace.trees.find(item => item.id === workspace.activeTreeId);
  const rows = [...document.querySelectorAll('#relationship-households .relationship-row')].map(row => ({
    name: row.querySelector('strong')?.textContent || '',
    hidden: row.classList.contains('is-hidden')
  }));
  return {
    rootId: tree.rootId,
    selectedIsSpouseNode: document.querySelector('.timeline-node[data-person-id="selected"]')?.classList.contains('spouse') || false,
    otherSpouseVisibleInTimeline: Boolean(document.querySelector('.timeline-node[data-person-id="other-spouse"]')),
    rows
  };
})()`);

assert.equal(result.rootId, 'root', 'opening the side panel must not refocus the tree');
assert.equal(result.selectedIsSpouseNode, true, 'the regression fixture must inspect a spouse-layer node');
assert.equal(result.otherSpouseVisibleInTimeline, false, 'the other marriage should remain outside the current focus tree');
assert.deepEqual(
  result.rows.map(row => row.name).sort(),
  ['Lineal spouse', 'Other child', 'Other spouse', 'Shared child'].sort()
);
assert.equal(result.rows.find(row => row.name === 'Other spouse')?.hidden, true);
assert.equal(result.rows.find(row => row.name === 'Other child')?.hidden, true);

console.log(JSON.stringify(result));
socket.close();
