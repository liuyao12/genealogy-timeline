from __future__ import annotations

import re
from pathlib import Path

ROOT = Path('.')
APP = ROOT / 'app.js'
HTML = ROOT / 'index.html'
CSS = ROOT / 'styles.css'


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


app = APP.read_text(encoding='utf-8')

app = replace_once(
    app,
    "import { birthOrderPairs, packTimelineRunsSourceFirst } from './timeline-compaction.js?v=3';\n",
    "import { birthOrderPairs, packTimelineRunsSourceFirst } from './timeline-compaction.js?v=3';\n"
    "import {\n"
    "  buildPersonTimelineEvents, childBirthEventKey, marriageEventKey, normalizePersonEventVisibility,\n"
    "  personalEventId, personalEventKey, personEventAgeLabel, personEventIsVisible,\n"
    "  personEventReferencesProfile, relationshipEndEventKey, remapPersonEventVisibility,\n"
    "  setPersonEventVisibility\n"
    "} from './person-events.js?v=1';\n",
    'person-events import',
)

app = replace_once(
    app,
    "    const isMonarchReign = clean(event?.kind).toLowerCase() === 'monarch-reign' || isReignLabel(name);\n"
    "    const monarchGroup = isMonarchReign ? monarchGroupForEvent({ ...event, name }) : '';\n"
    "    return {\n"
    "      name,\n"
    "      startYear,\n"
    "      endYear: endYear ?? startYear,\n",
    "    const isMonarchReign = clean(event?.kind).toLowerCase() === 'monarch-reign' || isReignLabel(name);\n"
    "    const monarchGroup = isMonarchReign ? monarchGroupForEvent({ ...event, name }) : '';\n"
    "    const normalizedEndYear = endYear ?? startYear;\n"
    "    const id = personalEventId({ ...event, name, startYear, endYear: normalizedEndYear });\n"
    "    return {\n"
    "      id,\n"
    "      name,\n"
    "      startYear,\n"
    "      endYear: normalizedEndYear,\n",
    'stable personal event ids',
)

app = replace_once(
    app,
    "    personalEvents: normalizePersonalEvents([...(Array.isArray(source.personalEvents) ? source.personalEvents : []), ...extractGeniReignFacts(source)]),\n"
    "    sourceUrl,\n",
    "    personalEvents: normalizePersonalEvents([...(Array.isArray(source.personalEvents) ? source.personalEvents : []), ...extractGeniReignFacts(source)]),\n"
    "    eventVisibility: normalizePersonEventVisibility(source.eventVisibility || source.timelineEventVisibility),\n"
    "    sourceUrl,\n",
    'normalize profile event visibility',
)

app = replace_once(
    app,
    "    normalized.relationshipEndStatuses = remapMap(normalized.relationshipEndStatuses);\n"
    "    people[normalized.id] = people[normalized.id] ? mergePersonRecords(people[normalized.id], normalized) : normalized;\n",
    "    normalized.relationshipEndStatuses = remapMap(normalized.relationshipEndStatuses);\n"
    "    normalized.eventVisibility = remapPersonEventVisibility(normalized.eventVisibility, remap);\n"
    "    people[normalized.id] = people[normalized.id] ? mergePersonRecords(people[normalized.id], normalized) : normalized;\n",
    'migrate event visibility profile ids',
)

app = replace_once(
    app,
    "  merged.personalEvents = normalizePersonalEvents([...incoming.personalEvents, ...existing.personalEvents]);\n"
    "  merged.sourceUrl = incoming.sourceUrl || existing.sourceUrl;\n",
    "  merged.personalEvents = normalizePersonalEvents([...incoming.personalEvents, ...existing.personalEvents]);\n"
    "  merged.eventVisibility = {\n"
    "    ...normalizePersonEventVisibility(incoming.eventVisibility),\n"
    "    ...normalizePersonEventVisibility(existing.eventVisibility)\n"
    "  };\n"
    "  merged.sourceUrl = incoming.sourceUrl || existing.sourceUrl;\n",
    'merge event visibility',
)

