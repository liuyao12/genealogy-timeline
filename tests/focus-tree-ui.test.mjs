import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('the selected profile exposes a persistent focus-tree action', () => {
  assert.match(html, /id="focus-tree-button"/);
  assert.match(html, /id="focus-tree-status"/);
  assert.match(app, /function focusTreeOn\(personId\)/);
  assert.match(app, /state\.rootId = id/);
  assert.match(app, /Tree focused on/);
});

test('spouse rows offer a one-click focus change', () => {
  assert.match(app, /className = 'relationship-focus'/);
  assert.match(app, /focus\.dataset\.focusPersonId = targetId/);
  assert.match(app, /focusTreeOn\(targetId\)/);
  assert.match(styles, /\.relationship-focus/);
});

test('focus changes use named View Transitions and preserve the chosen node position', () => {
  assert.match(app, /document\.startViewTransition\(applyFocus\)/);
  assert.match(app, /timelineViewTransitionName/);
  assert.match(app, /group\.style\.viewTransitionName/);
  assert.match(app, /viewport\.scrollTop \+= newRect\.top - oldRect\.top/);
  assert.match(styles, /::view-transition-group\(\*\)/);
});

test('the timeline starts at the oldest known paternal ancestor', () => {
  assert.match(app, /const lineageStartId = scope\.treeRootId \|\| state\.rootId/);
  assert.match(app, /scope\.linealIds\.has\(person\.id\)/);
  assert.match(app, /const preferredTreeRootId = datedIds\.has\(scope\.treeRootId\)/);
  assert.match(app, /scope\.paternalAncestorIds\.has\(id\)/);
});
