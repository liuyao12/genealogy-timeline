from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('.')

GENI_IDS = {
    'royal-battenberg-julia-1825': '6000000001434797950',
    'royal-castile-joanna-i-1479': '6000000018001664573',
    'royal-castile-philip-i-1478': '376298089210013354',
    'royal-denmark-anne-catherine-brandenburg-1575': '4104768',
    'royal-denmark-christian-iv-1577': '4104731',
    'royal-denmark-christian-ix-1818': '6000000003065659343',
    'royal-denmark-frederick-ii-1534': '4104556',
    'royal-denmark-frederick-iii-1609': '6000000004377641319',
    'royal-denmark-louise-hesse-kassel-1817': '4134741994550032164',
    'royal-denmark-sophie-amalie-1628': '4104869',
    'royal-denmark-sophie-mecklenburg-1557': '4104601',
    'royal-france-catherine-medici-1519': '6000000001063166988',
    'royal-france-charles-ix-1550': '6000000000307280059',
    'royal-france-claude-1499': '6000000003219788110',
    'royal-france-francis-i-1494': '4695498',
    'royal-france-henry-ii-1519': '6000000001841472088',
    'royal-france-henry-iii-1551': '6000000000307280073',
    'royal-france-henry-iv-1553': '6000000001479508039',
    'royal-france-louis-xiii-1601': '6000000000842892424',
    'royal-france-margaret-valois-1553': '6000000001479578007',
    'royal-france-marie-medici-1575': '6000000000851442057',
    'royal-greece-george-i-1845': '4533621',
    'royal-greece-olga-constantinovna-1851': '6000000001552709924',
    'royal-habsburg-charles-v-1500': '6000000001095643277',
    'royal-habsburg-isabella-portugal-1503': '5405903272180113463',
    'royal-hesse-alexander-1823': '6000000001435086023',
    'royal-hesse-charles-1809': '6000000000307244449',
    'royal-hesse-elisabeth-prussia-1815': '6000000007329601083',
    'royal-hesse-louis-ii-1777': '6000000040699313241',
    'royal-hesse-wilhelmine-baden-1788': '6000000003446622340',
    'royal-orange-amalia-solms-1602': '4040221674860032328',
    'royal-orange-frederick-henry-1584': '4040216435970129981',
    'royal-palatinate-frederick-iv-1574': '6000000006727753675',
    'royal-palatinate-louise-juliana-1576': '6000000006727753685',
    'royal-portugal-catherine-austria-1507': '6000000005597849712',
    'royal-portugal-john-iii-1502': '6000000002756902145',
    'royal-portugal-manuel-i-1469': '6000000001976884495',
    'royal-portugal-maria-aragon-1482': '6000000000830244922',
    'royal-spain-carlos-asturias-1545': '6000000001600066316',
    'royal-spain-isabella-clara-eugenia-1566': '6000000006436641118',
    'royal-spain-philip-iii-1578': '6000000000837486609',
}

BRITISH_MONARCH_COLOR = '#c62828'
OTHER_MONARCH_COLOR = '#3949ab'
PROFILE_ID_RE = re.compile(r'^profile-g?\d+$', re.I)
REFERENCE_ARRAY_FIELDS = [
    'parents', 'children', 'partners', 'spouses', 'nonSpouses',
    'divorcedSpouses', 'geniImmediateFamilyIds',
]
REFERENCE_MAP_FIELDS = [
    'marriageYears', 'relationshipEndYears', 'relationshipEndStatuses',
]


def canonical_profile_id(digits: str) -> str:
    return f"profile-{'g' if len(digits) >= 15 else ''}{digits}"


ID_ALIASES = {old_id: canonical_profile_id(digits) for old_id, digits in GENI_IDS.items()}
assert len(ID_ALIASES) == 41


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one match in {path}, found {count}: {old[:140]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_block(path: str, start_marker: str, end_marker: str, replacement: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding='utf-8')
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'Missing block start in {path}: {start_marker!r}')
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise SystemExit(f'Missing block end in {path}: {end_marker!r}')
    file_path.write_text(text[:start] + replacement + text[end:], encoding='utf-8')


def remap_id(value: object) -> object:
    return ID_ALIASES.get(str(value), value)


def remap_list(value: object) -> list[str]:
    values = value if isinstance(value, list) else []
    return list(dict.fromkeys(str(remap_id(item)) for item in values if item))


def remap_map(value: object) -> dict[str, object]:
    values = value if isinstance(value, dict) else {}
    return {str(remap_id(key)): detail for key, detail in values.items()}


def infer_monarch_group(event: dict[str, object]) -> str:
    explicit = str(event.get('monarchGroup') or '').strip().lower()
    if explicit in {'british', 'other'}:
        return explicit
    name = str(event.get('name') or '')
    if re.search(r'\b(?:England|Scotland|Great Britain|United Kingdom|British|Ireland)\b', name, re.I):
        return 'british'
    if re.match(r'^Reign(?:\s*·|$)', name, re.I):
        return 'british'
    return 'other'


