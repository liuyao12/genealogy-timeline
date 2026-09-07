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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Page evaluation failed.');
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

const ROOT_GENI = 'profile-g6000000000000010001';
const WIFE_GENI = 'profile-g6000000000000010002';
const MISTRESS_GENI = 'profile-g6000000000000010003';
const NEW_CHILD_GENI = 'profile-g6000000000000010009';

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'initial page load');

await evaluate(`(() => {
  const person = (id, displayName, extra = {}) => ({
    id, displayName, firstName: '', lastName: '', title: '', gender: 'unknown',
    birthYear: '1900', deathYear: '1980', isLiving: false, place: '', note: '',
    parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
    marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {},
    namePeriods: [], defaultNamePeriodId: '', personalEvents: [],
    sourceUrl: '', sourceId: '', sourceProvider: '', importedAt: '',
    geniImmediateFamilyLoaded: false, geniImmediateFamilyVerifiedAt: '', geniImmediateFamilyIds: [],
    ...extra
  });
  const people = {
    'local-root': person('local-root', 'Local Root', {
      gender: 'male', sourceId: ${JSON.stringify(ROOT_GENI)}, sourceProvider: 'geni',
      children: ['legitimate', 'nonmarital', 'missing-parent', 'nn-child', 'stillborn', 'infant', 'next-year-infant', 'survivor'],
      partners: ['local-wife', 'local-mistress'], spouses: ['local-wife'], nonSpouses: ['local-mistress'],
      marriageYears: { 'local-wife': '1899' }
    }),
    [${JSON.stringify(ROOT_GENI)}]: person(${JSON.stringify(ROOT_GENI)}, 'Remote duplicate of root', {
      sourceId: ${JSON.stringify(ROOT_GENI)}, sourceProvider: 'geni', children: ['duplicate-linked-child'],
      partners: [${JSON.stringify(WIFE_GENI)}], spouses: [${JSON.stringify(WIFE_GENI)}], marriageYears: { [${JSON.stringify(WIFE_GENI)}]: '1899' }
    }),
    'local-wife': person('local-wife', 'Local Wife', {
      gender: 'female', sourceId: ${JSON.stringify(WIFE_GENI)}, sourceProvider: 'geni',
      children: ['legitimate', 'nn-child', 'stillborn', 'infant', 'next-year-infant', 'survivor', 'duplicate-linked-child'],
      partners: ['local-root'], spouses: ['local-root'], marriageYears: { 'local-root': '1899' }
    }),
    'local-mistress': person('local-mistress', 'Local Mistress', {
      gender: 'female', sourceId: ${JSON.stringify(MISTRESS_GENI)}, sourceProvider: 'geni',
      children: ['nonmarital'], partners: ['local-root'], nonSpouses: ['local-root']
    }),
    legitimate: person('legitimate', 'Legitimate Child', { parents: ['local-root', 'local-wife'] }),
    nonmarital: person('nonmarital', 'Non-marital Child', { parents: ['local-root', 'local-mistress'], children: ['hidden-grandchild'] }),
    'hidden-grandchild': person('hidden-grandchild', 'Hidden Grandchild', { parents: ['nonmarital', 'other-parent'] }),
    'other-parent': person('other-parent', 'Other Parent', { children: ['hidden-grandchild'] }),
    'missing-parent': person('missing-parent', 'One-parent Child', { parents: ['local-root'] }),
    'nn-child': person('nn-child', 'NN child of Root', { parents: ['local-root', 'local-wife'] }),
    stillborn: person('stillborn', 'Stillborn daughter', { birthYear: '1902', deathYear: '1902', parents: ['local-root', 'local-wife'] }),
    infant: person('infant', 'Infant One', { birthYear: '1903', deathYear: '1903', parents: ['local-root', 'local-wife'] }),
    'next-year-infant': person('next-year-infant', 'Infant Two', { birthYear: '1904', deathYear: '1905', parents: ['local-root', 'local-wife'] }),
    survivor: person('survivor', 'Young Survivor', { birthYear: '1906', deathYear: '1908', parents: ['local-root', 'local-wife'] }),
    'duplicate-linked-child': person('duplicate-linked-child', 'Child linked through duplicate ID', {
      parents: [${JSON.stringify(ROOT_GENI)}, ${JSON.stringify(WIFE_GENI)}]
    })
  };
  const workspace = {
    version: 1,
    activeTreeId: 'tree-noisy-births',
    trees: [{
      id: 'tree-noisy-births', title: 'Noisy birth test', rootId: 'local-root', people,
      globalEvents: [], reignColor: '#c62828', timelineYearWidth: 4, timelineNodeHeight: 28,
      asOfYear: null, lastAsOfYear: null, showDecadeBands: true, treeFilter: '', relationVisibility: {},
      starterDataVersion: 0, manualTree: true, collapsedIds: [], zoom: 1, viewportLeft: 0, viewportTop: 0
    }]
  };
  localStorage.clear();
  localStorage.setItem('lineage-tree-workspace-v1', JSON.stringify(workspace));
  location.reload();
  return true;
})()`);

