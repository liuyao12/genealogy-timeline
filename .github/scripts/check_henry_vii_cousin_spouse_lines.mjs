import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debugPort = Number(process.argv[3] || 9222);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
      if (response.ok) {
        const page = (await response.json()).find(target => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome debugging endpoint did not become available');
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
  const response = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Page evaluation failed');
  return response.result?.value;
}
async function waitFor(expression, label, timeout = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'page load');
await waitFor("document.getElementById('tree-filter')", 'application controls');
if (!await evaluate("document.querySelectorAll('.timeline-node').length")) {
  await evaluate("document.getElementById('royal-example-button').click(); true");
}
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'starter timeline');

await evaluate(`(() => {
  const input = document.getElementById('tree-filter');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);

const expectedIds = [
  'profile-g312092994390004595',
  'profile-g311788525210007050',
  'profile-g5145210727590105956',
  'profile-g6000000002435383373',
  'profile-g6000000003858695567',
  'profile-g6000000003876051113',
  'profile-g6000000000048910716',
  'profile-g6000000002447248679',
  'profile-g6000000001260403655',
  'profile-4532996',
  'profile-g4134741994550032164',
  'profile-g6000000003070981015',
  'profile-g5495575341940116659'
];
for (const personId of expectedIds) {
  await waitFor(`document.querySelector('.timeline-node[data-person-id="${personId}"]')`, `${personId} timeline node`);
}

const duplicateIds = await evaluate(`(() => {
  const ids = Array.from(document.querySelectorAll('.timeline-node')).map(node => node.dataset.personId).filter(Boolean);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
})()`);
assert.deepEqual(duplicateIds, []);

await evaluate("document.querySelector('.timeline-node[data-person-id=\"profile-g4138652783200125692\"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); true");
await waitFor("document.getElementById('person-heading').textContent.includes('Caroline of Brunswick')", 'Caroline side panel');
const carolineRows = await evaluate("Array.from(document.querySelectorAll('#relationship-households .relationship-row')).map(row => row.textContent.replace(/\\s+/g, ' ').trim())");
assert.ok(carolineRows.some(row => row.includes('Augusta, Duchess of Brunswick-Wolfenbüttel')));
assert.ok(carolineRows.some(row => row.includes('Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel')));
assert.ok(carolineRows.some(row => row.includes('George IV, King of Great Britain and Ireland')));
assert.ok(carolineRows.some(row => row.includes('Princess Charlotte of Wales')));

const beforeRoot = await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId || ''");
const downgraded = await evaluate(`(() => {
  const newIds = new Set(${JSON.stringify([
    'profile-g312092994390004595',
    'profile-g311788525210007050',
    'profile-g5145210727590105956',
    'profile-g6000000002435383373',
    'profile-g6000000003858695567',
    'profile-g6000000000048910716',
    'profile-g6000000001847933002',
    'profile-g6000000002447248679',
    'profile-g6000000007329600601',
    'profile-4532996',
    'profile-g6000000002737707932'
  ])});
  for (const key of Object.keys(localStorage)) {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (workspace?.version !== 1 || !Array.isArray(workspace.trees)) continue;
    const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId) || workspace.trees[0];
    if (!tree?.people?.['profile-g6000000003760873898']) continue;
    tree.starterDataVersion = 28;
    for (const id of newIds) delete tree.people[id];
    for (const person of Object.values(tree.people)) {
      for (const field of ['parents','children','partners','spouses','nonSpouses','divorcedSpouses','geniImmediateFamilyIds']) {
        if (Array.isArray(person[field])) person[field] = person[field].filter(id => !newIds.has(id));
      }
      for (const field of ['marriageYears','relationshipEndYears','relationshipEndStatuses']) {
        if (!person[field] || typeof person[field] !== 'object') continue;
        for (const id of newIds) delete person[field][id];
      }
    }
    const resetParents = id => { if (tree.people[id]) tree.people[id].parents = tree.people[id].parents.filter(parent => !newIds.has(parent)); };
    resetParents('profile-g4138652783200125692');
    resetParents('profile-g6000000003876051113');
    resetParents('profile-g6000000001260403655');
    resetParents('profile-g4134741994550032164');
    localStorage.setItem(key, JSON.stringify(workspace));
    return { key, rootId: tree.rootId };
  }
  return null;
})()`);
assert.ok(downgraded);
await evaluate('location.reload(); true');
await waitFor("document.readyState === 'complete'", 'reload');
await waitFor("document.querySelector('.timeline-node[data-person-id=\"profile-g312092994390004595\"]')", 'migrated Caroline branch');
await waitFor("document.querySelector('.timeline-node[data-person-id=\"profile-g6000000002435383373\"]')", 'migrated Darnley branch');
const upgraded = await evaluate(`(() => {
  for (const key of Object.keys(localStorage)) {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (workspace?.version !== 1 || !Array.isArray(workspace.trees)) continue;
    const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId) || workspace.trees[0];
    if (!tree?.people?.['profile-g6000000003760873898']) continue;
    return {
      version: tree.starterDataVersion,
      rootId: tree.rootId,
      profiles: Object.keys(tree.people).length,
      carolineParents: tree.people['profile-g4138652783200125692'].parents,
      darnleyParents: tree.people['profile-g6000000003876051113'].parents,
      augustaParents: tree.people['profile-g6000000001260403655'].parents,
      louiseParents: tree.people['profile-g4134741994550032164'].parents
    };
  }
  return null;
})()`);
assert.equal(upgraded.version, 29);
assert.equal(upgraded.rootId, beforeRoot);
assert.equal(upgraded.profiles, 179);
for (const parents of [upgraded.carolineParents, upgraded.darnleyParents, upgraded.augustaParents, upgraded.louiseParents]) {
  assert.equal(parents.length, 2);
}

console.log(JSON.stringify({
  visibleNodes: await evaluate("document.querySelectorAll('.timeline-node').length"),
  carolineRows,
  downgraded,
  upgraded
}));
socket.close();