def update_starter_data() -> None:
    path = ROOT / 'data/british-royal-line.json'
    payload = json.loads(path.read_text(encoding='utf-8'))
    original_people = payload['people']
    missing = sorted(set(ID_ALIASES) - set(original_people))
    if missing:
        raise SystemExit(f'Missing local starter profiles: {missing}')
    collisions = sorted(target for old, target in ID_ALIASES.items() if target in original_people and target != old)
    if collisions:
        raise SystemExit(f'Geni target IDs already exist in starter data: {collisions}')

    people: dict[str, dict[str, object]] = {}
    for old_id, raw_person in original_people.items():
        person = dict(raw_person)
        person_id = str(remap_id(old_id))
        person['id'] = person_id
        for field in REFERENCE_ARRAY_FIELDS:
            person[field] = remap_list(person.get(field))
        for field in REFERENCE_MAP_FIELDS:
            person[field] = remap_map(person.get(field))

        existing_source_id = str(person.get('sourceId') or '').strip()
        if not PROFILE_ID_RE.fullmatch(existing_source_id):
            existing_source_id = person_id if PROFILE_ID_RE.fullmatch(person_id) else ''
        if not existing_source_id:
            raise SystemExit(f'{person_id} has no Geni identity after migration')
        person['sourceId'] = existing_source_id
        aliases = [
            str(alias).strip()
            for alias in person.get('geniAliases', [])
            if str(alias).strip()
        ] if isinstance(person.get('geniAliases'), list) else []
        aliases.extend([existing_source_id, person_id])
        person['geniAliases'] = list(dict.fromkeys(alias for alias in aliases if PROFILE_ID_RE.fullmatch(alias)))

        events = []
        for raw_event in person.get('personalEvents', []) if isinstance(person.get('personalEvents'), list) else []:
            event = dict(raw_event)
            name = str(event.get('name') or '').strip()
            if re.match(r'^Tenure\s+as\s+', name, re.I):
                name = re.sub(r'^Tenure\s+as\s+', 'Reign as ', name, flags=re.I)
                event['name'] = name
            if re.match(r'^Reign(?:\b|\s*·)', name, re.I):
                group = infer_monarch_group(event)
                event['kind'] = 'monarch-reign'
                event['monarchGroup'] = group
                event['color'] = BRITISH_MONARCH_COLOR if group == 'british' else OTHER_MONARCH_COLOR
            events.append(event)
        person['personalEvents'] = events
        people[person_id] = person

    payload['people'] = people
    payload['rootId'] = str(remap_id(payload.get('rootId')))
    payload['idAliases'] = dict(sorted(ID_ALIASES.items()))
    payload['version'] = 27

    if len(people) != 168:
        raise SystemExit(f'Expected 168 starter profiles, found {len(people)}')
    if any(key.startswith('royal-') for key in people):
        raise SystemExit('Some local royal-* profile IDs remain')
    for key, person in people.items():
        if not PROFILE_ID_RE.fullmatch(key):
            raise SystemExit(f'Non-Geni starter key remains: {key}')
        if not PROFILE_ID_RE.fullmatch(str(person.get('sourceId') or '')):
            raise SystemExit(f'Profile lacks a Geni sourceId: {key}')
        if not person.get('geniAliases'):
            raise SystemExit(f'Profile lacks Geni aliases: {key}')

    claudes = [(key, person) for key, person in people.items() if str(person.get('displayName') or '').startswith('Claude, Queen of France')]
    if [key for key, _ in claudes] != ['profile-g6000000003219788110']:
        raise SystemExit(f'Unexpected Claude profiles: {[key for key, _ in claudes]}')
    if 'profile-4695498' not in claudes[0][1].get('spouses', []):
        raise SystemExit('Canonical Claude lost her Francis I marriage')

    monarch_events = [
        event
        for person in people.values()
        for event in person.get('personalEvents', [])
        if event.get('kind') == 'monarch-reign'
    ]
    if len(monarch_events) != 51:
        raise SystemExit(f'Expected 51 monarch events, found {len(monarch_events)}')
    if any(str(event.get('name') or '').startswith('Tenure') for event in monarch_events):
        raise SystemExit('A monarch event still uses the Tenure label')
    if {event.get('monarchGroup') for event in monarch_events} != {'british', 'other'}:
        raise SystemExit('Both British and other monarch groups must be present')

    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def update_geni_identity_module() -> None:
    replace_once(
        'geni-identity.js',
        """  const urls = [person?.profile_url, person?.profileUrl, person?.sourceUrl, person?.url]
    .map(canonicalGeniIdentity).filter(Boolean);
  const allowBareId = provider === 'geni' || urls.length > 0 || /^\\d{15,}$/.test(guid);
""",
        """  const urls = [person?.profile_url, person?.profileUrl, person?.sourceUrl, person?.url]
    .map(canonicalGeniIdentity).filter(Boolean);
  // `geniAliases` keeps both the compact API node ID and the public GUID when
  // Geni exposes them together. Either form can therefore match an older
  // starter record or a later API response.
  const explicitAliases = unique([
    ...(Array.isArray(person?.geniAliases) ? person.geniAliases : []),
    ...(Array.isArray(person?.geni_ids) ? person.geni_ids : [])
  ]).map(canonicalGeniIdentity).filter(Boolean);
  const allowBareId = provider === 'geni' || urls.length > 0 || /^\\d{15,}$/.test(guid);
""",
    )
    replace_once(
        'geni-identity.js',
        """  const candidates = [
    idCandidate(person?.sourceId),
""",
        """  const candidates = [
    ...explicitAliases,
    idCandidate(person?.sourceId),
""",
    )
    replace_once(
        'geni-identity.js',
        """  merged.geniNonMaritalBirth = previous.geniNonMaritalBirth === true || incoming.geniNonMaritalBirth === true;
  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(previous.geniParentUnionStatus);
""",
        """  merged.geniAliases = unique([...(previous.geniAliases || []), ...(incoming.geniAliases || [])]);
  merged.geniNonMaritalBirth = previous.geniNonMaritalBirth === true || incoming.geniNonMaritalBirth === true;
  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(previous.geniParentUnionStatus);
""",
    )
    replace_once(
        'geni-identity.js',
        """    if (identity) record.sourceId = identity;
    records[targetId] = mergeIncomingRecords(records[targetId], record);
""",
        """    if (identity) record.sourceId = identity;
    record.geniAliases = unique([
      ...(source.geniAliases || []).map(canonicalGeniIdentity),
      ...geniIdentityCandidates(source, incomingId),
      identity
    ].filter(Boolean));
    records[targetId] = mergeIncomingRecords(records[targetId], record);
""",
    )


def update_geni_model() -> None:
    replace_once('geni-model.js', """export function profileToLineagePerson(raw, fallbackId = '', importedAt = new Date().toISOString()) {
  const id = stableProfileId(raw, fallbackId);
  const birth = raw?.birth || {};
""", """export function profileToLineagePerson(raw, fallbackId = '', importedAt = new Date().toISOString()) {
  const id = stableProfileId(raw, fallbackId);
  const apiId = canonicalGeniProfileId(refId(raw?.id || raw?.url));
  const publicId = profileIdFromGeniInput(raw?.profile_url);
  const guid = clean(raw?.guid);
  const guidId = /^\\d{15,}$/.test(guid) ? `profile-g${guid}` : '';
  const geniAliases = unique([id, apiId, publicId, guidId].filter(Boolean));
  const birth = raw?.birth || {};
""")
    replace_once('geni-model.js', """    sourceProvider: 'geni',
    importedAt,
    geniParentUnionStatus: '',
""", """    sourceProvider: 'geni',
    importedAt,
    geniAliases,
    geniParentUnionStatus: '',
""")
    replace_once('geni-model.js', """  merged.relationshipEndStatuses = { ...(incoming.relationshipEndStatuses || {}), ...(existing.relationshipEndStatuses || {}) };
  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(existing.geniParentUnionStatus);
""", """  merged.relationshipEndStatuses = { ...(incoming.relationshipEndStatuses || {}), ...(existing.relationshipEndStatuses || {}) };
  merged.geniAliases = unique([...(incoming.geniAliases || []), ...(existing.geniAliases || [])]);
  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(existing.geniParentUnionStatus);
""")