app = replace_once(
    app,
    "    GENI_REFERENCE_MAP_FIELDS.forEach(field => {\n"
    "      const mapped = {};\n"
    "      Object.entries(person[field] || {}).forEach(([relativeId, value]) => {\n"
    "        const targetId = resolve(relativeId);\n"
    "        if (targetId && targetId !== person.id) mapped[targetId] = value;\n"
    "      });\n"
    "      person[field] = mapped;\n"
    "    });\n"
    "  });\n",
    "    GENI_REFERENCE_MAP_FIELDS.forEach(field => {\n"
    "      const mapped = {};\n"
    "      Object.entries(person[field] || {}).forEach(([relativeId, value]) => {\n"
    "        const targetId = resolve(relativeId);\n"
    "        if (targetId && targetId !== person.id) mapped[targetId] = value;\n"
    "      });\n"
    "      person[field] = mapped;\n"
    "    });\n"
    "    person.eventVisibility = remapPersonEventVisibility(person.eventVisibility, resolve);\n"
    "  });\n",
    'rewrite event visibility profile ids',
)

old_age_helper = """function personalEventAgePrefix(person, event) {
  const birthYear = numericYear(person?.birthYear);
  const startYear = numericYear(event?.startYear);
  if (birthYear == null || startYear == null || startYear < birthYear) return '';
  const startAge = startYear - birthYear + 1;
  return `Age ${startAge}`;
}

"""
app = replace_once(app, old_age_helper, '', 'remove old event age prefix')

new_personal_events = r'''function personEventKindSymbol(event) {
  if (event.kind === 'marriage') return '⚭';
  if (event.kind === 'relationship') return '◇';
  if (event.kind === 'child-birth') return '•';
  if (event.kind === 'relationship-end') return event.status === 'annulled' ? '≠' : '∕';
  return '';
}

function personEventAgeCell(person, event) {
  const age = document.createElement('span');
  age.className = 'person-event-age';
  age.textContent = personEventAgeLabel(person, event);
  age.title = 'Approximate age from year-only dates; the exact age can be one year lower.';
  return age;
}

function personEventVisibilityButton(person, event, shown) {
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

function beginPersonalEventEdit(row, person, summary) {
  const index = summary.personalIndex;
  const event = person.personalEvents[index];
  if (!event) return;
  row.classList.add('editing');
  const shown = personEventIsVisible(person, summary.key);
  const age = personEventAgeCell(person, summary);
  const editor = document.createElement('div');
  editor.className = 'person-event-editor';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'person-event-editor-name';
  nameInput.value = event.name;
  nameInput.setAttribute('aria-label', 'Event name');
  const startInput = inlineYearInput(event.startYear, 'Start year');
  const endInput = inlineYearInput(event.endYear, 'End year');
  const monarchGroup = isMonarchReignEvent(event) ? monarchGroupForEvent(event) : '';
  const eventFallback = monarchGroup === 'british' ? DEFAULT_REIGN_EVENT_COLOR
    : monarchGroup === 'other' ? DEFAULT_OTHER_MONARCH_EVENT_COLOR : DEFAULT_PERSONAL_EVENT_COLOR;
  const draftColor = eventColorPalette(personalEventColor(event), `Colour for ${event.name}`, () => {}, eventFallback);
  const save = rowActionButton('row-save', '✓', `Save ${event.name}`, () => {
    const nextName = clean(nameInput.value);
    let startYear = numericYear(startInput.value);
    let endYear = numericYear(endInput.value) ?? startYear;
    if (!nextName || startYear == null) return toast('Enter an event name and start year.', true);
    if (endYear < startYear) [startYear, endYear] = [endYear, startYear];
    const updated = {
      ...event,
      name: nextName,
      startYear,
      endYear,
      color: paletteColor(draftColor.value, eventFallback)
    };
    if (isReignLabel(updated.name)) {
      updated.kind = 'monarch-reign';
      updated.monarchGroup = monarchGroupForEvent({ ...updated, monarchGroup: '' });
      updated.color = applySharedMonarchColor(updated.monarchGroup, updated.color);
    } else {
      delete updated.kind;
      delete updated.monarchGroup;
    }
    person.personalEvents[index] = updated;
    person.personalEvents = normalizePersonalEvents(person.personalEvents);
    persist('Personal event saved');
    render();
  });
  const cancel = rowActionButton('row-cancel', '↶', `Cancel editing ${event.name}`, () => render());
  const remove = rowActionButton('row-delete', '×', `Delete ${event.name}`, () => {
    person.personalEvents.splice(index, 1);
    if (person.eventVisibility) delete person.eventVisibility[summary.key];
    persist('Personal event deleted');
    render();
  });
  const details = document.createElement('div');
  details.className = 'person-event-editor-details';
  details.append(startInput, endInput, draftColor, save, cancel, remove);
  editor.append(nameInput, details);
  row.replaceChildren(age, editor, personEventVisibilityButton(person, summary, shown));
  nameInput.focus();
  nameInput.select();
}

function renderPersonalEvents(person) {
  const list = els['personal-events-list'];
  const events = buildPersonTimelineEvents(person, state.people, { nameAtYear });
  const header = document.createElement('div');
  header.className = 'person-event-table-header';
  ['Age', 'Event', 'Mark'].forEach(label => {
    const cell = document.createElement('span');
    cell.textContent = label;
    header.append(cell);
  });
  if (!events.length) {
    const empty = document.createElement('span');
    empty.className = 'event-editor-empty person-event-empty';
    empty.textContent = 'No dated family or personal events yet.';
    list.replaceChildren(header, empty);
    return;
  }
  const rows = events.map(event => {
    const shown = personEventIsVisible(person, event.key);
    const row = document.createElement('div');
    row.className = `person-event-row ${event.kind}${shown ? '' : ' is-hidden'}`;
    row.dataset.eventKey = event.key;
    row.dataset.eventKind = event.kind;
    row.dataset.eventYear = String(event.startYear);
    const copy = document.createElement('div');
    copy.className = 'person-event-copy';
    const title = document.createElement('div');
    title.className = 'person-event-title';
    const kind = document.createElement('span');
    kind.className = `person-event-kind ${event.kind}`;
    kind.textContent = personEventKindSymbol(event);
    if (event.kind === 'personal') kind.style.setProperty('--event-color', personalEventColor(event.sourceEvent));
    kind.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong');
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
    row.append(personEventAgeCell(person, event), copy, personEventVisibilityButton(person, event, shown));
    return row;
  });
  list.replaceChildren(header, ...rows);
}

'''
app = replace_regex_once(
    app,
    r"function renderPersonalEvents\(person\) \{.*?\n\}\n\n(?=function renderGlobalEventsEditor\(\) \{)",
    new_personal_events,
    'chronological side-panel events',
)

