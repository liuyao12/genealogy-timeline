import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debuggingPort = Number(process.argv[3] || 9222);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForTarget() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then(response => response.json());
      const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome debugger did not become available.');
}

const target = await waitForTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject, timer } = pending.get(message.id);
  pending.delete(message.id);
  clearTimeout(timer);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
});
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, label, timeout = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function searchAndOpen(query, expectedHeading) {
  await evaluate(`(() => {
    const input = document.getElementById('tree-filter');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor(`Array.from(document.querySelectorAll('.person-list-item')).some(button => button.textContent.includes(${JSON.stringify(expectedHeading)}))`, `${expectedHeading} search result`);
  await evaluate(`Array.from(document.querySelectorAll('.person-list-item')).find(button => button.textContent.includes(${JSON.stringify(expectedHeading)})).click(); true`);
  await waitFor(`document.getElementById('person-heading').textContent.includes(${JSON.stringify(expectedHeading)})`, `${expectedHeading} side panel`);
}
async function focusSelected() {
  await evaluate(`document.getElementById('focus-tree-button').click(); true`);
  await waitFor(`!document.documentElement.classList.contains('focus-tree-transitioning')`, 'tree transition');
}
async function assertTimelineNames(names) {
  for (const name of names) {
    await waitFor(`Array.from(document.querySelectorAll('#timeline-canvas .timeline-node')).some(node => node.getAttribute('aria-label')?.includes(${JSON.stringify(name)}))`, `${name} timeline node`);
  }
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: appUrl });
await waitFor(`document.readyState === 'complete' && document.querySelectorAll('.timeline-node').length > 50`, 'starter timeline');

// Frederick II is a true Henry VII descendant through George I and Sophia Dorothea,
// so the default king/queen filter should retain him without a manual import.
await assertTimelineNames(['Frederick II, King of Prussia']);
await searchAndOpen('Frederick the Great', 'Frederick II');
const frederickPanel = await evaluate(`(() => ({
  heading: document.getElementById('person-heading').textContent,
  parents: Array.from(document.querySelectorAll('#relationship-households .relationship-row.parent strong')).map(node => node.textContent),
  chronology: Array.from(document.querySelectorAll('.person-event-row')).map(row => row.textContent.replace(/\\s+/g, ' ').trim())
}))()`);
assert.match(frederickPanel.heading, /Frederick II/);
assert.ok(frederickPanel.parents.some(name => /Frederick William I/.test(name)));
assert.ok(frederickPanel.parents.some(name => /Sophia Dorothea/.test(name)));
assert.ok(frederickPanel.chronology.some(row => /Elisabeth Christine/.test(row)));

await searchAndOpen('Sophia Dorothea of Hanover', 'Sophia Dorothea');
await focusSelected();
await assertTimelineNames(['Frederick II, King of Prussia', 'Louisa Ulrika', 'Frederick William II']);

await searchAndOpen('Isabella I, Queen of Castile', 'Isabella I');
await focusSelected();
await assertTimelineNames(['Catherine of Aragon', 'Joanna I', 'Anna of Austria', 'Elisabeth of Austria']);

await searchAndOpen('John IV, King of Portugal', 'John IV');
await focusSelected();
await assertTimelineNames(['Catherine of Braganza', 'Afonso VI', 'Peter II', 'John V']);

console.log(JSON.stringify({
  profileCount: await evaluate(`document.querySelectorAll('.person-list-row').length`),
  frederickPanel,
  finalRoot: await evaluate(`document.querySelector('.timeline-node.focus')?.getAttribute('aria-label') || ''`)
}));
socket.close();
