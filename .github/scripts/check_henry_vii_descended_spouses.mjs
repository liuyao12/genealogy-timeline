import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debugPort = Number(process.argv[3] || 9222);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
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
async function waitFor(expression, label, timeout = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}
async function searchAndOpen(fragment) {
  await evaluate(`(() => {
    const input = document.getElementById('tree-filter');
    input.value = ${JSON.stringify(fragment)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    `Array.from(document.querySelectorAll('.person-list-row')).some(row => row.textContent.includes(${JSON.stringify(fragment)}))`,
    `${fragment} search result`
  );
  const personId = await evaluate(`Array.from(document.querySelectorAll('.person-list-row')).find(row => row.textContent.includes(${JSON.stringify(fragment)}))?.dataset.personId || ''`);
  assert.ok(personId, `Missing result ID for ${fragment}`);
  await evaluate(`document.querySelector('.person-list-row[data-person-id=${JSON.stringify(personId)}] .person-list-item').click(); true`);
  await waitFor(`document.getElementById('person-heading').textContent.includes(${JSON.stringify(fragment)})`, `${fragment} side panel`);
  return personId;
}
async function familyText() {
  return evaluate("document.getElementById('relationship-households').innerText");
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'page load');
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'bundled tree');

await evaluate(`(() => {
  const input = document.getElementById('tree-filter');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await waitFor("document.querySelectorAll('.timeline-node').length > 100", 'unfiltered descendant tree');

const rootBefore = await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId || ''");
const carolineId = await searchAndOpen('Caroline of Brunswick');
let panel = await familyText();
assert.match(panel, /Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel/);
assert.match(panel, /Augusta, Duchess of Brunswick-Wolfenbüttel/);
assert.equal(await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId || ''"), rootBefore);

await searchAndOpen('Augusta, Duchess of Cambridge');
panel = await familyText();
assert.match(panel, /Prince Frederick of Hesse-Kassel/);
assert.match(panel, /Princess Caroline of Nassau-Usingen/);

await searchAndOpen('Louise of Hesse-Kassel');
panel = await familyText();
assert.match(panel, /Prince William of Hesse-Kassel/);
assert.match(panel, /Princess Charlotte of Denmark/);

await searchAndOpen('Princess Elisabeth of Prussia');
panel = await familyText();
assert.match(panel, /Prince William of Prussia/);
assert.match(panel, /Princess Maria Anna of Hesse-Homburg/);

const visibleBeforeMigration = await evaluate(`Array.from(document.querySelectorAll('.timeline-node')).map(node => node.textContent).filter(text => [
  'George IV, King of Great Britain and Ireland',
  'Caroline of Brunswick',
  'Augusta, Duchess of Cambridge',
  'Alexandra of Denmark',
  'Louis IV, Grand Duke of Hesse',
  'Prince Andrew of Greece and Denmark'
].some(name => text.includes(name)))`);
for (const name of [
  'George IV, King of Great Britain and Ireland',
  'Caroline of Brunswick',
  'Augusta, Duchess of Cambridge',
  'Alexandra of Denmark',
  'Louis IV, Grand Duke of Hesse',
  'Prince Andrew of Greece and Denmark'
]) assert.ok(visibleBeforeMigration.some(text => text.includes(name)), `${name} should be visible`);

const downgraded = await evaluate(`(async () => {
  const currentStarter = await (await fetch('./data/british-royal-line.json', { cache: 'no-store' })).json();
  const newNameFragments = [
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel',
    'Mary, Landgravine of Hesse-Kassel',
    'Frederick II, Landgrave of Hesse-Kassel',
    'Prince Frederick of Hesse-Kassel',
    'Princess Caroline of Nassau-Usingen',
    'Prince William of Hesse-Kassel',
    'Princess Charlotte of Denmark',
    'Sophia Dorothea of Hanover, Queen in Prussia',
    'Frederick William I, King in Prussia',
    'Prince Augustus William of Prussia',
    'Duchess Luise of Brunswick-Wolfenbüttel',
    'Frederick William II, King of Prussia',
    'Frederica Louisa of Hesse-Darmstadt, Queen of Prussia',
    'Prince William of Prussia',
    'Princess Maria Anna of Hesse-Homburg',
    'Margaret Douglas, Countess of Lennox',
    'Matthew Stewart, 4th Earl of Lennox'
  ];
  const newIds = new Set(Object.entries(currentStarter.people)
    .filter(([, person]) => newNameFragments.some(fragment => person.displayName.includes(fragment)))
    .map(([id]) => id));
  let result = null;
  for (const key of Object.keys(localStorage)) {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (workspace?.version !== 1 || !Array.isArray(workspace.trees)) continue;
    const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId) || workspace.trees[0];
    if (!tree?.people?.[${JSON.stringify(carolineId)}]) continue;
    tree.starterDataVersion = 28;
    for (const id of newIds) delete tree.people[id];
    for (const person of Object.values(tree.people)) {
      for (const field of ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds']) {
        if (Array.isArray(person[field])) person[field] = person[field].filter(id => !newIds.has(id));
      }
      for (const field of ['marriageYears', 'relationshipEndYears', 'relationshipEndStatuses']) {
        if (!person[field] || typeof person[field] !== 'object') continue;
        for (const id of newIds) delete person[field][id];
      }
    }
    const find = fragment => Object.values(tree.people).find(person => person.displayName.includes(fragment));
    for (const fragment of ['Caroline of Brunswick', 'Augusta, Duchess of Cambridge', 'Louise of Hesse-Kassel', 'Princess Elisabeth of Prussia', 'Lord Darnley']) {
      const person = find(fragment);
      if (person) person.parents = [];
    }
    localStorage.setItem(key, JSON.stringify(workspace));
    result = { key, removed: newIds.size, rootId: tree.rootId };
    break;
  }
  return result;
})()`);
assert.ok(downgraded, 'Could not locate saved bundled tree');
assert.ok(downgraded.removed >= 16, `Expected at least 16 new profiles, removed ${downgraded.removed}`);
assert.equal(downgraded.rootId, rootBefore);

await evaluate('location.reload(); true');
await waitFor("document.readyState === 'complete'", 'reload');
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'upgraded tree');
assert.equal(await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId || ''"), rootBefore);

const upgraded = await evaluate(`(() => {
  for (const key of Object.keys(localStorage)) {
    let workspace;
    try { workspace = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (workspace?.version !== 1 || !Array.isArray(workspace.trees)) continue;
    const tree = workspace.trees.find(candidate => candidate.id === workspace.activeTreeId) || workspace.trees[0];
    if (!tree?.people?.[${JSON.stringify(carolineId)}]) continue;
    const find = fragment => Object.values(tree.people).find(person => person.displayName.includes(fragment));
    return {
      version: tree.starterDataVersion,
      rootId: tree.rootId,
      profileCount: Object.keys(tree.people).length,
      carolineParents: find('Caroline of Brunswick')?.parents?.length || 0,
      augustaParents: find('Augusta, Duchess of Cambridge')?.parents?.length || 0,
      louiseParents: find('Louise of Hesse-Kassel')?.parents?.length || 0,
      elisabethParents: find('Princess Elisabeth of Prussia')?.parents?.length || 0,
      darnleyParents: find('Lord Darnley')?.parents?.length || 0
    };
  }
  return null;
})()`);
assert.equal(upgraded.version, 29);
assert.equal(upgraded.rootId, rootBefore);
assert.ok(upgraded.profileCount >= 184);
assert.deepEqual(
  [upgraded.carolineParents, upgraded.augustaParents, upgraded.louiseParents, upgraded.elisabethParents, upgraded.darnleyParents],
  [2, 2, 2, 2, 2]
);

console.log(JSON.stringify({ rootBefore, visibleBeforeMigration, downgraded, upgraded }));
socket.close();
