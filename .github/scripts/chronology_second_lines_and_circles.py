from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:120]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


# ---------------------------------------------------------------------------
# Build complete second-line chronology descriptions in the data adapter.
# ---------------------------------------------------------------------------
replace_once(
    'person-events.js',
    """function relationshipEndNote(reason, formal) {
  if (reason === 'annulled') return 'annulled';
  if (reason === 'divorced') return 'divorced';
  if (reason === 'ended') return formal ? 'marriage ended' : 'relationship ended';
  if (reason === 'partner-died') return formal ? 'spouse died' : 'partner died';
  if (reason === 'ongoing') return 'ongoing';
  // When the selected person dies first, the lifespan already supplies that
  // endpoint; no redundant “person died” note is needed in the marriage row.
  return '';
}

function relationshipDurationDetail(startYear, endState, formal) {
  const note = relationshipEndNote(endState.reason, formal);
  const effectiveEndYear = endState.endYear
    ?? (endState.ongoing ? numericYear(endState.currentYear) : null);
  if (effectiveEndYear == null) return note ? `${note} · end year unknown` : '';
  const elapsedYears = Math.max(0, effectiveEndYear - startYear);
  const duration = elapsedYears === 0
    ? 'under 1 year'
    : `${elapsedYears} year${elapsedYears === 1 ? '' : 's'}`;
  return [duration, note].filter(Boolean).join(' · ');
}
""",
    """function elapsedYearsLabel(startYear, endYear) {
  if (endYear == null) return '';
  const elapsedYears = Math.max(0, endYear - startYear);
  return elapsedYears === 0
    ? 'under 1 year'
    : `${elapsedYears} year${elapsedYears === 1 ? '' : 's'}`;
}

function relationshipEndPhrase(reason, formal) {
  if (reason === 'annulled') return formal ? 'annulled' : 'ended';
  if (reason === 'divorced') return formal ? 'divorced' : 'separated';
  if (reason === 'ended') return 'ended';
  if (reason === 'partner-died') return 'died';
  if (reason === 'ongoing') return 'ongoing';
  // The selected person's own death is already stated in the profile header.
  return '';
}

function relationshipChronologyDetail(startYear, endState, formal) {
  const opening = `${formal ? 'married' : 'together'} ${startYear}`;
  const ending = relationshipEndPhrase(endState.reason, formal);
  const effectiveEndYear = endState.endYear
    ?? (endState.ongoing ? numericYear(endState.currentYear) : null);
  const endClause = ending === 'ongoing'
    ? 'ongoing'
    : ending && effectiveEndYear != null
      ? `${ending} ${effectiveEndYear}`
      : '';
  const duration = elapsedYearsLabel(startYear, effectiveEndYear);
  return [opening + (endClause ? `; ${endClause}` : ''), duration]
    .filter(Boolean)
    .join(' · ');
}

function datedEventDetail(startYear, endYear) {
  if (endYear == null || endYear === startYear) return String(startYear);
  return `${startYear}–${endYear} · ${elapsedYearsLabel(startYear, endYear)}`;
}
""",
)
replace_once(
    'person-events.js',
    "detail: relationshipDurationDetail(relationshipYear, endState, formal),",
    "detail: relationshipChronologyDetail(relationshipYear, endState, formal),",
)
replace_once(
    'person-events.js',
    """      startYear: birthYear,
      endYear: birthYear,
      relativeId: childId,
""",
    """      startYear: birthYear,
      endYear: birthYear,
      detail: `born ${birthYear}`,
      relativeId: childId,
""",
)
replace_once(
    'person-events.js',
    """      startYear,
      endYear,
      source: clean(event.source) || 'personal',
""",
    """      startYear,
      endYear,
      detail: datedEventDetail(startYear, endYear),
      source: clean(event.source) || 'personal',
""",
)

