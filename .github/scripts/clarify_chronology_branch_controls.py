from pathlib import Path
import re

ROOT = Path('.')


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one occurrence, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


app_path = ROOT / 'app.js'
app = app_path.read_text(encoding='utf-8')

# Child births belong to the vertical side-panel chronology. They are not marks
# painted across the parent's lifespan on the main drawing canvas.
timeline_pattern = re.compile(
    r"    if \(state\.showPersonalEvents\) \{\n"
    r"      buildPersonTimelineEvents\(person, state\.people, \{ nameAtYear \}\)\n"
    r"        \.filter\(event => \['relationship', 'child-birth'\]\.includes\(event\.kind\)\)\n"
    r"        \.forEach\(event => \{.*?\n"
    r"        \}\);\n"
    r"    \}\n"
    r"(?=    const childrenShownAtAnotherOccurrence)",
    re.S,
)
timeline_replacement = """    if (state.showPersonalEvents) {
      buildPersonTimelineEvents(person, state.people, { nameAtYear })
        .filter(event => event.kind === 'relationship')
        .forEach(event => {
          if (!personEventIsVisible(person, event.key)) return;
          const localX = (event.startYear - birthYear(person)) * yearWidth;
          if (localX < 0 || localX > lifespanWidth) return;
          const mark = svg('g', {
            class: 'family-event-mark relationship',
            'data-event-key': event.key,
            'data-event-year': event.startYear
          });
          mark.append(svg('title', {}, `${event.label} · ${event.startYear}`));
          const half = 3;
          mark.append(svg('path', { class: 'family-event-halo', d: `M ${localX} 1 L ${localX + half} ${rowHeight / 2} L ${localX} ${rowHeight - 1} L ${localX - half} ${rowHeight / 2} Z` }));
          mark.append(svg('path', { class: 'family-event-relationship-line', d: `M ${localX} 1 L ${localX + half} ${rowHeight / 2} L ${localX} ${rowHeight - 1} L ${localX - half} ${rowHeight / 2} Z` }));
          group.append(mark);
        });
    }
"""
app, count = timeline_pattern.subn(timeline_replacement, app, count=1)
if count != 1:
    raise SystemExit(f'main-canvas child-birth marks: expected one block, found {count}')

old_visibility = """function personEventVisibilityButton(person, event, shown) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'person-event-visibility';
  toggle.textContent = shown ? 'Hide' : 'Show';
  toggle.setAttribute('aria-pressed', String(shown));
  toggle.setAttribute('aria-label', `${shown ? 'Hide' : 'Show'} the ${event.label} mark on ${visibleName(person)}'s timeline`);
  toggle.title = `${shown ? 'Hide' : 'Show'} this mark; family relationships and event data remain unchanged`;
  toggle.addEventListener('click', () => {
    setPersonEventVisibility(person, event.key, !shown);
    persist(`${event.label} mark ${shown ? 'hidden' : 'shown'}`);
    render();
  });
  return toggle;
}
"""
new_visibility = """function personEventVisibilityButton(person, event, shown) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'person-event-visibility';
  toggle.textContent = shown ? 'Hide' : 'Show';
  toggle.setAttribute('aria-pressed', String(shown));
  toggle.setAttribute('aria-label', `${shown ? 'Hide' : 'Show'} the ${event.label} mark on ${visibleName(person)}'s timeline`);
  toggle.title = `${shown ? 'Hide' : 'Show'} this mark; family relationships and event data remain unchanged`;
  toggle.addEventListener('click', () => {
    setPersonEventVisibility(person, event.key, !shown);
    persist(`${event.label} mark ${shown ? 'hidden' : 'shown'}`);
    render();
  });
  return toggle;
}

function childBranchRelationKeys(childId) {
  return unique(state.people[childId]?.parents)
    .filter(parentId => state.people[parentId])
    .map(parentId => childRelationKey(parentId, childId));
}

function childBranchIsShown(childId) {
  return !childBranchRelationKeys(childId)
    .some(key => relationOverride(key) === false);
}

function childBranchVisibilityButton(person, event, shown) {
  const child = state.people[event.relativeId];
  const relationKeys = childBranchRelationKeys(event.relativeId);
  const scope = activeDescendantScope();
  const canToggle = Boolean(
    child
    && relationKeys.length
    && scope.allowedIds.has(person.id)
    && scope.linealIds.has(child.id)
  );
  const childName = child ? visibleName(child) : event.label.replace(/^Birth of\s+/i, '');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'person-event-branch-visibility';
  toggle.textContent = shown ? '◉' : '○';
  toggle.disabled = !canToggle;
  toggle.setAttribute('aria-pressed', String(shown));
  toggle.title = canToggle
    ? `${shown ? 'Hide' : 'Show'} ${childName} and the downstream branch in the timeline`
    : `${childName} is outside the current focus tree`;
  toggle.setAttribute('aria-label', toggle.title);
  if (canToggle) toggle.addEventListener('click', () => {
    relationKeys.forEach(key => { state.relationVisibility[key] = !shown; });
    persist(`${childName} and downstream branch ${shown ? 'hidden' : 'shown'} in the timeline`);
    render();
  });
  return toggle;
}
"""
if app.count(old_visibility) != 1:
    raise SystemExit(f'event visibility controls: expected one block, found {app.count(old_visibility)}')
