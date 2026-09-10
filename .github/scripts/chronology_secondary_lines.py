from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one occurrence, found {count}: {old[:100]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_regex_once(path: str, pattern: str, replacement: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: expected one regex occurrence, found {count}: {pattern[:100]!r}')
    file_path.write_text(updated, encoding='utf-8')


# Keep the date-line formatter with the event model so its rules can be tested
# independently of DOM rendering.
person_events = Path('person-events.js')
text = person_events.read_text(encoding='utf-8')
marker = """export function personEventAgeLabel(person, event) {
  const birthYear = numericYear(person?.birthYear);
  const startYear = numericYear(event?.startYear);
  if (birthYear == null || startYear == null || startYear < birthYear) return '—';
  // A ranged event belongs in the chronology at its beginning. The duration
  // remains in the event column rather than turning the age cell into a range.
  return String(startYear - birthYear);
}

"""
helper = """export function personEventAgeLabel(person, event) {
  const birthYear = numericYear(person?.birthYear);
  const startYear = numericYear(event?.startYear);
  if (birthYear == null || startYear == null || startYear < birthYear) return '—';
  // A ranged event belongs in the chronology at its beginning. The duration
  // remains in the event column rather than turning the age cell into a range.
  return String(startYear - birthYear);
}

function eventYearRange(event) {
  const startYear = numericYear(event?.startYear);
  if (startYear == null) return '';
  if (event?.ongoing) return `${startYear}–present`;
  const endYear = numericYear(event?.endYear);
  return endYear == null || endYear === startYear
    ? String(startYear)
    : `${startYear}–${endYear}`;
}

/**
 * Compact second line for the vertical profile chronology.
 *
 * Names stay on the first line. The second line carries the relationship verb
 * and dates for family milestones, or just the year/range for authored events.
 * Death still closes a marriage range, but is deliberately not named here.
 */
export function personEventSecondaryLabel(event) {
  const startYear = numericYear(event?.startYear);
  if (startYear == null) return '';
  if (event?.kind === 'child-birth') return `born ${startYear}`;

  const endYear = numericYear(event?.endYear);
  const knownEndYear = event?.endYearKnown === false ? null : endYear;
  const reason = clean(event?.endReason).toLowerCase();
  if (event?.kind === 'marriage') {
    if (['divorced', 'annulled', 'ended'].includes(reason)) {
      return `married ${startYear}; ${reason}${knownEndYear == null ? '' : ` ${knownEndYear}`}`;
    }
    return `married ${eventYearRange(event)}`;
  }
  if (event?.kind === 'relationship') {
    if (reason === 'ended') {
      return `together ${startYear}; ended${knownEndYear == null ? '' : ` ${knownEndYear}`}`;
    }
    return `together ${eventYearRange(event)}`;
  }
  return eventYearRange(event);
}

"""
if text.count(marker) != 1:
    raise SystemExit(f'person-events.js: expected one age-label marker, found {text.count(marker)}')
text = text.replace(marker, helper, 1)
old = """      endYear: endState.endYear ?? relationshipYear,
      ongoing: endState.ongoing,
      endReason: endState.reason,
"""
new = """      endYear: endState.endYear ?? relationshipYear,
      endYearKnown: endState.endYear != null,
      ongoing: endState.ongoing,
      endReason: endState.reason,
"""
if text.count(old) != 1:
    raise SystemExit(f'person-events.js: expected one relationship date block, found {text.count(old)}')
text = text.replace(old, new, 1)
person_events.write_text(text, encoding='utf-8')

# Import and render the new second-line formatter. All chronology controls use
# the same filled/empty circular visual language, while preserving distinct
# mark-versus-branch behavior in their click handlers.
replace_once(
    'app.js',
    """  personalEventId, personalEventKey, personEventAgeLabel, personEventIsVisible,
  personEventReferencesProfile, remapPersonEventVisibility,
""",
    """  personalEventId, personalEventKey, personEventAgeLabel, personEventIsVisible,
  personEventReferencesProfile, personEventSecondaryLabel, remapPersonEventVisibility,
""",
)
replace_once('app.js', "from './person-events.js?v=3';", "from './person-events.js?v=4';")

replace_regex_once(
    'app.js',
    r"\nfunction personEventYearLabel\(event\) \{.*?\n\}\n\nfunction personEventVisibilityButton",
    "\nfunction personEventVisibilityButton",
)

replace_regex_once(
    'app.js',
    r"function personEventVisibilityButton\(person, event, shown\) \{.*?\n\}\n\nfunction childBranchRelationKeys",
    """function personEventVisibilityButton(person, event, shown) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'person-event-visibility';
  toggle.textContent = '';
  toggle.setAttribute('aria-pressed', String(shown));
  toggle.dataset.markState = shown ? 'shown' : 'hidden';
  toggle.setAttribute('aria-label', `${shown ? 'Hide' : 'Show'} the ${event.label} mark on ${visibleName(person)}'s timeline`);
  toggle.title = `${shown ? 'Hide' : 'Show'} this mark; family relationships and event data remain unchanged`;
  toggle.addEventListener('click', () => {
    setPersonEventVisibility(person, event.key, !shown);
    persist(`${event.label} mark ${shown ? 'hidden' : 'shown'}`);
    render();
  });
  return toggle;
}

function childBranchRelationKeys""",
)

old_render = """    const years = document.createElement('span');
    years.className = 'person-event-year';
    years.textContent = `· ${personEventYearLabel(event)}`;
    title.append(kind, name, years);
    if (event.editable) {
      const edit = rowActionButton('person-event-edit row-edit', '✎', `Edit ${event.label}`, () => beginPersonalEventEdit(row, person, event));
      title.append(edit);
    }
    copy.append(title);
    if (event.detail) {
      const detail = document.createElement('small');
      detail.className = 'person-event-detail';
      detail.textContent = event.detail;
      copy.append(detail);
    }
"""
new_render = """    title.append(kind, name);
    if (event.editable) {
      const edit = rowActionButton('person-event-edit row-edit', '✎', `Edit ${event.label}`, () => beginPersonalEventEdit(row, person, event));
      title.append(edit);
    }
    copy.append(title);
    const secondary = document.createElement('small');
    secondary.className = 'person-event-secondary';
    secondary.textContent = personEventSecondaryLabel(event);
    if (secondary.textContent) copy.append(secondary);
"""
replace_once('app.js', old_render, new_render)

# Compact the Mark column and make both mark and branch buttons true circles.
styles = Path('styles.css')
css = styles.read_text(encoding='utf-8')
css = css.replace(
    ".person-event-table-header, .person-event-row { display: grid; grid-template-columns: 36px minmax(0,1fr) 46px; align-items: center; gap: 8px; }",
    ".person-event-table-header, .person-event-row { display: grid; grid-template-columns: 36px minmax(0,1fr) 22px; align-items: center; gap: 8px; }",
    1,
)
css = css.replace(
    ".person-event-title { min-width: 0; position: relative; z-index: 1; display: grid; grid-template-columns: 17px minmax(0,1fr) auto auto; align-items: center; gap: 5px; }",
    ".person-event-title { min-width: 0; position: relative; z-index: 1; display: grid; grid-template-columns: 17px minmax(0,1fr) auto; align-items: center; gap: 5px; }",
    1,
)
old_css = """.person-event-year { color: #666; font: 8px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; }
.person-event-detail { margin-left: 22px; color: #666; font: 8px/1.3 Inter, sans-serif; }
.person-event-visibility { width: 46px; height: 26px; padding: 0; border: 1px solid #999; border-radius: 6px; background: #fff; color: #333; cursor: pointer; font-size: 8px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.person-event-visibility:hover { border-color: #000; background: #eee; color: #000; }
.person-event-visibility[aria-pressed=\"false\"] { border-color: #111; background: #111; color: #fff; }
.person-event-branch-visibility { justify-self: center; width: 15px; height: 15px; padding: 0; border: 1.5px solid #222; border-radius: 50%; background: #222; cursor: pointer; }
.person-event-branch-visibility:hover { box-shadow: 0 0 0 3px #e8e8e8; }
.person-event-branch-visibility[aria-pressed=\"false\"] { background: #fff; }
.person-event-branch-visibility:disabled { border-color: #aaa; background: #ddd; cursor: not-allowed; box-shadow: none; }
"""
new_css = """.person-event-secondary { margin-left: 22px; color: #666; font: 8px/1.35 Inter, sans-serif; }
.person-event-visibility,
.person-event-branch-visibility { justify-self: center; width: 15px; height: 15px; padding: 0; border: 1.5px solid #222; border-radius: 50%; background: #222; cursor: pointer; }
.person-event-visibility:hover,
.person-event-branch-visibility:hover { box-shadow: 0 0 0 3px #e8e8e8; }
.person-event-visibility[aria-pressed=\"false\"],
.person-event-branch-visibility[aria-pressed=\"false\"] { background: #fff; }
.person-event-branch-visibility:disabled { border-color: #aaa; background: #ddd; cursor: not-allowed; box-shadow: none; }
"""
if css.count(old_css) != 1:
    raise SystemExit(f'styles.css: expected one chronology control block, found {css.count(old_css)}')
css = css.replace(old_css, new_css, 1)
styles.write_text(css, encoding='utf-8')

replace_once(
    'index.html',
    '<small>Child circles show or hide downstream branches</small>',
    '<small>Filled circles are shown; child circles control branches</small>',
)
replace_once('index.html', './styles.css?v=81', './styles.css?v=82')
replace_once('index.html', './app.js?v=151', './app.js?v=152')

# Unit coverage for the exact requested wording and the no-death wording rule.
test_path = Path('tests/person-events.test.mjs')
test_text = test_path.read_text(encoding='utf-8')
test_text = test_text.replace(
    """  personEventAgeLabel,
  personEventIsVisible,
""",
    """  personEventAgeLabel,
  personEventIsVisible,
  personEventSecondaryLabel,
""",
    1,
)
anchor = """test('uses stable keys for independently switchable timeline marks', () => {
"""
new_tests = """test('formats family milestones and authored events on compact second lines', () => {
  const events = buildPersonTimelineEvents(people.p, people, { currentYear: 2026 });
  assert.equal(personEventSecondaryLabel(events.find(event => event.kind === 'marriage')), 'married 1995; divorced 2005');
  assert.equal(personEventSecondaryLabel(events.find(event => event.relativeId === 'c1')), 'born 1998');
  assert.equal(personEventSecondaryLabel(events.find(event => event.kind === 'personal')), '1999–2002');
});

test('uses a marriage range for death without naming the spouse death', () => {
  const widowedPeople = structuredClone(people);
  delete widowedPeople.p.relationshipEndYears.s;
  delete widowedPeople.s.relationshipEndYears.p;
  delete widowedPeople.p.relationshipEndStatuses.s;
  delete widowedPeople.s.relationshipEndStatuses.p;
  widowedPeople.p.divorcedSpouses = [];
  widowedPeople.s.divorcedSpouses = [];
  widowedPeople.p.deathYear = '2020';
  widowedPeople.s.deathYear = '2010';
  const marriage = buildPersonTimelineEvents(widowedPeople.p, widowedPeople, { currentYear: 2026 })[0];
  assert.equal(personEventSecondaryLabel(marriage), 'married 1995–2010');
  assert.doesNotMatch(personEventSecondaryLabel(marriage), /died/i);
});

""" + anchor
if test_text.count(anchor) != 1:
    raise SystemExit(f'tests/person-events.test.mjs: expected one insertion anchor, found {test_text.count(anchor)}')
test_text = test_text.replace(anchor, new_tests, 1)
test_path.write_text(test_text, encoding='utf-8')

# Replace structural assertions for inline years/text buttons with the new
# second-line and circular-control contract.
side_test = Path('tests/side-panel-life-events.test.mjs')
side = side_test.read_text(encoding='utf-8')
side = side.replace(
    """  assert.match(app, /years\\.textContent = `· \\${personEventYearLabel\\(event\\)}`/);
""",
    """  assert.match(app, /secondary\\.textContent = personEventSecondaryLabel\\(event\\)/);
""",
    1,
)
side = side.replace(
    """  assert.match(app, /detail\\.className = 'person-event-detail'/);
""",
    """  assert.match(app, /secondary\\.className = 'person-event-secondary'/);
""",
    1,
)
old_mark_test = """test('marriages and authored events retain independent timeline-mark controls', () => {
  assert.match(app, /function personEventVisibilityButton\\(person, event, shown\\)/);
  assert.match(app, /toggle\\.textContent = shown \\? 'Hide' : 'Show'/);
  assert.match(app, /setPersonEventVisibility\\(person, event\\.key, !shown\\)/);
  assert.match(html, /Show or hide marriage, relationship, and authored-event marks/);
});
"""
new_mark_test = """test('all chronology visibility controls are filled or empty circles', () => {
  assert.match(app, /function personEventVisibilityButton\\(person, event, shown\\)/);
  assert.match(app, /toggle\\.textContent = ''/);
  assert.match(app, /toggle\\.dataset\\.markState = shown \\? 'shown' : 'hidden'/);
  assert.match(app, /setPersonEventVisibility\\(person, event\\.key, !shown\\)/);
  assert.match(css, /\\.person-event-visibility,\\s*\\.person-event-branch-visibility \\{[^}]*border-radius: 50%/s);
  assert.match(css, /\\.person-event-visibility\\[aria-pressed=\\\"false\\\"\\],/);
  assert.match(html, /Filled circles are shown; child circles control branches/);
});
"""
if side.count(old_mark_test) != 1:
    raise SystemExit(f'tests/side-panel-life-events.test.mjs: expected one mark-control test, found {side.count(old_mark_test)}')
side = side.replace(old_mark_test, new_mark_test, 1)
side = side.replace("from './person-events.js?v=3'", "from './person-events.js?v=4'")
side = side.replace(r"\.\/styles\.css\?v=81", r"\.\/styles\.css\?v=82")
side = side.replace(r"\.\/app\.js\?v=151", r"\.\/app\.js\?v=152")
side_test.write_text(side, encoding='utf-8')

# Other source-level cache assertions should follow the deployed revisions.
for path in Path('tests').glob('*.test.mjs'):
    content = path.read_text(encoding='utf-8')
    content = content.replace("person-events.js?v=3", "person-events.js?v=4")
    content = content.replace("styles.css?v=81", "styles.css?v=82")
    content = content.replace("app.js?v=151", "app.js?v=152")
    path.write_text(content, encoding='utf-8')

print('Chronology secondary lines and circular mark controls applied.')
