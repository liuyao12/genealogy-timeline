from pathlib import Path
import re

ROOT = Path('.')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


def replace_regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected one regex match, found {count}')
    return updated


app_path = ROOT / 'app.js'
app = app_path.read_text(encoding='utf-8')

old_year_helper = """function personEventYearLabel(event) {
  const startYear = numericYear(event?.startYear);
  if (startYear == null) return '';
  if (event?.ongoing) return `${startYear}–present`;
  const endYear = numericYear(event?.endYear);
  return endYear == null || endYear === startYear
    ? String(startYear)
    : `${startYear}–${endYear}`;
}

"""
new_year_helper = """function personEventYearLabel(event) {
  const startYear = numericYear(event?.startYear);
  if (startYear == null) return '';
  if (event?.ongoing) return `${startYear}–present`;
  const endYear = numericYear(event?.endYear);
  return endYear == null || endYear === startYear
    ? String(startYear)
    : `${startYear}–${endYear}`;
}

function personEventDurationLabel(startYear, endYear) {
  const start = numericYear(startYear);
  const end = numericYear(endYear);
  if (start == null || end == null || end <= start) return '';
  const years = end - start;
  return `${years} year${years === 1 ? '' : 's'}`;
}

function personEventSecondLine(event) {
  const startYear = numericYear(event?.startYear);
  const endYear = numericYear(event?.endYear);
  if (startYear == null) return '';
  if (event.kind === 'child-birth') return `born ${startYear}`;
  if (event.kind === 'marriage' || event.kind === 'relationship') {
    const begins = `${event.kind === 'marriage' ? 'married' : 'partnered'} ${startYear}`;
    if (event.ongoing) return `${begins}; ongoing`;
    if (endYear == null || endYear === startYear) return begins;
    const ending = event.endReason === 'divorced' ? 'divorced'
      : event.endReason === 'annulled' ? 'annulled'
        : event.endReason === 'partner-died'
          ? (event.kind === 'marriage' ? 'spouse died' : 'partner died')
          : event.endReason === 'person-died' ? 'died'
            : event.endReason === 'ended' ? 'ended' : '';
    return ending ? `${begins}; ${ending} ${endYear}` : `${begins}; ended ${endYear}`;
  }
  const range = personEventYearLabel(event);
  const duration = personEventDurationLabel(startYear, endYear);
  return [range, duration].filter(Boolean).join(' · ');
}

"""
app = replace_once(app, old_year_helper, new_year_helper, 'chronology second-line helper')

visibility_pattern = r"function personEventVisibilityButton\(person, event, shown\) \{.*?\n\}\n\nfunction childBranchRelationKeys"
visibility_replacement = """function personEventVisibilityButton(person, event, shown) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'person-event-visibility person-event-circle-control';
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

function childBranchRelationKeys"""
app = replace_regex_once(app, visibility_pattern, visibility_replacement, 'circular mark control')

app = replace_once(
    app,
    "toggle.className = 'person-event-branch-visibility';",
    "toggle.className = 'person-event-branch-visibility person-event-circle-control';",
    'shared circle class for child controls',
)

old_render_dates = """    const years = document.createElement('span');
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
new_render_dates = """    title.append(kind, name);
    if (event.editable) {
      const edit = rowActionButton('person-event-edit row-edit', '✎', `Edit ${event.label}`, () => beginPersonalEventEdit(row, person, event));
      title.append(edit);
    }
    copy.append(title);
    const chronology = personEventSecondLine(event);
    if (chronology) {
      const detail = document.createElement('small');
      detail.className = 'person-event-detail';
      detail.textContent = chronology;
      copy.append(detail);
    }
