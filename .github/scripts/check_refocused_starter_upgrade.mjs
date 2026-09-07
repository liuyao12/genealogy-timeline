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

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'page load');
await waitFor("document.getElementById('tree-filter')", 'application controls');
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'starter timeline');

await evaluate(`(() => {
  const input = document.getElementById('tree-filter');
  input.value = 'Louis XII, King of France';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await waitFor(
  "Array.from(document.querySelectorAll('.person-list-row')).some(row => row.textContent.includes('Louis XII, King of France'))",
  'Louis XII search result'
);
const louisId = await evaluate("Array.from(document.querySelectorAll('.person-list-row')).find(row => row.textContent.includes('Louis XII, King of France'))?.dataset.personId || ''");
assert.equal(louisId, 'profile-g6000000000440363134');
await evaluate(`document.querySelector('.person-list-row[data-person-id="${louisId}"] .person-list-item').click(); true`);
await waitFor("document.getElementById('person-heading').textContent.includes('Louis XII')", 'Louis XII side panel');
await evaluate("document.getElementById('focus-tree-button').click(); true");
await waitFor(`document.querySelector('.timeline-node.focus')?.dataset.personId === ${JSON.stringify(louisId)}`, 'Louis XII focus');
await waitFor("!document.documentElement.classList.contains('focus-tree-transitioning')", 'focus transition');

const downgraded = await evaluate(`(() => {
  for (const key of Object.keys(localStorage)) {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (workspace?.version !== 1 || !Array.isArray(workspace.trees)) continue;
    const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId) || workspace.trees[0];
    if (!tree?.people?.[${JSON.stringify(louisId)}]) continue;
    tree.rootId = ${JSON.stringify(louisId)};
    tree.starterDataVersion = 25;
    const removed = new Set(Object.keys(tree.people).filter(id => id.startsWith('royal-')));
    for (const id of removed) delete tree.people[id];
    for (const person of Object.values(tree.people)) {
      for (const field of ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds']) {
        if (Array.isArray(person[field])) person[field] = person[field].filter(id => !removed.has(id));
      }
      for (const field of ['marriageYears', 'relationshipEndYears', 'relationshipEndStatuses']) {
        if (!person[field] || typeof person[field] !== 'object') continue;
        for (const id of removed) delete person[field][id];
      }
    }
    localStorage.setItem(key, JSON.stringify(workspace));
    return { key, removed: removed.size };
  }
  return null;
})()`);
assert.ok(downgraded, 'could not locate the saved starter workspace');
assert.ok(downgraded.removed >= 40, 'the simulated version-25 tree should remove the foreign expansion');

await evaluate('location.reload(); true');
await waitFor("document.readyState === 'complete'", 'reload');
await waitFor("document.getElementById('tree-filter')", 'reloaded controls');
await waitFor(`document.querySelector('.timeline-node.focus')?.dataset.personId === ${JSON.stringify(louisId)}`, 'preserved refocused root');
await waitFor("document.querySelector('.timeline-node[data-person-id=\"royal-france-claude-1499\"]')", 'restored Claude profile');

const restored = await evaluate(`(() => {
  for (const key of Object.keys(localStorage)) {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (workspace?.version !== 1 || !Array.isArray(workspace.trees)) continue;
    const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId) || workspace.trees[0];
    if (!tree?.people?.[${JSON.stringify(louisId)}]) continue;
    return {
      rootId: tree.rootId,
      starterDataVersion: tree.starterDataVersion,
      hasClaude: Boolean(tree.people['royal-france-claude-1499']),
      profileCount: Object.keys(tree.people).length
    };
  }
  return null;
})()`);

assert.deepEqual(restored, {
  rootId: louisId,
  starterDataVersion: 26,
  hasClaude: true,
  profileCount: 168
});

console.log(JSON.stringify({ downgraded, restored }));
socket.close();