app = app.replace(old_visibility, new_visibility, 1)

old_render_head = """  const rows = events.map(event => {
    const shown = personEventIsVisible(person, event.key);
    const row = document.createElement('div');
"""
new_render_head = """  const rows = events.map(event => {
    const isChildBranch = event.kind === 'child-birth';
    const shown = isChildBranch
      ? childBranchIsShown(event.relativeId)
      : personEventIsVisible(person, event.key);
    const row = document.createElement('div');
"""
if app.count(old_render_head) != 1:
    raise SystemExit(f'event row visibility state: expected one block, found {app.count(old_render_head)}')
app = app.replace(old_render_head, new_render_head, 1)

old_event_name = """    const name = document.createElement('strong');
    name.textContent = event.label;
"""
new_event_name = """    const relative = event.relativeId && state.people[event.relativeId];
    const name = document.createElement(relative ? 'button' : 'strong');
    name.textContent = event.label;
    if (relative) {
      name.type = 'button';
      name.className = 'person-event-relative';
      name.title = `Open ${visibleName(relative)}'s profile`;
      name.setAttribute('aria-label', name.title);
      name.addEventListener('click', () => {
        const inCurrentScope = activeDescendantScope().allowedIds.has(relative.id);
        if (inCurrentScope) selectPerson(relative.id, { center: true });
        else selectPerson(relative.id, { allowOutsideScope: true });
      });
    }
"""
if app.count(old_event_name) != 1:
    raise SystemExit(f'event relative link: expected one block, found {app.count(old_event_name)}')
app = app.replace(old_event_name, new_event_name, 1)

old_row_append = """    row.append(personEventAgeCell(person, event), copy, personEventVisibilityButton(person, event, shown));
"""
new_row_append = """    const control = isChildBranch
      ? childBranchVisibilityButton(person, event, shown)
      : personEventVisibilityButton(person, event, shown);
    row.append(personEventAgeCell(person, event), copy, control);
"""
if app.count(old_row_append) != 1:
    raise SystemExit(f'event row control: expected one block, found {app.count(old_row_append)}')
app = app.replace(old_row_append, new_row_append, 1)

# The chronology now carries marriages and every child's birth. Keep this
# separate section for parentage only.
parentage_pattern = re.compile(
    r"function renderRelationshipHouseholds\(person\) \{.*?\n\}\n\n"
    r"(?=function formatGeniFamilyCheckedAt)",
    re.S,
)
parentage_replacement = """function renderRelationshipHouseholds(person) {
  const container = els['relationship-households'];
  if (!person) { container.replaceChildren(); return; }
  const parentIds = unique(person.parents)
    .filter(id => state.people[id])
    .sort((firstId, secondId) =>
      (numericYear(state.people[firstId]?.birthYear) ?? 9999)
      - (numericYear(state.people[secondId]?.birthYear) ?? 9999)
      || visibleName(state.people[firstId]).localeCompare(visibleName(state.people[secondId]))
    );
  if (!parentIds.length) {
    const empty = document.createElement('p');
    empty.className = 'relationship-empty';
    empty.textContent = 'No parents recorded in this tree.';
    container.replaceChildren(empty);
    return;
  }

  const origin = document.createElement('div');
  origin.className = 'relationship-household family-origin';
  const heading = document.createElement('p');
  heading.className = 'relationship-group-label';
  heading.textContent = 'Parents';
  origin.append(heading);
  parentIds.forEach(parentId => {
    const parent = state.people[parentId];
    const role = parent.gender === 'male' ? 'Father' : parent.gender === 'female' ? 'Mother' : 'Parent';
    const row = document.createElement('div');
    row.className = 'relationship-row parent';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Open ${visibleName(parent)}'s profile`);
    const branch = document.createElement('span');
    branch.className = 'relationship-branch';
    branch.textContent = '↑';
    const copy = document.createElement('span');
    copy.className = 'relationship-copy';
    const name = document.createElement('strong');
    name.textContent = visibleName(parent);
    const meta = document.createElement('small');
    meta.textContent = `${role} · ${life(parent)}`;
    copy.append(name, meta);
    row.append(branch, copy);
    const openParent = () => {
      const inCurrentScope = activeDescendantScope().allowedIds.has(parentId);
      if (inCurrentScope) selectPerson(parentId, { center: true });
      else selectPerson(parentId, { allowOutsideScope: true });
    };
    row.addEventListener('click', openParent);
    row.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openParent();
    });
    origin.append(row);
  });
  container.replaceChildren(origin);
}

"""
app, count = parentage_pattern.subn(parentage_replacement, app, count=1)
if count != 1:
    raise SystemExit(f'parentage-only section: expected one function, found {count}')

