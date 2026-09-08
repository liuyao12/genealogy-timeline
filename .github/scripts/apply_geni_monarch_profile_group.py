from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one match in {path}, found {count}: {old[:140]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'app.js',
    """import { duplicateGeniIdentityGroups, remapPeopleByGeniIdentity } from './geni-identity.js?v=2';
import { layoutGlobalEventLabels } from './timeline-event-labels.js?v=1';
""",
    """import { duplicateGeniIdentityGroups, remapPeopleByGeniIdentity } from './geni-identity.js?v=2';
import { monarchGroupFromProfile } from './monarch-events.js?v=1';
import { layoutGlobalEventLabels } from './timeline-event-labels.js?v=1';
""",
)

replace_once(
    'app.js',
    """  visit(profile?.custom_fields);
  visit(profile?.custom_facts);
  visit(profile?.details);
  visit(profile?.detail_strings);
  return normalizePersonalEvents(found);
}
""",
    """  visit(profile?.custom_fields);
  visit(profile?.custom_facts);
  visit(profile?.details);
  visit(profile?.detail_strings);
  const monarchGroup = monarchGroupFromProfile(profile);
  return normalizePersonalEvents(found.map(event => (
    isMonarchReignEvent(event)
      ? { ...event, kind: 'monarch-reign', monarchGroup }
      : event
  )));
}
""",
)

replace_once('index.html', './app.js?v=144', './app.js?v=145')
replace_once(
    'tests/side-panel-immediate-family.test.mjs',
    "assert.match(html, /\\.\\/app\\.js\\?v=144/);",
    "assert.match(html, /\\.\\/app\\.js\\?v=145/);",
)

Path('tests/monarch-events.test.mjs').write_text(r"""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monarchGroupFromProfile } from '../monarch-events.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('classifies British monarchs from their Geni title or display name', () => {
  assert.equal(monarchGroupFromProfile({ display_name: 'Henry VIII', title: 'King of England' }), 'british');
  assert.equal(monarchGroupFromProfile({ displayName: 'Victoria, Queen of the United Kingdom' }), 'british');
  assert.equal(monarchGroupFromProfile({ name: 'James VI and I', detail_strings: { title: 'King of Scots and England' } }), 'british');
});

test('classifies foreign and unidentified Geni reign profiles as other monarchs', () => {
  assert.equal(monarchGroupFromProfile({ display_name: 'Louis XII', title: 'King of France' }), 'other');
  assert.equal(monarchGroupFromProfile({ display_name: 'Charles V', title: 'Holy Roman Emperor' }), 'other');
  assert.equal(monarchGroupFromProfile({ display_name: 'Unidentified ruler' }), 'other');
});

test('does not call a foreign monarch British merely because unrelated prose mentions England', () => {
  assert.equal(monarchGroupFromProfile({
    display_name: 'Foreign King',
    title: 'King of Exampleland',
    note: 'His daughter later became Queen of England.'
  }), 'other');
});

test('Geni reign extraction applies the profile-derived monarch group', () => {
  assert.match(app, /import \{ monarchGroupFromProfile \} from '\.\/monarch-events\.js\?v=1'/);
  assert.match(app, /const monarchGroup = monarchGroupFromProfile\(profile\)/);
  assert.match(app, /\? \{ \.\.\.event, kind: 'monarch-reign', monarchGroup \}/);
  assert.match(html, /\.\/app\.js\?v=145/);
});
""", encoding='utf-8')
