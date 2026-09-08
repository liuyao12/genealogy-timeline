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

const GEORGE_III = 'profile-g6000000003091034586';
const CHARLOTTE = 'profile-g6000000003891728922';
const GEORGE_IV = 'profile-g4137986493320052463';
const WILLIAM_IV = 'profile-g4137989648200126749';
const EDWARD_KENT = 'profile-g4087038607800049893';
const ADOLPHUS = 'profile-g6000000000307240333';
const GEORGE_V = 'profile-g6000000000701511040';
const MARY_TECK = 'profile-g6000000001324056123';
const ELIZABETH_II = 'profile-g6000000003075071669';
const CHARLES_III = 'profile-g6000000003075030887';
const CHILDREN = [GEORGE_IV, WILLIAM_IV, EDWARD_KENT, ADOLPHUS];

async function openGeorgeThirdPanel() {
  await evaluate(`(() => {
    const input = document.getElementById('tree-filter');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor(`document.querySelector('.timeline-node[data-person-id="${GEORGE_III}"]')`, 'George III timeline node');
  await evaluate(`document.querySelector('.timeline-node[data-person-id="${GEORGE_III}"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); true`);
  await waitFor("document.getElementById('person-heading').textContent.includes('George III')", 'George III side panel');
  return evaluate(`(() => ({
    rootId: document.querySelector('.timeline-node.focus')?.dataset.personId || '',
    rows: Array.from(document.querySelectorAll('#relationship-households .relationship-row')).map(row => row.textContent.replace(/\\s+/g, ' ').trim()),
    emptyLabels: Array.from(document.querySelectorAll('#relationship-households .relationship-empty')).map(row => row.textContent.trim())
  }))()`);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'page load');
await waitFor("document.getElementById('tree-filter')", 'application controls');
if (!await evaluate("document.querySelectorAll('.timeline-node').length")) {
  await evaluate("document.getElementById('royal-example-button').click(); true");
}
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'bundled timeline');

const initialRoot = await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId || ''");
const initialPanel = await openGeorgeThirdPanel();
assert.equal(initialPanel.rootId, initialRoot, 'opening George III must not refocus the tree');
for (const name of [
  'Charlotte of Mecklenburg-Strelitz',
  'George IV, King of Great Britain and Ireland',
  'William IV, King of Great Britain and Ireland',
  'Edward, Duke of Kent',
  'Adolphus, Duke of Cambridge'
]) {
  assert.ok(initialPanel.rows.some(row => row.includes(name)), `${name} should be grouped in George III’s side panel`);
}
assert.equal(initialPanel.emptyLabels.includes('Children without another recorded parent'), false);

for (const [personId, expected] of [
  [GEORGE_IV, 'George IV, King of Great Britain and Ireland'],
  [WILLIAM_IV, 'William IV, King of Great Britain and Ireland']
]) {
  await waitFor(`document.querySelector('.timeline-node[data-person-id="${personId}"]')`, expected);
  const label = await evaluate(`document.querySelector('.timeline-node[data-person-id="${personId}"]').textContent`);
  assert.ok(label.includes(expected), `${expected} should appear in the timeline`);
}
await waitFor("document.querySelector('.timeline-node[data-person-id=\"profile-g6000000008852088113\"]')", 'Victoria branch');
await waitFor(`document.querySelector('.timeline-node[data-person-id="${ADOLPHUS}"]')`, 'Cambridge branch');

// Simulate a saved version-27 starter with the exact broken parent links and
// old sovereign-title wording. Reloading must repair it in place.
const downgraded = await evaluate(`(() => {
  for (const key of Object.keys(localStorage)) {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (workspace?.version !== 1 || !Array.isArray(workspace.trees)) continue;
    const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId) || workspace.trees[0];
    if (!tree?.people?.[${JSON.stringify(GEORGE_III)}]) continue;
    tree.starterDataVersion = 27;
    const children = ${JSON.stringify(CHILDREN)};
    children.forEach(id => { tree.people[id].parents = [${JSON.stringify(GEORGE_III)}]; });
    tree.people[${JSON.stringify(CHARLOTTE)}].children = [];

    const oldTitle = (id, displayName, title, note, periodId, periodName) => {
      const person = tree.people[id];
      person.displayName = displayName;
      person.title = title;
      person.note = note;
      const period = person.namePeriods.find(item => item.id === periodId);
      if (period) period.name = periodName;
    };
    oldTitle(${JSON.stringify(GEORGE_IV)}, 'George IV, King of the United Kingdom', 'King of the United Kingdom', 'King of the United Kingdom, 1820–1830', 'george-iv-name-1820', 'George IV, King of the United Kingdom');
    oldTitle(${JSON.stringify(WILLIAM_IV)}, 'William IV, King of the United Kingdom', 'King of the United Kingdom', 'King of the United Kingdom, 1830–1837', 'william-iv-name-1830', 'William IV, King of the United Kingdom');
    oldTitle(${JSON.stringify(ELIZABETH_II)}, 'Elizabeth II, Queen of the United Kingdom', 'Queen of the United Kingdom', 'Queen of the United Kingdom, 1952–2022', 'elizabeth-ii-name-1952', 'Elizabeth II, Queen of the United Kingdom');
    oldTitle(${JSON.stringify(CHARLES_III)}, 'Charles III, King of the United Kingdom', 'King of the United Kingdom', 'Present King of the United Kingdom', 'charles-iii-name-2022', 'Charles III, King of the United Kingdom');

    const georgeV = tree.people[${JSON.stringify(GEORGE_V)}];
    georgeV.displayName = 'George V, King of the United Kingdom';
    georgeV.title = 'King of the United Kingdom';
    georgeV.note = 'King of the United Kingdom, 1910–1936';
    georgeV.namePeriods = georgeV.namePeriods.filter(period => period.id !== 'george-v-name-1927');
    const georgeVPeriod = georgeV.namePeriods.find(period => period.id === 'george-v-name-1910');
    if (georgeVPeriod) {
      georgeVPeriod.name = 'George V, King of the United Kingdom';
      georgeVPeriod.endYear = 1936;
    }
    georgeV.defaultNamePeriodId = 'george-v-name-1910';

    const mary = tree.people[${JSON.stringify(MARY_TECK)}];
    mary.namePeriods = mary.namePeriods.filter(period => period.id !== 'mary-teck-name-1927');
    const maryPeriod = mary.namePeriods.find(period => period.id === 'mary-teck-name-1910');
    if (maryPeriod) {
      maryPeriod.name = 'Mary, Queen of the United Kingdom';
      maryPeriod.endYear = 1936;
    }
    localStorage.setItem(key, JSON.stringify(workspace));
    return { key, rootId: tree.rootId };
  }
  return null;
})()`);
assert.ok(downgraded, 'could not locate the saved starter workspace');

await evaluate('location.reload(); true');
await waitFor("document.readyState === 'complete'", 'reload');
await waitFor("document.getElementById('tree-filter')", 'reloaded controls');
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'upgraded timeline');