old_known = """  const knownIds = unique([
    ...scopedParentIds(person.id, scope),
    ...scopedSpouseIds(person, scope),
    ...scopedChildIds(person.id, scope)
  ]);
  els['known-family-count'].textContent = `${knownIds.length} relative${knownIds.length === 1 ? '' : 's'}`;
"""
new_known = """  const knownParentIds = unique(person.parents).filter(id => state.people[id]);
  els['known-family-count'].textContent = `${knownParentIds.length} parent${knownParentIds.length === 1 ? '' : 's'}`;
"""
if app.count(old_known) != 1:
    raise SystemExit(f'parent count: expected one block, found {app.count(old_known)}')
app = app.replace(old_known, new_known, 1)
app_path.write_text(app, encoding='utf-8')

html_path = ROOT / 'index.html'
html = html_path.read_text(encoding='utf-8')
replacements = {
    '<link rel="stylesheet" href="./styles.css?v=80">': '<link rel="stylesheet" href="./styles.css?v=81">',
    '<script type="module" src="./app.js?v=149"></script>': '<script type="module" src="./app.js?v=150"></script>',
    '<span class="eyebrow">Family</span>': '<span class="eyebrow">Parentage</span>',
    '<small>Immediate family for this profile</small>': '<small>Parents recorded for this profile</small>',
    '<strong>Known in this tree</strong>': '<strong>Parents in this tree</strong>',
    '<small id="known-family-count">0 relatives</small>': '<small id="known-family-count">0 parents</small>',
    '<small>One mark per row; family stays connected</small>': '<small>Child circles show or hide downstream branches</small>',
    'Show or hide marks for marriages, children’s births, and authored events': 'Show or hide marriage, relationship, and authored-event marks',
}
for old, new in replacements.items():
    count = html.count(old)
    if count != 1:
        raise SystemExit(f'index replacement {old!r}: expected one occurrence, found {count}')
    html = html.replace(old, new, 1)
html_path.write_text(html, encoding='utf-8')

css_path = ROOT / 'styles.css'
css = css_path.read_text(encoding='utf-8')
old_css = """.person-event-copy { min-width: 0; display: grid; gap: 2px; }
.person-event-title { min-width: 0; display: grid; grid-template-columns: 17px minmax(0,1fr) auto auto; align-items: center; gap: 5px; }
.person-event-title strong { overflow: hidden; color: #111; font-size: 10px; font-weight: 600; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.person-event-kind { width: 17px; display: grid; place-items: center; color: #333; font: 13px/1 Georgia, serif; }
"""
new_css = """.person-event-copy { min-width: 0; position: relative; display: grid; gap: 2px; }
.person-event-copy::before { content: ''; position: absolute; z-index: 0; left: 8px; top: -20px; bottom: -20px; width: 1px; background: #d2d2d2; }
.person-event-table-header + .person-event-row .person-event-copy::before { top: 50%; }
.person-event-row:last-child .person-event-copy::before { bottom: 50%; }
.person-event-title { min-width: 0; position: relative; z-index: 1; display: grid; grid-template-columns: 17px minmax(0,1fr) auto auto; align-items: center; gap: 5px; }
.person-event-title strong, .person-event-relative { overflow: hidden; color: #111; font-size: 10px; font-weight: 600; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.person-event-relative { min-width: 0; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.person-event-relative:hover { text-decoration: underline; text-underline-offset: 2px; }
.person-event-kind { position: relative; z-index: 1; width: 17px; display: grid; place-items: center; color: #333; background: #fff; font: 13px/1 Georgia, serif; }
"""
if css.count(old_css) != 1:
    raise SystemExit(f'vertical chronology CSS: expected one block, found {css.count(old_css)}')
