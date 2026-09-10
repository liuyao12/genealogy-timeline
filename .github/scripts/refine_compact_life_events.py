from __future__ import annotations

import re
from pathlib import Path

ROOT = Path('.')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one occurrence, found {count}')
    return text.replace(old, new, 1)


def replace_regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected one regex occurrence, found {count}')
    return updated


person_events_path = ROOT / 'person-events.js'
person_events = person_events_path.read_text(encoding='utf-8')

person_events = replace_once(
    person_events,
    """export function personEventAgeLabel(person, event) {
  const birthYear = numericYear(person?.birthYear);
  const startYear = numericYear(event?.startYear);
  const endYear = numericYear(event?.endYear) ?? startYear;
  if (birthYear == null || startYear == null || startYear < birthYear) return '—';
  const startAge = startYear - birthYear;
  const endAge = Math.max(startAge, (endYear ?? startYear) - birthYear);
  return endAge === startAge ? String(startAge) : `${startAge}–${endAge}`;
}
""",
    """export function personEventAgeLabel(person, event) {
  const birthYear = numericYear(person?.birthYear);
  const startYear = numericYear(event?.startYear);
  if (birthYear == null || startYear == null || startYear < birthYear) return '—';
  // A ranged event belongs in the chronology at its beginning. The duration
  // remains in the event column rather than turning the age cell into a range.
  return String(startYear - birthYear);
}
""",
    'beginning age for ranged events',
)

