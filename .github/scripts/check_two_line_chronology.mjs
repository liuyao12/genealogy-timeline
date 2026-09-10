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
  if (message.error) reject(new Error(message.error.message || 'Chrome command failed.'));
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
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page evaluation failed.');
  }
  return result.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: appUrl });
for (let attempt = 0; attempt < 180; attempt += 1) {
  if (await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('.person-list-item'))`)) break;
  if (attempt === 179) throw new Error('Lineage did not finish loading.');
  await sleep(100);
}

const result = await evaluate(`(async () => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const text = element => element?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const input = document.getElementById('tree-filter');
  input.value = 'George III';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await pause(120);
  const profileButton = [...document.querySelectorAll('.person-list-item')]
    .find(button => text(button).includes('George III'));
  if (!profileButton) throw new Error('Could not find George III.');
  profileButton.click();
  await pause(180);

  const rows = [...document.querySelectorAll('.person-event-row')];
  const marriage = rows.find(row => row.classList.contains('marriage') && text(row).includes('Charlotte'));
  const child = rows.find(row => row.classList.contains('child-birth') && text(row).includes('George IV'));
  const reign = rows.find(row => row.classList.contains('personal') && text(row).includes('Reign'));
  if (!marriage || !child || !reign) {
    throw new Error('Expected George III chronology rows were not rendered: ' + rows.map(text).join(' || '));
  }

  const snapshot = row => ({
    label: text(row.querySelector('.person-event-relative, .person-event-title strong')),
    secondLine: text(row.querySelector('.person-event-detail')),
    inlineYear: text(row.querySelector('.person-event-year')),
    controlText: text(row.querySelector('.person-event-circle-control')),
    controlPressed: row.querySelector('.person-event-circle-control')?.getAttribute('aria-pressed'),
    borderRadius: getComputedStyle(row.querySelector('.person-event-circle-control')).borderRadius,
    width: getComputedStyle(row.querySelector('.person-event-circle-control')).width,
    height: getComputedStyle(row.querySelector('.person-event-circle-control')).height,
    eventKey: row.dataset.eventKey
  });

  const before = {
    header: [...document.querySelectorAll('.person-event-table-header span')].map(text),
    marriage: snapshot(marriage),
    child: snapshot(child),
    reign: snapshot(reign),
    allControlTexts: rows.map(row => text(row.querySelector('.person-event-circle-control'))),
    childBirthCanvasMarks: document.querySelectorAll('#timeline-canvas .family-event-mark.child-birth, #timeline-canvas [data-event-key^="child-birth:"]').length,
    georgeNodes: document.querySelectorAll('#timeline-canvas .timeline-node[data-person-id="profile-g4137986493320052463"]').length
  };

  marriage.querySelector('.person-event-circle-control').click();
  await pause(180);
  const hiddenMarriage = [...document.querySelectorAll('.person-event-row')]
    .find(row => row.dataset.eventKey === before.marriage.eventKey);
  const marriageAfterHide = {
    pressed: hiddenMarriage.querySelector('.person-event-circle-control')?.getAttribute('aria-pressed'),
    text: text(hiddenMarriage.querySelector('.person-event-circle-control'))
  };
  hiddenMarriage.querySelector('.person-event-circle-control').click();
  await pause(180);

  const childAgain = [...document.querySelectorAll('.person-event-row')]
    .find(row => row.dataset.eventKey === before.child.eventKey);
  childAgain.querySelector('.person-event-circle-control').click();
  await pause(180);
  const georgeAfterHide = document.querySelectorAll('#timeline-canvas .timeline-node[data-person-id="profile-g4137986493320052463"]').length;
  const hiddenChild = [...document.querySelectorAll('.person-event-row')]
    .find(row => row.dataset.eventKey === before.child.eventKey);
  const childAfterHide = hiddenChild.querySelector('.person-event-circle-control')?.getAttribute('aria-pressed');
  hiddenChild.querySelector('.person-event-circle-control').click();
  await pause(180);
  const georgeAfterRestore = document.querySelectorAll('#timeline-canvas .timeline-node[data-person-id="profile-g4137986493320052463"]').length;

  return { before, marriageAfterHide, georgeAfterHide, childAfterHide, georgeAfterRestore };
})()`);

assert.deepEqual(result.before.header, ['Age', 'Event', 'Mark']);
assert.equal(result.before.marriage.label.includes('Married'), false);
assert.equal(result.before.marriage.secondLine, 'married 1761; spouse died 1818');
assert.equal(result.before.child.label.includes('Birth of'), false);
assert.equal(result.before.child.secondLine, 'born 1762');
assert.equal(result.before.reign.secondLine, '1760–1820 · 60 years');
assert.equal(result.before.marriage.inlineYear, '');
assert.equal(result.before.child.inlineYear, '');
assert.equal(result.before.reign.inlineYear, '');
assert.ok(result.before.allControlTexts.every(value => value === ''), 'Every Mark-column control should be an unlabeled circle.');
for (const row of [result.before.marriage, result.before.child, result.before.reign]) {
  assert.equal(row.controlPressed, 'true');
  assert.equal(row.width, '15px');
  assert.equal(row.height, '15px');
  assert.ok(row.borderRadius === '50%' || row.borderRadius === '7.5px');
}
assert.equal(result.before.childBirthCanvasMarks, 0);
assert.ok(result.before.georgeNodes > 0);
assert.deepEqual(result.marriageAfterHide, { pressed: 'false', text: '' });
assert.equal(result.georgeAfterHide, 0);
assert.equal(result.childAfterHide, 'false');
assert.ok(result.georgeAfterRestore > 0);

console.log('Two-line chronology and circular-control browser check passed.');
socket.close();
