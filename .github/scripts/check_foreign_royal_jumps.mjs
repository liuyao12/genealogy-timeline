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

async function openResult(name) {
  await searchFor(name);
  assert.equal(await evaluate("document.querySelectorAll('.person-list-focus').length"), 0);
  const personId = await resultId(name);
  assert.ok(personId, `No result ID for ${name}`);
  const rootBefore = await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId || ''");
  await evaluate(`document.querySelector('.person-list-row[data-person-id=${JSON.stringify(personId)}] .person-list-item').click(); true`);
  await waitFor(
    `document.getElementById('person-heading').textContent.includes(${JSON.stringify(name)})`,
    `${name} profile side panel`
  );
  assert.equal(
    await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId || ''"),
    rootBefore,
    'opening a search result must not refocus the tree'
  );
  assert.equal(await evaluate("document.getElementById('tree-filter').value"), name);
  return personId;
}

async function focusFromSidePanel(personId, name) {
  assert.equal(await evaluate("document.getElementById('focus-tree-button').disabled"), false);
  await evaluate("document.getElementById('focus-tree-button').click(); true");
  await waitFor(
    `document.querySelector('.timeline-node.focus')?.dataset.personId === ${JSON.stringify(personId)}`,
    `${name} focused tree`
  );
  await waitFor(
    "!document.documentElement.classList.contains('focus-tree-transitioning')",
    `${name} focus transition`
  );
  assert.equal(await evaluate("document.getElementById('tree-filter').value"), '');
}

async function assertTimelineProfiles(profiles) {
  for (const [personId, name] of profiles) {
    await waitFor(
      `document.querySelector('.timeline-node[data-person-id=${JSON.stringify(personId)}]')`,
      `${name} timeline node`
    );
  }
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

const louisXiiId = await openResult('Louis XII, King of France');
await focusFromSidePanel(louisXiiId, 'Louis XII');
await assertTimelineProfiles([
  ['royal-france-claude-1499', 'Claude of France'],
  ['royal-france-francis-i-1494', 'Francis I'],
  ['royal-france-henry-ii-1519', 'Henry II'],
  ['profile-g6000000003232545902', 'Francis II'],
  ['royal-france-charles-ix-1550', 'Charles IX'],
  ['royal-france-henry-iii-1551', 'Henry III']
]);

const christianIxId = await openResult('Christian IX, King of Denmark');
assert.equal(
  await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId"),
  louisXiiId,
  'the Danish result should remain a preview until its side-panel tree button is used'
);
await focusFromSidePanel(christianIxId, 'Christian IX');
await assertTimelineProfiles([
  ['profile-g6000000003070981015', 'Alexandra of Denmark'],
  ['royal-greece-george-i-1845', 'George I of Greece'],
  ['profile-g5495575341940116659', 'Prince Andrew of Greece and Denmark'],
  ['profile-g6000000003075171096', 'Philip, Duke of Edinburgh']
]);

const manuelId = await openResult('Manuel I, King of Portugal');
await focusFromSidePanel(manuelId, 'Manuel I');
await assertTimelineProfiles([
  ['royal-portugal-john-iii-1502', 'John III of Portugal'],
  ['royal-habsburg-isabella-portugal-1503', 'Isabella of Portugal'],
  ['profile-g6000000001600060051', 'Philip II of Spain'],
  ['profile-g6000000001599879609', 'Maria Manuela of Portugal'],
  ['royal-spain-carlos-asturias-1545', 'Carlos, Prince of Asturias']
]);

console.log(JSON.stringify({
  frenchRoot: louisXiiId,
  danishRoot: christianIxId,
  portugueseRoot: manuelId,
  searchResultTreeButtons: await evaluate("document.querySelectorAll('.person-list-focus').length"),
  finalVisibleProfiles: await evaluate("document.querySelectorAll('.timeline-node').length")
}));

socket.close();
