import {
  DEFAULT_MAX_PROFILES,
  DEFAULT_MAX_REQUESTS,
  DEFAULT_REQUEST_DELAY_MS,
  GENI_IMPORT_CHECKPOINT_KEY,
  GENI_IMPORT_INTENT_KEY,
  GENI_TOKEN_EXPIRY_KEY,
  GENI_TOKEN_SESSION_KEY,
  WORKSPACE_STORAGE_KEY
} from './geni-config.js?v=1';
import { clean, profileIdFromGeniInput } from './geni-model.js?v=1';
import { GeniJsonpClient, cryptoId } from './geni-api.js?v=1';
import { GeniDescendantImporter, lineageTreeSnapshot } from './geni-import-core.js?v=1';

function storageJson(storage, key, fallback = null) {
  try {
    return JSON.parse(storage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSessionJson(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function tokenIsCurrent() {
  const token = clean(sessionStorage.getItem(GENI_TOKEN_SESSION_KEY));
  const expiry = Number(sessionStorage.getItem(GENI_TOKEN_EXPIRY_KEY));
  if (!token) return false;
  if (expiry && Date.now() >= expiry - 60000) {
    sessionStorage.removeItem(GENI_TOKEN_SESSION_KEY);
    sessionStorage.removeItem(GENI_TOKEN_EXPIRY_KEY);
    return false;
  }
  return true;
}

function captureOauthResult() {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, '').replace(/^\/?\?/, ''));
  const token = clean(hash.get('access_token') || query.get('access_token'));
  const expiresIn = Number(hash.get('expires_in') || query.get('expires_in'));
  const status = clean(hash.get('status') || query.get('status'));
  const message = clean(hash.get('message') || query.get('message'));
  const ownsCallback = Boolean(sessionStorage.getItem(GENI_IMPORT_INTENT_KEY));
  if (token) {
    sessionStorage.setItem(GENI_TOKEN_SESSION_KEY, token);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      sessionStorage.setItem(GENI_TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
    }
  }
  // Remove our OAuth result from the address bar after saving it. Leave an
  // unrelated callback alone so the original app module can still process it.
  if (ownsCallback && (token || status || message)) {
    for (const key of ['access_token', 'expires_in', 'status', 'message']) query.delete(key);
    const suffix = query.toString();
    history.replaceState(history.state, '', `${location.pathname}${suffix ? `?${suffix}` : ''}`);
  }
  return { token, status, message };
}

function beginAuthorization(config) {
  const appId = clean(document.querySelector('meta[name="geni-app-id"]')?.content);
  if (!appId) throw new Error('The public Geni application ID is not configured.');
  writeSessionJson(GENI_IMPORT_INTENT_KEY, config);
  const authorize = new URL('https://www.geni.com/platform/oauth/authorize');
  authorize.searchParams.set('client_id', appId);
  authorize.searchParams.set('redirect_uri', `${location.origin}${location.pathname}`);
  authorize.searchParams.set('response_type', 'token');
  location.assign(authorize.href);
}

function saveAsTreeTab(pkg, importer) {
  if (!pkg.rootId || !pkg.people?.[pkg.rootId]) throw new Error('The imported Geni branch has no usable root profile.');
  const workspace = storageJson(localStorage, WORKSPACE_STORAGE_KEY, { version: 1, activeTreeId: '', trees: [] });
  workspace.version = 1;
  workspace.trees = Array.isArray(workspace.trees) ? workspace.trees : [];
  importer.treeId ||= `tree-geni-${cryptoId()}`;
  const snapshot = lineageTreeSnapshot(pkg, { id: importer.treeId });
  const index = workspace.trees.findIndex(tree => tree?.id === importer.treeId);
  if (index >= 0) workspace.trees[index] = snapshot;
  else workspace.trees.push(snapshot);
  workspace.activeTreeId = importer.treeId;
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

async function mergeIntoCurrentTree(pkg) {
  const textarea = document.getElementById('ai-import-json');
  const button = document.getElementById('stitch-ai-import');
  if (!textarea || !button) throw new Error('Lineage has not finished initializing its stitch importer.');
  textarea.value = JSON.stringify(pkg);
  button.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function injectStyles() {
  if (document.getElementById('geni-import-styles')) return;
  const style = document.createElement('style');
  style.id = 'geni-import-styles';
  style.textContent = `
    .geni-source-block { display: grid; gap: 9px; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,.12); }
    .geni-source-block p { margin: 0; }
    .geni-source-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .geni-source-heading strong { font-size: .92rem; }
    .geni-import-dialog-card { width: min(680px, calc(100vw - 32px)); }
    .geni-import-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(170px, .65fr); gap: 12px; }
    .geni-import-grid label:first-child { grid-column: 1 / -1; }
    .geni-import-note { margin: 0; font-size: .82rem; color: rgba(0,0,0,.66); line-height: 1.45; }
    .geni-import-status { min-height: 4.4em; padding: 12px; border: 1px solid rgba(0,0,0,.15); border-radius: 8px; background: rgba(0,0,0,.025); display: grid; gap: 7px; }
    .geni-import-status strong { font-size: .9rem; }
    .geni-import-status small { line-height: 1.4; }
    .geni-import-meter { width: 100%; height: 7px; }
    .geni-import-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
    .geni-import-actions .button:first-child { margin-right: auto; }
    .geni-connection-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: .8rem; }
    .geni-connection-row button { border: 0; background: none; padding: 0; text-decoration: underline; cursor: pointer; font: inherit; }
    @media (max-width: 620px) { .geni-import-grid { grid-template-columns: 1fr; } }
  `;
  document.head.append(style);
}

function createUi() {
  injectStyles();
  const sourceCard = document.querySelector('.source-card');
  if (!sourceCard || document.getElementById('geni-import-button')) return null;
  const block = document.createElement('div');
  block.className = 'geni-source-block';
  block.innerHTML = `
    <div class="geni-source-heading"><span class="eyebrow">Live Geni import</span><strong>Load a descendant branch</strong></div>
    <p>Authorize Geni, then fetch descendants generation by generation into a new timeline tab.</p>
    <button class="button secondary grow" id="geni-import-button" type="button">Load descendants from Geni</button>
  `;
  const royalButton = document.getElementById('royal-example-button');
  sourceCard.insertBefore(block, royalButton || null);

  const dialog = document.createElement('dialog');
  dialog.id = 'geni-import-dialog';
  dialog.innerHTML = `
    <div class="dialog-card geni-import-dialog-card">
      <div class="dialog-heading">
        <div><span class="eyebrow">Authorized live import</span><h2>Load descendants from Geni</h2></div>
        <button class="close-detail" id="close-geni-import" type="button" aria-label="Close">×</button>
      </div>
      <p class="dialog-intro">Profiles and unions are fetched in generation-sized batches. Your access token remains in this browser tab and is never written to the tree.</p>
      <div class="geni-import-grid">
        <label>Geni profile URL or public ID<input id="geni-root-profile" autocomplete="off" placeholder="https://www.geni.com/people/…/600000…"></label>
        <label>Descendant scope<select id="geni-generation-scope">
          <option value="1">Children</option>
          <option value="2">Children and grandchildren</option>
          <option value="4" selected>Four descendant generations</option>
          <option value="8">Eight descendant generations</option>
          <option value="all">All reachable descendants</option>
        </select></label>
        <label>Destination<select id="geni-import-destination">
          <option value="new" selected>New tree tab</option>
          <option value="merge">Merge into current tree</option>
        </select></label>
        <label>Profile pause target<input id="geni-max-profiles" type="number" min="25" max="5000" step="25" value="${DEFAULT_MAX_PROFILES}"></label>
        <label>Request safety limit<input id="geni-max-requests" type="number" min="20" max="2000" step="20" value="${DEFAULT_MAX_REQUESTS}"></label>
      </div>
      <p class="geni-import-note">The importer retains complete generations, spouses, marriage and divorce dates, and the correct parent union. Adopted and foster children are included and identified in the imported profile note.</p>
      <div class="geni-import-status" aria-live="polite">
        <strong id="geni-import-status-title">Ready</strong>
        <small id="geni-import-status-detail">No Geni requests have been made.</small>
        <progress class="geni-import-meter" id="geni-import-meter" max="100" value="0"></progress>
      </div>
      <div class="geni-connection-row"><span id="geni-connection-status"></span><button id="geni-forget-token" type="button">Forget authorization</button></div>
      <div class="geni-import-actions">
        <button class="button secondary" id="geni-use-partial" type="button" hidden>Use partial tree</button>
        <button class="button secondary" id="geni-stop-import" type="button" hidden>Stop</button>
        <button class="button secondary" id="geni-clear-checkpoint" type="button" hidden>Discard saved progress</button>
        <button class="button primary" id="geni-start-import" type="button">Start import</button>
      </div>
      <p class="geni-import-note"><a href="https://github.com/liuyao12/genealogy-timeline/blob/main/docs/geni-import.md" target="_blank" rel="noreferrer">How authorization, limits, and saved progress work ↗</a></p>
    </div>
  `;
  document.body.append(dialog);
  return {
    block,
    button: block.querySelector('#geni-import-button'),
    dialog,
    close: dialog.querySelector('#close-geni-import'),
    root: dialog.querySelector('#geni-root-profile'),
    scope: dialog.querySelector('#geni-generation-scope'),
    destination: dialog.querySelector('#geni-import-destination'),
    maxProfiles: dialog.querySelector('#geni-max-profiles'),
    maxRequests: dialog.querySelector('#geni-max-requests'),
    statusTitle: dialog.querySelector('#geni-import-status-title'),
    statusDetail: dialog.querySelector('#geni-import-status-detail'),
    meter: dialog.querySelector('#geni-import-meter'),
    connection: dialog.querySelector('#geni-connection-status'),
    forget: dialog.querySelector('#geni-forget-token'),
    partial: dialog.querySelector('#geni-use-partial'),
    stop: dialog.querySelector('#geni-stop-import'),
    clear: dialog.querySelector('#geni-clear-checkpoint'),
    start: dialog.querySelector('#geni-start-import')
  };
}

function configFromUi(ui) {
  const scope = clean(ui.scope.value);
  return {
    rootInput: clean(ui.root.value),
    descendantGenerations: scope === 'all' ? 32 : Math.max(1, Number(scope) || 4),
    allDescendants: scope === 'all',
    maxProfiles: Math.max(25, Math.min(5000, Number(ui.maxProfiles.value) || DEFAULT_MAX_PROFILES)),
    maxRequests: Math.max(20, Math.min(2000, Number(ui.maxRequests.value) || DEFAULT_MAX_REQUESTS)),
    destination: ui.destination.value === 'merge' ? 'merge' : 'new'
  };
}

function populateUiFromConfig(ui, config) {
  if (!config) return;
  ui.root.value = clean(config.rootInput);
  ui.scope.value = config.allDescendants ? 'all' : String(config.descendantGenerations || 4);
  if (![...ui.scope.options].some(option => option.value === ui.scope.value)) ui.scope.value = '4';
  ui.destination.value = config.destination === 'merge' ? 'merge' : 'new';
  ui.maxProfiles.value = String(config.maxProfiles || DEFAULT_MAX_PROFILES);
  ui.maxRequests.value = String(config.maxRequests || DEFAULT_MAX_REQUESTS);
}

function selectedGeniId() {
  const input = document.querySelector('#person-form input[name="geniId"]');
  return clean(input?.value);
}

function checkpointFromStorage() {
  return storageJson(sessionStorage, GENI_IMPORT_CHECKPOINT_KEY, null);
}

function updateConnectionUi(ui) {
  const connected = tokenIsCurrent();
  ui.connection.textContent = connected ? 'Authorized with Geni for this browser tab.' : 'Geni authorization is required before the first request.';
  ui.forget.hidden = !connected;
}

function updateCheckpointUi(ui) {
  const checkpoint = checkpointFromStorage();
  ui.clear.hidden = !checkpoint;
  ui.partial.hidden = !checkpoint || !Object.keys(checkpoint.people || {}).length;
  ui.start.textContent = checkpoint ? 'Resume import' : (tokenIsCurrent() ? 'Start import' : 'Authorize and start');
  ui.button.textContent = checkpoint ? 'Resume Geni descendant import' : 'Load descendants from Geni';
  return checkpoint;
}

function setUiRunning(ui, running) {
  ui.stop.hidden = !running;
  ui.start.disabled = running;
  ui.partial.disabled = running;
  ui.clear.disabled = running;
  for (const element of [ui.root, ui.scope, ui.destination, ui.maxProfiles, ui.maxRequests]) element.disabled = running;
}

function statusFromProgress(ui, progress, client, importer) {
  const profileCount = Object.keys(importer?.people || {}).length;
  const requestCount = client?.requestCount || 0;
  if (progress.phase === 'backoff') {
    ui.statusTitle.textContent = 'Geni asked us to slow down';
    ui.statusDetail.textContent = `${progress.message} Retrying after ${Math.round(progress.retryInMs / 1000)} seconds · ${requestCount} requests so far.`;
  } else if (progress.phase === 'generation') {
    ui.statusTitle.textContent = `Reading descendant generation ${progress.generation + 1}`;
    ui.statusDetail.textContent = `${progress.frontier} profile${progress.frontier === 1 ? '' : 's'} in this generation · ${profileCount} profiles retained · ${requestCount} requests.`;
  } else if (progress.phase === 'checkpoint') {
    ui.statusTitle.textContent = `Completed ${progress.generation} descendant generation${progress.generation === 1 ? '' : 's'}`;
    ui.statusDetail.textContent = `${progress.profiles} profiles retained · ${progress.frontier} queued for the next generation · ${progress.requests} requests.`;
  } else if (progress.phase === 'request') {
    ui.statusDetail.textContent = `${profileCount} profiles retained · request ${requestCount} is reading ${progress.path}.`;
  }
  const maxProfiles = Number(ui.maxProfiles.value) || DEFAULT_MAX_PROFILES;
  ui.meter.max = maxProfiles;
  ui.meter.value = Math.min(maxProfiles, profileCount);
}

let activeImporter = null;

async function commitImporterResult(ui, importer, { clearCheckpoint = true, reload = true } = {}) {
  const pkg = importer.package();
  if (!Object.keys(pkg.people).length) throw new Error('No public Geni profiles were available to import.');
  if (importer.destination === 'merge') {
    await mergeIntoCurrentTree(pkg);
    if (clearCheckpoint) sessionStorage.removeItem(GENI_IMPORT_CHECKPOINT_KEY);
    ui.statusTitle.textContent = 'Imported into the current tree';
    ui.statusDetail.textContent = `${Object.keys(pkg.people).length} profiles were stitched into the active timeline.`;
    updateCheckpointUi(ui);
    return;
  }
  saveAsTreeTab(pkg, importer);
  if (clearCheckpoint) sessionStorage.removeItem(GENI_IMPORT_CHECKPOINT_KEY);
  else writeSessionJson(GENI_IMPORT_CHECKPOINT_KEY, importer.checkpoint());
  if (reload) location.reload();
}

async function runImport(ui, requestedConfig = null) {
  const saved = checkpointFromStorage();
  const formConfig = requestedConfig || configFromUi(ui);
  if (!saved && !profileIdFromGeniInput(formConfig.rootInput)) {
    ui.statusTitle.textContent = 'Enter a Geni profile';
    ui.statusDetail.textContent = 'Use a public Geni profile URL, a public GUID, or a profile ID.';
    ui.root.focus();
    return;
  }
  const resumeCheckpoint = saved && (!formConfig.rootInput || profileIdFromGeniInput(formConfig.rootInput) === saved.rootRequestId)
    ? { ...saved, maxProfiles: formConfig.maxProfiles, destination: formConfig.destination }
    : null;
  if (saved && !resumeCheckpoint) sessionStorage.removeItem(GENI_IMPORT_CHECKPOINT_KEY);
  const config = resumeCheckpoint ? {
    ...formConfig,
    rootInput: saved.rootInput,
    descendantGenerations: saved.descendantGenerations,
    allDescendants: saved.allDescendants,
    destination: saved.destination
  } : formConfig;
  if (!tokenIsCurrent()) {
    beginAuthorization(config);
    return;
  }

  setUiRunning(ui, true);
  ui.statusTitle.textContent = resumeCheckpoint ? 'Resuming Geni import' : 'Starting Geni import';
  ui.statusDetail.textContent = 'Preparing the first generation-sized batch.';
  const minDelay = Number(document.querySelector('meta[name="geni-request-delay-ms"]')?.content) || DEFAULT_REQUEST_DELAY_MS;
  let client;
  try {
    client = new GeniJsonpClient({
      token: sessionStorage.getItem(GENI_TOKEN_SESSION_KEY),
      minDelayMs: minDelay,
      maxRequests: config.maxRequests,
      onProgress: progress => statusFromProgress(ui, progress, client, activeImporter)
    });
    activeImporter = new GeniDescendantImporter({
      client,
      ...config,
      checkpoint: resumeCheckpoint,
      onProgress: progress => {
        statusFromProgress(ui, progress, client, activeImporter);
        if (progress.phase === 'checkpoint') writeSessionJson(GENI_IMPORT_CHECKPOINT_KEY, activeImporter.checkpoint());
      }
    });
    const result = await activeImporter.run();
    writeSessionJson(GENI_IMPORT_CHECKPOINT_KEY, activeImporter.checkpoint());
    if (result.completed) {
      ui.statusTitle.textContent = 'Geni descendant import complete';
      ui.statusDetail.textContent = `${result.profiles} profiles across ${result.generations} processed generation${result.generations === 1 ? '' : 's'} · ${result.requests} requests · ${result.restrictedProfiles + result.restrictedUnions} restricted records skipped.`;
      await commitImporterResult(ui, activeImporter, { clearCheckpoint: true, reload: activeImporter.destination === 'new' });
    } else {
      ui.statusTitle.textContent = 'Import paused at a generation boundary';
      ui.statusDetail.textContent = `${result.pauseReason} ${result.profiles} profiles are saved as resumable progress.`;
      updateCheckpointUi(ui);
    }
  } catch (error) {
    if (activeImporter) writeSessionJson(GENI_IMPORT_CHECKPOINT_KEY, activeImporter.checkpoint());
    if (error?.code === 'GENI_INVALID_ACCESS_TOKEN') {
      sessionStorage.removeItem(GENI_TOKEN_SESSION_KEY);
      sessionStorage.removeItem(GENI_TOKEN_EXPIRY_KEY);
      const resumeConfig = activeImporter ? {
        rootInput: activeImporter.rootInput,
        descendantGenerations: activeImporter.descendantGenerations,
        allDescendants: activeImporter.allDescendants,
        maxProfiles: activeImporter.maxProfiles,
        maxRequests: config.maxRequests,
        destination: activeImporter.destination
      } : config;
      updateConnectionUi(ui);
      beginAuthorization(resumeConfig);
      return;
    }
    if (error?.code === 'GENI_CANCELLED') {
      ui.statusTitle.textContent = 'Import stopped';
      ui.statusDetail.textContent = `${Object.keys(activeImporter?.people || {}).length} profiles are saved as resumable progress.`;
    } else if (error?.code === 'GENI_REQUEST_LIMIT') {
      ui.statusTitle.textContent = 'Import paused at the request limit';
      ui.statusDetail.textContent = `${error.message} Raise the request limit and resume, or use the partial tree.`;
    } else {
      ui.statusTitle.textContent = 'Geni import paused';
      ui.statusDetail.textContent = error?.message || 'The import could not continue. Saved progress can be resumed.';
      console.error(error);
    }
    updateCheckpointUi(ui);
  } finally {
    activeImporter = null;
    setUiRunning(ui, false);
    updateConnectionUi(ui);
    updateCheckpointUi(ui);
  }
}

function initializeBrowserIntegration() {
  if (typeof document === 'undefined') return;
  const oauth = captureOauthResult();
  const ui = createUi();
  if (!ui) return;
  updateConnectionUi(ui);
  const checkpoint = updateCheckpointUi(ui);
  if (checkpoint) populateUiFromConfig(ui, checkpoint);
  else {
    const selectedId = selectedGeniId();
    if (selectedId) ui.root.value = selectedId;
  }

  ui.button.addEventListener('click', () => {
    const saved = updateCheckpointUi(ui);
    if (saved) populateUiFromConfig(ui, saved);
    else if (!ui.root.value) ui.root.value = selectedGeniId();
    updateConnectionUi(ui);
    ui.dialog.showModal();
  });
  ui.close.addEventListener('click', () => ui.dialog.close());
  ui.start.addEventListener('click', () => runImport(ui));
  ui.stop.addEventListener('click', () => activeImporter?.cancel());
  ui.partial.addEventListener('click', async () => {
    const savedProgress = checkpointFromStorage();
    if (!savedProgress) return;
    const client = new GeniJsonpClient({ token: sessionStorage.getItem(GENI_TOKEN_SESSION_KEY) || 'saved-progress', maxRequests: 1 });
    const importer = new GeniDescendantImporter({ client, checkpoint: savedProgress, rootInput: savedProgress.rootInput });
    await commitImporterResult(ui, importer, { clearCheckpoint: false, reload: importer.destination === 'new' });
  });
  ui.clear.addEventListener('click', () => {
    sessionStorage.removeItem(GENI_IMPORT_CHECKPOINT_KEY);
    sessionStorage.removeItem(GENI_IMPORT_INTENT_KEY);
    ui.statusTitle.textContent = 'Saved progress discarded';
    ui.statusDetail.textContent = 'A new import can now be started.';
    ui.meter.value = 0;
    updateCheckpointUi(ui);
  });
  ui.forget.addEventListener('click', () => {
    sessionStorage.removeItem(GENI_TOKEN_SESSION_KEY);
    sessionStorage.removeItem(GENI_TOKEN_EXPIRY_KEY);
    updateConnectionUi(ui);
    updateCheckpointUi(ui);
  });

  const resumeIntent = storageJson(sessionStorage, GENI_IMPORT_INTENT_KEY, null);
  if (oauth.status === 'unauthorized') {
    sessionStorage.removeItem(GENI_IMPORT_INTENT_KEY);
    ui.statusTitle.textContent = 'Geni authorization was not granted';
    ui.statusDetail.textContent = oauth.message || 'No API requests were made.';
  } else if (tokenIsCurrent() && resumeIntent) {
    sessionStorage.removeItem(GENI_IMPORT_INTENT_KEY);
    populateUiFromConfig(ui, resumeIntent);
    const startAfterLoad = () => {
      ui.dialog.showModal();
      runImport(ui, resumeIntent);
    };
    if (document.readyState === 'complete') window.setTimeout(startAfterLoad, 0);
    else window.addEventListener('load', () => window.setTimeout(startAfterLoad, 0), { once: true });
  }
}

initializeBrowserIntegration();
