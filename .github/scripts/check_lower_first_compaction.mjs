import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const chromeBinary = process.env.CHROME_BIN;
if (!chromeBinary) throw new Error('CHROME_BIN is not set');

const userDataDir = mkdtempSync(join(tmpdir(), 'lineage-lower-first-'));
const port = 9231;
const chrome = spawn(chromeBinary, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-extensions', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1600,1100', 'about:blank'
], { stdio: 'ignore' });

let socket;
let messageId = 0;
const pending = new Map();
const runtimeErrors = [];

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function pageTarget() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await json(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find(item => item.type === 'page' && item.url === 'about:blank')
        || targets.find(item => item.type === 'page');
      if (target) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome page target did not start');
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

async function waitUntil(expression, label, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  const target = await pageTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(message.params?.exceptionDetails?.exception?.description
        || message.params?.exceptionDetails?.text
        || JSON.stringify(message.params));
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      runtimeErrors.push(message.params.args?.map(argument => argument.value || argument.description).join(' ') || 'console.error');
    }
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await waitUntil('document.readyState === "complete"', 'page load');
  await waitUntil('document.querySelectorAll(".timeline-node").length > 10', 'timeline render');
  await sleep(300);

  const result = await evaluate(`(() => ({
    nodeCount: document.querySelectorAll('.timeline-node').length,
    focusId: document.querySelector('.timeline-node.focus')?.dataset.personId || '',
    appScript: document.querySelector('script[src*="app.js"]')?.getAttribute('src') || '',
    compactionModuleLoaded: performance.getEntriesByType('resource')
      .some(entry => entry.name.includes('timeline-compaction.js?v=1')),
    minY: Math.min(...[...document.querySelectorAll('.timeline-node')]
      .map(node => Number((node.getAttribute('transform')?.match(/translate\\([^ ]+ ([^)]+)\\)/) || [])[1])))
  }))()`);

  if (!result.compactionModuleLoaded) throw new Error('timeline-compaction.js was not loaded');
  if (!result.appScript.includes('app.js?v=133')) throw new Error(`unexpected app script ${result.appScript}`);
  if (!result.focusId) throw new Error('focused timeline node was not rendered');
  if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join('\n')}`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const waiter of pending.values()) waiter.reject(new Error('Chrome closed'));
  socket?.close();
  chrome.kill('SIGKILL');
  await sleep(250);
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
