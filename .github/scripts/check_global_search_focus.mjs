import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const chromeBinary = process.env.CHROME_BIN;
if (!chromeBinary) throw new Error('CHROME_BIN is not set');

const appUrl = 'http://127.0.0.1:4173/';
const userDataDir = mkdtempSync(join(tmpdir(), 'lineage-global-search-'));
const port = 9231;
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await json(`http://127.0.0.1:${port}/json`);
      const target = targets.find(candidate => candidate.type === 'page' && candidate.url.startsWith(appUrl));
      if (target) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome did not expose the app page');
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

async function waitUntil(expression, label, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const person = (id, name, gender, birthYear, deathYear) => ({
  id,
  displayName: name,
  firstName: '',
  lastName: '',
  title: '',
  gender,
  birthYear: String(birthYear),
  deathYear: String(deathYear),
  isLiving: false,
  parents: [],
  children: [],
  spouses: [],
  partners: [],
  nonSpouses: [],
  divorcedSpouses: [],
  marriageYears: {},
  relationshipEndYears: {},
  relationshipEndStatuses: {},
  namePeriods: [],
  personalEvents: []
});

const workspace = {
  version: 1,
  activeTreeId: 'tree-search-test',
  trees: [{
    id: 'tree-search-test',
    title: 'Global search test',
    rootId: 'visible-root',
    people: {
      'visible-root': person('visible-root', 'Visible Root', 'male', 1900, 1970),
      'hidden-result': person('hidden-result', 'Hidden Search Result', 'female', 1920, 2000)
    },
    globalEvents: [],
    reignColor: '#c62828',
    timelineYearWidth: 4,
    timelineNodeHeight: 28,
    asOfYear: null,
    lastAsOfYear: null,
    showDecadeBands: true,
    treeFilter: '',
    relationVisibility: {},
    starterDataVersion: 0,
    manualTree: true,
    collapsedIds: [],
    zoom: 1,
    viewportLeft: 220,
    viewportTop: 170
  }]
};

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
  await waitUntil('document.readyState === "complete"', 'initial load');
  await evaluate(`localStorage.setItem('lineage-tree-workspace-v1', ${JSON.stringify(JSON.stringify(workspace))}); location.reload(); true`);
  await waitUntil(`document.readyState === 'complete' && document.querySelector('.timeline-node[data-person-id="visible-root"]')`, 'test tree');

  await evaluate(`(() => {
    const input = document.querySelector('#tree-filter');
    input.value = 'Hidden Search';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await waitUntil(`document.querySelector('.person-list-row[data-person-id="hidden-result"] .person-list-focus')`, 'hidden search result');

  const before = await evaluate(`(() => {
    const row = document.querySelector('.person-list-row[data-person-id="hidden-result"]');
    const focus = row?.querySelector('.person-list-focus');
    return {
      hiddenOnTimeline: Boolean(document.querySelector('.timeline-node[data-person-id="hidden-result"]')),
      outside: row?.classList.contains('outside-focus-scope') || false,
      focusLabel: focus?.textContent || '',
      scopeNote: row?.querySelector('.person-list-scope')?.textContent || '',
      count: document.querySelector('#people-count')?.textContent || '',
      label: document.querySelector('#people-label')?.textContent || ''
    };
  })()`);

  if (before.hiddenOnTimeline) throw new Error('Hidden profile was already in the focused timeline');
  if (!before.outside) throw new Error('Hidden result was not marked outside the current focus tree');
  if (before.focusLabel !== 'Focus') throw new Error(`Focus action label was ${before.focusLabel}`);
  if (!before.scopeNote.includes('Outside current focus tree')) throw new Error(`Scope note was ${before.scopeNote}`);
  if (before.count !== '1' || before.label !== 'stored match') throw new Error(`Search count was ${before.count} ${before.label}`);

  await evaluate(`document.querySelector('.person-list-row[data-person-id="hidden-result"] .person-list-focus').click(); true`);
  await waitUntil(`document.querySelector('.timeline-node.focus[data-person-id="hidden-result"]') && document.querySelector('#tree-filter').value === ''`, 'hidden result focus');

  const after = await evaluate(`(() => {
    const saved = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
    const tree = saved.trees.find(candidate => candidate.id === saved.activeTreeId);
    return {
      rootId: tree?.rootId || '',
      query: document.querySelector('#tree-filter')?.value || '',
      focusVisible: Boolean(document.querySelector('.timeline-node.focus[data-person-id="hidden-result"]')),
      sidebarOpen: document.querySelector('#detail-sidebar')?.classList.contains('open') || false,
      heading: document.querySelector('#person-heading')?.textContent || ''
    };
  })()`);

  if (after.rootId !== 'hidden-result') throw new Error(`Persisted root was ${after.rootId}`);
  if (after.query) throw new Error(`Search was not cleared: ${after.query}`);
  if (!after.focusVisible) throw new Error('Focused search result did not appear on the timeline');
  if (!after.sidebarOpen || !after.heading.includes('Hidden Search Result')) {
    throw new Error(`Focused result sidebar was not open: ${JSON.stringify(after)}`);
  }

  console.log(JSON.stringify({ before, after }, null, 2));
} finally {
  for (const waiter of pending.values()) waiter.reject(new Error('Chrome closed'));
  socket?.close();
  chrome.kill('SIGKILL');
  await sleep(250);
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