const upgraded = await evaluate(`(() => {
  for (const key of Object.keys(localStorage)) {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (workspace?.version !== 1 || !Array.isArray(workspace.trees)) continue;
    const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId) || workspace.trees[0];
    if (!tree?.people?.[${JSON.stringify(GEORGE_III)}]) continue;
    const georgeV = tree.people[${JSON.stringify(GEORGE_V)}];
    return {
      version: tree.starterDataVersion,
      rootId: tree.rootId,
      childParents: ${JSON.stringify(CHILDREN)}.map(id => tree.people[id].parents),
      charlotteChildren: tree.people[${JSON.stringify(CHARLOTTE)}].children,
      georgeIV: tree.people[${JSON.stringify(GEORGE_IV)}].displayName,
      williamIV: tree.people[${JSON.stringify(WILLIAM_IV)}].displayName,
      elizabethII: tree.people[${JSON.stringify(ELIZABETH_II)}].displayName,
      charlesIII: tree.people[${JSON.stringify(CHARLES_III)}].displayName,
      georgeVDefault: georgeV.defaultNamePeriodId,
      georgeVPeriods: georgeV.namePeriods.filter(period => period.id.startsWith('george-v-name-19')).map(period => [period.id, period.name, period.startYear, period.endYear])
    };
  }
  return null;
})()`);

assert.equal(upgraded.version, 28);
assert.equal(upgraded.rootId, downgraded.rootId);
for (const parents of upgraded.childParents) assert.deepEqual(parents, [GEORGE_III, CHARLOTTE]);
for (const childId of CHILDREN) assert.ok(upgraded.charlotteChildren.includes(childId));
assert.equal(upgraded.georgeIV, 'George IV, King of Great Britain and Ireland');
assert.equal(upgraded.williamIV, 'William IV, King of Great Britain and Ireland');
assert.equal(upgraded.elizabethII, 'Elizabeth II, Queen of Great Britain and Northern Ireland');
assert.equal(upgraded.charlesIII, 'Charles III, King of Great Britain and Northern Ireland');
assert.equal(upgraded.georgeVDefault, 'george-v-name-1927');
assert.deepEqual(upgraded.georgeVPeriods, [
  ['george-v-name-1910', 'George V, King of Great Britain and Ireland, Emperor of India', 1910, 1927],
  ['george-v-name-1927', 'George V, King of Great Britain and Northern Ireland, Emperor of India', 1927, 1936]
]);

const upgradedPanel = await openGeorgeThirdPanel();
assert.equal(upgradedPanel.emptyLabels.includes('Children without another recorded parent'), false);
for (const name of ['George IV, King of Great Britain and Ireland', 'William IV, King of Great Britain and Ireland']) {
  assert.ok(upgradedPanel.rows.some(row => row.includes(name)), name);
}

console.log(JSON.stringify({ initialPanel, downgraded, upgraded, upgradedPanel }));
socket.close();