def update_app() -> None:
    replace_once('app.js', "import { graphUnionRecords } from './geni-import-core.js?v=3';", "import { graphUnionRecords } from './geni-import-core.js?v=4';")
    replace_once('app.js', "import { duplicateGeniIdentityGroups, remapPeopleByGeniIdentity } from './geni-identity.js?v=1';", "import { duplicateGeniIdentityGroups, remapPeopleByGeniIdentity } from './geni-identity.js?v=2';")
    replace_once('app.js', """const DEFAULT_REIGN_EVENT_COLOR = '#c62828';
const DEFAULT_PERSONAL_EVENT_COLOR = '#1565c0';
""", """const DEFAULT_REIGN_EVENT_COLOR = '#c62828';
const DEFAULT_OTHER_MONARCH_EVENT_COLOR = '#3949ab';
const DEFAULT_PERSONAL_EVENT_COLOR = '#1565c0';
""")
    replace_once('app.js', """  reignColor: DEFAULT_REIGN_EVENT_COLOR,
  timelineYearWidth: DEFAULT_TIMELINE_YEAR_WIDTH,
""", """  reignColor: DEFAULT_REIGN_EVENT_COLOR,
  otherMonarchColor: DEFAULT_OTHER_MONARCH_EVENT_COLOR,
  timelineYearWidth: DEFAULT_TIMELINE_YEAR_WIDTH,
""")
    replace_once('app.js', """  lastAsOfYear: null,
  showDecadeBands: true,
""", """  lastAsOfYear: null,
  showPersonalEvents: true,
  showDecadeBands: true,
""")
    replace_once('app.js', """  'events-dialog', 'close-events-dialog', 'timeline-as-of-toggle', 'timeline-background-toggle', 'timeline-scale-down', 'timeline-scale-value', 'timeline-scale-up', 'timeline-height-down', 'timeline-height-value', 'timeline-height-up', 'global-events-list', 'global-event-name', 'global-event-start', 'global-event-end', 'global-event-color', 'add-global-event',
""", """  'events-dialog', 'close-events-dialog', 'timeline-as-of-toggle', 'timeline-personal-events-toggle', 'timeline-background-toggle', 'timeline-scale-down', 'timeline-scale-value', 'timeline-scale-up', 'timeline-height-down', 'timeline-height-value', 'timeline-height-up', 'global-events-list', 'global-event-name', 'global-event-start', 'global-event-end', 'global-event-color', 'add-global-event',
""")
    replace_once('app.js', """  return sourceId ? {
    sourceId,
    sourceUrl: `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
    sourceProvider: 'geni'
  } : null;
""", """  return sourceId ? {
    sourceId,
    sourceUrl: `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
    sourceProvider: 'geni',
    geniAliases: [sourceId]
  } : null;
""")
    replace_once('app.js', """function geniProfileIdForPerson(person) {
  for (const candidate of [person?.id, person?.sourceId, person?.sourceUrl]) {
""", """function geniProfileIdForPerson(person) {
  for (const candidate of [person?.id, person?.sourceId, ...(person?.geniAliases || []), person?.sourceUrl]) {
""")

    replace_block('app.js', 'function normalizePersonalEvents(events) {', '\n\nfunction normalizeNamePeriods(periods) {', r"""function normalizedMonarchGroup(value) {
  const group = clean(value).toLowerCase().replace(/[\s_-]+/g, '-');
  if (['british', 'britain', 'uk', 'united-kingdom'].includes(group)) return 'british';
  if (['other', 'foreign', 'non-british'].includes(group)) return 'other';
  return '';
}

function canonicalPersonalEventName(event, value) {
  const name = clean(value);
  const source = clean(event?.source).toLowerCase();
  const kind = clean(event?.kind).toLowerCase();
  if ((source === 'royal' || kind === 'monarch-reign') && /^tenure\s+as\s+/i.test(name)) {
    return name.replace(/^tenure\s+as\s+/i, 'Reign as ');
  }
  return name;
}

function isMonarchReignEvent(event) {
  if (typeof event === 'string') return isReignLabel(event);
  return clean(event?.kind).toLowerCase() === 'monarch-reign' || isReignLabel(event?.name);
}

function monarchGroupForEvent(event) {
  const explicit = normalizedMonarchGroup(event?.monarchGroup || event?.monarch_group);
  if (explicit) return explicit;
  const name = clean(typeof event === 'string' ? event : event?.name);
  if (/\b(?:England|Scotland|Great Britain|United Kingdom|British|Ireland)\b/i.test(name)) return 'british';
  if (clean(event?.source).toLowerCase() === 'geni') return 'other';
  return /^reign(?:\s*·|$)/i.test(name) ? 'british' : 'other';
}

function monarchColorForGroup(group) {
  return normalizedMonarchGroup(group) === 'british' ? state.reignColor : state.otherMonarchColor;
}

function personalEventColor(event) {
  return isMonarchReignEvent(event)
    ? monarchColorForGroup(monarchGroupForEvent(event))
    : paletteColor(event?.color, DEFAULT_PERSONAL_EVENT_COLOR);
}

function normalizePersonalEvents(events) {
  const normalized = (Array.isArray(events) ? events : []).map(event => {
    const date = event?.date || event?.event_date || {};
    const rawName = clean(event?.name || event?.title || event?.label || event?.event_type || event?.type);
    const name = canonicalPersonalEventName(event, rawName);
    const startDate = event?.start_date || date?.start || date?.from || {};
    const endDate = event?.end_date || date?.end || date?.to || {};
    const startYear = numericYear(event?.startYear ?? event?.start_year ?? startDate?.year ?? date?.start_year ?? date?.year ?? event?.year);
    const endYear = numericYear(event?.endYear ?? event?.end_year ?? endDate?.year ?? date?.end_year ?? date?.year ?? event?.year);
    const isMonarchReign = clean(event?.kind).toLowerCase() === 'monarch-reign' || isReignLabel(name);
    const monarchGroup = isMonarchReign ? monarchGroupForEvent({ ...event, name }) : '';
    return {
      name,
      startYear,
      endYear: endYear ?? startYear,
      source: clean(event?.source || ''),
      ...(isMonarchReign ? { kind: 'monarch-reign', monarchGroup } : {}),
      color: isMonarchReign
        ? monarchColorForGroup(monarchGroup)
        : paletteColor(event?.color, DEFAULT_PERSONAL_EVENT_COLOR)
    };
  }).filter(event => event.name && event.startYear != null);
  return [...new Map(normalized.map(event => [`${event.name.toLocaleLowerCase()}|${event.startYear}|${event.endYear}`, event])).values()];
}""")
    replace_once('app.js', """    const direct = normalizePersonalEvents([{ name: 'Reign', ...value }])[0];
""", """    const direct = normalizePersonalEvents([{ ...value, name: 'Reign', source: 'geni', kind: 'monarch-reign', monarchGroup: 'other' }])[0];
""")
    replace_once('app.js', """  return { name: 'Reign', startYear: years[0], endYear: years[1] ?? years[0], source: 'geni' };
""", """  return { name: 'Reign', startYear: years[0], endYear: years[1] ?? years[0], source: 'geni', kind: 'monarch-reign', monarchGroup: 'other' };
""")
    replace_once('app.js', """  return normalizePersonalEvents(events).filter(event => isReignLabel(event.name)).map(event => ({ ...event, source: 'geni' }));
""", """  return normalizePersonalEvents(events).filter(isMonarchReignEvent).map(event => ({ ...event, source: 'geni', kind: 'monarch-reign', monarchGroup: 'other' }));
""")
    replace_once('app.js', """function reignEvents(person) {
  return person.personalEvents.filter(event => isReignLabel(event.name));
}
""", """function reignEvents(person) {
  return person.personalEvents.filter(isMonarchReignEvent);
}
""")
    replace_once('app.js', """    importedAt: clean(source.importedAt || source.provenance?.importedAt),
    geniParentUnionStatus: clean(source.geniParentUnionStatus || source.parentUnionStatus || source.parent_union_status).toLowerCase().replace(/[\\s-]+/g, '_'),
""", """    importedAt: clean(source.importedAt || source.provenance?.importedAt),
    geniAliases: unique([
      profileIdFromInput(source.sourceId),
      ...array(source.geniAliases || source.geni_ids || source.geniIds).map(profileIdFromInput)
    ].filter(Boolean)),
    geniParentUnionStatus: clean(source.geniParentUnionStatus || source.parentUnionStatus || source.parent_union_status).toLowerCase().replace(/[\\s-]+/g, '_'),
""")

    replace_once('app.js', """  state.people = createBritishRoyalSample();
  state.globalEvents = createBritishHistoryEvents();
  state.asOfYear = null;
  state.lastAsOfYear = null;
""", """  state.reignColor = DEFAULT_REIGN_EVENT_COLOR;
  state.otherMonarchColor = DEFAULT_OTHER_MONARCH_EVENT_COLOR;
  state.showPersonalEvents = true;
  state.people = createBritishRoyalSample();
  state.globalEvents = createBritishHistoryEvents();
  state.asOfYear = null;
  state.lastAsOfYear = null;
""")
    replace_once('app.js', """  if (!isBundledLine) return false;

  const bundledPeople = createBritishRoyalSample();
""", """  if (!isBundledLine) return false;

  // Version 27 replaces every local royal-* identifier with its Geni identity.
  // If a Geni API import already created the canonical profile, merge the old
  // starter node into that survivor before adding the refreshed starter data.
  migrateBundledStarterProfileIds();
  const bundledPeople = createBritishRoyalSample();
""")
    replace_once('app.js', """    normalized.id = remap(oldId);
    normalized.sourceId = remap(normalized.sourceId);
    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'].forEach(field => {
""", """    normalized.id = remap(oldId);
    normalized.sourceId = remap(normalized.sourceId);
    normalized.geniAliases = unique((normalized.geniAliases || []).map(alias => profileIdFromInput(alias)).filter(Boolean));
    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'].forEach(field => {
""")
    replace_once('app.js', """    globalEvents: state.globalEvents, reignColor: state.reignColor,
    timelineYearWidth: state.timelineYearWidth, timelineNodeHeight: state.timelineNodeHeight,
    asOfYear: state.asOfYear, lastAsOfYear: state.lastAsOfYear,
    showDecadeBands: state.showDecadeBands, treeFilter: state.treeFilter, relationVisibility: state.relationVisibility,
""", """    globalEvents: state.globalEvents, reignColor: state.reignColor, otherMonarchColor: state.otherMonarchColor,
    timelineYearWidth: state.timelineYearWidth, timelineNodeHeight: state.timelineNodeHeight,
    asOfYear: state.asOfYear, lastAsOfYear: state.lastAsOfYear,
    showPersonalEvents: state.showPersonalEvents, showDecadeBands: state.showDecadeBands,
    treeFilter: state.treeFilter, relationVisibility: state.relationVisibility,
""")
    replace_block('app.js', 'function applyTreeSnapshot(saved) {', '\n\nfunction restore() {', r"""function applyTreeSnapshot(saved) {
  const savedRootId = /^profile-/i.test(clean(saved.rootId)) ? canonicalGeniProfileId(saved.rootId) : clean(saved.rootId);
  // Set shared colours before normalizing profile events so the persisted
  // British and other-monarch palettes are applied consistently on load.
  state.reignColor = paletteColor(saved.reignColor, DEFAULT_REIGN_EVENT_COLOR);
  state.otherMonarchColor = paletteColor(saved.otherMonarchColor, DEFAULT_OTHER_MONARCH_EVENT_COLOR);
  const migratedPeople = migrateGeniPeople(saved.people);
  const migratedVisibility = migrateRelationVisibility(saved.relationVisibility);
  state.title = clean(saved.title) || 'Untitled family';
  state.rootId = savedRootId;
  state.timelineYearWidth = timelineYearWidth(saved.timelineYearWidth);
  state.timelineNodeHeight = timelineNodeHeight(saved.timelineNodeHeight);
  state.asOfYear = numericYear(saved.asOfYear);
  state.lastAsOfYear = numericYear(saved.lastAsOfYear ?? saved.asOfYear);
  state.showPersonalEvents = saved.showPersonalEvents !== false;
  state.showDecadeBands = saved.showDecadeBands !== false;
  state.treeFilter = clean(saved.treeFilter);
  if (!state.treeFilter && savedRootId === profileIdFromInput(HENRY_VII_GENI_URL)) state.treeFilter = 'king queen';
  state.relationVisibility = migratedVisibility.relationVisibility;
  state.starterDataVersion = Number.parseInt(saved.starterDataVersion, 10) || 0;
  state.manualTree = saved.manualTree === true;
  state.globalEvents = normalizeGlobalEvents(saved.globalEvents || saved.timelineEvents);
  state.people = migratedPeople.people;
  state.collapsedIds = new Set(array(saved.collapsedIds));
  state.zoom = Math.min(1.8, Math.max(.45, Number(saved.zoom) || 1));
  state.selectedId = '';
  state.editingProfileId = '';
  state.ephemeral = false;
  pendingTimelineViewport = Object.hasOwn(saved, 'viewportLeft') || Object.hasOwn(saved, 'viewportTop') ? {
    left: Math.max(0, Number(saved.viewportLeft) || 0),
    top: Math.max(0, Number(saved.viewportTop) || 0)
  } : null;
  timelineViewportInitialized = false;
  return migratedPeople.migrated || migratedVisibility.migrated || savedRootId !== clean(saved.rootId);
}""")

    replace_once('app.js', """    aliases[rawId] = id;
    profileMap[id] = { ...profile, id };
""", """    aliases[rawId] = id;
    profileMap[id] = {
      ...profile,
      id,
      geniAliases: unique([...(profile.geniAliases || []), rawId, id].map(profileIdFromInput).filter(Boolean))
    };
""")
    replace_once('app.js', """  merged.sourceProvider = incoming.sourceProvider || existing.sourceProvider;
  merged.importedAt = incoming.importedAt || existing.importedAt;
  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(existing.geniParentUnionStatus);
""", """  merged.sourceProvider = incoming.sourceProvider || existing.sourceProvider;
  merged.importedAt = incoming.importedAt || existing.importedAt;
  merged.geniAliases = unique([...(incoming.geniAliases || []), ...(existing.geniAliases || [])]);
  merged.geniParentUnionStatus = clean(incoming.geniParentUnionStatus) || clean(existing.geniParentUnionStatus);
""")

    replace_block('app.js', 'function coalesceDuplicateGeniProfiles(preferredId = \'\') {', '\n\nfunction mergeGeniRecordsIntoCurrentTree(records) {', r"""function rewriteStateProfileIds(replacements) {
  const replacementIds = Object.keys(replacements || {});
  if (!replacementIds.length) return 0;
  const resolve = id => replacements[id] || id;
  Object.values(state.people).forEach(person => {
    GENI_REFERENCE_ARRAY_FIELDS.forEach(field => {
      person[field] = unique((person[field] || []).map(resolve).filter(id => id && id !== person.id));
    });
    GENI_REFERENCE_MAP_FIELDS.forEach(field => {
      const mapped = {};
      Object.entries(person[field] || {}).forEach(([relativeId, value]) => {
        const targetId = resolve(relativeId);
        if (targetId && targetId !== person.id) mapped[targetId] = value;
      });
      person[field] = mapped;
    });
  });
  state.rootId = resolve(state.rootId);
  state.selectedId = resolve(state.selectedId);
  state.editingProfileId = resolve(state.editingProfileId);
  state.collapsedIds = new Set([...state.collapsedIds].map(resolve));
  if (state.geniImport?.profileId) state.geniImport.profileId = resolve(state.geniImport.profileId);
  const relationVisibility = {};
  Object.entries(state.relationVisibility).forEach(([key, value]) => {
    relationVisibility[remapRelationVisibilityKey(key, replacements)] = value;
  });
  state.relationVisibility = relationVisibility;
  return replacementIds.length;
}

function coalesceDuplicateGeniProfiles(preferredId = '') {
  const replacements = {};
  duplicateGeniIdentityGroups(state.people).forEach(({ ids }) => {
    const survivor = [preferredId, state.rootId, state.selectedId]
      .find(id => ids.includes(id))
      || ids.find(id => !/^profile-g?\d+$/i.test(id))
      || ids[0];
    let merged = state.people[survivor];
    ids.filter(id => id !== survivor).forEach(duplicateId => {
      merged = mergePersonRecords(merged, { ...state.people[duplicateId], id: survivor });
      replacements[duplicateId] = survivor;
      delete state.people[duplicateId];
    });
    state.people[survivor] = merged;
  });
  return rewriteStateProfileIds(replacements);
}

function bundledStarterIdAliases() {
  return Object.fromEntries(Object.entries(britishRoyalStarterData?.idAliases || {}).map(([oldId, targetId]) => [
    clean(oldId),
    /^profile-/i.test(clean(targetId)) ? canonicalGeniProfileId(targetId) : clean(targetId)
  ]).filter(([oldId, targetId]) => oldId && targetId));
}

function migrateBundledStarterProfileIds() {
  const replacements = {};
  Object.entries(bundledStarterIdAliases()).forEach(([oldId, targetId]) => {
    const source = state.people[oldId];
    if (!source || oldId === targetId) return;
    const identity = profileIdFromInput(targetId);
    const incoming = normalizePerson({
      ...source,
      id: targetId,
      sourceId: identity || source.sourceId,
      geniAliases: unique([...(source.geniAliases || []), identity].filter(Boolean))
    }, targetId);
    const existingTarget = state.people[targetId];
    if (existingTarget) {
      const apiPlainName = [existingTarget.firstName, existingTarget.lastName].filter(Boolean).join(' ');
      const targetLooksLikeRawGeni = existingTarget.importedAt
        && (!clean(existingTarget.displayName) || clean(existingTarget.displayName) === apiPlainName);
      state.people[targetId] = targetLooksLikeRawGeni
        ? mergePersonRecords(incoming, existingTarget)
        : mergePersonRecords(existingTarget, incoming);
    } else {
      state.people[targetId] = incoming;
    }
    state.people[targetId].id = targetId;
    if (identity) {
      state.people[targetId].sourceId = identity;
      state.people[targetId].geniAliases = unique([...(state.people[targetId].geniAliases || []), identity]);
    }
    delete state.people[oldId];
    replacements[oldId] = targetId;
  });
  const migrated = rewriteStateProfileIds(replacements);
  return migrated + coalesceDuplicateGeniProfiles();
}""")

    replace_once('app.js', """    const hasReign = reignEvents(person).length > 0;
""", """    const hasReign = state.showPersonalEvents && reignEvents(person).length > 0;
""")
    replace_once('app.js', """    person.personalEvents.forEach(event => {
""", """    if (state.showPersonalEvents) person.personalEvents.forEach(event => {
""")
    replace_once('app.js', """      const eventColor = isReignLabel(event.name) ? state.reignColor : paletteColor(event.color, DEFAULT_PERSONAL_EVENT_COLOR);
""", """      const eventColor = personalEventColor(event);
""")
    replace_once('app.js', """    group.append(nodeShape({ class: 'lifespan-outline' }));
    group.append(personalEventLayer);
""", """    group.append(nodeShape({ class: 'lifespan-outline' }));
    if (state.showPersonalEvents) group.append(personalEventLayer);
""")

    replace_block('app.js', 'function setSharedReignColor(value) {', '\n\nfunction rowActionButton', r"""function applySharedMonarchColor(group, value) {
  const normalizedGroup = normalizedMonarchGroup(group) || 'other';
  const stateKey = normalizedGroup === 'british' ? 'reignColor' : 'otherMonarchColor';
  const fallback = normalizedGroup === 'british' ? DEFAULT_REIGN_EVENT_COLOR : DEFAULT_OTHER_MONARCH_EVENT_COLOR;
  state[stateKey] = paletteColor(value, fallback);
  Object.values(state.people).forEach(person => person.personalEvents.forEach(event => {
    if (isMonarchReignEvent(event) && monarchGroupForEvent(event) === normalizedGroup) {
      event.kind = 'monarch-reign';
      event.monarchGroup = normalizedGroup;
      event.color = state[stateKey];
    }
  }));
  return state[stateKey];
}

function setSharedMonarchColor(group, value) {
  const normalizedGroup = normalizedMonarchGroup(group) || 'other';
  applySharedMonarchColor(normalizedGroup, value);
  persist(`${normalizedGroup === 'british' ? 'British' : 'Other-monarch'} reign colour saved`);
  render();
}""")
    replace_once('app.js', """function eventEditorRow(event, onSave, onColor, onDelete, fallback = DEFAULT_PERSONAL_EVENT_COLOR, prefix = '') {
""", """function eventEditorRow(event, onSave, onColor, onDelete, fallback = DEFAULT_PERSONAL_EVENT_COLOR, prefix = '', personal = false) {
""")
    replace_once('app.js', """  const color = eventColorPalette(isReignLabel(event.name) ? state.reignColor : event.color, `Colour for ${event.name}`, onColor, fallback);
""", """  const monarchGroup = personal && isMonarchReignEvent(event) ? monarchGroupForEvent(event) : '';
  const eventFallback = monarchGroup === 'british' ? DEFAULT_REIGN_EVENT_COLOR
    : monarchGroup === 'other' ? DEFAULT_OTHER_MONARCH_EVENT_COLOR : fallback;
  const displayedColor = personal ? personalEventColor(event) : paletteColor(event.color, fallback);
  const color = eventColorPalette(displayedColor, `Colour for ${event.name}`, onColor, eventFallback);
""")
    replace_once('app.js', """    const draftColor = eventColorPalette(isReignLabel(event.name) ? state.reignColor : event.color, `Colour for ${event.name}`, () => {}, fallback);
""", """    const draftColor = eventColorPalette(displayedColor, `Colour for ${event.name}`, () => {}, eventFallback);
""")
    replace_block('app.js', 'function renderPersonalEvents(person) {', '\n\nfunction renderGlobalEventsEditor() {', r"""function renderPersonalEvents(person) {
  const list = els['personal-events-list'];
  if (!person?.personalEvents?.length) {
    const empty = document.createElement('span');
    empty.className = 'event-editor-empty';
    empty.textContent = 'No personal events yet.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...person.personalEvents.map((event, index) => eventEditorRow(event, updated => {
    if (isReignLabel(updated.name)) {
      updated.kind = 'monarch-reign';
      updated.monarchGroup = monarchGroupForEvent({ ...updated, monarchGroup: '' });
      applySharedMonarchColor(updated.monarchGroup, updated.color);
    } else {
      delete updated.kind;
      delete updated.monarchGroup;
    }
    person.personalEvents[index] = updated;
    person.personalEvents = normalizePersonalEvents(person.personalEvents);
    persist('Personal event saved');
    render();
  }, value => {
    if (isMonarchReignEvent(event)) return setSharedMonarchColor(monarchGroupForEvent(event), value);
    person.personalEvents[index].color = paletteColor(value, DEFAULT_PERSONAL_EVENT_COLOR);
    persist('Event colour saved');
    render();
  }, () => {
    person.personalEvents.splice(index, 1);
    persist('Personal event deleted');
    render();
  }, DEFAULT_PERSONAL_EVENT_COLOR, personalEventAgePrefix(person, event), true)));
}""")

    replace_once('app.js', """  syncToggle(els['timeline-as-of-toggle'], state.asOfYear != null);
  syncToggle(els['timeline-background-toggle'], state.showDecadeBands);
""", """  syncToggle(els['timeline-as-of-toggle'], state.asOfYear != null);
  syncToggle(els['timeline-personal-events-toggle'], state.showPersonalEvents);
  syncToggle(els['timeline-background-toggle'], state.showDecadeBands);
""")
    replace_once('app.js', """function toggleDecadeBackground() {
""", """function togglePersonalEvents() {
  state.showPersonalEvents = !state.showPersonalEvents;
  persist(`Personal events turned ${state.showPersonalEvents ? 'on' : 'off'}`);
  render();
  syncTimelineSettingControls();
}

function toggleDecadeBackground() {
""")
    replace_once('app.js', """els['timeline-as-of-toggle'].addEventListener('click', toggleHistoricalSnapshot);
els['timeline-background-toggle'].addEventListener('click', toggleDecadeBackground);
""", """els['timeline-as-of-toggle'].addEventListener('click', toggleHistoricalSnapshot);
els['timeline-personal-events-toggle'].addEventListener('click', togglePersonalEvents);
els['timeline-background-toggle'].addEventListener('click', toggleDecadeBackground);
""")

    replace_once('app.js', """  state.globalEvents = [];
  state.asOfYear = null;
  state.lastAsOfYear = null;
  state.showDecadeBands = true;
""", """  state.globalEvents = [];
  state.reignColor = DEFAULT_REIGN_EVENT_COLOR;
  state.otherMonarchColor = DEFAULT_OTHER_MONARCH_EVENT_COLOR;
  state.asOfYear = null;
  state.lastAsOfYear = null;
  state.showPersonalEvents = true;
  state.showDecadeBands = true;
""")

    replace_block('app.js', "els['add-personal-event'].addEventListener('click', () => {", "\ndocument.addEventListener('keydown', event => {", r"""els['add-personal-event'].addEventListener('click', () => {
  const person = state.people[state.selectedId];
  if (!person) return;
  const name = clean(els['personal-event-name'].value);
  const startYear = numericYear(els['personal-event-start'].value);
  const endYear = numericYear(els['personal-event-end'].value) ?? startYear;
  if (!name || startYear == null) return toast('Enter a personal event name and start year.', true);
  const event = {
    name,
    startYear: Math.min(startYear, endYear),
    endYear: Math.max(startYear, endYear),
    color: paletteColor(els['personal-event-color'].value, DEFAULT_PERSONAL_EVENT_COLOR),
    source: 'local'
  };
  if (isReignLabel(name)) {
    event.kind = 'monarch-reign';
    event.monarchGroup = monarchGroupForEvent(event);
    event.color = applySharedMonarchColor(event.monarchGroup, els['personal-event-color'].value);
  }
  person.personalEvents = normalizePersonalEvents([...person.personalEvents, event]);
  els['personal-event-name'].value = '';
  els['personal-event-start'].value = '';
  els['personal-event-end'].value = '';
  persist('Personal event added');
  render();
});""")
    replace_block('app.js', 'let personalColorForReign = false;', '\n\nawait loadBritishRoyalStarterData();', r"""let personalEventColorMode = 'personal';
els['personal-event-name'].addEventListener('input', () => {
  const name = clean(els['personal-event-name'].value);
  const mode = isReignLabel(name) ? monarchGroupForEvent({ name, source: 'local' }) : 'personal';
  if (mode === personalEventColorMode) return;
  personalEventColorMode = mode;
  const color = mode === 'british' ? state.reignColor
    : mode === 'other' ? state.otherMonarchColor : DEFAULT_PERSONAL_EVENT_COLOR;
  const fallback = mode === 'british' ? DEFAULT_REIGN_EVENT_COLOR
    : mode === 'other' ? DEFAULT_OTHER_MONARCH_EVENT_COLOR : DEFAULT_PERSONAL_EVENT_COLOR;
  updateEventColorPalette(els['personal-event-color'], color, fallback);
});""")

    replace_once('app.js', """  state.reignColor = paletteColor(payload.reignColor || payload.db?.reignColor, DEFAULT_REIGN_EVENT_COLOR);
  state.timelineYearWidth = timelineYearWidth(payload.timelineYearWidth || payload.db?.timelineYearWidth);
""", """  state.reignColor = paletteColor(payload.reignColor || payload.db?.reignColor, DEFAULT_REIGN_EVENT_COLOR);
  state.otherMonarchColor = paletteColor(payload.otherMonarchColor || payload.db?.otherMonarchColor, DEFAULT_OTHER_MONARCH_EVENT_COLOR);
  state.showPersonalEvents = (payload.showPersonalEvents ?? payload.db?.showPersonalEvents) !== false;
  state.timelineYearWidth = timelineYearWidth(payload.timelineYearWidth || payload.db?.timelineYearWidth);
""")
    replace_once('app.js', """    title: state.title, activeRootId: state.rootId, people: state.people, globalEvents: state.globalEvents, reignColor: state.reignColor, timelineYearWidth: state.timelineYearWidth, timelineNodeHeight: state.timelineNodeHeight, asOfYear: state.asOfYear, treeFilter: state.treeFilter, relationVisibility: state.relationVisibility, manualTree: state.manualTree,
""", """    title: state.title, activeRootId: state.rootId, people: state.people, globalEvents: state.globalEvents,
    reignColor: state.reignColor, otherMonarchColor: state.otherMonarchColor, showPersonalEvents: state.showPersonalEvents,
    timelineYearWidth: state.timelineYearWidth, timelineNodeHeight: state.timelineNodeHeight, asOfYear: state.asOfYear, treeFilter: state.treeFilter, relationVisibility: state.relationVisibility, manualTree: state.manualTree,
""")


