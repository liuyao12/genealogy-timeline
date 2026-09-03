const SOURCE_MODE_STORAGE_KEY = 'lineage-source-mode-v1';

function readStoredMode() {
  try { return localStorage.getItem(SOURCE_MODE_STORAGE_KEY) || ''; }
  catch { return ''; }
}

function writeStoredMode(mode) {
  try { localStorage.setItem(SOURCE_MODE_STORAGE_KEY, mode); }
  catch { /* Storage can be disabled without breaking the accordion. */ }
}

function sourceModeSummary({ eyebrow, title, icon }) {
  const summary = document.createElement('summary');
  summary.className = 'source-mode-summary';

  const mark = document.createElement('span');
  mark.className = 'source-mode-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = icon;

  const copy = document.createElement('span');
  copy.className = 'source-mode-summary-copy';
  const label = document.createElement('span');
  label.className = 'eyebrow';
  label.textContent = eyebrow;
  const heading = document.createElement('strong');
  heading.textContent = title;
  copy.append(label, heading);

  const chevron = document.createElement('span');
  chevron.className = 'source-mode-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '⌄';

  summary.append(mark, copy, chevron);
  return summary;
}

function sourceMode({ mode, eyebrow, title, icon, content, open = false }) {
  const details = document.createElement('details');
  details.className = 'source-mode';
  details.dataset.sourceMode = mode;
  details.name = 'tree-source-mode';
  details.open = open;
  details.append(sourceModeSummary({ eyebrow, title, icon }), content);
  return details;
}

function sourceModePanel(nodes = []) {
  const panel = document.createElement('div');
  panel.className = 'source-mode-panel';
  panel.append(...nodes.filter(Boolean));
  return panel;
}

function prepareStaticModes(sourceCard) {
  const existing = sourceCard.querySelector('#tree-source-modes');
  if (existing) return existing;

  const heading = sourceCard.querySelector(':scope > .source-heading');
  const paragraphs = [...sourceCard.querySelectorAll(':scope > p')];
  const manualButton = sourceCard.querySelector(':scope > #new-tree-button');
  const divider = sourceCard.querySelector(':scope > .source-divider');
  const aiHeading = sourceCard.querySelector(':scope > .source-subheading');
  const aiButton = sourceCard.querySelector(':scope > #prepare-ai-import');
  const exampleButton = sourceCard.querySelector(':scope > #royal-example-button');
  if (!heading || paragraphs.length < 2 || !manualButton || !aiButton) return null;

  const headingEyebrow = heading.querySelector('.eyebrow');
  const headingTitle = heading.querySelector('h2');
  const headingMark = heading.querySelector('.source-monogram');
  if (headingEyebrow) headingEyebrow.textContent = 'Add or import a tree';
  if (headingTitle) headingTitle.textContent = 'Choose one method';
  if (headingMark) headingMark.textContent = '3';

  const modes = document.createElement('div');
  modes.id = 'tree-source-modes';
  modes.className = 'source-modes';
  modes.setAttribute('aria-label', 'Ways to add a family tree');

  const manual = sourceMode({
    mode: 'manual', eyebrow: 'Manual tree', title: 'One profile at a time', icon: '+', open: true,
    content: sourceModePanel([paragraphs[0], manualButton])
  });
  const ai = sourceMode({
    mode: 'ai', eyebrow: 'AI-assisted import', title: 'Structured public research', icon: '✦',
    content: sourceModePanel([paragraphs[1], aiButton])
  });
  modes.append(manual, ai);

  divider?.remove();
  aiHeading?.remove();
  sourceCard.insertBefore(modes, exampleButton || null);
  if (exampleButton) exampleButton.classList.add('source-example-after-modes');
  return modes;
}

function wrapGeniMode(sourceCard, modes) {
  const block = sourceCard.querySelector(':scope > .geni-source-block');
  if (!block || block.closest('.source-mode')) return null;

  const heading = block.querySelector('.geni-source-heading');
  const title = heading?.querySelector('strong')?.textContent?.trim() || 'Load a descendant branch';
  heading?.remove();
  block.classList.add('source-mode-panel');
  const details = sourceMode({
    mode: 'geni', eyebrow: 'Live Geni import', title, icon: 'G', content: block
  });
  const ai = modes.querySelector('[data-source-mode="ai"]');
  modes.insertBefore(details, ai || null);
  return details;
}

