import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('timeline profile nodes do not repeat their visible name in a native hover tooltip', () => {
  assert.doesNotMatch(
    appSource,
    /group\.append\(svg\('title', \{\}, `\$\{historicalDisplayName\} · \$\{historicalLifeLabel\}`\)\);/
  );
});

test('timeline profile nodes retain accessible labels and informative event tooltips', () => {
  assert.match(appSource, /'aria-label': `\$\{historicalDisplayName\}, \$\{historicalLifeLabel\}/);
  assert.match(appSource, /mark\.append\(svg\('title', \{\}, `\$\{event\.name\} · \$\{yearLabel\}`\)\);/);
  assert.match(appSource, /marker\.append\(svg\('title', \{\}, `Married \$\{visibleName\(partner\)\} in \$\{marriageYear\}`\)\);/);
});
