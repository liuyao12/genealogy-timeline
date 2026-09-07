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

async function waitFor(expression, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function searchFor(name) {
  await evaluate(`(() => {
    const input = document.getElementById('tree-filter');
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    `Array.from(document.querySelectorAll('.person-list-row')).some(row => row.textContent.includes(${JSON.stringify(name)}))`,
    `${name} search result`
  );
}

async function resultId(name) {
  return evaluate(`Array.from(document.querySelectorAll('.person-list-row')).find(row => row.textContent.includes(${JSON.stringify(name)}))?.dataset.personId || ''`);
}

async function clickResult(id) {
  await evaluate(`document.querySelector('.person-list-row[data-person-id=${JSON.stringify(id)}] .person-list-item').click(); true`);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'page load');
await waitFor("document.getElementById('tree-filter')", 'application controls');

if (!await evaluate("document.querySelectorAll('.timeline-node').length")) {
  await evaluate("document.getElementById('royal-example-button').click(); true");
}
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'British royal timeline');

await searchFor('Catherine of Aragon');
assert.equal(await evaluate("document.querySelectorAll('.person-list-focus').length"), 0);
const catherineId = await resultId('Catherine of Aragon');
assert.ok(catherineId);
await clickResult(catherineId);
await waitFor("document.getElementById('person-heading').textContent.includes('Catherine of Aragon')", 'Catherine profile panel');
assert.equal(await evaluate("document.getElementById('focus-tree-button').disabled"), false);
await evaluate("document.getElementById('focus-tree-button').click(); true");
await waitFor(`document.querySelector('.timeline-node.focus')?.dataset.personId === ${JSON.stringify(catherineId)}`, 'Catherine tree');
await waitFor("document.getElementById('tree-filter').value === ''", 'search clearing after side-panel tree action');

await searchFor('Henry VII');
const henryId = await resultId('Henry VII');
assert.ok(henryId);
const rootBeforePreview = await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId");
assert.equal(await evaluate("document.querySelectorAll('.person-list-focus').length"), 0);
await clickResult(henryId);
await waitFor("document.getElementById('person-heading').textContent.includes('Henry VII')", 'Henry VII profile panel');
const previewState = await evaluate(`({
  root: document.querySelector('.timeline-node.focus')?.dataset.personId,
  query: document.getElementById('tree-filter').value,
  sidebarOpen: document.getElementById('detail-sidebar').classList.contains('open'),
  treeButtonDisabled: document.getElementById('focus-tree-button').disabled
})`);
assert.equal(previewState.root, rootBeforePreview, 'opening the result must not change the current tree');
assert.equal(previewState.query, 'Henry VII', 'opening the result must preserve the search');
assert.equal(previewState.sidebarOpen, true);
assert.equal(previewState.treeButtonDisabled, false);

await evaluate("document.getElementById('focus-tree-button').click(); true");
await waitFor(`document.querySelector('.timeline-node.focus')?.dataset.personId === ${JSON.stringify(henryId)}`, 'Henry VII tree');
await waitFor("document.getElementById('tree-filter').value === ''", 'search clearing after Henry VII tree action');

await searchFor('Arthur, Prince of Wales');
assert.ok(await resultId('Arthur, Prince of Wales'));
assert.equal(await evaluate("document.querySelectorAll('.person-list-focus').length"), 0);

await searchFor('Adolphus, Duke of Cambridge');
assert.ok(await resultId('Adolphus, Duke of Cambridge'));
assert.equal(await evaluate("document.querySelectorAll('.person-list-focus').length"), 0);

console.log(JSON.stringify({
  catherineTree: catherineId,
  previewedWithoutRefocus: henryId,
  finalTree: await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId"),
  searchTreeButtons: await evaluate("document.querySelectorAll('.person-list-focus').length")
}));
socket.close();
