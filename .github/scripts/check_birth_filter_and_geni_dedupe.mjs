import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debugPort = Number(process.argv[3] || 9222);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(target => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome debugging endpoint did not become available.');
}

const socket = new WebSocket(await waitForDebugger());
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page evaluation failed.');
  }
  return result.result?.value;
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

const ROOT_GENI = 'profile-g6000000000000000042';
const SPOUSE_GENI = 'profile-g6000000000000000044';
const EXISTING_CHILD = 'local-existing-child';
const LEGITIMATE = 'profile-g6000000000000000043';
const INFANT = 'profile-g6000000000000000045';
const NN = 'profile-g6000000000000000046';
const MISSING_PARENT = 'profile-g6000000000000000047';
const NON_MARITAL = 'profile-g6000000000000000048';
const MISTRESS = 'profile-g6000000000000000049';
const STILLBORN = 'profile-g6000000000000000050';

const basePerson = overrides => ({
  firstName: '', lastName: '', title: '', gender: 'unknown', birthYear: '', deathYear: '', isLiving: false,
  place: '', note: '', parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
  marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, namePeriods: [], defaultNamePeriodId: '',
  personalEvents: [], sourceUrl: '', sourceId: '', sourceProvider: '', importedAt: '',
  geniImmediateFamilyLoaded: false, geniImmediateFamilyVerifiedAt: '', geniImmediateFamilyIds: [],
  ...overrides
});

const initialPeople = {
  'local-root': basePerson({
    id: 'local-root', displayName: 'Locally edited Root', gender: 'male', birthYear: '1970', deathYear: '2070',
    children: [EXISTING_CHILD], partners: ['local-spouse'], spouses: ['local-spouse'],
    marriageYears: { 'local-spouse': '1995' }, sourceId: ROOT_GENI,
    sourceUrl: 'https://www.geni.com/people/Root/6000000000000000042', sourceProvider: 'geni'
  }),
  [ROOT_GENI]: basePerson({
    id: ROOT_GENI, displayName: 'Duplicate remote Root', gender: 'male', birthYear: '1970', deathYear: '2070',
    children: [EXISTING_CHILD], sourceId: ROOT_GENI,
    sourceUrl: 'https://www.geni.com/people/Root/6000000000000000042', sourceProvider: 'geni'
  }),
  'local-spouse': basePerson({
    id: 'local-spouse', displayName: 'Locally edited Spouse', gender: 'female', birthYear: '1972', deathYear: '2072',
    children: [EXISTING_CHILD], partners: ['local-root'], spouses: ['local-root'],
    marriageYears: { 'local-root': '1995' }, sourceId: SPOUSE_GENI,
    sourceUrl: 'https://www.geni.com/people/Spouse/6000000000000000044', sourceProvider: 'geni'
  }),
  [EXISTING_CHILD]: basePerson({
    id: EXISTING_CHILD, displayName: 'Existing Child', gender: 'female', birthYear: '1998', deathYear: '2080',
    parents: [ROOT_GENI, 'local-spouse']
  })
};

const workspace = {
  version: 1,
  activeTreeId: 'tree-dedupe-test',
  trees: [{
    id: 'tree-dedupe-test', title: 'Geni identity merge test', rootId: 'local-root', people: initialPeople,
    globalEvents: [], reignColor: '#c62828', timelineYearWidth: 4, timelineNodeHeight: 28,
    asOfYear: null, lastAsOfYear: null, showDecadeBands: true, treeFilter: '', relationVisibility: {},
    starterDataVersion: 0, manualTree: true, collapsedIds: [], zoom: 1, viewportLeft: 0, viewportTop: 0
  }]
};

