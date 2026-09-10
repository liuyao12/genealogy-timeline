import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debuggingPort = Number(process.argv[3] || 9222);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForPageTarget() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
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

for (let attempt = 0; attempt < 120; attempt += 1) {
  const ready = await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('.person-list-item'))`);
  if (ready) break;
  if (attempt === 119) throw new Error('Lineage did not finish loading its starter tree.');
  await sleep(100);
}

const result = await evaluate(`(async () => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const input = document.getElementById('tree-filter');
  input.value = 'George IV';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await pause(100);
  const profileButton = [...document.querySelectorAll('.person-list-item')]
    .find(button => button.textContent.includes('George IV'));
  if (!profileButton) throw new Error('Could not find George IV in the bundled royal example.');
  profileButton.click();
  await pause(150);

  const text = element => element?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const header = [...document.querySelectorAll('.person-event-table-header > span')].map(text);
  const rows = [...document.querySelectorAll('.person-event-row')];
  const marriage = rows.find(row => row.classList.contains('marriage') && text(row).includes('Caroline'));
  const reign = rows.find(row => row.classList.contains('personal') && /Reign/i.test(text(row)));
  const children = rows.filter(row => row.classList.contains('child-birth'));
  if (!marriage) throw new Error('George IV marriage row was not rendered. Rows: ' + rows.map(text).join(' || '));
  if (!reign) throw new Error('George IV reign row was not rendered. Rows: ' + rows.map(text).join(' || '));

  const marriageKey = marriage.dataset.eventKey;
  const timelineMarkCount = key => [...document.querySelectorAll('#timeline-canvas [data-event-key]')]
    .filter(element => element.dataset.eventKey === key).length;
  const beforeHide = timelineMarkCount(marriageKey);
  marriage.querySelector('.person-event-visibility').click();
  await pause(150);
  const hiddenMarriage = [...document.querySelectorAll('.person-event-row')]
    .find(row => row.dataset.eventKey === marriageKey);
  const afterHide = timelineMarkCount(marriageKey);
  hiddenMarriage.querySelector('.person-event-visibility').click();
  await pause(150);
  const restoredMarriage = [...document.querySelectorAll('.person-event-row')]
    .find(row => row.dataset.eventKey === marriageKey);
  const afterRestore = timelineMarkCount(marriageKey);

  return {
    header,
    marriage: {
      age: text(marriage.querySelector('.person-event-age')),
      label: text(marriage.querySelector('.person-event-title strong')),
      year: text(marriage.querySelector('.person-event-year')),
      detail: text(marriage.querySelector('.person-event-detail'))
    },
    reign: {
      age: text(reign.querySelector('.person-event-age')),
      year: text(reign.querySelector('.person-event-year'))
    },
    childLabels: children.map(row => text(row.querySelector('.person-event-title'))),
    relationshipEndRows: rows.filter(row => row.classList.contains('relationship-end')).length,
    marks: {
      beforeHide,
      afterHide,
      hiddenButton: text(hiddenMarriage.querySelector('.person-event-visibility')),
      afterRestore,
      restoredButton: text(restoredMarriage.querySelector('.person-event-visibility'))
    }
  };
})()`);

assert.deepEqual(result.header, ['Age', 'Event', 'Mark']);
assert.equal(result.marriage.age, '33');
assert.match(result.marriage.label, /Married Caroline/);
assert.equal(result.marriage.year, '· 1795–1821');
assert.equal(result.marriage.detail, '26 years · spouse died');
assert.equal(result.reign.age, '58');
assert.match(result.reign.year, /^· 1820–1830$/);
assert.ok(result.childLabels.some(label => /Birth of .*Charlotte.*· 1796/i.test(label)), 'Princess Charlotte birth should remain in the chronology.');
assert.equal(result.relationshipEndRows, 0);
assert.ok(result.marks.beforeHide > 0, 'Marriage mark should initially be visible.');
assert.equal(result.marks.afterHide, 0);
assert.equal(result.marks.hiddenButton, 'Show');
assert.ok(result.marks.afterRestore > 0, 'Marriage mark should return after Show.');
assert.equal(result.marks.restoredButton, 'Hide');

console.log('Compact life-event browser check passed.');
socket.close();
