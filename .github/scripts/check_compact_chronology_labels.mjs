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

async function waitFor(expression, label, attempts = 160) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('.person-list-item'))", 'starter tree');

const georgeId = 'profile-g4137986493320052463';
const charlotteId = 'profile-g5145210727590105956';

await evaluate(`(async () => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const input = document.getElementById('tree-filter');
  input.value = 'George IV';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await pause(120);
  const result = document.querySelector('.person-list-row[data-person-id="${georgeId}"] .person-list-item');
  if (!result) throw new Error('George IV search result was not found.');
  result.click();
  await pause(120);
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await pause(180);
  return true;
})()`);
await waitFor(`document.getElementById('person-heading').textContent.includes('George IV')`, 'George IV side panel');
await waitFor(`document.querySelector('.timeline-node[data-person-id="${charlotteId}"]')`, 'Princess Charlotte timeline node');

const initial = await evaluate(`(() => {
  const text = element => element?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const rows = [...document.querySelectorAll('.person-event-row')];
  const marriage = rows.find(row => row.classList.contains('marriage') && /Caroline/i.test(text(row)));
  const child = rows.find(row => row.classList.contains('child-birth') && /Charlotte Augusta of Wales/i.test(text(row)));
  if (!marriage || !child) throw new Error('Expected marriage and child rows were not rendered: ' + rows.map(text).join(' || '));
  const childControl = child.querySelector('.person-event-branch-visibility');
  const relationshipRows = [...document.querySelectorAll('#relationship-households .relationship-row')];
  return {
    heading: text(document.querySelector('.life-events-heading .eyebrow')),
    marriageLabel: text(marriage.querySelector('.person-event-relative')),
    marriageText: text(marriage),
    marriageMarkText: text(marriage.querySelector('.person-event-visibility')),
    childLabel: text(child.querySelector('.person-event-relative')),
    childText: text(child),
    childControlText: text(childControl),
    childControlPressed: childControl?.getAttribute('aria-pressed'),
    childControlRadius: childControl ? getComputedStyle(childControl).borderRadius : '',
    childMarkButtons: child.querySelectorAll('.person-event-visibility').length,
    childCanvasMarks: document.querySelectorAll('#timeline-canvas [data-event-key^="child-birth:"]').length,
    relationshipKinds: relationshipRows.map(row => [...row.classList].filter(name => ['parent', 'spouse', 'child'].includes(name)))
  };
})()`);

assert.equal(initial.heading, 'Chronology');
assert.ok(/Caroline/i.test(initial.marriageLabel));
assert.doesNotMatch(initial.marriageText, /\bMarried\b/i);
assert.doesNotMatch(initial.marriageText, /Relationship with/i);
assert.equal(initial.marriageMarkText, 'Hide');
assert.equal(initial.childLabel, 'Charlotte Augusta of Wales');
assert.doesNotMatch(initial.childText, /Birth of/i);
assert.equal(initial.childControlText, '');
assert.equal(initial.childControlPressed, 'true');
assert.ok(initial.childControlRadius === '50%' || Number.parseFloat(initial.childControlRadius) >= 7, `Unexpected child-circle radius: ${initial.childControlRadius}`);
assert.equal(initial.childMarkButtons, 0);
assert.equal(initial.childCanvasMarks, 0);
assert.ok(initial.relationshipKinds.length > 0);
assert.ok(initial.relationshipKinds.every(classes => classes.length === 1 && classes[0] === 'parent'));

await evaluate(`document.querySelector('.person-event-row.child-birth .person-event-branch-visibility').click(); true`);
await waitFor(`!document.querySelector('.timeline-node[data-person-id="${charlotteId}"]')`, 'hidden Princess Charlotte branch');
const hidden = await evaluate(`(() => {
  const row = [...document.querySelectorAll('.person-event-row.child-birth')]
    .find(candidate => candidate.textContent.includes('Charlotte Augusta of Wales'));
  return {
    rowStillPresent: Boolean(row),
    pressed: row?.querySelector('.person-event-branch-visibility')?.getAttribute('aria-pressed'),
    childCanvasMarks: document.querySelectorAll('#timeline-canvas [data-event-key^="child-birth:"]').length
  };
})()`);
assert.equal(hidden.rowStillPresent, true, 'the chronology row should remain when its branch is hidden');
assert.equal(hidden.pressed, 'false');
assert.equal(hidden.childCanvasMarks, 0);

await evaluate(`([...document.querySelectorAll('.person-event-row.child-birth')]
  .find(candidate => candidate.textContent.includes('Charlotte Augusta of Wales'))
  ?.querySelector('.person-event-branch-visibility'))?.click(); true`);
await waitFor(`document.querySelector('.timeline-node[data-person-id="${charlotteId}"]')`, 'restored Princess Charlotte branch');

console.log('Compact chronology-label and child-branch interaction check passed.');
socket.close();