app = replace_once(
    app,
    "    const hasReign = state.showPersonalEvents && reignEvents(person).length > 0;\n",
    "    const visiblePersonalEvents = person.personalEvents.filter(event => personEventIsVisible(person, personalEventKey(event)));\n"
    "    const hasReign = state.showPersonalEvents && visiblePersonalEvents.some(isMonarchReignEvent);\n",
    'visible reign state',
)

new_personal_event_marks = r'''    if (state.showPersonalEvents) visiblePersonalEvents.forEach(event => {
      const start = Math.max(birthYear(person), event.startYear);
      const finish = Math.min(endYear(person), event.endYear ?? event.startYear);
      if (finish < start) return;
      const eventX = (start - birthYear(person)) * yearWidth;
      const eventWidth = Math.max(0, (finish - start) * yearWidth);
      const eventColor = personalEventColor(event);
      const eventKey = personalEventKey(event);
      const eventMark = svg('g', { class: 'personal-event-mark', 'data-event-key': eventKey });
      if (eventWidth > 0) {
        const mark = svg('rect', { class: 'personal-event-range', x: eventX, y: 0, width: eventWidth, height: rowHeight, fill: personalEventFill(eventColor) });
        const yearLabel = formatEventYearRange(event.startYear, event.endYear);
        mark.append(svg('title', {}, `${event.name} · ${yearLabel}`));
        eventMark.append(mark);
        eventMark.append(svg('line', { class: 'personal-event-edge', x1: eventX, y1: 0, x2: eventX, y2: rowHeight, stroke: eventColor }));
        eventMark.append(svg('line', { class: 'personal-event-edge', x1: eventX + eventWidth, y1: 0, x2: eventX + eventWidth, y2: rowHeight, stroke: eventColor }));
      } else {
        const mark = svg('line', { class: 'personal-event-point', x1: eventX, y1: 0, x2: eventX, y2: rowHeight, stroke: eventColor });
        const yearLabel = formatEventYearRange(event.startYear, event.endYear);
        mark.append(svg('title', {}, `${event.name} · ${yearLabel}`));
        eventMark.append(mark);
      }
      personalEventLayer.append(eventMark);
    });
'''
app = replace_regex_once(
    app,
    r"    if \(state\.showPersonalEvents\) person\.personalEvents\.forEach\(event => \{.*?\n    \}\);\n(?=    // The opaque event layer)",
    new_personal_event_marks,
    'per-person personal event mark visibility',
)