def update_core_and_imports() -> None:
    replace_once('geni-import-core.js', "from './geni-model.js?v=3';", "from './geni-model.js?v=4';")
    replace_once('geni-import-core.js', """    reignColor: '#c62828',
    timelineYearWidth: 4,
""", """    reignColor: '#c62828',
    otherMonarchColor: '#3949ab',
    showPersonalEvents: true,
    showDecadeBands: true,
    timelineYearWidth: 4,
""")
    replace_once('geni-import.js', "from './geni-model.js?v=3';", "from './geni-model.js?v=4';")
    replace_once('geni-import.js', "from './geni-import-core.js?v=3';", "from './geni-import-core.js?v=4';")


def update_index() -> None:
    replace_once('index.html', """        <div class="timeline-toggle-setting">
          <span class="timeline-toggle-label">Decade background<small>Alternating white and light-gray decades</small></span>
          <button class="timeline-setting-toggle" id="timeline-background-toggle" type="button" aria-pressed="true">On</button>
        </div>
""", """        <div class="timeline-toggle-setting">
          <span class="timeline-toggle-label">Personal events<small>Show or hide every personal-event band together</small></span>
          <button class="timeline-setting-toggle" id="timeline-personal-events-toggle" type="button" aria-pressed="true">On</button>
        </div>
        <div class="timeline-toggle-setting">
          <span class="timeline-toggle-label">Decade background<small>Alternating white and light-gray decades</small></span>
          <button class="timeline-setting-toggle" id="timeline-background-toggle" type="button" aria-pressed="true">On</button>
        </div>
""")
    replace_once('index.html', '<script type="module" src="./geni-import.js?v=3"></script>', '<script type="module" src="./geni-import.js?v=4"></script>')
    replace_once('index.html', '<script type="module" src="./app.js?v=142"></script>', '<script type="module" src="./app.js?v=143"></script>')