const stitchPeople = {
  [ROOT_GENI]: basePerson({
    id: ROOT_GENI, displayName: 'Remote Root', gender: 'male', birthYear: '1970', deathYear: '2070',
    children: [LEGITIMATE, INFANT, NN, MISSING_PARENT, NON_MARITAL, STILLBORN],
    partners: [SPOUSE_GENI, MISTRESS], spouses: [SPOUSE_GENI], nonSpouses: [MISTRESS],
    marriageYears: { [SPOUSE_GENI]: '1995' }, sourceId: ROOT_GENI,
    sourceUrl: 'https://www.geni.com/people/Root/6000000000000000042', sourceProvider: 'geni'
  }),
  [SPOUSE_GENI]: basePerson({
    id: SPOUSE_GENI, displayName: 'Remote Spouse', gender: 'female', birthYear: '1972', deathYear: '2072',
    children: [LEGITIMATE, INFANT, NN, STILLBORN], partners: [ROOT_GENI], spouses: [ROOT_GENI],
    marriageYears: { [ROOT_GENI]: '1995' }, sourceId: SPOUSE_GENI,
    sourceUrl: 'https://www.geni.com/people/Spouse/6000000000000000044', sourceProvider: 'geni'
  }),
  [LEGITIMATE]: basePerson({
    id: LEGITIMATE, displayName: 'Legitimate Child', gender: 'female', birthYear: '2000', deathYear: '2080',
    parents: [ROOT_GENI, SPOUSE_GENI], sourceId: LEGITIMATE,
    sourceUrl: 'https://www.geni.com/people/Legitimate/6000000000000000043', sourceProvider: 'geni'
  }),
  [INFANT]: basePerson({
    id: INFANT, displayName: 'David Test', gender: 'male', birthYear: '2001', deathYear: '2002',
    parents: [ROOT_GENI, SPOUSE_GENI], sourceId: INFANT,
    sourceUrl: 'https://www.geni.com/people/David/6000000000000000045', sourceProvider: 'geni'
  }),
  [NN]: basePerson({
    id: NN, displayName: 'N.N., daughter of Root', gender: 'female', birthYear: '2003', deathYear: '2070',
    parents: [ROOT_GENI, SPOUSE_GENI], sourceId: NN,
    sourceUrl: 'https://www.geni.com/people/NN/6000000000000000046', sourceProvider: 'geni'
  }),
  [MISSING_PARENT]: basePerson({
    id: MISSING_PARENT, displayName: 'One Parent Child', gender: 'male', birthYear: '2004', deathYear: '2070',
    parents: [ROOT_GENI], sourceId: MISSING_PARENT,
    sourceUrl: 'https://www.geni.com/people/One-Parent/6000000000000000047', sourceProvider: 'geni'
  }),
  [MISTRESS]: basePerson({
    id: MISTRESS, displayName: 'Recorded Mistress', gender: 'female', birthYear: '1975', deathYear: '2075',
    children: [NON_MARITAL], partners: [ROOT_GENI], nonSpouses: [ROOT_GENI], sourceId: MISTRESS,
    sourceUrl: 'https://www.geni.com/people/Mistress/6000000000000000049', sourceProvider: 'geni'
  }),
  [NON_MARITAL]: basePerson({
    id: NON_MARITAL, displayName: 'Non-marital Child', gender: 'male', birthYear: '2005', deathYear: '2070',
    parents: [ROOT_GENI, MISTRESS], geniParentUnionStatus: 'partner', geniNonMaritalBirth: true,
    sourceId: NON_MARITAL,
    sourceUrl: 'https://www.geni.com/people/Non-Marital/6000000000000000048', sourceProvider: 'geni'
  }),
  [STILLBORN]: basePerson({
    id: STILLBORN, displayName: 'Stillborn son of Root', gender: 'male', birthYear: '2006', deathYear: '2006',
    parents: [ROOT_GENI, SPOUSE_GENI], sourceId: STILLBORN,
    sourceUrl: 'https://www.geni.com/people/Stillborn/6000000000000000050', sourceProvider: 'geni'
  })
};

const stitchPackage = {
  schema: 'lineage-stitch', version: 1, focusId: ROOT_GENI, rootId: ROOT_GENI, people: stitchPeople
};

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'initial page load');
await waitFor("document.getElementById('tree-filter')", 'initial application controls');