app = replace_once(
    app,
    "      parentIds.forEach((parentId, parentIndex) => {\n"
    "        const parentKey = parentKeys[parentIndex];\n"
    "        if (!marriageOverlaysByParent.has(parentKey)) marriageOverlaysByParent.set(parentKey, []);\n"
    "        marriageOverlaysByParent.get(parentKey).push({\n"
    "          x: trunkX,\n"
    "          year: recordedMarriageYear,\n"
    "          className: marriageClass,\n"
    "          title: `Married ${visibleName(state.people[parentIds.find(id => id !== parentId)])} in ${recordedMarriageYear}`\n"
    "        });\n"
    "      });\n",
    "      parentIds.forEach((parentId, parentIndex) => {\n"
    "        const partnerId = parentIds.find(id => id !== parentId);\n"
    "        const eventKey = marriageEventKey(partnerId);\n"
    "        if (!state.showPersonalEvents || !personEventIsVisible(state.people[parentId], eventKey)) return;\n"
    "        const parentKey = parentKeys[parentIndex];\n"
    "        if (!marriageOverlaysByParent.has(parentKey)) marriageOverlaysByParent.set(parentKey, []);\n"
    "        marriageOverlaysByParent.get(parentKey).push({\n"
    "          x: trunkX,\n"
    "          year: recordedMarriageYear,\n"
    "          eventKey,\n"
    "          className: marriageClass,\n"
    "          title: `Married ${visibleName(state.people[partnerId])} in ${recordedMarriageYear}`\n"
    "        });\n"
    "      });\n",
    'marriage overlay visibility',
)

app = replace_once(
    app,
    "        'data-marriage-year': marriage.year\n"
    "      });\n",
    "        'data-marriage-year': marriage.year,\n"
    "        'data-event-key': marriage.eventKey\n"
    "      });\n",
    'marriage overlay event key',
)

app = replace_once(
    app,
    "      const marriageYear = marriageYearFor(id, partnerId);\n"
    "      if (!partner || marriageYear == null) return;\n"
    "      const localX = (marriageYear - birthYear(person)) * yearWidth;\n",
    "      const marriageYear = marriageYearFor(id, partnerId);\n"
    "      const eventKey = marriageEventKey(partnerId);\n"
    "      if (!partner || marriageYear == null || !state.showPersonalEvents || !personEventIsVisible(person, eventKey)) return;\n"
    "      const localX = (marriageYear - birthYear(person)) * yearWidth;\n",
    'marriage date marker visibility',
)

app = replace_once(
    app,
    "        'data-marriage-year': marriageYear,\n"
    "        'data-partner-id': partnerId\n"
    "      });\n",
    "        'data-marriage-year': marriageYear,\n"
    "        'data-partner-id': partnerId,\n"
    "        'data-event-key': eventKey\n"
    "      });\n",
    'marriage date marker event key',
)

family_marks = r'''    if (state.showPersonalEvents) {
      buildPersonTimelineEvents(person, state.people, { nameAtYear })
        .filter(event => ['relationship', 'child-birth', 'relationship-end'].includes(event.kind))
        .forEach(event => {
          if (!personEventIsVisible(person, event.key)) return;
          const localX = (event.startYear - birthYear(person)) * yearWidth;
          if (localX < 0 || localX > lifespanWidth) return;
          const mark = svg('g', {
            class: `family-event-mark ${event.kind}${event.status ? ` ${event.status}` : ''}`,
            'data-event-key': event.key,
            'data-event-year': event.startYear
          });
          mark.append(svg('title', {}, `${event.label} · ${event.startYear}`));
          if (event.kind === 'child-birth') {
            mark.append(svg('line', { class: 'family-event-halo', x1: localX, y1: 1, x2: localX, y2: rowHeight - 1 }));
            mark.append(svg('line', { class: 'family-event-child-birth-line', x1: localX, y1: 1, x2: localX, y2: rowHeight - 1 }));
            mark.append(svg('circle', { class: 'family-event-child-birth-dot', cx: localX, cy: 4, r: 2.2 }));
          } else if (event.kind === 'relationship') {
            const half = 3;
            mark.append(svg('path', { class: 'family-event-halo', d: `M ${localX} 1 L ${localX + half} ${rowHeight / 2} L ${localX} ${rowHeight - 1} L ${localX - half} ${rowHeight / 2} Z` }));
            mark.append(svg('path', { class: 'family-event-relationship-line', d: `M ${localX} 1 L ${localX + half} ${rowHeight / 2} L ${localX} ${rowHeight - 1} L ${localX - half} ${rowHeight / 2} Z` }));
          } else {
            const secondSlash = event.status === 'annulled' ? ` M ${localX + 2} 2 L ${localX + 7} ${rowHeight - 2}` : '';
            const path = `M ${localX - 4} 2 L ${localX + 1} ${rowHeight - 2}${secondSlash}`;
            mark.append(svg('path', { class: 'family-event-halo', d: path }));
            mark.append(svg('path', { class: 'family-event-relationship-end-line', d: path }));
          }
          group.append(mark);
        });
    }
'''
app = replace_once(
    app,
    "    const childrenShownAtAnotherOccurrence = transportedChildrenByNatalId.get(id) || new Set();\n",
    family_marks + "    const childrenShownAtAnotherOccurrence = transportedChildrenByNatalId.get(id) || new Set();\n",
    'automatic family event marks',
)