# ---------------------------------------------------------------------------
# Render names on the first line and all time information on the small second.
# Every third-column action uses the same filled/empty circle vocabulary.
# ---------------------------------------------------------------------------
replace_once(
    'app.js',
    """function personEventYearLabel(event) {
  const startYear = numericYear(event?.startYear);
  if (startYear == null) return '';
  if (event?.ongoing) return `${startYear}–present`;
  const endYear = numericYear(event?.endYear);
  return endYear == null || endYear === startYear
    ? String(startYear)
    : `${startYear}–${endYear}`;
}

""",
    '',
)
replace_once(
    'app.js',
    """function personEventVisibilityButton(person, event, shown) {
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
""",
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
""",
)
replace_once(
    'app.js',
    """    const years = document.createElement('span');
    years.className = 'person-event-year';
    years.textContent = `· ${personEventYearLabel(event)}`;
    title.append(kind, name, years);
""",
    """    title.append(kind, name);
""",
)

# ---------------------------------------------------------------------------
# Unify both kinds of chronology controls as circles and simplify the grid.
# ---------------------------------------------------------------------------
replace_once(
    'styles.css',
    ".person-event-title { min-width: 0; position: relative; z-index: 1; display: grid; grid-template-columns: 17px minmax(0,1fr) auto auto; align-items: center; gap: 5px; }",
    ".person-event-title { min-width: 0; position: relative; z-index: 1; display: grid; grid-template-columns: 17px minmax(0,1fr) auto; align-items: center; gap: 5px; }",
)
replace_once(
    'styles.css',
    """.person-event-year { color: #666; font: 8px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; }
.person-event-detail { margin-left: 22px; color: #666; font: 8px/1.3 Inter, sans-serif; }
.person-event-visibility { width: 46px; height: 26px; padding: 0; border: 1px solid #999; border-radius: 6px; background: #fff; color: #333; cursor: pointer; font-size: 8px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.person-event-visibility:hover { border-color: #000; background: #eee; color: #000; }
.person-event-visibility[aria-pressed=\"false\"] { border-color: #111; background: #111; color: #fff; }
.person-event-branch-visibility { justify-self: center; width: 15px; height: 15px; padding: 0; border: 1.5px solid #222; border-radius: 50%; background: #222; cursor: pointer; }
.person-event-branch-visibility:hover { box-shadow: 0 0 0 3px #e8e8e8; }
.person-event-branch-visibility[aria-pressed=\"false\"] { background: #fff; }
""",
    """.person-event-detail { margin-left: 22px; color: #666; font: 8px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.person-event-visibility,
.person-event-branch-visibility { justify-self: center; width: 15px; height: 15px; padding: 0; border: 1.5px solid #222; border-radius: 50%; background: #222; cursor: pointer; }
.person-event-visibility:hover,
.person-event-branch-visibility:hover { box-shadow: 0 0 0 3px #e8e8e8; }
.person-event-visibility[aria-pressed=\"false\"],
.person-event-branch-visibility[aria-pressed=\"false\"] { background: #fff; }
""",
)

# ---------------------------------------------------------------------------
# Explanatory copy and cache keys.
# ---------------------------------------------------------------------------
replace_once(
    'index.html',
    '<small>Child circles show or hide downstream branches</small>',
    '<small>Filled circles are shown; child circles control downstream branches</small>',
)
replace_once('index.html', './styles.css?v=81', './styles.css?v=82')
replace_once('index.html', './app.js?v=151', './app.js?v=152')
replace_once('app.js', "from './person-events.js?v=3';", "from './person-events.js?v=4';")

# ---------------------------------------------------------------------------
# Update unit/structural expectations.
# ---------------------------------------------------------------------------
replace_once(
    'tests/person-events.test.mjs',
    "assert.equal(marriage.detail, '10 years · divorced');",
    "assert.equal(marriage.detail, 'married 1995; divorced 2005 · 10 years');",
)
replace_once(
    'tests/person-events.test.mjs',
    "assert.equal(marriage.detail, '15 years · spouse died');",
    "assert.equal(marriage.detail, 'married 1995; died 2010 · 15 years');",
)
replace_once(
    'tests/person-events.test.mjs',
    "assert.equal(marriage.detail, '13 years');",
    "assert.equal(marriage.detail, 'married 1995 · 13 years');",
)
insert_after = """  assert.deepEqual(events.map(event => personEventAgeLabel(people.p, event)), ['25', '28', '29', '31']);
"""
replace_once(
    'tests/person-events.test.mjs',
    insert_after,
    insert_after + """  assert.equal(events[1].detail, 'born 1998');
  assert.equal(events[2].detail, '1999–2002 · 3 years');
  assert.equal(events[3].detail, 'born 2001');
""",
)

side_test = Path('tests/side-panel-life-events.test.mjs')
side = side_test.read_text(encoding='utf-8')
side = side.replace(
    "  assert.match(app, /years\\.textContent = `· \\${personEventYearLabel\\(event\\)}`/);\n",
    "  assert.doesNotMatch(app, /personEventYearLabel/);\n  assert.match(app, /title\\.append\\(kind, name\\)/);\n",
)
side = side.replace(
    "  assert.match(personEvents, /detail: relationshipDurationDetail\\(relationshipYear, endState, formal\\)/);\n  assert.match(personEvents, /return formal \\? 'spouse died' : 'partner died'/);\n",
    "  assert.match(personEvents, /detail: relationshipChronologyDetail\\(relationshipYear, endState, formal\\)/);\n  assert.match(personEvents, /if \\(reason === 'partner-died'\\) return 'died'/);\n  assert.match(personEvents, /detail: `born \\${birthYear}`/);\n  assert.match(personEvents, /detail: datedEventDetail\\(startYear, endYear\\)/);\n",
)
side = side.replace(
    "  assert.match(app, /toggle\\.textContent = shown \\? 'Hide' : 'Show'/);\n",
    "  assert.match(app, /toggle\\.textContent = ''/);\n  assert.match(app, /toggle\\.dataset\\.markState = shown \\? 'shown' : 'hidden'/);\n  assert.match(css, /\\.person-event-visibility,[\\s\\S]*border-radius: 50%/);\n",
)
side = side.replace("from '\\.\\/person-events\\.js\\?v=3'", "from '\\.\\/person-events\\.js\\?v=4'")
side = side.replace("\\.\\/styles\\.css\\?v=81", "\\.\\/styles\\.css\\?v=82")
side = side.replace("\\.\\/app\\.js\\?v=151", "\\.\\/app\\.js\\?v=152")
side_test.write_text(side, encoding='utf-8')

print('Chronology second-line descriptions and circle controls applied.')