"""
app = replace_once(app, old_render_dates, new_render_dates, 'two-line event row rendering')
app_path.write_text(app, encoding='utf-8')


html_path = ROOT / 'index.html'
html = html_path.read_text(encoding='utf-8')
html = replace_once(
    html,
    '<small>Child circles show or hide downstream branches</small>',
    '<small>Filled circles are shown; child circles control branches</small>',
    'chronology helper text',
)
html = replace_once(html, './styles.css?v=81', './styles.css?v=82', 'stylesheet cache key')
html = replace_once(html, './app.js?v=151', './app.js?v=152', 'app cache key')
html_path.write_text(html, encoding='utf-8')


css_path = ROOT / 'styles.css'
css = css_path.read_text(encoding='utf-8')
css = replace_once(
    css,
    'grid-template-columns: 36px minmax(0,1fr) 46px;',
    'grid-template-columns: 36px minmax(0,1fr) 24px;',
    'compact chronology mark column',
)
css = replace_once(
    css,
    'grid-template-columns: 17px minmax(0,1fr) auto auto;',
    'grid-template-columns: 17px minmax(0,1fr) auto;',
    'two-line chronology title columns',
)
controls_pattern = r"\.person-event-visibility \{.*?\.person-event-branch-visibility:disabled \{[^}]*\}"
controls_replacement = """.person-event-circle-control {
  justify-self: center;
  width: 15px;
  height: 15px;
  padding: 0;
  border: 1.5px solid #222;
  border-radius: 50%;
  background: #222;
  cursor: pointer;
}
.person-event-circle-control:hover { box-shadow: 0 0 0 3px #e8e8e8; }
.person-event-circle-control[aria-pressed=\"false\"] { background: #fff; }
.person-event-circle-control:disabled { border-color: #aaa; background: #ddd; cursor: not-allowed; box-shadow: none; }"""
css = replace_regex_once(css, controls_pattern, controls_replacement, 'uniform circle control styles')
css_path.write_text(css, encoding='utf-8')


# Keep source-level regression checks aligned with the new two-line layout.
test_path = ROOT / 'tests' / 'side-panel-life-events.test.mjs'
test = test_path.read_text(encoding='utf-8')
test = replace_once(
    test,
    "  assert.match(app, /years\\.textContent = `· \\$\\{personEventYearLabel\\(event\\)\\}`/);",
    "  assert.match(app, /const chronology = personEventSecondLine\\(event\\)/);",
    'two-line chronology source assertion',
)
test = replace_once(
    test,
    "  assert.match(app, /toggle\\.textContent = shown \\? 'Hide' : 'Show'/);",
    "  assert.match(app, /toggle\\.className = 'person-event-visibility person-event-circle-control'/);\n  assert.match(app, /toggle\\.textContent = ''/);",
    'circle-control source assertion',
)
test = replace_once(
    test,
    "  assert.match(html, /Child circles show or hide downstream branches/);",
    "  assert.match(html, /Filled circles are shown; child circles control branches/);",
    'chronology helper assertion',
)
test = replace_once(test, "/\\.\\/styles\\.css\\?v=81/", "/\\.\\/styles\\.css\\?v=82/", 'stylesheet cache assertion')
test = replace_once(test, "/\\.\\/app\\.js\\?v=151/", "/\\.\\/app\\.js\\?v=152/", 'app cache assertion')
insert_after = """test('relationship and child rows use compact names without redundant verbs', () => {
  assert.match(personEvents, /label: partnerName/);
  assert.match(personEvents, /label: relativeName\\(child, birthYear, nameAtYear\\)/);
  assert.doesNotMatch(personEvents, /`Married \\${partnerName}`/);
  assert.doesNotMatch(personEvents, /`Relationship with \\${partnerName}`/);
  assert.doesNotMatch(personEvents, /`Birth of \\${relativeName/);
});
"""
extra = """

test('every chronology row places its date or duration on a second line', () => {
  assert.match(app, /if \\(event.kind === 'child-birth'\\) return `born \\${startYear}`/);
  assert.match(app, /`married' : 'partnered'\\} \\${startYear}`/);
  assert.match(app, /`\\${begins}; divorced \\${endYear}`|event.endReason === 'divorced'/);
  assert.match(app, /personEventDurationLabel\\(startYear, endYear\\)/);
  assert.match(app, /detail.className = 'person-event-detail'/);
  assert.doesNotMatch(app, /years.textContent = `·/);
});

test('all chronology show-hide controls use the same filled or empty circle', () => {
  assert.match(app, /person-event-visibility person-event-circle-control/);
  assert.match(app, /person-event-branch-visibility person-event-circle-control/);
  assert.match(css, /\\.person-event-circle-control \\{[^}]*border-radius: 50%/s);
  assert.match(css, /\\.person-event-circle-control\\[aria-pressed=\\\"false\\\"\\] \\{ background: #fff; \\}/);
});
"""
if extra.strip() not in test:
    test = replace_once(test, insert_after, insert_after + extra, 'append second-line chronology tests')
test_path.write_text(test, encoding='utf-8')

# Other structural tests may pin the cache key.
for path in (ROOT / 'tests').glob('*.test.mjs'):
    text = path.read_text(encoding='utf-8')
    updated = text.replace('app.js?v=151', 'app.js?v=152').replace('styles.css?v=81', 'styles.css?v=82')
    if updated != text:
        path.write_text(updated, encoding='utf-8')

print('Applied uniform chronology circles and two-line date descriptions.')
