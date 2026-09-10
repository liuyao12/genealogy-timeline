import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debuggingPort = Number(process.argv[3] || 9222);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForPageTarget() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then(response => response.json());
      const target = targets.find(candidate => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
      if (target) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome DevTools target did not become available.');
}

const target = await waitForPageTarget();
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
  if (message.error) reject(new Error(message.error.message || 'Chrome DevTools command failed.'));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}.`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed.');
  }
  return result.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: appUrl });
for (let attempt = 0; attempt < 150; attempt += 1) {
  const ready = await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('.person-list-item'))`);
  if (ready) break;
  if (attempt === 149) throw new Error('Lineage did not finish loading its starter tree.');
  await sleep(100);
}

const result = await evaluate(`(async () => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const text = element => element?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const input = document.getElementById('tree-filter');
  input.value = 'George IV';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await pause(100);
  const profileButton = [...document.querySelectorAll('.person-list-item')]
    .find(button => text(button).includes('George IV'));
  if (!profileButton) throw new Error('Could not find George IV.');
  profileButton.click();
  await pause(150);
  const rows = [...document.querySelectorAll('.person-event-row')];
  const charlotte = rows.find(row => row.classList.contains('child-birth') && text(row).includes('Charlotte Augusta of Wales'));
  if (!charlotte) throw new Error('Charlotte’s birth row was not rendered. Rows: ' + rows.map(text).join(' || '));
  const familyChildren = [...document.querySelectorAll('.relationship-row.child')].map(text);
  return {
    age: text(charlotte.querySelector('.person-event-age')),
    label: text(charlotte.querySelector('.person-event-title strong')),
    year: text(charlotte.querySelector('.person-event-year')),
    familyChildren,
    relationshipEndRows: rows.filter(row => row.classList.contains('relationship-end')).length
  };
})()`);

assert.equal(result.age, '34');
assert.equal(result.label, 'Birth of Charlotte Augusta of Wales');
assert.equal(result.year, '· 1796');
assert.ok(result.familyChildren.some(label => label.includes('Charlotte Augusta of Wales')));
assert.equal(result.relationshipEndRows, 0);
console.log('Princess Charlotte side-panel check passed.');
socket.close();
