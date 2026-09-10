from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one occurrence in {path}, found {count}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'person-events.js',
    '      label: formal ? `Married ${partnerName}` : `Relationship with ${partnerName}`,',
    '      label: partnerName,',
    'compact partner label',
)
replace_once(
    'person-events.js',
    '      label: `Birth of ${relativeName(child, birthYear, nameAtYear)}`,',
    '      label: relativeName(child, birthYear, nameAtYear),',
    'compact child label',
)
replace_once(
    'person-events.js',
    '  // Keep every dated child as its own chronological birth row. Family\n',
    '  // Keep every dated child as its own chronological row. The bullet and\n'
    '  // circular branch control already identify this as the child’s birth year.\n',
    'child chronology comment',
)

replace_once(
    'app.js',
    "} from './person-events.js?v=2';",
    "} from './person-events.js?v=3';",
    'person-events cache key',
)
replace_once(
    'app.js',
    "  const childName = child ? visibleName(child) : event.label.replace(/^Birth of\\s+/i, '');",
    '  const childName = child ? visibleName(child) : event.label;',
    'child branch fallback name',
)

replace_once(
    'index.html',
    '<span class="eyebrow">Life events</span>',
    '<span class="eyebrow">Chronology</span>',
    'chronology heading',
)
replace_once(
    'index.html',
    '<script type="module" src="./app.js?v=150"></script>',
    '<script type="module" src="./app.js?v=151"></script>',
    'app cache key',
)

replace_once(
    'tests/person-events.test.mjs',
    """      ['marriage', 1995, 'Married Sam Example'],
      ['child-birth', 1998, 'Birth of First Child'],
      ['personal', 1999, 'Research fellowship'],
      ['child-birth', 2001, 'Birth of Second Child']
""",
    """      ['marriage', 1995, 'Sam Example'],
      ['child-birth', 1998, 'First Child'],
      ['personal', 1999, 'Research fellowship'],
      ['child-birth', 2001, 'Second Child']
""",
    'compact chronology expectations',
)
replace_once(
    'tests/person-events.test.mjs',
    """test('showing and hiding a mark does not alter the event or relationship data', () => {
  const person = structuredClone(people.p);
  const key = childBirthEventKey('c1');
  assert.equal(personEventIsVisible(person, key), true);
  setPersonEventVisibility(person, key, false);
  assert.equal(personEventIsVisible(person, key), false);
  assert.deepEqual(person.children, ['c1', 'c2']);
  setPersonEventVisibility(person, key, true);
  assert.equal(personEventIsVisible(person, key), true);
  assert.deepEqual(person.eventVisibility, {});
});
""",
    """test('showing and hiding a timeline mark does not alter marriage or child data', () => {
  const person = structuredClone(people.p);
  const key = marriageEventKey('s');
  assert.equal(personEventIsVisible(person, key), true);
  setPersonEventVisibility(person, key, false);
  assert.equal(personEventIsVisible(person, key), false);
  assert.deepEqual(person.spouses, ['s']);
  assert.deepEqual(person.children, ['c1', 'c2']);
  setPersonEventVisibility(person, key, true);
  assert.equal(personEventIsVisible(person, key), true);
  assert.deepEqual(person.eventVisibility, {});
});
""",
    'mark visibility semantic test',
)

replace_once(
    'tests/princess-charlotte-family.test.mjs',
    "    assert.equal(birth.label, 'Birth of Charlotte Augusta of Wales');",
    "    assert.equal(birth.label, 'Charlotte Augusta of Wales');",
    'Princess Charlotte compact label',
)

side_path = Path('tests/side-panel-life-events.test.mjs')
side_lines = side_path.read_text(encoding='utf-8').splitlines()
heading_hits = 0
child_label_hits = 0
cache_hits = 0
for line_index, line in enumerate(side_lines):
    if 'assert.match(html, /<span class="eyebrow">Life events' in line:
        side_lines[line_index] = line.replace('Life events', 'Chronology')
        heading_hits += 1
        line = side_lines[line_index]
    if 'assert.match(personEvents, /label: `Birth of' in line:
        side_lines[line_index] = "  assert.match(personEvents, /label: relativeName\\(child, birthYear, nameAtYear\\)/);"
        child_label_hits += 1
        line = side_lines[line_index]
    if 'person-events\\.js\\?v=2' in line:
        side_lines[line_index] = line.replace('v=2', 'v=3')
        cache_hits += 1
if heading_hits != 1 or child_label_hits != 1 or cache_hits != 1:
    raise SystemExit(
        f'side-panel test replacements: heading={heading_hits}, '
        f'child-label={child_label_hits}, cache={cache_hits}'
    )
side = '\n'.join(side_lines) + '\n'
addition = """
test('relationship and child rows use compact names without redundant verbs', () => {
  assert.match(personEvents, /label: partnerName/);
  assert.match(personEvents, /label: relativeName\\(child, birthYear, nameAtYear\\)/);
  assert.doesNotMatch(personEvents, /`Married \\${partnerName}`/);
  assert.doesNotMatch(personEvents, /`Relationship with \\${partnerName}`/);
  assert.doesNotMatch(personEvents, /`Birth of \\${relativeName/);
});

"""
marker = "test('child births do not paint marks across node boxes on the main canvas', () => {"
if side.count(marker) != 1:
    raise SystemExit(f'compact-label insertion marker: expected one occurrence, found {side.count(marker)}')
side = side.replace(marker, addition + marker, 1)
side = side.replace("\\.\\/app\\.js\\?v=150", "\\.\\/app\\.js\\?v=151", 1)
side_path.write_text(side, encoding='utf-8')

replace_once(
    'tests/side-panel-immediate-family.test.mjs',
    'assert.match(html, /\\.\\/app\\.js\\?v=150/);',
    'assert.match(html, /\\.\\/app\\.js\\?v=151/);',
    'parentage cache assertion',
)

# Guard the intended information architecture explicitly.
app = Path('app.js').read_text(encoding='utf-8')
relationship_start = app.index('function renderRelationshipHouseholds(person) {')
relationship_end = app.index('\nfunction renderGeniFamilyActions', relationship_start)
relationship_renderer = app[relationship_start:relationship_end]
for forbidden in ('allPartnerIds(person)', 'householdChildren', "kind: 'spouse'", "kind: 'child'"):
    if forbidden in relationship_renderer:
        raise SystemExit(f'parentage renderer still contains duplicated family content: {forbidden}')
if "event.kind === 'child-birth'" not in app or 'childBranchVisibilityButton' not in app:
    raise SystemExit('child chronology rows are not wired to branch visibility')
timeline_start = app.index('formalMarriagePartnerIds(id).forEach')
timeline_end = app.index('const childrenShownAtAnotherOccurrence', timeline_start)
if 'child-birth' in app[timeline_start:timeline_end]:
    raise SystemExit('child-birth marks are still emitted on the main canvas')

print('Compact chronology labels and branch-control semantics applied.')