function bindMode(details, modes) {
  if (details.dataset.sourceModeBound === 'true') return;
  details.dataset.sourceModeBound = 'true';
  const summary = details.querySelector(':scope > summary');
  summary?.addEventListener('click', event => {
    // Keep exactly one method visible. Selecting the open heading leaves it open.
    if (details.open) event.preventDefault();
  });
  details.addEventListener('toggle', () => {
    if (!details.open) {
      queueMicrotask(() => {
        if (![...modes.querySelectorAll(':scope > .source-mode')].some(mode => mode.open)) details.open = true;
      });
      return;
    }
    modes.querySelectorAll(':scope > .source-mode').forEach(other => {
      if (other !== details) other.open = false;
    });
    writeStoredMode(details.dataset.sourceMode);
  });
}

function activateRememberedMode(modes) {
  const all = [...modes.querySelectorAll(':scope > .source-mode')];
  if (!all.length) return;
  all.forEach(details => bindMode(details, modes));
  const stored = readStoredMode();
  const active = all.find(details => details.dataset.sourceMode === stored)
    || all.find(details => details.open)
    || all[0];
  all.forEach(details => { details.open = details === active; });
}

function injectSourceModeStyles() {
  if (document.getElementById('source-mode-styles')) return;
  const style = document.createElement('style');
  style.id = 'source-mode-styles';
  style.textContent = `
    .source-modes { display: grid; gap: 7px; margin-top: 13px; }
    .source-mode { overflow: hidden; border: 1px solid #c8c8c8; border-radius: 9px; background: #fff; }
    .source-mode[open] { border-color: #000; box-shadow: 0 3px 12px rgba(0,0,0,.07); }
    .source-mode-summary { display: grid; grid-template-columns: 27px minmax(0, 1fr) 15px; align-items: center; gap: 9px; min-height: 48px; padding: 8px 9px; cursor: pointer; list-style: none; user-select: none; }
    .source-mode-summary::-webkit-details-marker { display: none; }
    .source-mode-summary::marker { content: ''; }
    .source-mode-summary:hover { background: #f4f4f4; }
    .source-mode-summary:focus-visible { outline: 2px solid #000; outline-offset: -2px; }
    .source-mode-mark { display: grid; place-items: center; width: 27px; height: 27px; border: 1px solid #aaa; border-radius: 50%; background: #fff; font: 700 11px/1 Georgia, serif; }
    .source-mode[open] .source-mode-mark { border-color: #000; background: #000; color: #fff; }
    .source-mode-summary-copy { min-width: 0; }
    .source-mode-summary-copy strong { display: block; margin-top: 2px; overflow: hidden; font: 600 12px/1.3 Georgia, serif; text-overflow: ellipsis; white-space: nowrap; }
    .source-mode-chevron { color: #555; font-size: 15px; line-height: 1; text-align: center; transition: transform .16s ease; }
    .source-mode[open] .source-mode-chevron { transform: rotate(180deg); }
    .source-mode-panel { display: grid; gap: 9px; margin: 0; padding: 10px 11px 12px; border-top: 1px solid #ddd; }
    .source-mode-panel p { margin: 0; }
    .source-mode-panel > .button { width: 100%; }
    .source-mode-panel.geni-source-block { margin: 0; padding: 10px 11px 12px; border-top: 1px solid #ddd; }
    .source-example-after-modes { display: block; margin-top: 11px; padding-top: 10px; border-top: 1px solid #ddd; }
  `;
  document.head.append(style);
}

function initializeSourceModes() {
  const sourceCard = document.querySelector('.source-card');
  if (!sourceCard) return;
  injectSourceModeStyles();
  const modes = prepareStaticModes(sourceCard);
  if (!modes) return;

  const observer = new MutationObserver(() => {
    const added = wrapGeniMode(sourceCard, modes);
    if (added) {
      bindMode(added, modes);
      activateRememberedMode(modes);
    }
  });
  observer.observe(sourceCard, { childList: true });
  wrapGeniMode(sourceCard, modes);
  window.setTimeout(() => activateRememberedMode(modes), 0);
}

if (typeof document !== 'undefined') initializeSourceModes();
