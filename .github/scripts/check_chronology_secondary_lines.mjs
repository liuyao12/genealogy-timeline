import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debuggingPort = Number(process.argv[3] || 9222);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then(response => response.json());
      const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
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
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject, timer } = pending.get(message.id);
  pending.delete(message.id);
  clearTimeout(timer);
  if (message.error) reject(new Error(message.error.message || 'Chrome command failed.'));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}.`));
    }, 20000);
    pending.set(id, { resolve, reject, timer });
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
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

async function openProfile(query, expectedText = query) {
  await evaluate(`(() => {
    const input = document.getElementById('tree-filter');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    `Array.from(document.querySelectorAll('.person-list-item')).some(button => button.textContent.includes(${JSON.stringify(expectedText)}))`,
    `${expectedText} search result`
  );
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('.person-list-item'))
      .find(candidate => candidate.textContent.includes(${JSON.stringify(expectedText)}));
    button.click();
    return true;
  })()`);
  await waitFor(
    `document.getElementById('person-heading').textContent.includes(${JSON.stringify(expectedText)})`,
    `${expectedText} side panel`
  );
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete' && document.getElementById('tree-filter')", 'application load');
if (!await evaluate("document.querySelectorAll('.timeline-node').length > 0")) {
  await evaluate("document.getElementById('royal-example-button').click(); true");
}
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'bundled royal timeline');

await openProfile('Henry VIII');
const henry = await evaluate(`(() => {
  const text = node => node?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const rows = Array.from(document.querySelectorAll('.person-event-row'));
  const marriage = rows.find(row => row.classList.contains('marriage') && text(row.querySelector('.person-event-title')).includes('Catherine of Aragon'));
  const child = rows.find(row => row.classList.contains('child-birth') && text(row.querySelector('.person-event-title')).includes('Mary I'));
  const reign = rows.find(row => row.classList.contains('personal') && text(row.querySelector('.person-event-title')).includes('Reign'));
  if (!marriage || !child || !reign) throw new Error('Expected Henry VIII chronology rows were not rendered.');
  const allControls = Array.from(document.querySelectorAll('.person-event-visibility, .person-event-branch-visibility'));
  return {
    header: Array.from(document.querySelectorAll('.person-event-table-header > span')).map(text),
    marriageTitle: text(marriage.querySelector('.person-event-title')),
    marriageSecondary: text(marriage.querySelector('.person-event-secondary')),
    childTitle: text(child.querySelector('.person-event-title')),
    childSecondary: text(child.querySelector('.person-event-secondary')),
    reignTitle: text(reign.querySelector('.person-event-title')),
    reignSecondary: text(reign.querySelector('.person-event-secondary')),
    controlTexts: allControls.map(text),
    controlRadii: allControls.map(control => getComputedStyle(control).borderRadius),
    controlPressed: allControls.map(control => control.getAttribute('aria-pressed')),
    marriageKey: marriage.dataset.eventKey,
    marriageControlClass: marriage.lastElementChild.className,
    childControlClass: child.lastElementChild.className
  };
})()`);

assert.deepEqual(henry.header, ['Age', 'Event', 'Mark']);
assert.match(henry.marriageTitle, /Catherine of Aragon/);
assert.doesNotMatch(henry.marriageTitle, /1509|married/i);
assert.equal(henry.marriageSecondary, 'married 1509; annulled 1533');
assert.match(henry.childTitle, /Mary I/);
assert.doesNotMatch(henry.childTitle, /1516|birth of/i);
assert.equal(henry.childSecondary, 'born 1516');
assert.match(henry.reignTitle, /Reign/);
assert.doesNotMatch(henry.reignTitle, /1509|1547/);
assert.equal(henry.reignSecondary, '1509–1547');
assert.ok(henry.controlTexts.every(value => value === ''), 'Every chronology control should be an unlabeled visual circle.');
assert.ok(henry.controlRadii.every(value => value === '50%'), 'Every chronology control should have a circular border radius.');
assert.ok(henry.controlPressed.every(value => value === 'true' || value === 'false'));
assert.match(henry.marriageControlClass, /person-event-visibility/);
assert.match(henry.childControlClass, /person-event-branch-visibility/);

const markToggle = await evaluate(`(async () => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const row = Array.from(document.querySelectorAll('.person-event-row'))
    .find(candidate => candidate.dataset.eventKey === ${JSON.stringify(henry.marriageKey)});
  const count = () => Array.from(document.querySelectorAll('#timeline-canvas [data-event-key]'))
    .filter(element => element.dataset.eventKey === ${JSON.stringify(henry.marriageKey)}).length;
  const before = count();
  row.querySelector('.person-event-visibility').click();
  await pause(150);
  const after = count();
  const restoredRow = Array.from(document.querySelectorAll('.person-event-row'))
    .find(candidate => candidate.dataset.eventKey === ${JSON.stringify(henry.marriageKey)});
  const pressed = restoredRow.querySelector('.person-event-visibility').getAttribute('aria-pressed');
  const text = restoredRow.querySelector('.person-event-visibility').textContent;
  restoredRow.querySelector('.person-event-visibility').click();
  await pause(150);
  return { before, after, pressed, text, restored: count() };
})()`);
assert.ok(markToggle.before > 0);
assert.equal(markToggle.after, 0);
assert.equal(markToggle.pressed, 'false');
assert.equal(markToggle.text, '');
assert.ok(markToggle.restored > 0);

await openProfile('George III');
const george = await evaluate(`(() => {
  const text = node => node?.textContent?.replace(/\\s+/g, ' ').trim() || '';
  const rows = Array.from(document.querySelectorAll('.person-event-row'));
  const marriage = rows.find(row => row.classList.contains('marriage') && text(row.querySelector('.person-event-title')).includes('Charlotte of Mecklenburg'));
  const edward = rows.find(row => row.classList.contains('child-birth') && text(row.querySelector('.person-event-title')).includes('Edward, Duke of Kent'));
  if (!marriage || !edward) throw new Error('Expected George III chronology rows were not rendered.');
  return {
    marriageSecondary: text(marriage.querySelector('.person-event-secondary')),
    fullMarriageText: text(marriage),
    edwardId: edward.querySelector('.person-event-relative')?.getAttribute('aria-label') || '',
    edwardKey: edward.dataset.eventKey,
    edwardControlPressed: edward.querySelector('.person-event-branch-visibility')?.getAttribute('aria-pressed')
  };
})()`);
assert.equal(george.marriageSecondary, 'married 1761–1818');
assert.doesNotMatch(george.fullMarriageText, /spouse died/i);
assert.match(george.edwardId, /Edward, Duke of Kent/);
assert.equal(george.edwardControlPressed, 'true');

const branchToggle = await evaluate(`(async () => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const row = Array.from(document.querySelectorAll('.person-event-row'))
    .find(candidate => candidate.dataset.eventKey === ${JSON.stringify(george.edwardKey)});
  const control = row.querySelector('.person-event-branch-visibility');
  const findPersonId = name => Array.from(document.querySelectorAll('.timeline-node'))
    .find(node => node.getAttribute('aria-label')?.includes(name))?.dataset.personId || '';
  const edwardId = findPersonId('Edward, Duke of Kent');
  const victoriaId = findPersonId('Victoria, Queen');
  const before = {
    edward: Boolean(document.querySelector('.timeline-node[data-person-id="' + CSS.escape(edwardId) + '"]')),
    victoria: Boolean(document.querySelector('.timeline-node[data-person-id="' + CSS.escape(victoriaId) + '"]'))
  };
  control.click();
  await pause(180);
  const after = {
    edward: Boolean(document.querySelector('.timeline-node[data-person-id="' + CSS.escape(edwardId) + '"]')),
    victoria: Boolean(document.querySelector('.timeline-node[data-person-id="' + CSS.escape(victoriaId) + '"]'))
  };
  const restoredRow = Array.from(document.querySelectorAll('.person-event-row'))
    .find(candidate => candidate.dataset.eventKey === ${JSON.stringify(george.edwardKey)});
  const hiddenPressed = restoredRow.querySelector('.person-event-branch-visibility').getAttribute('aria-pressed');
  restoredRow.querySelector('.person-event-branch-visibility').click();
  await pause(180);
  return {
    before,
    after,
    hiddenPressed,
    restoredEdward: Boolean(document.querySelector('.timeline-node[data-person-id="' + CSS.escape(edwardId) + '"]')),
    restoredVictoria: Boolean(document.querySelector('.timeline-node[data-person-id="' + CSS.escape(victoriaId) + '"]'))
  };
})()`);
assert.deepEqual(branchToggle.before, { edward: true, victoria: true });
assert.deepEqual(branchToggle.after, { edward: false, victoria: false });
assert.equal(branchToggle.hiddenPressed, 'false');
assert.equal(branchToggle.restoredEdward, true);
assert.equal(branchToggle.restoredVictoria, true);

console.log('Chronology secondary-line and circular-control browser check passed.');
socket.close();