css = css.replace(old_css, new_css, 1)

old_visibility_css = """.person-event-visibility:hover { border-color: #000; background: #eee; color: #000; }
.person-event-visibility[aria-pressed=\"false\"] { border-color: #111; background: #111; color: #fff; }
"""
new_visibility_css = """.person-event-visibility:hover { border-color: #000; background: #eee; color: #000; }
.person-event-visibility[aria-pressed=\"false\"] { border-color: #111; background: #111; color: #fff; }
.person-event-branch-visibility { justify-self: center; width: 27px; height: 25px; display: grid; place-items: center; padding: 0; border: 1px solid #aaa; border-radius: 6px; background: #fff; color: #111; cursor: pointer; font-size: 12px; }
.person-event-branch-visibility:hover { border-color: #000; background: #eee; }
.person-event-branch-visibility:disabled { border-color: #ccc; background: #f4f4f4; color: #aaa; cursor: not-allowed; }
.person-event-row.is-hidden .person-event-branch-visibility { color: #777; }
"""
if css.count(old_visibility_css) != 1:
    raise SystemExit(f'branch-circle CSS: expected one block, found {css.count(old_visibility_css)}')
css = css.replace(old_visibility_css, new_visibility_css, 1)

old_focus_css = ".row-edit:focus-visible, .row-default:focus-visible, .row-save:focus-visible, .row-cancel:focus-visible, .row-delete:focus-visible, .person-event-visibility:focus-visible { outline: 2px solid #000; outline-offset: -2px; }"
new_focus_css = ".row-edit:focus-visible, .row-default:focus-visible, .row-save:focus-visible, .row-cancel:focus-visible, .row-delete:focus-visible, .person-event-visibility:focus-visible, .person-event-branch-visibility:focus-visible, .person-event-relative:focus-visible { outline: 2px solid #000; outline-offset: -2px; }"
if css.count(old_focus_css) != 1:
    raise SystemExit(f'focus CSS: expected one block, found {css.count(old_focus_css)}')
css = css.replace(old_focus_css, new_focus_css, 1)
css_path.write_text(css, encoding='utf-8')

side_panel_tests = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const personEvents = readFileSync(new URL('../person-events.js', import.meta.url), 'utf8');
const timelineStart = app.indexOf('formalMarriagePartnerIds(id).forEach');
const timelineEnd = app.indexOf('const childrenShownAtAnotherOccurrence', timelineStart);
const timelineMarks = app.slice(timelineStart, timelineEnd);