def update_tests() -> None:
    path = ROOT / 'tests/foreign-royal-branches.test.mjs'
    text = path.read_text(encoding='utf-8')
    text = text.replace("test('the expanded bundled example advances to version 26'", "test('the expanded bundled example advances to version 27'", 1)
    text = text.replace('assert.equal(starter.version, 26);', 'assert.equal(starter.version, 27);', 1)
    path.write_text(text, encoding='utf-8')

    identity_path = ROOT / 'tests/geni-identity.test.mjs'
    identity = identity_path.read_text(encoding='utf-8')
    identity += r"""

test('matches a compact starter Geni alias to a later public-GUID API record', () => {
  const existing = {
    francis: {
      id: 'profile-4695498',
      sourceId: 'profile-4695498',
      geniAliases: ['profile-4695498'],
      displayName: 'Francis I, King of France'
    }
  };
  const incoming = {
    'profile-g6000000999999999999': {
      id: 'profile-g6000000999999999999',
      sourceId: 'profile-g6000000999999999999',
      geniAliases: ['profile-4695498', 'profile-g6000000999999999999'],
      displayName: 'François I',
      parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [],
      marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, geniImmediateFamilyIds: []
    }
  };
  const remapped = remapPeopleByGeniIdentity(incoming, existing);
  assert.equal(remapped.idMap['profile-g6000000999999999999'], 'francis');
  assert.ok(remapped.people.francis);
  assert.deepEqual(remapped.people.francis.geniAliases.sort(), [
    'profile-4695498',
    'profile-g6000000999999999999'
  ]);
});
"""
    identity_path.write_text(identity, encoding='utf-8')

    import_test_path = ROOT / 'tests/geni-import.test.mjs'
    import_test = import_test_path.read_text(encoding='utf-8')
    anchor = """  assert.equal(person.place, '');
  assert.doesNotMatch(JSON.stringify(person), /Beijing|San Francisco|\"month\"|\"day\"/);
"""
    replacement = """  assert.equal(person.place, '');
  assert.deepEqual(person.geniAliases.sort(), ['profile-42', 'profile-g6000000000000000042']);
  assert.doesNotMatch(JSON.stringify(person), /Beijing|San Francisco|\"month\"|\"day\"/);
"""
    if import_test.count(anchor) != 1:
        raise SystemExit(f'Expected one Geni profile test anchor, found {import_test.count(anchor)}')
    import_test_path.write_text(import_test.replace(anchor, replacement, 1), encoding='utf-8')

    (ROOT / 'tests/starter-geni-monarch-events.test.mjs').write_text(r"""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duplicateGeniIdentityGroups, primaryGeniIdentity } from '../geni-identity.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;

function byName(name) {
  const entries = Object.entries(people).filter(([, person]) => person.displayName === name);
  assert.equal(entries.length, 1, `expected one profile named ${name}`);
  return entries[0];
}

test('every bundled profile is keyed and indexed by a Geni identity', () => {
  assert.equal(Object.keys(starter.idAliases || {}).length, 41);
  assert.equal(Object.keys(people).length, 168);
  for (const [id, person] of Object.entries(people)) {
    assert.match(id, /^profile-g?\d+$/i, `${person.displayName} has a non-Geni key`);
    assert.match(person.sourceId || '', /^profile-g?\d+$/i, `${person.displayName} lacks a Geni sourceId`);
    assert.ok(person.geniAliases?.includes(person.sourceId), `${person.displayName} lacks its sourceId alias`);
    assert.ok(primaryGeniIdentity(person, id), `${person.displayName} is not indexable by Geni identity`);
  }
  assert.deepEqual(duplicateGeniIdentityGroups(people), []);
});

test('Claude is represented once by her Geni profile and retains the Francis I marriage', () => {
  const [claudeId, claude] = byName('Claude, Queen of France and Duchess of Brittany');
  const [francisId, francis] = byName('Francis I, King of France');
  assert.equal(claudeId, 'profile-g6000000003219788110');
  assert.equal(francisId, 'profile-4695498');
  assert.equal(starter.idAliases['royal-france-claude-1499'], claudeId);
  assert.ok(claude.spouses.includes(francisId));
  assert.ok(francis.spouses.includes(claudeId));
  assert.equal(people['royal-france-claude-1499'], undefined);
});

test('all monarch events use one kind, two synchronized groups, and distinct colours', () => {
  const events = Object.values(people).flatMap(person => person.personalEvents || []);
  const monarchEvents = events.filter(event => event.kind === 'monarch-reign');
  assert.equal(monarchEvents.length, 51);
  assert.equal(monarchEvents.every(event => /^Reign(?:\b|\s*·)/i.test(event.name)), true);
  assert.equal(monarchEvents.every(event => ['british', 'other'].includes(event.monarchGroup)), true);
  assert.equal(monarchEvents.every(event => event.color === (event.monarchGroup === 'british' ? '#c62828' : '#3949ab')), true);
  assert.equal(monarchEvents.some(event => event.monarchGroup === 'british'), true);
  assert.equal(monarchEvents.some(event => event.monarchGroup === 'other'), true);
  assert.equal(monarchEvents.some(event => /^Tenure\b/i.test(event.name)), false);
});

test('the application exposes one personal-event toggle and two shared monarch palettes', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="timeline-personal-events-toggle"/);
  assert.match(app, /showPersonalEvents: true/);
  assert.match(app, /DEFAULT_OTHER_MONARCH_EVENT_COLOR = '#3949ab'/);
  assert.match(app, /function setSharedMonarchColor\(group, value\)/);
  assert.match(app, /if \(state\.showPersonalEvents\) group\.append\(personalEventLayer\)/);
});
""", encoding='utf-8')


