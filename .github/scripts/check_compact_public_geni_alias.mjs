import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debugPort = Number(process.argv[3] || 9222);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function debuggerUrl() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
      const targets = response.ok ? await response.json() : [];
      const page = targets.find(target => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome debugging endpoint did not become available.');
}

const socket = new WebSocket(await debuggerUrl());
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
});
function command(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Page evaluation failed.');
  return response.result?.value;
}
async function waitFor(expression, label, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

const compact = 'profile-42';
const publicId = 'profile-g6000000000000000042';
const spouseCompact = 'profile-43';
const spousePublic = 'profile-g6000000000000000043';
const childPublic = 'profile-g6000000000000000044';

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'initial page load');

await evaluate(`(() => {
  const person = (id, displayName, sourceId, sourceUrl, extra = {}) => ({
    id, displayName, firstName: '', lastName: '', title: '', gender: 'unknown',
    birthYear: '1900', deathYear: '1980', isLiving: false, place: '', note: '',
    parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
    marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {},
    namePeriods: [], defaultNamePeriodId: '', personalEvents: [],
    sourceUrl, sourceId, sourceProvider: 'geni', importedAt: '',
    geniImmediateFamilyLoaded: false, geniImmediateFamilyVerifiedAt: '', geniImmediateFamilyIds: [],
    ...extra
  });
  const people = {
    'local-root': person(
      'local-root', 'Locally Named Root', ${JSON.stringify(compact)},
      'https://www.geni.com/people/Locally-Named-Root/6000000000000000042',
      { gender: 'male', partners: ['local-spouse'], spouses: ['local-spouse'], marriageYears: { 'local-spouse': '1920' } }
    ),
    'local-spouse': person(
      'local-spouse', 'Locally Named Spouse', ${JSON.stringify(spouseCompact)},
      'https://www.geni.com/people/Locally-Named-Spouse/6000000000000000043',
      { gender: 'female', partners: ['local-root'], spouses: ['local-root'], marriageYears: { 'local-root': '1920' } }
    )
  };
  localStorage.clear();
  localStorage.setItem('lineage-tree-workspace-v1', JSON.stringify({
    version: 1,
    activeTreeId: 'alias-tree',
    trees: [{
      id: 'alias-tree', title: 'Alias merge test', rootId: 'local-root', people,
      globalEvents: [], reignColor: '#c62828', timelineYearWidth: 4, timelineNodeHeight: 28,
      asOfYear: null, lastAsOfYear: null, showDecadeBands: true, treeFilter: '', relationVisibility: {},
      starterDataVersion: 0, manualTree: true, collapsedIds: [], zoom: 1, viewportLeft: 0, viewportTop: 0
    }]
  }));
  location.reload();
  return true;
})()`);
await waitFor("document.readyState === 'complete'", 'synthetic tree reload');
await waitFor("document.querySelector('.timeline-node[data-person-id=\"local-root\"]')", 'local root node');

const packageValue = {
  schema: 'lineage-stitch',
  version: 1,
  rootId: compact,
  focusId: compact,
  people: {
    [compact]: {
      id: compact,
      sourceId: publicId,
      sourceUrl: 'https://www.geni.com/people/Remote-Root/6000000000000000042',
      sourceProvider: 'geni', displayName: 'Remote Root', birthYear: '1900', deathYear: '1980',
      partners: [spouseCompact], spouses: [spouseCompact], children: [childPublic], marriageYears: { [spouseCompact]: '1920' }
    },
    [spouseCompact]: {
      id: spouseCompact,
      sourceId: spousePublic,
      sourceUrl: 'https://www.geni.com/people/Remote-Spouse/6000000000000000043',
      sourceProvider: 'geni', displayName: 'Remote Spouse', birthYear: '1901', deathYear: '1981',
      partners: [compact], spouses: [compact], children: [childPublic], marriageYears: { [compact]: '1920' }
    },
    [childPublic]: {
      id: childPublic, sourceId: childPublic,
      sourceUrl: 'https://www.geni.com/people/New-Child/6000000000000000044',
      sourceProvider: 'geni', displayName: 'New Child', birthYear: '1925', deathYear: '2000',
      parents: [compact, spouseCompact]
    }
  }
};

await evaluate(`(() => {
  document.getElementById('ai-import-json').value = ${JSON.stringify(JSON.stringify(packageValue))};
  document.getElementById('stitch-ai-import').click();
  return true;
})()`);
await waitFor(`document.querySelector('.timeline-node[data-person-id=${JSON.stringify(childPublic)}]')`, 'new child node');

const result = await evaluate(`(() => {
  const workspace = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
  const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId);
  return {
    keys: Object.keys(tree.people),
    root: tree.people['local-root'],
    spouse: tree.people['local-spouse'],
    child: tree.people[${JSON.stringify(childPublic)}]
  };
})()`);
assert.deepEqual(new Set(result.keys), new Set(['local-root', 'local-spouse', childPublic]));
assert.equal(result.root.displayName, 'Locally Named Root');
assert.equal(result.root.sourceId, publicId, 'the public GUID should replace the compact source identity');
assert.equal(result.spouse.displayName, 'Locally Named Spouse');
assert.equal(result.spouse.sourceId, spousePublic);
assert.deepEqual(new Set(result.child.parents), new Set(['local-root', 'local-spouse']));
assert.ok(result.root.children.includes(childPublic));
assert.ok(result.spouse.children.includes(childPublic));
assert.ok(result.root.spouses.includes('local-spouse'));
assert.ok(result.spouse.spouses.includes('local-root'));

console.log(JSON.stringify({
  keys: result.keys,
  rootSourceId: result.root.sourceId,
  spouseSourceId: result.spouse.sourceId,
  childParents: result.child.parents
}));
socket.close();
