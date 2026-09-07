from pathlib import Path

path = Path('.github/scripts/check_paternal_households.mjs')
text = path.read_text()

old = """let socket;
let messageId = 0;
const pending = new Map();
"""
new = """let socket;
let messageId = 0;
const pending = new Map();
const runtimeErrors = [];
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one pending block, found {text.count(old)}')
text = text.replace(old, new, 1)

old = """async function waitUntil(expression, label, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
"""
new = """async function waitUntil(expression, label, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(80);
  }
  let pageState = null;
  try {
    pageState = await evaluate(`(() => ({
      readyState: document.readyState,
      href: location.href,
      title: document.title,
      nodeCount: document.querySelectorAll('.timeline-node').length,
      canvasHidden: document.querySelector('#timeline-canvas')?.hasAttribute('hidden'),
      canvasText: document.querySelector('#timeline-canvas')?.textContent?.slice(0, 500),
      bodyText: document.body?.innerText?.slice(0, 1000),
      workspaceLength: localStorage.getItem('lineage-tree-workspace-v1')?.length || 0
    }))()`);
  } catch (error) {
    pageState = { diagnosticError: error.message };
  }
  throw new Error(`Timed out waiting for ${label}\nPage state: ${JSON.stringify(pageState, null, 2)}\nRuntime errors: ${JSON.stringify(runtimeErrors, null, 2)}`);
}
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one waitUntil block, found {text.count(old)}')
text = text.replace(old, new, 1)

old = """  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
"""
new = """  socket.addEventListener('message', event => {
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
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one socket listener, found {text.count(old)}')
text = text.replace(old, new, 1)
path.write_text(text)
