import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debugPort = Number(process.argv[3] || 9222);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
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

async function waitFor(expression, label, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
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

async function searchFor(name) {
  await evaluate(`(() => {
    const input = document.getElementById('tree-filter');
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor(`Array.from(document.querySelectorAll('.person-list-row')).some(row => row.textContent.includes(${JSON.stringify(name)}))`, `${name} search result`);
}

async function rowInfo(name) {
  return evaluate(`(() => {
    const row = Array.from(document.querySelectorAll('.person-list-row')).find(item => item.textContent.includes(${JSON.stringify(name)}));
    if (!row) return null;
    return {
      id: row.dataset.personId,
      outside: row.classList.contains('outside-focus-scope'),
      treeSymbol: row.querySelector('.person-list-focus')?.textContent,
      treeDisabled: row.querySelector('.person-list-focus')?.disabled || false
    };
  })()`);
}

await searchFor('Catherine of Aragon');
const catherine = await rowInfo('Catherine of Aragon');
assert.equal(catherine?.treeSymbol, '🌳');
assert.equal(catherine?.treeDisabled, false);
await evaluate(`document.querySelector('.person-list-row[data-person-id=${JSON.stringify(catherine.id)}] .person-list-focus').click(); true`);
await waitFor(`document.querySelector('.timeline-node.focus')?.dataset.personId === ${JSON.stringify(catherine.id)}`, 'Catherine as tree root');
await waitFor("document.getElementById('tree-filter').value === ''", 'search clearing after tree change');

await searchFor('Henry VII');
const henry = await rowInfo('Henry VII');
assert.ok(henry?.id, 'Henry VII should be a stored search result.');
assert.equal(henry.outside, true, 'Henry VII should be outside Catherine’s current tree.');
assert.equal(henry.treeSymbol, '🌳');
const rootBeforeProfileClick = await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId");

await evaluate(`document.querySelector('.person-list-row[data-person-id=${JSON.stringify(henry.id)}] .person-list-item').click(); true`);
await waitFor(`document.getElementById('person-heading').textContent.includes('Henry VII')`, 'Henry VII side panel');
const profilePreview = await evaluate(`(() => ({
  sidebarOpen: document.getElementById('detail-sidebar').classList.contains('open'),
  rootId: document.querySelector('.timeline-node.focus')?.dataset.personId,
  query: document.getElementById('tree-filter').value,
  selected: document.querySelector('.person-list-row[data-person-id=${JSON.stringify(henry.id)}]')?.classList.contains('active'),
  sideTreeSymbol: document.getElementById('focus-tree-button').textContent,
  relationshipSymbols: Array.from(document.querySelectorAll('.relationship-focus')).map(button => button.textContent)
}))()`);
assert.equal(profilePreview.sidebarOpen, true);
assert.equal(profilePreview.rootId, rootBeforeProfileClick, 'opening an outside profile must not change the tree root');
assert.equal(profilePreview.query, 'Henry VII', 'opening the profile should preserve the search');
assert.equal(profilePreview.selected, true);
assert.equal(profilePreview.sideTreeSymbol, '🌳');
assert.ok(profilePreview.relationshipSymbols.every(symbol => symbol === '🌳'));

await evaluate(`document.querySelector('.person-list-row[data-person-id=${JSON.stringify(henry.id)}] .person-list-focus').click(); true`);
await waitFor(`document.querySelector('.timeline-node.focus')?.dataset.personId === ${JSON.stringify(henry.id)}`, 'Henry VII tree action');
await waitFor("document.getElementById('tree-filter').value === ''", 'search clearing after Henry tree action');

console.log(JSON.stringify({
  catherineRoot: catherine.id,
  previewedWithoutRefocus: henry.id,
  finalRoot: await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId")
}));
socket.close();
