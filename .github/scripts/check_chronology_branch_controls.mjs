import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debuggingPort = Number(process.argv[3] || 9222);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForPageTarget() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(candidate => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
        if (target) return target;
      }
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
    }, 20000);
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

async function waitFor(expression, label, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('.person-list-item'))", 'starter tree');

const setup = await evaluate(`(async () => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const input = document.getElementById('tree-filter');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await pause(200);
  const text = element => element?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const profileButton = [...document.querySelectorAll('.person-list-item')]
    .find(button => text(button).includes('George III'));
  if (!profileButton) throw new Error('Could not find George III after clearing the timeline filter.');
  profileButton.click();
  await pause(200);
  const victoria = [...document.querySelectorAll('.timeline-node')]
    .find(node => text(node).includes('Victoria, Queen'));
  return {
    heading: document.getElementById('person-heading')?.textContent || '',
    victoriaId: victoria?.dataset.personId || '',
    nodeCount: document.querySelectorAll('.timeline-node').length
  };
})()`);
assert.match(setup.heading, /George III/);
assert.ok(setup.victoriaId, 'Queen Victoria should be present before hiding her paternal branch.');
assert.ok(setup.nodeCount > 100, 'Clearing the filter should expose the full royal example.');

const initial = await evaluate(`(() => {
  const text = element => element?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const childKey = 'child-birth:profile-g4087038607800049893';
  const childRow = document.querySelector('.person-event-row[data-event-key="' + childKey + '"]');
  const marriageRow = document.querySelector('.person-event-row.marriage');
  const personalRow = document.querySelector('.person-event-row.personal');
  return {
    header: [...document.querySelectorAll('.person-event-table-header > span')].map(text),
    childKey,
    childRow: Boolean(childRow),
    childLabel: text(childRow?.querySelector('.person-event-title')),
    childControl: text(childRow?.querySelector('.person-event-branch-visibility')),
    childMarkButtonCount: childRow?.querySelectorAll('.person-event-visibility').length || 0,
    childCanvasMarks: document.querySelectorAll('#timeline-canvas [data-event-key^="child-birth:"]').length,
    familySpouses: document.querySelectorAll('#relationship-households .relationship-row.spouse').length,
    familyChildren: document.querySelectorAll('#relationship-households .relationship-row.child').length,
    familyParents: document.querySelectorAll('#relationship-households .relationship-row.parent').length,
    parentageHeading: document.querySelector('.relationship-heading .eyebrow')?.textContent || '',
    marriageControl: text(marriageRow?.querySelector('.person-event-visibility')),
    personalControl: text(personalRow?.querySelector('.person-event-visibility')),
    edwardVisible: Boolean(document.querySelector('.timeline-node[data-person-id="profile-g4087038607800049893"]')),
    relativeLink: Boolean(childRow?.querySelector('.person-event-relative'))
  };
})()`);

assert.deepEqual(initial.header, ['Age', 'Event', 'Mark']);
assert.equal(initial.childRow, true);
assert.match(initial.childLabel, /Birth of .*Edward/i);
assert.equal(initial.childControl, '◉');
assert.equal(initial.childMarkButtonCount, 0);
assert.equal(initial.childCanvasMarks, 0);
assert.equal(initial.familySpouses, 0);
assert.equal(initial.familyChildren, 0);
assert.equal(initial.familyParents, 2);
assert.equal(initial.parentageHeading, 'Parentage');
assert.equal(initial.marriageControl, 'Hide');
assert.equal(initial.personalControl, 'Hide');
assert.equal(initial.edwardVisible, true);
assert.equal(initial.relativeLink, true);

await evaluate(`document.querySelector('.person-event-row[data-event-key="child-birth:profile-g4087038607800049893"] .person-event-branch-visibility').click(); true`);
await waitFor("!document.querySelector('.timeline-node[data-person-id=\"profile-g4087038607800049893\"]')", 'Edward branch to hide');
await waitFor(`!document.querySelector('.timeline-node[data-person-id=${JSON.stringify(setup.victoriaId)}]')`, 'Queen Victoria downstream branch to hide');

const hidden = await evaluate(`(() => {
  const row = document.querySelector('.person-event-row[data-event-key="child-birth:profile-g4087038607800049893"]');
  return {
    control: row?.querySelector('.person-event-branch-visibility')?.textContent?.trim() || '',
    rowHidden: row?.classList.contains('is-hidden') || false,
    childCanvasMarks: document.querySelectorAll('#timeline-canvas [data-event-key^="child-birth:"]').length
  };
})()`);
assert.equal(hidden.control, '○');
assert.equal(hidden.rowHidden, true);
assert.equal(hidden.childCanvasMarks, 0);

await evaluate(`document.querySelector('.person-event-row[data-event-key="child-birth:profile-g4087038607800049893"] .person-event-branch-visibility').click(); true`);
await waitFor("document.querySelector('.timeline-node[data-person-id=\"profile-g4087038607800049893\"]')", 'Edward branch to return');
await waitFor(`document.querySelector('.timeline-node[data-person-id=${JSON.stringify(setup.victoriaId)}]')`, 'Queen Victoria downstream branch to return');

const restored = await evaluate(`(() => {
  const row = document.querySelector('.person-event-row[data-event-key="child-birth:profile-g4087038607800049893"]');
  return {
    control: row?.querySelector('.person-event-branch-visibility')?.textContent?.trim() || '',
    childCanvasMarks: document.querySelectorAll('#timeline-canvas [data-event-key^="child-birth:"]').length,
    settingsCopy: [...document.querySelectorAll('.timeline-toggle-label')]
      .find(label => label.textContent.includes('Life-event marks'))?.textContent?.replace(/\\s+/g, ' ').trim() || ''
  };
})()`);
assert.equal(restored.control, '◉');
assert.equal(restored.childCanvasMarks, 0);
assert.match(restored.settingsCopy, /marriage, relationship, and authored-event marks/i);

console.log(JSON.stringify({ setup, initial, hidden, restored }));
socket.close();
