import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const chromeBinary = process.env.CHROME_BIN;
assert.ok(chromeBinary, 'CHROME_BIN is required');

const chrome = spawn(chromeBinary, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--window-size=1920,1080',
  '--remote-debugging-port=9222',
  `--user-data-dir=/tmp/lineage-chrome-${process.pid}`,
  'http://127.0.0.1:4173/'
], { stdio: ['ignore', 'pipe', 'pipe'] });

let chromeLog = '';
chrome.stdout.on('data', chunk => { chromeLog += chunk; });
chrome.stderr.on('data', chunk => { chromeLog += chunk; });

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForJson(path, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:9222${path}`);
      if (response.ok) return await response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Chrome DevTools did not become ready.\n${chromeLog}`);
}

function connectCdp(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    ready,
    close: () => socket.close(),
    async send(method, params = {}) {
      await ready;
      const id = ++nextId;
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    }
  };
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Browser evaluation failed');
  }
  return response.result.value;
}

async function waitFor(cdp, expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(cdp, expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for browser condition: ${expression}`);
}

try {
  await waitForJson('/json/version');
  const pages = await waitForJson('/json/list');
  const page = pages.find(item => item.type === 'page' && item.url.startsWith('http://127.0.0.1:4173/'));
  assert.ok(page?.webSocketDebuggerUrl, 'Lineage browser page was not found');
  const cdp = connectCdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelectorAll('#timeline-canvas .timeline-node').length > 0`);

  const hasLabels = await evaluate(cdp, `document.querySelectorAll('#timeline-ruler .global-event-label-box').length > 0`);
  if (!hasLabels) {
    await evaluate(cdp, `(() => {
      document.querySelector('#global-events-button').click();
      document.querySelector('#global-event-name').value = 'Browser geometry event';
      document.querySelector('#global-event-start').value = '1500';
      document.querySelector('#global-event-end').value = '1530';
      document.querySelector('#add-global-event').click();
      return true;
    })()`);
    await waitFor(cdp, `document.querySelectorAll('#timeline-ruler .global-event-label-box').length > 0`);
  }

  const geometry = await evaluate(cdp, `(() => {
    const ruler = document.querySelector('#timeline-ruler');
    const baseline = ruler.querySelector('.ruler-line');
    const firstLifespan = [...document.querySelectorAll('#timeline-canvas .timeline-node .lifespan')]
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    const labelBoxes = [...ruler.querySelectorAll('.global-event-label-box')];
    const labelGroups = [...ruler.querySelectorAll('.global-event-label')];
    const labels = labelBoxes.map(box => {
      const rect = box.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const collisions = [];
    labels.forEach((first, firstIndex) => labels.slice(firstIndex + 1).forEach((second, offset) => {
      const secondIndex = firstIndex + offset + 1;
      const overlapX = first.left < second.right - .5 && second.left < first.right - .5;
      const overlapY = first.top < second.bottom - .5 && second.top < first.bottom - .5;
      if (overlapX && overlapY) collisions.push([firstIndex, secondIndex]);
    }));
    const pointerAnchors = labelGroups.map(group => {
      const path = group.querySelector('.global-event-label-pointer');
      const guide = ruler.querySelector('.global-event-label-guide[stroke="' + group.querySelector('.global-event-label-box').getAttribute('fill') + '"]');
      return { hasPointer: Boolean(path), hasTitle: Boolean(group.querySelector('title')) };
    });
    const rulerRect = ruler.getBoundingClientRect();
    const baselineRect = baseline.getBoundingClientRect();
    const lifespanRect = firstLifespan.getBoundingClientRect();
    const declaredHeight = Number(ruler.getAttribute('height'));
    return {
      labelCount: labelBoxes.length,
      collisions,
      pointerAnchors,
      rulerHeight: rulerRect.height,
      declaredHeight,
      inlineHeight: ruler.style.height,
      inlineMarginBottom: ruler.style.marginBottom,
      baselineTop: baselineRect.top,
      firstNodeTop: lifespanRect.top,
      nodeGap: lifespanRect.top - baselineRect.top,
      firstNodeOverlapsRuler: lifespanRect.top < rulerRect.bottom - .5,
      legacyTextLabels: ruler.querySelectorAll('text.global-event-label').length,
      fullLabels: labelGroups.every(group => Boolean(group.querySelector('title')?.textContent))
    };
  })()`);

  assert.ok(geometry.labelCount > 0, 'No global event badges were rendered');
  assert.deepEqual(geometry.collisions, [], 'Global event badges overlap');
  assert.equal(geometry.legacyTextLabels, 0, 'Legacy below-ruler event text remains');
  assert.equal(geometry.fullLabels, true, 'A global event badge lacks a full tooltip label');
  assert.ok(geometry.pointerAnchors.every(item => item.hasPointer && item.hasTitle), 'Badges must have pointers and full titles');
  assert.ok(Math.abs(geometry.rulerHeight - geometry.declaredHeight) < .75, 'Rendered ruler height does not match SVG height');
  assert.equal(geometry.inlineHeight, `${geometry.declaredHeight}px`);
  assert.equal(geometry.inlineMarginBottom, `-${geometry.declaredHeight}px`);
  assert.ok(geometry.nodeGap >= 0 && geometry.nodeGap <= 2.5, `First node is ${geometry.nodeGap}px from the ruler baseline`);
  assert.equal(geometry.firstNodeOverlapsRuler, false, 'First node overlaps the sticky ruler');

  console.log(JSON.stringify(geometry, null, 2));
  cdp.close();
} finally {
  chrome.kill('SIGTERM');
  await sleep(200);
  if (!chrome.killed) chrome.kill('SIGKILL');
}