await evaluate(`localStorage.setItem('lineage-tree-workspace-v1', ${JSON.stringify(JSON.stringify(workspace))}); location.reload(); true`);
await waitFor("document.readyState === 'complete'", 'custom workspace reload');
await waitFor("document.querySelector('.timeline-node[data-person-id=\"local-root\"]')", 'local root timeline node');

await evaluate(`(() => {
  const textarea = document.getElementById('ai-import-json');
  textarea.value = ${JSON.stringify(JSON.stringify(stitchPackage))};
  document.getElementById('stitch-ai-import').click();
  return true;
})()`);
await waitFor("document.querySelector('.timeline-node[data-person-id=\"profile-g6000000000000000043\"]')", 'legitimate child timeline node');
await waitFor("!document.querySelector('.timeline-node[data-person-id=\"profile-g6000000000000000042\"]')", 'canonical duplicate removal');

const visibleIds = await evaluate("Array.from(new Set(Array.from(document.querySelectorAll('.timeline-node')).map(node => node.dataset.personId))).sort()");
for (const expected of ['local-root', 'local-spouse', EXISTING_CHILD, LEGITIMATE]) {
  assert.ok(visibleIds.includes(expected), `${expected} should remain visible`);
}
for (const hidden of [ROOT_GENI, SPOUSE_GENI, INFANT, NN, MISSING_PARENT, NON_MARITAL, MISTRESS, STILLBORN]) {
  assert.ok(!visibleIds.includes(hidden), `${hidden} should not appear on the timeline`);
}

const stored = await evaluate(`(() => {
  const workspace = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
  return workspace.trees.find(tree => tree.id === workspace.activeTreeId);
})()`);
assert.equal(stored.rootId, 'local-root');
assert.ok(stored.people['local-root']);
assert.ok(stored.people['local-spouse']);
assert.equal(stored.people[ROOT_GENI], undefined);
assert.equal(stored.people[SPOUSE_GENI], undefined);
assert.equal(stored.people['local-root'].displayName, 'Locally edited Root');
assert.equal(stored.people['local-spouse'].displayName, 'Locally edited Spouse');
assert.equal(stored.people['local-root'].sourceId, ROOT_GENI);
assert.equal(stored.people['local-spouse'].sourceId, SPOUSE_GENI);
assert.deepEqual(stored.people[LEGITIMATE].parents.sort(), ['local-root', 'local-spouse']);
assert.ok(stored.people['local-root'].children.includes(LEGITIMATE));
assert.ok(stored.people['local-spouse'].children.includes(LEGITIMATE));
assert.deepEqual(stored.people[EXISTING_CHILD].parents.sort(), ['local-root', 'local-spouse']);
assert.equal(stored.people[NON_MARITAL].geniParentUnionStatus, 'partner');
assert.equal(stored.people[NON_MARITAL].geniNonMaritalBirth, true);

await evaluate(`(() => {
  const input = document.getElementById('tree-filter');
  input.value = 'N.N.';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await waitFor(
  `Array.from(document.querySelectorAll('.person-list-row')).some(row => row.dataset.personId === ${JSON.stringify(NN)})`,
  'hidden NN search result'
);
assert.equal(await evaluate(`Boolean(document.querySelector('.timeline-node[data-person-id=${JSON.stringify(NN)}]'))`), false);
await evaluate(`document.querySelector('.person-list-row[data-person-id=${JSON.stringify(NN)}] .person-list-item').click(); true`);
await waitFor("document.getElementById('person-heading').textContent.includes('N.N.')", 'hidden NN profile side panel');
assert.equal(await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId"), 'local-root');

console.log(JSON.stringify({
  visibleIds,
  storedProfiles: Object.keys(stored.people).length,
  rootChildren: stored.people['local-root'].children,
  legitimateParents: stored.people[LEGITIMATE].parents,
  hiddenSearchResult: NN
}));

socket.close();
