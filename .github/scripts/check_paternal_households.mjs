import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const chromeBinary = process.env.CHROME_BIN;
if (!chromeBinary) throw new Error('CHROME_BIN is not set');

const userDataDir = mkdtempSync(join(tmpdir(), 'lineage-paternal-households-'));
const port = 9227;
const chrome = spawn(chromeBinary, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1600,1100', 'about:blank'
], { stdio: 'ignore' });

let socket;
let messageId = 0;
const pending = new Map();

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { return await json(`http://127.0.0.1:${port}/json/version`); }
    catch { await sleep(100); }
  }
  throw new Error('Chrome debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = ++messageId;
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

async function waitUntil(expression, label, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const person = (id, displayName, gender, birthYear, deathYear, parents = [], children = [], spouses = []) => ({
  id, displayName, gender, birthYear: String(birthYear), deathYear: String(deathYear),
  parents, children, spouses, partners: spouses, marriageYears: {},
  relationshipEndYears: {}, relationshipEndStatuses: {}, divorcedSpouses: [],
  nonSpouses: [], namePeriods: [], personalEvents: []
});

const people = {
  'old-great-grandfather': person('old-great-grandfather', 'Old great-grandfather', 'male', 1820, 1890, [], ['old-grandfather', 'old-great-aunt'], ['old-great-grandmother', 'old-great-second-wife']),
  'old-great-grandmother': person('old-great-grandmother', 'Old great-grandmother', 'female', 1825, 1880, [], ['old-grandfather', 'old-great-aunt'], ['old-great-grandfather']),
  'old-great-second-wife': person('old-great-second-wife', 'Old great-grandfather second wife', 'female', 1840, 1905, [], [], ['old-great-grandfather']),
  'old-great-aunt': person('old-great-aunt', 'Old great-aunt', 'female', 1852, 1920, ['old-great-grandfather', 'old-great-grandmother'], [], []),
  'old-grandfather': person('old-grandfather', 'Old grandfather', 'male', 1848, 1925, ['old-great-grandfather', 'old-great-grandmother'], ['old-father', 'old-uncle', 'old-half-aunt'], ['old-grandmother', 'old-step-grandmother']),
  'old-grandmother': person('old-grandmother', 'Old grandmother', 'female', 1850, 1920, [], ['old-father', 'old-uncle'], ['old-grandfather']),
  'old-step-grandmother': person('old-step-grandmother', 'Old step-grandmother', 'female', 1862, 1932, [], ['old-half-aunt'], ['old-grandfather']),
  'old-uncle': person('old-uncle', 'Old uncle', 'male', 1876, 1945, ['old-grandfather', 'old-grandmother'], ['old-cousin'], ['old-uncle-spouse']),
  'old-uncle-spouse': person('old-uncle-spouse', 'Old uncle spouse', 'female', 1880, 1950, [], ['old-cousin'], ['old-uncle']),
  'old-cousin': person('old-cousin', 'Old cousin', 'male', 1910, 1980, ['old-uncle', 'old-uncle-spouse'], [], []),
  'old-half-aunt': person('old-half-aunt', 'Old half-aunt', 'female', 1888, 1960, ['old-grandfather', 'old-step-grandmother'], [], []),
  'old-father': person('old-father', 'Old father', 'male', 1872, 1955, ['old-grandfather', 'old-grandmother'], ['old-root', 'old-sibling', 'old-half-sibling'], ['old-mother', 'old-stepmother']),
  'old-mother': person('old-mother', 'Old mother', 'female', 1878, 1960, [], ['old-root', 'old-sibling'], ['old-father']),
  'old-stepmother': person('old-stepmother', 'Old stepmother', 'female', 1888, 1968, [], ['old-half-sibling'], ['old-father']),
  'old-sibling': person('old-sibling', 'Old sibling', 'female', 1904, 1985, ['old-father', 'old-mother'], ['old-niece'], ['old-sibling-spouse']),
  'old-sibling-spouse': person('old-sibling-spouse', 'Old sibling spouse', 'male', 1900, 1980, [], ['old-niece'], ['old-sibling']),
  'old-niece': person('old-niece', 'Old niece', 'female', 1932, 2010, ['old-sibling', 'old-sibling-spouse'], [], []),
  'old-half-sibling': person('old-half-sibling', 'Old half-sibling', 'male', 1912, 1990, ['old-father', 'old-stepmother'], [], []),
  'old-root': person('old-root', 'Old focus', 'male', 1900, 1975, ['old-father', 'old-mother'], ['shared-child'], ['new-focus']),

  'new-great-grandfather': person('new-great-grandfather', 'New great-grandfather', 'male', 1828, 1900, [], ['new-grandfather', 'new-great-uncle'], ['new-great-grandmother', 'new-great-second-wife']),
  'new-great-grandmother': person('new-great-grandmother', 'New great-grandmother', 'female', 1832, 1895, [], ['new-grandfather', 'new-great-uncle'], ['new-great-grandfather']),
  'new-great-second-wife': person('new-great-second-wife', 'New great-grandfather second wife', 'female', 1845, 1910, [], [], ['new-great-grandfather']),
  'new-great-uncle': person('new-great-uncle', 'New great-uncle', 'male', 1855, 1930, ['new-great-grandfather', 'new-great-grandmother'], [], []),
  'new-grandfather': person('new-grandfather', 'New grandfather', 'male', 1852, 1930, ['new-great-grandfather', 'new-great-grandmother'], ['new-father', 'new-uncle'], ['new-grandmother', 'new-step-grandmother']),
  'new-grandmother': person('new-grandmother', 'New grandmother', 'female', 1858, 1938, [], ['new-father', 'new-uncle'], ['new-grandfather']),
  'new-step-grandmother': person('new-step-grandmother', 'New step-grandmother', 'female', 1870, 1940, [], [], ['new-grandfather']),
  'new-uncle': person('new-uncle', 'New uncle', 'male', 1886, 1962, ['new-grandfather', 'new-grandmother'], [], []),
  'new-father': person('new-father', 'New father', 'male', 1878, 1960, ['new-grandfather', 'new-grandmother'], ['new-focus', 'new-sibling', 'new-half-sibling'], ['new-mother', 'new-stepmother']),
  'new-mother': person('new-mother', 'New mother', 'female', 1882, 1966, [], ['new-focus', 'new-sibling'], ['new-father']),
  'new-stepmother': person('new-stepmother', 'New stepmother', 'female', 1892, 1972, [], ['new-half-sibling'], ['new-father']),
  'new-sibling': person('new-sibling', 'New sibling', 'male', 1908, 1982, ['new-father', 'new-mother'], ['new-nephew'], ['new-sibling-spouse']),
  'new-sibling-spouse': person('new-sibling-spouse', 'New sibling spouse', 'female', 1912, 1990, [], ['new-nephew'], ['new-sibling']),
  'new-nephew': person('new-nephew', 'New nephew', 'male', 1938, 2015, ['new-sibling', 'new-sibling-spouse'], [], []),
  'new-half-sibling': person('new-half-sibling', 'New half-sibling', 'female', 1915, 1995, ['new-father', 'new-stepmother'], [], []),
  'new-focus': person('new-focus', 'New focus', 'female', 1905, 1985, ['new-father', 'new-mother'], ['shared-child'], ['old-root']),
  'shared-child': person('shared-child', 'Shared child', 'male', 1935, 2005, ['old-root', 'new-focus'], ['shared-grandchild'], []),
  'shared-grandchild': person('shared-grandchild', 'Shared grandchild', 'female', 1965, 2025, ['shared-child'], [], [])
};
people['old-root'].marriageYears['new-focus'] = '1928';
people['new-focus'].marriageYears['old-root'] = '1928';

const workspace = {
  version: 1,
  activeTreeId: 'tree-paternal-households',
  trees: [{
    id: 'tree-paternal-households', title: 'Paternal household transition', rootId: 'old-root',
    people, globalEvents: [], reignColor: '#c62828', timelineYearWidth: 4,
    timelineNodeHeight: 28, asOfYear: null, lastAsOfYear: null,
    showDecadeBands: true, treeFilter: '', relationVisibility: {},
    starterDataVersion: 0, manualTree: true, collapsedIds: [], zoom: 1,
    viewportLeft: 220, viewportTop: 170
  }]
};

function assertIncludes(ids, expected, label) {
  for (const id of expected) {
    if (!ids.includes(id)) throw new Error(`${label} is missing ${id}`);
  }
}
function assertExcludes(ids, expected, label) {
  for (const id of expected) {
    if (ids.includes(id)) throw new Error(`${label} unexpectedly includes ${id}`);
  }
}

try {
  await waitForDebugger();
  const targets = await json(`http://127.0.0.1:${port}/json`);
  const target = targets[0] || await json(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
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

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await waitUntil('document.readyState === "complete"', 'initial page load');
  await evaluate(`localStorage.setItem('lineage-tree-workspace-v1', ${JSON.stringify(JSON.stringify(workspace))}); location.reload(); true`);
  await waitUntil('document.readyState === "complete" && document.querySelectorAll(".timeline-node").length > 10', 'test tree render');

  const initial = await evaluate(`(() => {
    const ids = [...new Set([...document.querySelectorAll('.timeline-node')].map(node => node.dataset.personId))];
    const spouse = document.querySelector('.timeline-node[data-person-id="new-focus"]');
    const focus = document.querySelector('.timeline-node.focus[data-person-id="old-root"]');
    const outline = focus?.querySelector('.lifespan-outline');
    const rect = spouse?.getBoundingClientRect();
    return {
      ids,
      spouseRect: rect && { left: rect.left, top: rect.top },
      focusStroke: outline && getComputedStyle(outline).stroke,
      focusWidth: outline && getComputedStyle(outline).strokeWidth
    };
  })()`);

  assertIncludes(initial.ids, [
    'old-great-grandfather', 'old-great-grandmother', 'old-great-second-wife', 'old-great-aunt',
    'old-grandfather', 'old-grandmother', 'old-step-grandmother', 'old-uncle', 'old-half-aunt',
    'old-father', 'old-mother', 'old-stepmother', 'old-sibling', 'old-half-sibling',
    'old-root', 'new-focus', 'shared-child', 'shared-grandchild'
  ], 'old focus tree');
  assertExcludes(initial.ids, [
    'old-uncle-spouse', 'old-cousin', 'old-sibling-spouse', 'old-niece',
    'new-father', 'new-sibling', 'new-stepmother'
  ], 'old focus tree');
  if (initial.focusStroke !== 'rgb(105, 169, 207)') throw new Error(`male focus stroke was ${initial.focusStroke}`);
  if (Number.parseFloat(initial.focusWidth) < 4.3) throw new Error(`male focus width was ${initial.focusWidth}`);

  await evaluate(`(() => {
    const node = document.querySelector('.timeline-node[data-person-id="old-root"]');
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  })()`);
  await waitUntil('document.querySelector(".relationship-focus[data-focus-person-id=\\"new-focus\\"]")', 'spouse focus action');
  await evaluate(`(() => {
    window.__lineageTransitionCalls = 0;
    if (document.startViewTransition) {
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = callback => { window.__lineageTransitionCalls += 1; return original(callback); };
    }
    document.querySelector('.relationship-focus[data-focus-person-id="new-focus"]').click();
    return true;
  })()`);
  await waitUntil('!document.documentElement.classList.contains("focus-tree-transitioning") && document.querySelector(".timeline-node.focus[data-person-id=\\"new-focus\\"]")', 'focus transition', 12000);
  await sleep(120);

  const after = await evaluate(`(() => {
    const ids = [...new Set([...document.querySelectorAll('.timeline-node')].map(node => node.dataset.personId))];
    const focus = document.querySelector('.timeline-node.focus[data-person-id="new-focus"]');
    const oldRoot = document.querySelector('.timeline-node.spouse[data-person-id="old-root"]');
    const outline = focus?.querySelector('.lifespan-outline');
    const rect = focus?.getBoundingClientRect();
    const saved = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
    return {
      ids,
      focusRect: rect && { left: rect.left, top: rect.top },
      focusStroke: outline && getComputedStyle(outline).stroke,
      focusWidth: outline && getComputedStyle(outline).strokeWidth,
      oldRootIsSpouse: Boolean(oldRoot),
      transitionCalls: window.__lineageTransitionCalls,
      persistedRoot: saved.trees.find(tree => tree.id === saved.activeTreeId)?.rootId
    };
  })()`);

  assertIncludes(after.ids, [
    'new-great-grandfather', 'new-great-grandmother', 'new-great-second-wife', 'new-great-uncle',
    'new-grandfather', 'new-grandmother', 'new-step-grandmother', 'new-uncle',
    'new-father', 'new-mother', 'new-stepmother', 'new-sibling', 'new-half-sibling',
    'new-focus', 'old-root', 'shared-child', 'shared-grandchild'
  ], 'new focus tree');
  assertExcludes(after.ids, [
    'new-sibling-spouse', 'new-nephew', 'old-father', 'old-sibling', 'old-stepmother'
  ], 'new focus tree');
  if (!after.oldRootIsSpouse) throw new Error('former focus did not become the new focus spouse');
  if (after.focusStroke !== 'rgb(229, 128, 181)') throw new Error(`female focus stroke was ${after.focusStroke}`);
  if (Number.parseFloat(after.focusWidth) < 4.7) throw new Error(`female focus width was ${after.focusWidth}`);
  if (after.persistedRoot !== 'new-focus') throw new Error(`persisted root was ${after.persistedRoot}`);
  if (initial.spouseRect && after.focusRect) {
    const delta = Math.abs(initial.spouseRect.left - after.focusRect.left) + Math.abs(initial.spouseRect.top - after.focusRect.top);
    if (delta > 1.5) throw new Error(`chosen spouse moved ${delta}px during focus transition`);
  }

  console.log(JSON.stringify({ initial, after }, null, 2));
} finally {
  for (const waiter of pending.values()) waiter.reject(new Error('Chrome closed'));
  socket?.close();
  chrome.kill('SIGKILL');
  rmSync(userDataDir, { recursive: true, force: true });
}
