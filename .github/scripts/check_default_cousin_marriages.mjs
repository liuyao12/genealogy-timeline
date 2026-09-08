import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debugPort = Number(process.argv[3] || 9222);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
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
    userGesture: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Page evaluation failed');
  return response.result?.value;
}
async function waitFor(expression, label, timeout = 30000) {
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
await waitFor("document.getElementById('tree-filter')?.value === 'king queen'", 'default king queen filter');
await waitFor("document.querySelectorAll('.timeline-node').length > 30", 'filtered royal timeline');

const ids = await evaluate(`(async () => {
  const starter = await (await fetch('./data/british-royal-line.json', { cache: 'no-store' })).json();
  const entries = Object.entries(starter.people);
  const one = fragment => {
    const matches = entries.filter(([, person]) => person.displayName.includes(fragment)
      || (person.namePeriods || []).some(period => period.name.includes(fragment)));
    if (matches.length !== 1) throw new Error('Expected one ' + fragment + ', found ' + matches.length);
    return matches[0][0];
  };
  return {
    caroline: one('Caroline of Brunswick'),
    princessAugusta: one('Augusta, Duchess of Brunswick-Wolfenbüttel'),
    georgeIII: one('George III, King of Great Britain'),
    georgeIV: one('George IV, King of Great Britain'),
    maryScots: one('Mary, Queen of Scots'),
    darnley: one('Lord Darnley'),
    williamIII: one('William III & II'),
    maryII: one('Mary II'),
    adolphus: one('Adolphus, Duke of Cambridge'),
    augustaCambridge: one('Augusta, Duchess of Cambridge'),
    aliceHesse: one('Alice, Grand Duchess of Hesse'),
    louisIV: one('Louis IV, Grand Duke of Hesse'),
    edwardVII: one('Edward VII, King of Great Britain'),
    alexandra: one('Alexandra of Denmark'),
    andrew: one('Prince Andrew of Greece and Denmark'),
    aliceBattenberg: one('Princess Alice of Battenberg'),
    georgeV: one('George V, King of Great Britain'),
    maryTeck: one('Mary of Teck'),
    elizabethII: one('Elizabeth II, Queen of Great Britain'),
    philip: one('Philip, Duke of Edinburgh'),
  };
})()`);

const selector = id => `.timeline-node[data-person-id="${id}"]`;
const countExpression = id => `document.querySelectorAll(${JSON.stringify(selector(id))}).length`;
const count = id => evaluate(countExpression(id));

for (const [label, id] of Object.entries(ids)) {
  await waitFor(`${countExpression(id)} > 0`, `${label} in the default filtered timeline`);
}

const carolineBefore = await count(ids.caroline);
assert.ok(carolineBefore >= 2, `Caroline should have natal and marriage occurrences, found ${carolineBefore}`);
assert.equal(
  await evaluate(`document.querySelectorAll(${JSON.stringify(`${selector(ids.caroline)}.transport-copy`)}).length`),
  1,
  'Caroline should have one transported marriage occurrence'
);

// The other established double-descent marriages should likewise retain a
// duplicated occurrence on at least one side, making the loop visible rather
// than degrading to an ordinary spouse attachment.
for (const [label, candidates] of [
  ['Mary, Queen of Scots and Darnley', [ids.maryScots, ids.darnley]],
  ['William III and Mary II', [ids.williamIII, ids.maryII]],
  ['Adolphus and Augusta of Cambridge', [ids.adolphus, ids.augustaCambridge]],
  ['Alice and Louis IV of Hesse', [ids.aliceHesse, ids.louisIV]],
  ['Edward VII and Alexandra', [ids.edwardVII, ids.alexandra]],
  ['Andrew and Alice of Battenberg', [ids.andrew, ids.aliceBattenberg]],
  ['George V and Mary of Teck', [ids.georgeV, ids.maryTeck]],
  ['Elizabeth II and Philip', [ids.elizabethII, ids.philip]],
]) {
  const counts = await Promise.all(candidates.map(count));
  assert.ok(counts.some(value => value >= 2), `${label} should display a repeated spouse occurrence; counts ${counts}`);
}

async function toggleLineage(id, expectedState) {
  const expanderSelector = `${selector(id)}:not(.spouse) .timeline-expander.${expectedState}`;
  await waitFor(`document.querySelector(${JSON.stringify(expanderSelector)})`, `${expectedState} expander for ${id}`);
  await evaluate(`document.querySelector(${JSON.stringify(expanderSelector)}).dispatchEvent(new MouseEvent('click', { bubbles: true })); true`);
}

// Hide Caroline's natal route: her marriage occurrence remains beside George IV.
await toggleLineage(ids.princessAugusta, 'expanded');
await waitFor(`${countExpression(ids.caroline)} === 1`, 'Caroline retained only on the husband side');
assert.equal(await count(ids.georgeIV), 1);
await toggleLineage(ids.princessAugusta, 'collapsed');
await waitFor(`${countExpression(ids.caroline)} >= 2`, 'Caroline natal route restored');

// Hide George IV's paternal route: Caroline remains in her Brunswick natal line.
await toggleLineage(ids.georgeIII, 'expanded');
await waitFor(`${countExpression(ids.caroline)} === 1`, 'Caroline retained only on the natal side');
assert.equal(await count(ids.georgeIV), 0);
await toggleLineage(ids.georgeIII, 'collapsed');
await waitFor(`${countExpression(ids.caroline)} >= 2`, 'George IV route restored');

const summary = {
  filter: await evaluate("document.getElementById('tree-filter').value"),
  visibleNodes: await evaluate("document.querySelectorAll('.timeline-node').length"),
  carolineOccurrences: await count(ids.caroline),
  transportCopies: await evaluate("document.querySelectorAll('.timeline-node.transport-copy').length"),
};
console.log(JSON.stringify(summary));
socket.close();
