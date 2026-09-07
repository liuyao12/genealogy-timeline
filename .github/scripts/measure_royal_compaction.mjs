import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const chromeBinary = process.env.CHROME_BIN;
const [appUrl = 'http://127.0.0.1:4173/', label = 'layout'] = process.argv.slice(2);
if (!chromeBinary) throw new Error('CHROME_BIN is not set');

const ids = {
  henryVIII: 'profile-g6000000007442241030',
  charlesII: 'profile-g6000000002529545042'
};
const userDataDir = mkdtempSync(join(tmpdir(), `lineage-royal-${label.replace(/[^a-z0-9]+/gi, '-')}-`));
const port = 9200 + Math.floor(Math.random() * 500);
const chrome = spawn(chromeBinary, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1500,1000', appUrl
], { stdio: 'ignore' });

let socket;
let nextId = 0;
const pending = new Map();

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function targetForApp() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const targets = await json(`http://127.0.0.1:${port}/json`);
      const target = targets.find(candidate => candidate.type === 'page' && candidate.url.startsWith(appUrl));
      if (target) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Chrome did not expose ${appUrl}`);
}

function command(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitUntil(expression, description, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function measure(query) {
  await evaluate(`(() => {
    const input = document.querySelector('#tree-filter');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(250);
  return evaluate(`(() => {
    const viewport = document.querySelector('#canvas-viewport');
    const canvas = document.querySelector('#timeline-canvas');
    const yOf = node => node?.transform?.baseVal?.consolidate?.()?.matrix?.f ?? null;
    const records = [...canvas.querySelectorAll('.timeline-node')].map(node => ({
      id: node.dataset.personId || '',
      key: node.dataset.nodeKey || '',
      name: node.querySelector('title')?.textContent?.split(' · ')[0] || node.getAttribute('aria-label')?.split(',')[0] || '',
      y: yOf(node),
      spouse: node.classList.contains('spouse'),
      transported: node.classList.contains('transport-copy')
    })).filter(record => Number.isFinite(record.y)).sort((a, b) => a.y - b.y || a.name.localeCompare(b.name));
    const distinctRows = [...new Set(records.map(record => Math.round(record.y * 100) / 100))].sort((a, b) => a - b);
    const target = id => records.find(record => record.key === id)
      || records.find(record => record.id === id && !record.transported)
      || records.find(record => record.id === id)
      || null;
    const summarizeTarget = id => {
      const record = target(id);
      if (!record) return null;
      const row = distinctRows.findIndex(y => Math.abs(y - record.y) < .01);
      const nearby = records.filter(candidate => Math.abs(candidate.y - record.y) <= 100)
        .map(candidate => ({ name: candidate.name, y: candidate.y, spouse: candidate.spouse, transported: candidate.transported }));
      const node = canvas.querySelector('.timeline-node[data-node-key="' + CSS.escape(record.key) + '"]')
        || canvas.querySelector('.timeline-node[data-person-id="' + CSS.escape(id) + '"]');
      const rect = node?.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      return {
        id,
        y: record.y,
        row,
        rowsAbove: row,
        initialViewportTop: rect ? rect.top - viewportRect.top : null,
        initiallyVisible: Boolean(rect && rect.bottom > viewportRect.top && rect.top < viewportRect.bottom),
        nearby
      };
    };
    return {
      query: document.querySelector('#tree-filter')?.value || '',
      nodeCount: records.length,
      distinctRowCount: distinctRows.length,
      minY: Math.min(...records.map(record => record.y)),
      maxY: Math.max(...records.map(record => record.y)),
      verticalSpan: Math.max(...records.map(record => record.y)) - Math.min(...records.map(record => record.y)),
      viewportHeight: viewport.clientHeight,
      scrollTop: viewport.scrollTop,
      henryVIII: summarizeTarget(${JSON.stringify(ids.henryVIII)}),
      charlesII: summarizeTarget(${JSON.stringify(ids.charlesII)})
    };
  })()`);
}

try {
  const target = await targetForApp();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });

  await command('Runtime.enable');
  await waitUntil('document.readyState === "complete"', 'page load');
  await evaluate(`localStorage.clear(); sessionStorage.clear(); location.reload(); true`);
  await waitUntil(`document.readyState === 'complete'
    && document.querySelector('.timeline-node[data-person-id="${ids.henryVIII}"]')
    && document.querySelector('.timeline-node[data-person-id="${ids.charlesII}"]')`, 'British royal line');

  const filtered = await measure('king queen');
  const unfiltered = await measure('');
  console.log(JSON.stringify({ label, appUrl, filtered, unfiltered }));
} finally {
  for (const waiter of pending.values()) waiter.reject(new Error('Chrome closed'));
  socket?.close();
  chrome.kill('SIGKILL');
  await sleep(250);
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
