import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debugPort = Number(process.argv[3] || 9222);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
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

async function waitFor(expression, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'page load');
await waitFor("document.getElementById('tree-filter')", 'application controls');

if (!await evaluate("document.querySelectorAll('.timeline-node').length > 50")) {
  await evaluate("document.getElementById('royal-example-button').click(); true");
}
await waitFor("document.querySelectorAll('.timeline-node').length > 50", 'British royal timeline');

const rootBefore = await evaluate("document.querySelector('.timeline-node.focus')?.dataset.personId");
await evaluate(`(() => {
  const input = document.getElementById('tree-filter');
  input.value = 'Catherine of Aragon';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await waitFor("Array.from(document.querySelectorAll('.person-list-row')).some(row => row.textContent.includes('Catherine of Aragon'))", 'Catherine search result');

const searchIcon = await evaluate(`(() => {
  const row = Array.from(document.querySelectorAll('.person-list-row')).find(item => item.textContent.includes('Catherine of Aragon'));
  const button = row?.querySelector('.person-list-focus');
  const pseudo = button && getComputedStyle(button, '::before');
  return {
    id: row?.dataset.personId || '',
    className: button?.className || '',
    text: button?.textContent.trim() || '',
    mask: pseudo?.maskImage || pseudo?.webkitMaskImage || '',
    background: pseudo?.backgroundColor || ''
  };
})()`);
assert.ok(searchIcon.id, 'Catherine search result should exist.');
assert.match(searchIcon.className, /tree-action-button/);
assert.equal(searchIcon.text, '', 'tree actions must not contain a colour emoji or text glyph');
assert.notEqual(searchIcon.mask, 'none');
assert.match(searchIcon.mask, /data:image\/svg\+xml/);

await evaluate(`document.querySelector('.person-list-row[data-person-id="${searchIcon.id}"] .person-list-item').click(); true`);
await waitFor("document.getElementById('detail-sidebar').classList.contains('open')", 'profile side panel');
await waitFor("document.getElementById('person-heading').textContent.includes('Catherine')", 'Catherine profile header');

const geometry = await evaluate(`(() => {
  const hero = document.querySelector('.person-hero');
  const identity = document.querySelector('.person-hero-identity');
  const avatar = document.getElementById('person-avatar');
  const copy = document.querySelector('.person-hero-copy');
  const control = document.querySelector('.focus-tree-control');
  const button = document.getElementById('focus-tree-button');
  const status = document.getElementById('focus-tree-status');
  const pseudo = getComputedStyle(button, '::before');
  const rect = element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  };
  return {
    root: document.querySelector('.timeline-node.focus')?.dataset.personId || '',
    hero: rect(hero),
    identity: rect(identity),
    avatar: rect(avatar),
    copy: rect(copy),
    control: rect(control),
    button: rect(button),
    buttonClass: button.className,
    buttonText: button.textContent.trim(),
    mask: pseudo.maskImage || pseudo.webkitMaskImage || '',
    iconBackground: pseudo.backgroundColor,
    status: rect(status),
    statusClass: status.className,
    appVersion: document.querySelector('script[src*="app.js"]')?.getAttribute('src') || '',
    styleVersion: document.querySelector('link[href*="styles.css"]')?.getAttribute('href') || ''
  };
})()`);

assert.equal(geometry.root, rootBefore, 'opening a profile must not change the active tree');
assert.match(geometry.buttonClass, /tree-action-button/);
assert.equal(geometry.buttonText, '');
assert.match(geometry.mask, /data:image\/svg\+xml/);
assert.ok(geometry.hero.height <= 125, `profile hero should be compact, got ${geometry.hero.height}px`);
assert.ok(geometry.avatar.right < geometry.copy.left, 'avatar should occupy the left column');
assert.ok(geometry.copy.right < geometry.control.left, 'tree action should occupy a separate right-side column');
assert.ok(geometry.control.top >= geometry.identity.top - 1 && geometry.control.bottom <= geometry.identity.bottom + 1, 'tree action must stay inside the identity row');
assert.equal(geometry.statusClass, 'sr-only');
assert.ok(geometry.status.width <= 1 && geometry.status.height <= 1, 'tree summary should not consume visible header space');
assert.match(geometry.appVersion, /v=139/);
assert.match(geometry.styleVersion, /v=77/);

const relationshipIcons = await evaluate(`Array.from(document.querySelectorAll('.relationship-focus')).map(button => {
  const pseudo = getComputedStyle(button, '::before');
  return {
    className: button.className,
    text: button.textContent.trim(),
    mask: pseudo.maskImage || pseudo.webkitMaskImage || ''
  };
})`);
assert.ok(relationshipIcons.length > 0, 'Catherine should expose at least one spouse tree action.');
relationshipIcons.forEach(icon => {
  assert.match(icon.className, /tree-action-button/);
  assert.equal(icon.text, '');
  assert.match(icon.mask, /data:image\/svg\+xml/);
});

console.log(JSON.stringify({
  heroHeight: geometry.hero.height,
  identityColumns: [geometry.avatar.width, geometry.copy.width, geometry.control.width],
  searchIcon: searchIcon.mask !== 'none',
  relationshipIcons: relationshipIcons.length
}));
socket.close();