test('the side panel presents a vertical Age, Event, and Mark chronology', () => {
  assert.match(html, /<span class="eyebrow">Life events<\/span>/);
  assert.match(html, /aria-label="Chronological life events"/);
  assert.match(app, /\['Age', 'Event', 'Mark'\]/);
  assert.match(app, /years\.textContent = `· \$\{personEventYearLabel\(event\)\}`/);
  assert.match(css, /\.person-event-copy::before \{/);
  assert.match(css, /\.person-event-table-header \+ \.person-event-row \.person-event-copy::before/);
  assert.match(css, /\.person-event-row:last-child \.person-event-copy::before/);
});

test('ranged events use their beginning age and marriages carry duration and ending context', () => {
  assert.match(personEvents, /return String\(startYear - birthYear\)/);
  assert.match(personEvents, /detail: relationshipDurationDetail\(relationshipYear, endState, formal\)/);
  assert.match(personEvents, /return formal \? 'spouse died' : 'partner died'/);
  assert.match(app, /detail\.className = 'person-event-detail'/);
});

test('divorce is folded into its marriage instead of becoming a separate row', () => {
  assert.doesNotMatch(personEvents, /kind: 'relationship-end'/);
  assert.doesNotMatch(timelineMarks, /relationship-end/);
});

test('every dated child remains an individual birth row in the side panel', () => {
  assert.match(personEvents, /const childIds = unique\(values\(person\.children\)\)/);
  assert.match(personEvents, /kind: 'child-birth'/);
  assert.match(personEvents, /label: `Birth of \$\{relativeName\(child, birthYear, nameAtYear\)\}`/);
});

test('child births do not paint marks across node boxes on the main canvas', () => {
  assert.match(timelineMarks, /\.filter\(event => event\.kind === 'relationship'\)/);
  assert.doesNotMatch(timelineMarks, /child-birth/);
  assert.doesNotMatch(timelineMarks, /family-event-child-birth-line/);
});

test('a child row uses a round branch control rather than a mark button', () => {
  assert.match(app, /function childBranchVisibilityButton\(person, event, shown\)/);
  assert.match(app, /toggle\.textContent = shown \? '◉' : '○'/);
  assert.match(app, /childBranchRelationKeys\(event\.relativeId\)/);
  assert.match(app, /state\.relationVisibility\[key\] = !shown/);
  assert.match(app, /downstream branch/);
  assert.match(css, /\.person-event-branch-visibility \{/);
  assert.match(html, /Child circles show or hide downstream branches/);
});

test('marriages and authored events retain independent timeline-mark controls', () => {
  assert.match(app, /function personEventVisibilityButton\(person, event, shown\)/);
  assert.match(app, /toggle\.textContent = shown \? 'Hide' : 'Show'/);
  assert.match(app, /setPersonEventVisibility\(person, event\.key, !shown\)/);
  assert.match(html, /Show or hide marriage, relationship, and authored-event marks/);
});

test('family event names remain profile navigation controls', () => {
  assert.match(app, /name\.className = 'person-event-relative'/);
  assert.match(app, /selectPerson\(relative\.id, \{ center: true \}\)/);
  assert.match(app, /selectPerson\(relative\.id, \{ allowOutsideScope: true \}\)/);
});

test('event visibility survives normalization, merging, and profile-id remapping', () => {
  assert.match(app, /eventVisibility: normalizePersonEventVisibility/);
  assert.match(app, /merged\.eventVisibility = \{/);
  assert.match(app, /normalized\.eventVisibility = remapPersonEventVisibility/);
  assert.match(app, /person\.eventVisibility = remapPersonEventVisibility/);
});

test('the revised static assets use fresh cache keys', () => {
  assert.match(app, /from '\.\/person-events\.js\?v=2'/);
  assert.match(html, /\.\/styles\.css\?v=81/);
  assert.match(html, /\.\/app\.js\?v=150/);
});
'''
(ROOT / 'tests/side-panel-life-events.test.mjs').write_text(side_panel_tests, encoding='utf-8')

parentage_tests = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = app.indexOf('function renderRelationshipHouseholds(person) {');
const end = app.indexOf('\nfunction renderGeniFamily', start);
const section = app.slice(start, end > start ? end : app.length);

test('the former immediate-family list is reduced to parentage', () => {
  assert.ok(start >= 0, 'parentage renderer should exist');
  assert.match(section, /const parentIds = unique\(person\.parents\)/);
  assert.match(section, /heading\.textContent = 'Parents'/);
  assert.match(section, /No parents recorded in this tree/);
  assert.doesNotMatch(section, /allPartnerIds\(person\)/);
  assert.doesNotMatch(section, /householdChildren/);
  assert.doesNotMatch(section, /kind: 'spouse'/);
  assert.doesNotMatch(section, /kind: 'child'/);
  assert.doesNotMatch(section, /Children without another recorded parent/);
});

test('parent rows remain usable profile-navigation controls', () => {
  assert.match(section, /row\.setAttribute\('role', 'button'\)/);
  assert.match(section, /selectPerson\(parentId, \{ center: true \}\)/);
  assert.match(section, /selectPerson\(parentId, \{ allowOutsideScope: true \}\)/);
});

test('the side-panel copy describes parentage rather than a duplicated family list', () => {
  assert.match(html, /<span class="eyebrow">Parentage<\/span>/);
  assert.match(html, /Parents recorded for this profile/);
  assert.match(html, /Parents in this tree/);
  assert.match(html, /id="known-family-count">0 parents/);
  assert.match(app, /knownParentIds\.length} parent/);
  assert.match(html, /\.\/app\.js\?v=150/);
});
'''
(ROOT / 'tests/side-panel-immediate-family.test.mjs').write_text(parentage_tests, encoding='utf-8')

print('Chronology branch-control refinement generated.')