app = replace_once(
    app,
    "    delete other.relationshipEndStatuses[id];\n"
    "  });\n",
    "    delete other.relationshipEndStatuses[id];\n"
    "    other.eventVisibility = Object.fromEntries(\n"
    "      Object.entries(other.eventVisibility || {}).filter(([key]) => !personEventReferencesProfile(key, id))\n"
    "    );\n"
    "  });\n",
    'delete dangling event visibility',
)

APP.write_text(app, encoding='utf-8')

html = HTML.read_text(encoding='utf-8')
html = replace_once(
    html,
    "            <div class=\"event-editor-section\">\n"
    "              <span class=\"eyebrow\">Personal events</span>\n"
    "              <div class=\"event-editor-list\" id=\"personal-events-list\"></div>\n",
    "            <div class=\"event-editor-section life-events-section\">\n"
    "              <div class=\"life-events-heading\">\n"
    "                <span class=\"eyebrow\">Life events</span>\n"
    "                <small>Marks only; family stays connected</small>\n"
    "              </div>\n"
    "              <div class=\"event-editor-list person-event-table\" id=\"personal-events-list\" aria-label=\"Chronological life events\"></div>\n",
    'life events section heading',
)
html = replace_once(
    html,
    '                <input id="personal-event-name" type="text" placeholder="Event name" aria-label="Personal event name">',
    '                <input id="personal-event-name" type="text" placeholder="Add a marked event" aria-label="Personal event name">',
    'personal event add label',
)
html = replace_once(
    html,
    "          <span class=\"timeline-toggle-label\">Personal events<small>Show or hide every personal-event band together</small></span>",
    "          <span class=\"timeline-toggle-label\">Life-event marks<small>Show or hide all marriage, child-birth, relationship-end, and authored marks together</small></span>",
    'settings life-event label',
)
html = replace_once(html, './styles.css?v=78', './styles.css?v=79', 'stylesheet cache revision')
html = replace_once(html, './app.js?v=147', './app.js?v=148', 'app cache revision')
HTML.write_text(html, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
css = replace_once(
    css,
    ".personal-event-point { stroke-width: 2.2; }\n",
    ".personal-event-point { stroke-width: 2.2; }\n"
    ".personal-event-mark, .family-event-mark { pointer-events: none; }\n"
    ".family-event-halo { fill: none; stroke: rgba(255,255,255,.95); stroke-width: 3.8; stroke-linejoin: round; vector-effect: non-scaling-stroke; }\n"
    ".family-event-child-birth-line { stroke: #111; stroke-width: 1.2; stroke-dasharray: 1 2.5; vector-effect: non-scaling-stroke; }\n"
    ".family-event-child-birth-dot { fill: #111; stroke: #fff; stroke-width: 1; vector-effect: non-scaling-stroke; }\n"
    ".family-event-relationship-line, .family-event-relationship-end-line { fill: none; stroke: #111; stroke-width: 1.4; stroke-linejoin: round; vector-effect: non-scaling-stroke; }\n",
    'timeline family event marks',
)
css = replace_once(
    css,
    ".event-editor-empty { color: #777; font-size: 10px; }\n"
    ".event-editor-row { display: grid; grid-template-columns: minmax(0,1fr) auto 30px 24px; align-items: center; gap: 7px; min-height: 30px; }\n",
    ".event-editor-empty { color: #777; font-size: 10px; }\n"
    ".life-events-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }\n"
    ".life-events-heading small { color: #777; font-size: 8px; text-align: right; }\n"
    ".person-event-table { gap: 0; }\n"
    ".person-event-table-header, .person-event-row { display: grid; grid-template-columns: 36px minmax(0,1fr) 46px; align-items: center; gap: 8px; }\n"
    ".person-event-table-header { padding: 0 3px 5px; border-bottom: 1px solid #bbb; color: #666; font-size: 7px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }\n"
    ".person-event-table-header span:first-child { text-align: right; }\n"
    ".person-event-table-header span:last-child { text-align: center; }\n"
    ".person-event-row { min-height: 40px; padding: 5px 3px; border-bottom: 1px solid #e2e2e2; }\n"
    ".person-event-row:last-child { border-bottom: 0; }\n"
    ".person-event-row.is-hidden .person-event-age, .person-event-row.is-hidden .person-event-copy { opacity: .42; }\n"
    ".person-event-age { color: #333; font: 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: right; font-variant-numeric: tabular-nums; }\n"
    ".person-event-copy { min-width: 0; display: grid; gap: 2px; }\n"
    ".person-event-title { min-width: 0; display: grid; grid-template-columns: 17px minmax(0,1fr) auto; align-items: center; gap: 5px; }\n"
    ".person-event-title strong { overflow: hidden; color: #111; font-size: 10px; font-weight: 600; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }\n"
    ".person-event-kind { width: 17px; display: grid; place-items: center; color: #333; font: 13px/1 Georgia, serif; }\n"
    ".person-event-kind.child-birth { font-size: 15px; }\n"
    ".person-event-kind.relationship-end { font: 700 12px/1 Inter, sans-serif; }\n"
    ".person-event-kind.personal { color: transparent; }\n"
    ".person-event-kind.personal::before { content: ''; width: 9px; height: 9px; border: 1px solid rgba(0,0,0,.28); border-radius: 50%; background: var(--event-color); }\n"
    ".person-event-years { margin-left: 22px; color: #666; font: 8px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }\n"
    ".person-event-visibility { width: 46px; height: 26px; padding: 0; border: 1px solid #999; border-radius: 6px; background: #fff; color: #333; cursor: pointer; font-size: 8px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }\n"
    ".person-event-visibility:hover { border-color: #000; background: #eee; color: #000; }\n"
    ".person-event-visibility[aria-pressed=\"false\"] { border-color: #111; background: #111; color: #fff; }\n"
    ".person-event-empty { grid-column: 1 / -1; padding: 9px 3px 2px 44px; }\n"
    ".person-event-edit { width: 22px; height: 22px; }\n"
    ".person-event-row.editing { align-items: start; }\n"
    ".person-event-editor { min-width: 0; display: grid; gap: 5px; }\n"
    ".person-event-editor-name { min-width: 0; height: 29px; margin: 0 !important; padding: 5px 7px !important; font-size: 9px !important; }\n"
    ".person-event-editor-details { display: grid; grid-template-columns: 46px 46px 30px 24px 24px 24px; align-items: center; gap: 3px; }\n"
    ".person-event-editor-details input { min-width: 0; height: 29px; margin: 0 !important; padding: 5px 6px !important; font-size: 9px !important; }\n"
    ".event-editor-row { display: grid; grid-template-columns: minmax(0,1fr) auto 30px 24px; align-items: center; gap: 7px; min-height: 30px; }\n",
    'side-panel life event table',
)
css = replace_once(
    css,
    ".row-edit, .row-default, .row-save, .row-delete { display: grid; place-items: center; width: 24px; height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #555; cursor: pointer; line-height: 1; }\n",
    ".row-edit, .row-default, .row-save, .row-cancel, .row-delete { display: grid; place-items: center; width: 24px; height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #555; cursor: pointer; line-height: 1; }\n",
    'event edit control set',
)
css = replace_once(
    css,
    ".row-save { color: #111; font-size: 16px; font-weight: 700; }\n"
    ".row-delete { color: #d00000; font-size: 19px; }\n"
    ".row-edit:hover, .row-default:hover, .row-save:hover { background: #ededed; color: #000; }\n"
    ".row-delete:hover { background: #ffe8e8; color: #b00000; }\n"
    ".row-edit:focus-visible, .row-default:focus-visible, .row-save:focus-visible, .row-delete:focus-visible { outline: 2px solid #000; outline-offset: -2px; }\n",
    ".row-save { color: #111; font-size: 16px; font-weight: 700; }\n"
    ".row-cancel { color: #555; font-size: 15px; }\n"
    ".row-delete { color: #d00000; font-size: 19px; }\n"
    ".row-edit:hover, .row-default:hover, .row-save:hover, .row-cancel:hover { background: #ededed; color: #000; }\n"
    ".row-delete:hover { background: #ffe8e8; color: #b00000; }\n"
    ".row-edit:focus-visible, .row-default:focus-visible, .row-save:focus-visible, .row-cancel:focus-visible, .row-delete:focus-visible, .person-event-visibility:focus-visible { outline: 2px solid #000; outline-offset: -2px; }\n",
    'event cancel control styles',
)
CSS.write_text(css, encoding='utf-8')

for test_path in (ROOT / 'tests').glob('*.test.mjs'):
    test_text = test_path.read_text(encoding='utf-8')
    test_text = test_text.replace(r'app\.js\?v=147', r'app\.js\?v=148')
    test_path.write_text(test_text, encoding='utf-8')

(ROOT / 'tests' / 'side-panel-life-events.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('the side panel presents one three-column chronological life-event table', () => {
  assert.match(html, /<span class="eyebrow">Life events<\/span>/);
  assert.match(html, /id="personal-events-list"[^>]*aria-label="Chronological life events"/);
  assert.match(app, /\['Age', 'Event', 'Mark'\]/);
  assert.match(app, /buildPersonTimelineEvents\(person, state\.people, \{ nameAtYear \}\)/);
  assert.match(css, /\.person-event-table-header, \.person-event-row \{ display: grid; grid-template-columns: 36px minmax\(0,1fr\) 46px/);
});

test('every row gets an independent Show or Hide mark control', () => {
  assert.match(app, /function personEventVisibilityButton\(person, event, shown\)/);
  assert.match(app, /toggle\.textContent = shown \? 'Hide' : 'Show'/);
  assert.match(app, /setPersonEventVisibility\(person, event\.key, !shown\)/);
  assert.match(html, /Marks only; family stays connected/);
});

test('the timeline respects visibility for authored and family-derived marks', () => {
  assert.match(app, /visiblePersonalEvents = person\.personalEvents\.filter\(event => personEventIsVisible\(person, personalEventKey\(event\)\)\)/);
  assert.match(app, /class: 'personal-event-mark', 'data-event-key': eventKey/);
  assert.match(app, /class: `family-event-mark \$\{event\.kind\}/);
  assert.match(app, /personEventIsVisible\(state\.people\[parentId\], eventKey\)/);
  assert.match(app, /'data-event-key': marriage\.eventKey/);
  assert.match(app, /'data-event-key': eventKey/);
});

test('event visibility survives normalization, merging, and profile-id remapping', () => {
  assert.match(app, /eventVisibility: normalizePersonEventVisibility/);
  assert.match(app, /merged\.eventVisibility = \{/);
  assert.match(app, /normalized\.eventVisibility = remapPersonEventVisibility/);
  assert.match(app, /person\.eventVisibility = remapPersonEventVisibility/);
});

test('the revised static assets use fresh cache keys', () => {
  assert.match(html, /\.\/styles\.css\?v=79/);
  assert.match(html, /\.\/app\.js\?v=148/);
});
''', encoding='utf-8')

(ROOT / '.github' / 'scripts' / 'check_side_panel_life_events.mjs').write_text(r'''import assert from 'node:assert/strict';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const debugPort = Number(process.argv[3] || 9222);
const HENRY = 'profile-g6000000007442241030';
const MARY = 'profile-g5027356653020040914';
const CATHERINE = 'profile-4475169';
const CHILD_KEY = `child-birth:${MARY}`;
const MARRIAGE_KEY = `marriage:${CATHERINE}`;
const END_KEY = `relationship-end:${CATHERINE}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
      if (response.ok) {
        const page = (await response.json()).find(target => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome debugging endpoint did not become available');
}

const socket = new WebSocket(await waitForDebugger());
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Page evaluation failed');
  return response.result?.value;
}
async function waitFor(expression, label, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await evaluate(`Boolean(${expression})`)) return; } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
const selector = value => JSON.stringify(value);
const rowSelector = key => `.person-event-row[data-event-key="${key}"]`;
const childMark = `.timeline-node[data-person-id="${HENRY}"] .family-event-mark.child-birth[data-event-key="${CHILD_KEY}"]`;
const marriageMark = `.timeline-node[data-person-id="${HENRY}"] .marriage-date-marker[data-event-key="${MARRIAGE_KEY}"]`;
const endMark = `.timeline-node[data-person-id="${HENRY}"] .family-event-mark.relationship-end[data-event-key="${END_KEY}"]`;

await command('Page.enable');
await command('Runtime.enable');
await command('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete'", 'page load');
await waitFor(`document.querySelector(${selector(`.timeline-node[data-person-id="${HENRY}"]`)})`, 'Henry VIII node');
await evaluate(`document.querySelector(${selector(`.timeline-node[data-person-id="${HENRY}"]`)}).dispatchEvent(new MouseEvent('click', { bubbles: true })); true`);
await waitFor(`document.querySelector(${selector(rowSelector(CHILD_KEY))})`, 'Henry VIII life-event table');

assert.equal(await evaluate(`document.querySelector('.person-event-table-header').textContent.replace(/\\s+/g, ' ').trim()`), 'Age Event Mark');
const years = await evaluate(`Array.from(document.querySelectorAll('.person-event-row')).map(row => Number(row.dataset.eventYear))`);
assert.deepEqual(years, [...years].sort((a, b) => a - b));
assert.equal(await evaluate(`document.querySelector(${selector(`${rowSelector(MARRIAGE_KEY)} .person-event-age`)}).textContent.trim()`), '18');
assert.ok(await evaluate(`document.querySelectorAll(${selector(childMark)}).length`) > 0);
assert.ok(await evaluate(`document.querySelectorAll(${selector(marriageMark)}).length`) > 0);
assert.ok(await evaluate(`document.querySelectorAll(${selector(endMark)}).length`) > 0);

async function toggleAndCheck(key, markSelector, retainedExpression) {
  const row = rowSelector(key);
  await evaluate(`document.querySelector(${selector(`${row} .person-event-visibility`)}).click(); true`);
  await waitFor(`document.querySelectorAll(${selector(markSelector)}).length === 0`, `${key} mark hidden`);
  assert.equal(await evaluate(`document.querySelector(${selector(`${row} .person-event-visibility`)}).textContent.trim()`), 'Show');
  assert.equal(await evaluate(retainedExpression), true);
  await evaluate(`document.querySelector(${selector(`${row} .person-event-visibility`)}).click(); true`);
  await waitFor(`document.querySelectorAll(${selector(markSelector)}).length > 0`, `${key} mark shown again`);
}

await toggleAndCheck(
  CHILD_KEY,
  childMark,
  `Boolean(document.querySelector(${selector(`.timeline-node[data-person-id="${MARY}"]`)}) && Array.from(document.querySelectorAll('.relationship-row.child strong')).some(node => /Mary/.test(node.textContent)))`
);
await toggleAndCheck(
  MARRIAGE_KEY,
  marriageMark,
  `Array.from(document.querySelectorAll('.relationship-row.spouse strong')).some(node => /Catherine of Aragon/.test(node.textContent))`
);
await toggleAndCheck(
  END_KEY,
  endMark,
  `Array.from(document.querySelectorAll('.relationship-row.spouse strong')).some(node => /Catherine of Aragon/.test(node.textContent))`
);

const personalKey = await evaluate(`Array.from(document.querySelectorAll('.person-event-row[data-event-kind="personal"]')).find(row => /Reign/.test(row.textContent))?.dataset.eventKey || ''`);
assert.ok(personalKey);
const personalRow = rowSelector(personalKey);
const personalMark = `.timeline-node[data-person-id="${HENRY}"] .personal-event-mark[data-event-key="${personalKey}"]`;
await toggleAndCheck(personalKey, personalMark, `Boolean(document.querySelector(${selector(`.timeline-node[data-person-id="${HENRY}"]`)}))`);

console.log(JSON.stringify({ rows: years.length, childKey: CHILD_KEY, marriageKey: MARRIAGE_KEY, endKey: END_KEY, personalKey }));
socket.close();
''', encoding='utf-8')

print('Side-panel life-event patch generated.')