def write_browser_check() -> None:
    (ROOT / '.github/scripts/check_claude_monarch_events.mjs').write_text(r"""import assert from 'node:assert/strict';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const port = Number(process.argv[3] || 9222);

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function json(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Could not reach ${url}`);
}

const target = (await json(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`)).webSocketDebuggerUrl;
const socket = new WebSocket(target);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
});
function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

await send('Page.enable');
await send('Runtime.enable');
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.timeline-node').length > 0");

const initial = await evaluate(`(() => {
  const workspace = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
  const tree = workspace.trees.find(item => item.id === workspace.activeTreeId);
  const entries = Object.entries(tree.people);
  const idByName = name => entries.find(([, person]) => person.displayName === name)?.[0] || '';
  const nodeStrokes = name => {
    const id = idByName(name);
    const node = document.querySelector('.timeline-node[data-person-id="' + CSS.escape(id) + '"]');
    return node ? [...node.querySelectorAll('.personal-event-edge,.personal-event-point')].map(mark => mark.getAttribute('stroke')) : [];
  };
  return {
    version: tree.starterDataVersion,
    claudes: entries.filter(([, person]) => person.displayName?.startsWith('Claude, Queen of France')).map(([id]) => id),
    oldClaude: Boolean(tree.people['royal-france-claude-1499']),
    claudeSpouses: tree.people['profile-g6000000003219788110']?.spouses || [],
    britishStrokes: nodeStrokes('Henry VIII, King of England'),
    otherStrokes: nodeStrokes('Charles IX, King of France'),
    eventLayers: document.querySelectorAll('.personal-event-layer').length,
    togglePressed: document.getElementById('timeline-personal-events-toggle')?.getAttribute('aria-pressed')
  };
})()`);
assert.equal(initial.version, 27);
assert.deepEqual(initial.claudes, ['profile-g6000000003219788110']);
assert.equal(initial.oldClaude, false);
assert.ok(initial.claudeSpouses.includes('profile-4695498'));
assert.ok(initial.britishStrokes.length > 0);
assert.ok(initial.britishStrokes.every(color => color === '#c62828'));
assert.ok(initial.otherStrokes.length > 0);
assert.ok(initial.otherStrokes.every(color => color === '#3949ab'));
assert.ok(initial.eventLayers > 0);
assert.equal(initial.togglePressed, 'true');

await evaluate("document.getElementById('timeline-personal-events-toggle').click(); true");
await waitFor("document.querySelectorAll('.personal-event-layer').length === 0");
const hidden = await evaluate(`({
  layers: document.querySelectorAll('.personal-event-layer').length,
  pressed: document.getElementById('timeline-personal-events-toggle').getAttribute('aria-pressed'),
  saved: JSON.parse(localStorage.getItem('lineage-tree-workspace-v1')).trees.find(tree => tree.id === JSON.parse(localStorage.getItem('lineage-tree-workspace-v1')).activeTreeId).showPersonalEvents
})`);
assert.deepEqual(hidden, { layers: 0, pressed: 'false', saved: false });
await evaluate("document.getElementById('timeline-personal-events-toggle').click(); true");
await waitFor("document.querySelectorAll('.personal-event-layer').length > 0");

const legacyWorkspace = await evaluate(`(() => {
  const root = 'profile-g6000000003760873898';
  const emptyRelations = { parents: [], children: [], partners: [], spouses: [], nonSpouses: [], divorcedSpouses: [], marriageYears: {}, relationshipEndYears: {}, relationshipEndStatuses: {}, personalEvents: [], namePeriods: [] };
  const people = {
    [root]: { ...emptyRelations, id: root, displayName: 'Henry VII, King of England', gender: 'male', birthYear: '1457', deathYear: '1509', sourceId: root, sourceProvider: 'geni', starterProfile: true },
    'royal-france-claude-1499': { ...emptyRelations, id: 'royal-france-claude-1499', displayName: 'Claude, Queen of France and Duchess of Brittany', birthYear: '1499', deathYear: '1524', spouses: ['royal-france-francis-i-1494'], partners: ['royal-france-francis-i-1494'], sourceProvider: 'web', starterProfile: true },
    'royal-france-francis-i-1494': { ...emptyRelations, id: 'royal-france-francis-i-1494', displayName: 'Francis I, King of France', birthYear: '1494', deathYear: '1547', spouses: ['royal-france-claude-1499'], partners: ['royal-france-claude-1499'], sourceProvider: 'web', starterProfile: true },
    'profile-g6000000003219788110': { ...emptyRelations, id: 'profile-g6000000003219788110', displayName: 'Claude de France', firstName: 'Claude', lastName: 'de France', birthYear: '1499', deathYear: '1524', sourceId: 'profile-g6000000003219788110', sourceProvider: 'geni', importedAt: '2026-09-08T00:00:00.000Z' }
  };
  const workspace = { version: 1, activeTreeId: 'legacy-tree', trees: [{
    id: 'legacy-tree', title: 'The British royal line from Henry VII', rootId: root, people,
    globalEvents: [], reignColor: '#c62828', timelineYearWidth: 4, timelineNodeHeight: 28,
    asOfYear: null, treeFilter: 'king queen', relationVisibility: {}, starterDataVersion: 26,
    manualTree: false, collapsedIds: [], zoom: 1, viewportLeft: 0, viewportTop: 0
  }] };
  localStorage.setItem('lineage-tree-workspace-v1', JSON.stringify(workspace));
  location.reload();
  return true;
})()`);
assert.equal(legacyWorkspace, true);
await waitFor("document.readyState === 'complete' && JSON.parse(localStorage.getItem('lineage-tree-workspace-v1')).trees[0].starterDataVersion === 27", 20000);
const migrated = await evaluate(`(() => {
  const workspace = JSON.parse(localStorage.getItem('lineage-tree-workspace-v1'));
  const tree = workspace.trees.find(item => item.id === workspace.activeTreeId);
  const claudes = Object.entries(tree.people).filter(([, person]) => /Claude/.test(person.displayName || ''));
  return {
    oldClaude: Boolean(tree.people['royal-france-claude-1499']),
    oldFrancis: Boolean(tree.people['royal-france-francis-i-1494']),
    canonicalClaude: Boolean(tree.people['profile-g6000000003219788110']),
    claudeIdentityCount: claudes.filter(([, person]) => (person.geniAliases || []).includes('profile-g6000000003219788110') || person.sourceId === 'profile-g6000000003219788110').length,
    spouses: tree.people['profile-g6000000003219788110']?.spouses || [],
    version: tree.starterDataVersion
  };
})()`);
assert.equal(migrated.oldClaude, false);
assert.equal(migrated.oldFrancis, false);
assert.equal(migrated.canonicalClaude, true);
assert.equal(migrated.claudeIdentityCount, 1);
assert.ok(migrated.spouses.includes('profile-4695498'));
assert.equal(migrated.version, 27);

console.log(JSON.stringify({ initial, hidden, migrated }));
socket.close();
""", encoding='utf-8')


def main() -> None:
    update_starter_data()
    update_geni_identity_module()
    update_geni_model()
    update_app()
    update_core_and_imports()
    update_index()
    update_tests()
    write_browser_check()


if __name__ == '__main__':
    main()