person_events = replace_once(
    person_events,
    """function relationshipEndLabel(status, partnerName, formal) {
  if (status === 'annulled') return `Marriage to ${partnerName} annulled`;
  if (status === 'divorced') return `Divorced from ${partnerName}`;
  return `${formal ? 'Marriage to' : 'Relationship with'} ${partnerName} ended`;
}
""",
    """function relationshipEndState(person, partner, startYear, currentYear) {
  const partnerId = clean(partner?.id);
  const personId = clean(person?.id);
  const explicitEndYear = numericYear(
    person?.relationshipEndYears?.[partnerId]
      ?? partner?.relationshipEndYears?.[personId]
  );
  const status = relationshipStatus(person, partner);
  if (explicitEndYear != null && explicitEndYear >= startYear) {
    return { endYear: explicitEndYear, reason: status || 'ended', ongoing: false, currentYear };
  }
  // A known divorce or annulment without a year must not be silently replaced
  // by a later death date. Keep the reason and say that the end year is unknown.
  if (status) return { endYear: null, reason: status, ongoing: false, currentYear };

  const personDeathYear = numericYear(person?.deathYear);
  const partnerDeathYear = numericYear(partner?.deathYear);
  if (partnerDeathYear != null
    && partnerDeathYear >= startYear
    && (personDeathYear == null || partnerDeathYear < personDeathYear)) {
    return { endYear: partnerDeathYear, reason: 'partner-died', ongoing: false, currentYear };
  }
  if (personDeathYear != null && personDeathYear >= startYear) {
    return { endYear: personDeathYear, reason: 'person-died', ongoing: false, currentYear };
  }
  const ongoing = person?.isLiving === true && partner?.isLiving === true;
  return { endYear: null, reason: ongoing ? 'ongoing' : '', ongoing, currentYear };
}

function relationshipEndNote(reason, formal) {
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
    'fold relationship endings into relationship ranges',
)

new_build_function = r'''export function buildPersonTimelineEvents(person, people = {}, options = {}) {
  if (!person) return [];
  const nameAtYear = options.nameAtYear;
  const currentYear = numericYear(options.currentYear) ?? new Date().getFullYear();
  const events = [];
  const personId = clean(person.id);
  const partnerIds = unique([
    ...values(person.spouses),
    ...values(person.partners),
    ...Object.keys(person.marriageYears || {}),
    ...Object.keys(person.relationshipEndYears || {}),
    ...Object.keys(person.relationshipEndStatuses || {})
  ]);

  partnerIds.forEach(partnerId => {
    const partner = people[partnerId];
    if (!partner) return;
    const formal = values(person.spouses).includes(partnerId)
      || values(partner.spouses).includes(personId)
      || Object.hasOwn(person.marriageYears || {}, partnerId)
      || Object.hasOwn(partner.marriageYears || {}, personId);
    const relationshipYear = numericYear(
      person.marriageYears?.[partnerId] ?? partner.marriageYears?.[personId]
    );
    // A divorce whose marriage year is unknown cannot be placed honestly in a
    // beginning-year chronology, so it is not promoted to a standalone row.
    if (relationshipYear == null) return;

    const partnerName = relativeName(partner, relationshipYear, nameAtYear);
    const endState = relationshipEndState(person, partner, relationshipYear, currentYear);
    events.push({
      key: formal ? marriageEventKey(partnerId) : relationshipEventKey(partnerId),
      kind: formal ? 'marriage' : 'relationship',
      label: formal ? `Married ${partnerName}` : `Relationship with ${partnerName}`,
      startYear: relationshipYear,
      endYear: endState.endYear ?? relationshipYear,
      ongoing: endState.ongoing,
      endReason: endState.reason,
      detail: relationshipDurationDetail(relationshipYear, endState, formal),
      relativeId: partnerId,
      source: 'family',
      editable: false
    });
  });

  // Keep every dated child as its own chronological birth row. Family
  // normalization makes this list reciprocal, so no whole-tree scan is needed.
  const childIds = unique(values(person.children));
  childIds.forEach(childId => {
    const child = people[childId];
    const birthYear = numericYear(child?.birthYear);
    if (!child || birthYear == null) return;
    events.push({
      key: childBirthEventKey(childId),
      kind: 'child-birth',
      label: `Birth of ${relativeName(child, birthYear, nameAtYear)}`,
      startYear: birthYear,
      endYear: birthYear,
      relativeId: childId,
      source: 'family',
      editable: false
    });
  });

  (Array.isArray(person.personalEvents) ? person.personalEvents : []).forEach((event, personalIndex) => {
    const startYear = numericYear(event?.startYear);
    if (!clean(event?.name) || startYear == null) return;
    const endYear = numericYear(event?.endYear) ?? startYear;
    const eventId = personalEventId(event);
    events.push({
      key: personalEventKey({ ...event, id: eventId }),
      kind: 'personal',
      label: clean(event.name),
      startYear,
      endYear,
      source: clean(event.source) || 'personal',
      color: clean(event.color),
      eventId,
      personalIndex,
      editable: true,
      sourceEvent: event
    });
  });

  const kindOrder = new Map([
    ['marriage', 0], ['relationship', 0], ['child-birth', 1], ['personal', 2]
  ]);
  return [...new Map(events.map(event => [event.key, event])).values()]
    .sort((first, second) =>
      first.startYear - second.startYear
      || (kindOrder.get(first.kind) ?? 9) - (kindOrder.get(second.kind) ?? 9)
      || first.label.localeCompare(second.label)
    );
}
'''
person_events = replace_regex_once(
    person_events,
    r"export function buildPersonTimelineEvents\(person, people = \{\}, options = \{\}\) \{.*\n\}\s*\Z",
    new_build_function,
    'compact chronological event builder',
)
person_events_path.write_text(person_events, encoding='utf-8')


app_path = ROOT / 'app.js'
app = app_path.read_text(encoding='utf-8')
app = replace_once(app, "} from './person-events.js?v=1';", "} from './person-events.js?v=2';", 'person-event module cache key')
app = replace_once(
    app,
    ".filter(event => ['relationship', 'child-birth', 'relationship-end'].includes(event.kind))",
    ".filter(event => ['relationship', 'child-birth'].includes(event.kind))",
    'remove standalone relationship-ending marks',
)
app = replace_once(
    app,
    """function personEventKindSymbol(event) {
  if (event.kind === 'marriage') return '⚭';
  if (event.kind === 'relationship') return '◇';
  if (event.kind === 'child-birth') return '•';
  if (event.kind === 'relationship-end') return event.status === 'annulled' ? '≠' : '∕';
  return '';
}
""",
    """function personEventKindSymbol(event) {
  if (event.kind === 'marriage') return '⚭';
  if (event.kind === 'relationship') return '◇';
  if (event.kind === 'child-birth') return '•';
  return '';
}
""",
    'remove relationship-ending row symbol',
)
app = replace_once(
    app,
    """function personEventAgeCell(person, event) {
  const age = document.createElement('span');
  age.className = 'person-event-age';
  age.textContent = personEventAgeLabel(person, event);
  age.title = 'Approximate age from year-only dates; the exact age can be one year lower.';
  return age;
}
""",
    """function personEventAgeCell(person, event) {
  const age = document.createElement('span');
  age.className = 'person-event-age';
  age.textContent = personEventAgeLabel(person, event);
  age.title = 'Age at the beginning of the event, calculated from year-only dates; the exact age can be one year lower.';
  return age;
}

function personEventYearLabel(event) {
  const startYear = numericYear(event?.startYear);
  if (startYear == null) return '';
  if (event?.ongoing) return `${startYear}–present`;
  const endYear = numericYear(event?.endYear);
  return endYear == null || endYear === startYear
    ? String(startYear)
    : `${startYear}–${endYear}`;
}
""",
    'beginning-age tooltip and inline event year helper',
)
app = replace_once(
    app,
    """    const name = document.createElement('strong');
    name.textContent = event.label;
    title.append(kind, name);
    if (event.editable) {
      const edit = rowActionButton('person-event-edit row-edit', '✎', `Edit ${event.label}`, () => beginPersonalEventEdit(row, person, event));
      title.append(edit);
    }
    const years = document.createElement('small');
    years.className = 'person-event-years';
    years.textContent = formatEventYearRange(event.startYear, event.endYear);
    copy.append(title, years);
""",
    """    const name = document.createElement('strong');
    name.textContent = event.label;
    const years = document.createElement('span');
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
""",
    'event followed by inline year and marriage duration',
)
app_path.write_text(app, encoding='utf-8')


html_path = ROOT / 'index.html'
html = html_path.read_text(encoding='utf-8')
html = replace_once(html, './styles.css?v=79', './styles.css?v=80', 'stylesheet cache key')
html = replace_once(html, './app.js?v=148', './app.js?v=149', 'application cache key')
html = replace_once(html, 'Marks only; family stays connected', 'One mark per row; family stays connected', 'life-event heading note')
html = replace_once(
    html,
    'Show or hide all marriage, child-birth, relationship-end, and authored marks together',
    'Show or hide all marriage, child-birth, and authored marks together',
    'global life-event setting note',
)
html_path.write_text(html, encoding='utf-8')


css_path = ROOT / 'styles.css'
css = css_path.read_text(encoding='utf-8')
css = replace_once(
    css,
    '.person-event-title { min-width: 0; display: grid; grid-template-columns: 17px minmax(0,1fr) auto; align-items: center; gap: 5px; }',
    '.person-event-title { min-width: 0; display: grid; grid-template-columns: 17px minmax(0,1fr) auto auto; align-items: center; gap: 5px; }',
    'event title and year columns',
)
css = replace_once(
    css,
    '.person-event-kind.relationship-end { font: 700 12px/1 Inter, sans-serif; }\n',
    '',
    'remove relationship-ending row style',
)
css = replace_once(
    css,
    '.person-event-years { margin-left: 22px; color: #666; font: 8px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }',
    ".person-event-year { color: #666; font: 8px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; }\n.person-event-detail { margin-left: 22px; color: #666; font: 8px/1.3 Inter, sans-serif; }",
    'inline event year and duration detail styles',
)
css_path.write_text(css, encoding='utf-8')


person_events_test = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonTimelineEvents,
  childBirthEventKey,
  marriageEventKey,
  normalizePersonEventVisibility,
  personalEventId,
  personalEventKey,
  personEventAgeLabel,
  personEventIsVisible,
  remapPersonEventKey,
  remapPersonEventVisibility,
  setPersonEventVisibility
} from '../person-events.js';

const people = {
  p: {
    id: 'p',
    displayName: 'Pat Example',
    birthYear: '1970',
    children: ['c1', 'c2'],
    partners: ['s'],
    spouses: ['s'],
    divorcedSpouses: ['s'],
    marriageYears: { s: '1995' },
    relationshipEndYears: { s: '2005' },
    relationshipEndStatuses: { s: 'divorced' },
    personalEvents: [{ name: 'Research fellowship', startYear: 1999, endYear: 2002, color: '#1565c0' }]
  },
  s: {
    id: 's',
    displayName: 'Sam Example',
    birthYear: '1971',
    children: ['c1', 'c2'],
    partners: ['p'],
    spouses: ['p'],
    divorcedSpouses: ['p'],
    marriageYears: { p: '1995' },
    relationshipEndYears: { p: '2005' },
    relationshipEndStatuses: { p: 'divorced' }
  },
  c1: { id: 'c1', displayName: 'First Child', birthYear: '1998', parents: ['p', 's'] },
  c2: { id: 'c2', displayName: 'Second Child', birthYear: '2001', parents: ['p', 's'] }
};

test('keeps one simple chronology and folds divorce into the marriage range', () => {
  const events = buildPersonTimelineEvents(people.p, people, { currentYear: 2026 });
  assert.deepEqual(
    events.map(event => [event.kind, event.startYear, event.label]),
    [
      ['marriage', 1995, 'Married Sam Example'],
      ['child-birth', 1998, 'Birth of First Child'],
      ['personal', 1999, 'Research fellowship'],
      ['child-birth', 2001, 'Birth of Second Child']
    ]
  );
  const marriage = events[0];
  assert.equal(marriage.endYear, 2005);
  assert.equal(marriage.endReason, 'divorced');
  assert.equal(marriage.detail, '10 years · divorced');
  assert.equal(events.some(event => event.kind === 'relationship-end'), false);
  assert.deepEqual(events.map(event => personEventAgeLabel(people.p, event)), ['25', '28', '29', '31']);
});

test('uses the spouse death as the marriage endpoint and says why it ended', () => {
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
  assert.equal(marriage.endYear, 2010);
  assert.equal(marriage.endReason, 'partner-died');
  assert.equal(marriage.detail, '15 years · spouse died');
});

test('ends a marriage at the selected person death without a redundant note', () => {
  const endedPeople = structuredClone(people);
  delete endedPeople.p.relationshipEndYears.s;
  delete endedPeople.s.relationshipEndYears.p;
  delete endedPeople.p.relationshipEndStatuses.s;
  delete endedPeople.s.relationshipEndStatuses.p;
  endedPeople.p.divorcedSpouses = [];
  endedPeople.s.divorcedSpouses = [];
  endedPeople.p.deathYear = '2008';
  endedPeople.s.deathYear = '2015';
  const marriage = buildPersonTimelineEvents(endedPeople.p, endedPeople, { currentYear: 2026 })[0];
  assert.equal(marriage.endYear, 2008);
  assert.equal(marriage.endReason, 'person-died');
  assert.equal(marriage.detail, '13 years');
});

test('uses stable keys for independently switchable timeline marks', () => {
  const events = buildPersonTimelineEvents(people.p, people);
  assert.equal(events[0].key, marriageEventKey('s'));
  assert.equal(events[1].key, childBirthEventKey('c1'));
  assert.equal(events.at(-1).key, childBirthEventKey('c2'));
  const authored = events.find(event => event.kind === 'personal');
  assert.equal(authored.key, personalEventKey(authored.sourceEvent));
  assert.equal(personalEventId(authored.sourceEvent), personalEventId({ ...authored.sourceEvent }));
});

test('showing and hiding a mark does not alter the event or relationship data', () => {
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

test('normalizes and remaps saved profile-backed event keys', () => {
  assert.deepEqual(normalizePersonEventVisibility({ 'marriage:old': false, bad: 'no' }), { 'marriage:old': false });
  assert.equal(remapPersonEventKey('child-birth:old', id => id === 'old' ? 'new' : id), 'child-birth:new');
  assert.deepEqual(
    remapPersonEventVisibility({ 'marriage:old': false, 'personal:event-a': false }, id => id === 'old' ? 'new' : id),
    { 'marriage:new': false, 'personal:event-a': false }
  );
});

test('omits an undated marriage rather than creating a divorce-only row, but keeps every dated child', () => {
  const undatedPeople = structuredClone(people);
  undatedPeople.p.marriageYears = {};
  undatedPeople.s.marriageYears = {};
  const events = buildPersonTimelineEvents(undatedPeople.p, undatedPeople);
  assert.equal(events.some(event => event.kind === 'marriage'), false);
  assert.equal(events.some(event => event.kind === 'relationship-end'), false);
  assert.deepEqual(
    events.filter(event => event.kind === 'child-birth').map(event => event.relativeId),
    ['c1', 'c2']
  );
});
'''
(ROOT / 'tests/person-events.test.mjs').write_text(person_events_test, encoding='utf-8')


side_panel_test = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const personEvents = readFileSync(new URL('../person-events.js', import.meta.url), 'utf8');

test('the side panel presents Age, Event followed by year, and Mark columns', () => {
  assert.match(html, /<span class="eyebrow">Life events<\/span>/);
  assert.match(html, /id="personal-events-list"[^>]*aria-label="Chronological life events"/);
  assert.match(app, /\['Age', 'Event', 'Mark'\]/);
  assert.match(app, /years\.className = 'person-event-year'/);
  assert.match(app, /years\.textContent = `· \$\{personEventYearLabel\(event\)\}`/);
  assert.match(css, /\.person-event-title \{[^}]*grid-template-columns: 17px minmax\(0,1fr\) auto auto/);
});

test('ranged events use their beginning age and marriages carry duration and ending context', () => {
  assert.match(personEvents, /return String\(startYear - birthYear\)/);
  assert.match(personEvents, /detail: relationshipDurationDetail\(relationshipYear, endState, formal\)/);
  assert.match(personEvents, /return formal \? 'spouse died' : 'partner died'/);
  assert.match(app, /detail\.className = 'person-event-detail'/);
  assert.match(app, /if \(event\?\.ongoing\) return `\$\{startYear\}–present`/);
});

test('divorce is not emitted or drawn as a separate chronological event', () => {
  assert.doesNotMatch(personEvents, /kind: 'relationship-end'/);
  assert.match(app, /\.filter\(event => \['relationship', 'child-birth'\]\.includes\(event\.kind\)\)/);
  assert.doesNotMatch(html, /relationship-end, and authored marks/);
});

test('every dated child remains an individual birth row', () => {
  assert.match(personEvents, /const childIds = unique\(values\(person\.children\)\)/);
  assert.match(personEvents, /kind: 'child-birth'/);
  assert.match(personEvents, /label: `Birth of \$\{relativeName\(child, birthYear, nameAtYear\)\}`/);
});

test('every row gets an independent Show or Hide mark control', () => {
  assert.match(app, /function personEventVisibilityButton\(person, event, shown\)/);
  assert.match(app, /toggle\.textContent = shown \? 'Hide' : 'Show'/);
  assert.match(app, /setPersonEventVisibility\(person, event\.key, !shown\)/);
  assert.match(html, /One mark per row; family stays connected/);
});

test('event visibility survives normalization, merging, and profile-id remapping', () => {
  assert.match(app, /eventVisibility: normalizePersonEventVisibility/);
  assert.match(app, /merged\.eventVisibility = \{/);
  assert.match(app, /normalized\.eventVisibility = remapPersonEventVisibility/);
  assert.match(app, /person\.eventVisibility = remapPersonEventVisibility/);
});

test('the revised static assets use fresh cache keys', () => {
  assert.match(app, /from '\.\/person-events\.js\?v=2'/);
  assert.match(html, /\.\/styles\.css\?v=80/);
  assert.match(html, /\.\/app\.js\?v=149/);
});
'''
(ROOT / 'tests/side-panel-life-events.test.mjs').write_text(side_panel_test, encoding='utf-8')

for relative_path in [
    'tests/monarch-events.test.mjs',
    'tests/royal-title-place-style.test.mjs',
    'tests/side-panel-immediate-family.test.mjs',
]:
    path = ROOT / relative_path
    text = path.read_text(encoding='utf-8')
    text = replace_once(text, 'v=148', 'v=149', f'{relative_path} application cache key')
    path.write_text(text, encoding='utf-8')

print('Compact life-event chronology generated.')
