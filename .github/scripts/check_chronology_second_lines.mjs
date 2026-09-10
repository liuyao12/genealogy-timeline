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
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed.');
  }
  return result.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: appUrl });
for (let attempt = 0; attempt < 180; attempt += 1) {
  if (await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('.person-list-item'))`)) break;
  if (attempt === 179) throw new Error('Application did not finish loading.');
  await sleep(100);
}

const result = await evaluate(`(async () => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const text = element => element?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const input = document.getElementById('tree-filter');
  input.value = 'George III';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await pause(100);
  const profileButton = [...document.querySelectorAll('.person-list-item')]
    .find(button => text(button).includes('George III'));
  if (!profileButton) throw new Error('Could not find George III.');
  profileButton.click();
  await pause(150);

  const rows = [...document.querySelectorAll('.person-event-row')];
  const marriage = rows.find(row => row.classList.contains('marriage') && text(row).includes('Charlotte'));
  const child = rows.find(row => row.classList.contains('child-birth') && text(row).includes('George IV'));
  const reign = rows.find(row => row.classList.contains('personal') && /Reign/i.test(text(row)));
  if (!marriage || !child || !reign) throw new Error('Expected chronology rows were not rendered.');

  const circleInfo = control => {
    const style = getComputedStyle(control);
    return {
      text: text(control),
      width: style.width,
      height: style.height,
      radius: style.borderRadius,
      pressed: control.getAttribute('aria-pressed')
    };
  };
  const marriageControl = marriage.querySelector('.person-event-visibility');
  const childControl = child.querySelector('.person-event-branch-visibility');
  const reignControl = reign.querySelector('.person-event-visibility');
  const marriageKey = marriage.dataset.eventKey;
  const markCount = key => [...document.querySelectorAll('#timeline-canvas [data-event-key]')]
    .filter(element => element.dataset.eventKey === key).length;
  const beforeHide = markCount(marriageKey);
  marriageControl.click();
  await pause(150);
  const hiddenMarriage = [...document.querySelectorAll('.person-event-row')]
    .find(row => row.dataset.eventKey === marriageKey);
  const afterHide = markCount(marriageKey);

  return {
    header: [...document.querySelectorAll('.person-event-table-header > span')].map(text),
    marriage: {
      name: text(marriage.querySelector('.person-event-relative')),
      detail: text(marriage.querySelector('.person-event-detail')),
      circle: circleInfo(marriageControl),
      beforeHide,
      afterHide,
      hiddenPressed: hiddenMarriage.querySelector('.person-event-visibility').getAttribute('aria-pressed')
    },
    child: {
      name: text(child.querySelector('.person-event-relative')),
      detail: text(child.querySelector('.person-event-detail')),
      circle: circleInfo(childControl)
    },
    reign: {
      name: text(reign.querySelector('.person-event-title strong')),
      detail: text(reign.querySelector('.person-event-detail')),
      circle: circleInfo(reignControl)
    },
    inlineYears: document.querySelectorAll('.person-event-year').length,
    childCanvasMarks: document.querySelectorAll('#timeline-canvas .family-event-mark.child-birth, #timeline-canvas [data-event-key^="child-birth:"]').length,
    parentageHeadings: [...document.querySelectorAll('.relationship-group-label')].map(text)
  };
})()`);

assert.deepEqual(result.header, ['Age', 'Event', 'Mark']);
assert.equal(result.inlineYears, 0);
assert.equal(result.marriage.name.includes('Married'), false);
assert.equal(result.child.name.includes('Birth of'), false);
assert.equal(result.marriage.detail, 'married 1761; died 1818 · 57 years');
assert.equal(result.child.detail, 'born 1762');
assert.equal(result.reign.detail, '1760–1820 · 60 years');
for (const circle of [result.marriage.circle, result.child.circle, result.reign.circle]) {
  assert.equal(circle.text, '');
  assert.equal(circle.width, '15px');
  assert.equal(circle.height, '15px');
  assert.equal(circle.radius, '50%');
  assert.equal(circle.pressed, 'true');
}
assert.ok(result.marriage.beforeHide > 0);
assert.equal(result.marriage.afterHide, 0);
assert.equal(result.marriage.hiddenPressed, 'false');
assert.equal(result.childCanvasMarks, 0);
assert.deepEqual(result.parentageHeadings, ['Parents']);

console.log('Chronology second-line and circle-control browser check passed.');
socket.close();