await waitFor("document.readyState === 'complete'", 'synthetic tree reload');
await waitFor("document.querySelector('.timeline-node[data-person-id=\"local-root\"]')", 'local root timeline');

const visibleIds = await evaluate("Array.from(document.querySelectorAll('.timeline-node')).map(node => node.dataset.personId)");
for (const visible of ['local-root', 'local-wife', 'legitimate', 'survivor', 'duplicate-linked-child']) {
  assert.ok(visibleIds.includes(visible), `${visible} should remain visible`);
}
for (const hidden of ['nonmarital', 'hidden-grandchild', 'missing-parent', 'nn-child', 'stillborn', 'infant', 'next-year-infant']) {
  assert.ok(!visibleIds.includes(hidden), `${hidden} should be omitted from the projection`);
}

const restoredBeforeStitch = await evaluate(`(() => {
  const workspace = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
  const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId);
  return {
    keys: Object.keys(tree.people),
    duplicateChildParents: tree.people['duplicate-linked-child'].parents,
    rootChildren: tree.people['local-root'].children
  };
})()`);
assert.ok(restoredBeforeStitch.keys.includes('local-root'));
assert.ok(!restoredBeforeStitch.keys.includes(ROOT_GENI), 'restore should coalesce the duplicate public ID into the local anchor');
assert.deepEqual(new Set(restoredBeforeStitch.duplicateChildParents), new Set(['local-root', 'local-wife']));
assert.ok(restoredBeforeStitch.rootChildren.includes('duplicate-linked-child'));

await evaluate(`(() => {
  const input = document.getElementById('tree-filter');
  input.value = 'Non-marital Child';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await waitFor("Array.from(document.querySelectorAll('.person-list-row')).some(row => row.textContent.includes('Non-marital Child'))", 'hidden child search result');
assert.equal(await evaluate("document.querySelector('.timeline-node[data-person-id=\"nonmarital\"]') === null"), true);
await evaluate(`(() => {
  const input = document.getElementById('tree-filter');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);

const stitchPackage = {
  schema: 'lineage-stitch',
  version: 1,
  focusId: ROOT_GENI,
  rootId: ROOT_GENI,
  people: {
    [ROOT_GENI]: {
      id: ROOT_GENI, displayName: 'Remote Root', sourceId: ROOT_GENI, sourceProvider: 'geni',
      children: [NEW_CHILD_GENI], partners: [WIFE_GENI], spouses: [WIFE_GENI], marriageYears: { [WIFE_GENI]: '1899' }
    },
    [WIFE_GENI]: {
      id: WIFE_GENI, displayName: 'Remote Wife', sourceId: WIFE_GENI, sourceProvider: 'geni',
      children: [NEW_CHILD_GENI], partners: [ROOT_GENI], spouses: [ROOT_GENI], marriageYears: { [ROOT_GENI]: '1899' }
    },
    [NEW_CHILD_GENI]: {
      id: NEW_CHILD_GENI, displayName: 'New Geni Child', sourceId: NEW_CHILD_GENI, sourceProvider: 'geni',
      birthYear: '1910', deathYear: '1990', parents: [ROOT_GENI, WIFE_GENI]
    }
  }
};
await evaluate(`(() => {
  document.getElementById('ai-import-json').value = ${JSON.stringify(JSON.stringify(stitchPackage))};
  document.getElementById('stitch-ai-import').click();
  return true;
})()`);
await waitFor(`document.querySelector('.timeline-node[data-person-id=${JSON.stringify(NEW_CHILD_GENI)}]')`, 'new Geni child timeline node');
await waitFor("document.getElementById('toast').textContent.includes('coalesced by public ID')", 'dedupe completion message');

const stitched = await evaluate(`(() => {
  const workspace = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
  const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId);
  return {
    keys: Object.keys(tree.people),
    root: tree.people['local-root'],
    wife: tree.people['local-wife'],
    child: tree.people[${JSON.stringify(NEW_CHILD_GENI)}],
    toast: document.getElementById('toast').textContent
  };
})()`);
assert.ok(stitched.keys.includes('local-root'));
assert.ok(stitched.keys.includes('local-wife'));
assert.ok(!stitched.keys.includes(ROOT_GENI));
assert.ok(!stitched.keys.includes(WIFE_GENI));
assert.equal(stitched.root.displayName, 'Local Root', 'local naming must win over a later Geni display name');
assert.equal(stitched.wife.displayName, 'Local Wife');
assert.ok(stitched.root.children.includes(NEW_CHILD_GENI));
assert.ok(stitched.wife.children.includes(NEW_CHILD_GENI));
assert.deepEqual(new Set(stitched.child.parents), new Set(['local-root', 'local-wife']));
assert.ok(stitched.root.spouses.includes('local-wife'));
assert.ok(stitched.wife.spouses.includes('local-root'));
assert.match(stitched.toast, /duplicate Geni records? coalesced by public ID/);

console.log(JSON.stringify({
  visibleBeforeStitch: visibleIds,
  restoredProfileCount: restoredBeforeStitch.keys.length,
  stitchedProfileCount: stitched.keys.length,
  newChildParents: stitched.child.parents,
  toast: stitched.toast
}));

socket.close();
