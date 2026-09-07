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
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'British royal example');

const starterVersion = await evaluate("fetch('./data/british-royal-line.json', { cache: 'no-cache' }).then(response => response.json()).then(data => data.version)");
assert.equal(starterVersion, 24);

async function resultText(query) {
  await evaluate(`(() => {
    const input = document.getElementById('tree-filter');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor("document.querySelector('.person-list-row')", `${query} search result`);
  return evaluate("document.getElementById('people-list').innerText");
}

const expected = [
  ['Adolphus', 'Adolphus, Duke of Cambridge'],
  ['Mary Adelaide', 'Mary Adelaide, Duchess of Teck'],
  ['Louis Mountbatten', 'Louis Mountbatten, 1st Marquess of Milford Haven'],
  ['Elizabeth Stuart', 'Elizabeth Stuart, Queen of Bohemia'],
  ['Prince George of Denmark', 'Prince George of Denmark, Duke of Cumberland'],
  ['Catherine of Aragon', 'Catherine of Aragon']
];

for (const [query, name] of expected) {
  const text = await resultText(query);
  assert.ok(text.includes(name), `${name} was not rendered for ${query}`);
}

const adolphusText = await resultText('Adolphus');
assert.ok(!adolphusText.includes('Adolphus of Cambridge'));

console.log(JSON.stringify({ starterVersion, checked: expected.map(([, name]) => name) }));
socket.close();
