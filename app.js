import { computeDescendantScope } from './descendant-scope.js?v=1';

const STORAGE_KEY = 'lineage-web-v1';
const LEGACY_STORAGE_KEY = 'jiapu-web-v1';
const WORKSPACE_STORAGE_KEY = 'lineage-tree-workspace-v1';
const REPOSITORY_URL = 'https://github.com/liuyao12/genealogy-timeline';
const STITCH_SCHEMA_URL = `${REPOSITORY_URL}/blob/main/docs/import-schema.md`;
const STITCH_EXAMPLE_URL = `${REPOSITORY_URL}/blob/main/examples/stitch-import.example.json`;
const GENI_TOKEN_SESSION_KEY = 'lineage-geni-access-token';
const GENI_OAUTH_PENDING_KEY = 'lineage-geni-oauth-pending';
const GENI_IMPORT_INTENT_KEY = 'lineage-geni-import-intent';
const SVG_NS = 'http://www.w3.org/2000/svg';
const HENRY_VII_GENI_URL = 'https://www.geni.com/people/Henry-VII-King-of-England/6000000003760873898';
const CAMILLA_GENI_PROFILE_ID = 'profile-g6000000003081589893';
const EVENT_COLOR_PALETTE = [
  ['#c62828', 'Red'], ['#e65100', 'Orange'], ['#c2892b', 'Amber'], ['#6b7d2a', 'Olive'],
  ['#2e7d32', 'Green'], ['#00796b', 'Teal'], ['#00838f', 'Cyan'], ['#1565c0', 'Blue'],
  ['#3949ab', 'Indigo'], ['#7b1fa2', 'Violet'], ['#ad1457', 'Rose'], ['#616161', 'Grey']
];
const DEFAULT_REIGN_EVENT_COLOR = '#c62828';
const DEFAULT_PERSONAL_EVENT_COLOR = '#1565c0';
const DEFAULT_GLOBAL_EVENT_COLOR = '#c2892b';
const DEFAULT_TIMELINE_YEAR_WIDTH = 4;
const DEFAULT_TIMELINE_NODE_HEIGHT = 28;
const TIMELINE_YEAR_WIDTH_OPTIONS = [
  [3, 'Compact · 3 px/year'], [4, 'Default · 4 px/year'], [5, 'Roomy · 5 px/year'],
  [6, 'Wide · 6 px/year'], [8, 'Extra wide · 8 px/year']
];
const TIMELINE_NODE_HEIGHT_OPTIONS = [
  [24, 'Dense · 24 px'], [28, 'Compact · 28 px'], [32, 'Standard · 32 px'],
  [36, 'Tall · 36 px'], [42, 'Extra tall · 42 px']
];
function sessionValue(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else if (value !== undefined) sessionStorage.setItem(key, value);
    return sessionStorage.getItem(key) || '';
  } catch { return ''; }
}

function oauthCallbackParams() {
  const query = new URLSearchParams(location.search);
  const rawHash = location.hash.replace(/^#/, '').replace(/^\/?\?/, '');
  const hash = new URLSearchParams(rawHash);
  return {
    accessToken: clean(hash.get('access_token') || query.get('access_token')),
    status: clean(hash.get('status') || query.get('status')),
    message: clean(hash.get('message') || query.get('message'))
  };
}

const state = {
  title: 'Untitled family',
  people: {},
  globalEvents: [],
  selectedId: '',
  rootId: '',
  zoom: 1,
  ephemeral: false,
  reignColor: DEFAULT_REIGN_EVENT_COLOR,
  timelineYearWidth: DEFAULT_TIMELINE_YEAR_WIDTH,
  timelineNodeHeight: DEFAULT_TIMELINE_NODE_HEIGHT,
  asOfYear: null,
  treeFilter: '',
  relationVisibility: {},
  starterDataVersion: 0,
  manualTree: false,
  geniAccessToken: '',
  geniImport: null,
  collapsedIds: new Set(),
  editingProfileId: ''
};
let timelineViewportInitialized = false;
let timelineRulerGeometry = null;
let timelineAsOfDrag = null;
let timelineAsOfGripClientY = null;
let pendingTimelineViewport = null;
let hoveredListPersonId = '';
const treeWorkspace = { version: 1, activeTreeId: '', trees: [] };

const TIMELINE_PAN_MARGIN = { left: 220, right: 520, top: 170, bottom: 360 };

const els = Object.fromEntries([
  'tree-title', 'global-events-button', 'import-file-button', 'save-image-button', 'export-button', 'file-input', 'prepare-ai-import',
  'people-count', 'people-label', 'people-list', 'add-person-button', 'tree-tabs', 'add-tree-tab', 'canvas-viewport',
  'empty-state', 'timeline-ruler', 'timeline-canvas', 'empty-add-person-button', 'empty-file-button',
  'detail-backdrop', 'detail-sidebar', 'detail-empty', 'person-form', 'person-heading', 'person-life', 'person-avatar', 'edit-person', 'cancel-person-edit', 'person-edit-fields', 'person-edit-actions',
  'person-source-link', 'person-source-name', 'person-source-mark', 'source-updated', 'close-detail', 'delete-person', 'add-dialog', 'add-dialog-heading',
  'prepare-ai-person-import', 'ai-family-status',
  'relationship-households', 'add-relative',
  'name-periods-list', 'name-period-name', 'name-period-start', 'name-period-end', 'add-name-period',
  'personal-events-list', 'personal-event-name', 'personal-event-start', 'personal-event-end', 'personal-event-color', 'add-personal-event',
  'events-dialog', 'close-events-dialog', 'timeline-as-of-year', 'set-timeline-as-of', 'clear-timeline-as-of', 'timeline-scale-down', 'timeline-scale-value', 'timeline-scale-up', 'timeline-height-down', 'timeline-height-value', 'timeline-height-up', 'global-events-list', 'global-event-name', 'global-event-start', 'global-event-end', 'global-event-color', 'add-global-event',
  'add-form', 'parent-select', 'relation-type', 'new-tree-button', 'new-tree-dialog', 'new-tree-form', 'toast', 'save-status', 'tree-filter', 'royal-example-button',
  'ai-import-dialog', 'close-ai-import', 'ai-import-prompt', 'copy-ai-import-prompt', 'ai-import-json', 'upload-ai-import', 'stitch-ai-import'
].map(id => [id, document.getElementById(id)]));

function clean(value) { return value == null ? '' : String(value).trim(); }
function normalizeColor(value, fallback) { return /^#[0-9a-f]{6}$/i.test(clean(value)) ? clean(value).toLowerCase() : fallback; }
function paletteColor(value, fallback) {
  const normalized = normalizeColor(value, fallback);
  return EVENT_COLOR_PALETTE.some(([candidate]) => candidate === normalized) ? normalized : fallback;
}
function lightenHex(value, amount = 0.5) {
  const color = normalizeColor(value, '#000000');
  const channels = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16));
  return `#${channels.map(channel => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
}
function timelineYearWidth(value) {
  const width = Number(value);
  return TIMELINE_YEAR_WIDTH_OPTIONS.some(([candidate]) => candidate === width) ? width : DEFAULT_TIMELINE_YEAR_WIDTH;
}
function timelineNodeHeight(value) {
  const height = Number(value);
  return TIMELINE_NODE_HEIGHT_OPTIONS.some(([candidate]) => candidate === height) ? height : DEFAULT_TIMELINE_NODE_HEIGHT;
}
function uniqueId(prefix = 'id') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
function array(value) { return Array.isArray(value) ? value.filter(Boolean).map(String) : []; }
function initials(person) {
  const primaryName = visibleName(person).split(',')[0];
  const displayParts = primaryName.split(/\s+/).filter(Boolean);
  const parts = displayParts.length
    ? [displayParts[0], displayParts.length > 1 ? displayParts.at(-1) : ''].filter(Boolean)
    : [person.firstName, person.lastName].filter(Boolean);
  return (parts.map(part => Array.from(part)[0]).join('') || '?').slice(0, 2).toUpperCase();
}
function defaultNamePeriod(person) {
  return person?.namePeriods?.find(period => period.id === person.defaultNamePeriodId) || null;
}
function fullName(person) {
  return clean(defaultNamePeriod(person)?.name) || clean(person.displayName) || [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unnamed profile';
}
function nameAtYear(person, year) {
  const targetYear = numericYear(year);
  const periods = person?.namePeriods || [];
  if (targetYear == null || !periods.length) return fullName(person);
  const personBirthYear = numericYear(person?.birthYear);
  if (personBirthYear != null && targetYear < personBirthYear) return fullName(person);
  const personDeathYear = person?.isLiving ? null : numericYear(person?.deathYear);
  if (personDeathYear != null && targetYear > personDeathYear) return fullName(person);
  const exact = periods.filter(period =>
    (period.startYear == null || period.startYear <= targetYear)
    && (period.endYear == null || period.endYear >= targetYear)
  ).sort((a, b) => (b.startYear ?? -Infinity) - (a.startYear ?? -Infinity));
  if (exact[0]?.name) return exact[0].name;
  const reached = periods.filter(period => period.startYear != null && period.startYear <= targetYear)
    .sort((a, b) => b.startYear - a.startYear);
  return reached[0]?.name || periods[0]?.name || fullName(person);
}
function visibleName(person) { return nameAtYear(person, state.asOfYear); }
function searchableText(person) {
  return [fullName(person), person.title, ...(person.namePeriods || []).map(period => period.name)].filter(Boolean).join(' ').toLocaleLowerCase();
}
function matchesKeyword(person, keyword) {
  const fragment = clean(keyword).toLocaleLowerCase();
  return !!fragment && searchableText(person).includes(fragment);
}
function life(person) {
  const start = clean(person.birthYear) || '?';
  const end = person.isLiving ? 'living' : (clean(person.deathYear) || '?');
  return `${start}–${end}`;
}
function timelineLifeLabel(person, asOfYear = null) {
  const birthYear = numericYear(person?.birthYear);
  const snapshotYear = numericYear(asOfYear);
  const deathYear = person?.isLiving ? null : numericYear(person?.deathYear);
  const ordinaryRange = `(${clean(person?.birthYear) || '?'}–${person?.isLiving ? 'living' : (clean(person?.deathYear) || '?')})`;
  if (birthYear == null) return ordinaryRange;
  const referenceYear = snapshotYear ?? new Date().getFullYear();
  const intersectsReference = referenceYear >= birthYear
    && (person?.isLiving || (deathYear != null && referenceYear <= deathYear));
  return intersectsReference
    ? `(b. ${birthYear}, age ${Math.max(0, referenceYear - birthYear)})`
    : ordinaryRange;
}
function numericYear(value) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}
function unique(values) { return [...new Set(array(values))]; }
function uniqueRefs(values) {
  const candidates = Array.isArray(values) ? values
    : typeof values === 'string' ? [values]
      : values && typeof values === 'object' && (values.id || values.url) ? [values]
        : values && typeof values === 'object'
          ? Object.entries(values).map(([key, value]) => (
            typeof value === 'string' || (value && typeof value === 'object' && (value.id || value.url)) ? value : key
          ))
          : [];
  return [...new Set(candidates.map(refId).filter(Boolean))];
}
function validPublicUrl(value) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function validGeniUrl(value) {
  const href = validPublicUrl(value);
  if (!href) return '';
  return /(^|\.)geni\.com$/i.test(new URL(href).hostname) ? href : '';
}
function canonicalGeniProfileId(value) {
  const raw = clean(value);
  const explicit = raw.match(/^profile-(g?)(\d+)$/i);
  if (explicit) {
    const [, guidPrefix, digits] = explicit;
    return `profile-${guidPrefix || digits.length >= 15 ? 'g' : ''}${digits}`;
  }
  const compact = raw.match(/^(g?)(\d+)$/i);
  if (!compact) return raw;
  const [, guidPrefix, digits] = compact;
  return `profile-${guidPrefix || digits.length >= 15 ? 'g' : ''}${digits}`;
}
function geniProfileUrlId(value) {
  return canonicalGeniProfileId(value).replace(/^profile-g?/i, '');
}
function profileIdFromInput(input) {
  const raw = clean(input);
  if (!raw) return '';
  const direct = raw.match(/profile-g?\d+/i);
  if (direct) return canonicalGeniProfileId(direct[0]);
  if (/^g?\d+$/i.test(raw)) return canonicalGeniProfileId(raw);
  try {
    const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
    if (!/(^|\.)geni\.com$/i.test(url.hostname)) return '';
    const segment = url.pathname.split('/').filter(Boolean).pop();
    return segment ? canonicalGeniProfileId(segment) : '';
  } catch { return ''; }
}
function optionalGeniLink(input) {
  const sourceId = profileIdFromInput(input);
  return sourceId ? {
    sourceId,
    sourceUrl: `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
    sourceProvider: 'geni'
  } : null;
}
function sourceProviderFromUrl(url) {
  const href = validPublicUrl(url);
  if (!href) return '';
  const host = new URL(href).hostname.toLowerCase();
  if (/(^|\.)geni\.com$/.test(host)) return 'geni';
  return 'web';
}
function sourceMeta(person) {
  const provider = person.sourceProvider || sourceProviderFromUrl(person.sourceUrl);
  if (provider === 'geni') return { name: 'Geni public profile', mark: 'G' };
  if (provider === 'gedcom') return { name: 'GEDCOM import', mark: 'F' };
  if (provider === 'json') return { name: 'Tree backup', mark: 'F' };
  if (provider === 'royal') return { name: 'The Royal Family historical profile', mark: 'R' };
  return { name: person.sourceUrl ? 'Public web profile' : 'Source not linked', mark: 'S' };
}

function normalizePersonalEvents(events) {
  const normalized = (Array.isArray(events) ? events : []).map(event => {
    const date = event?.date || event?.event_date || {};
    const name = clean(event?.name || event?.title || event?.label || event?.event_type || event?.type);
    const startDate = event?.start_date || date?.start || date?.from || {};
    const endDate = event?.end_date || date?.end || date?.to || {};
    const startYear = numericYear(event?.startYear ?? event?.start_year ?? startDate?.year ?? date?.start_year ?? date?.year ?? event?.year);
    const endYear = numericYear(event?.endYear ?? event?.end_year ?? endDate?.year ?? date?.end_year ?? date?.year ?? event?.year);
    return {
      name,
      startYear,
      endYear: endYear ?? startYear,
      source: clean(event?.source || ''),
      color: isReignLabel(name) ? state.reignColor : paletteColor(event?.color, DEFAULT_PERSONAL_EVENT_COLOR)
    };
  }).filter(event => event.name && event.startYear != null);
  return [...new Map(normalized.map(event => [`${event.name.toLocaleLowerCase()}|${event.startYear}|${event.endYear}`, event])).values()];
}

function normalizeNamePeriods(periods) {
  const normalized = (Array.isArray(periods) ? periods : []).map(period => {
    const name = clean(period?.name || period?.displayName || period?.display_name || period?.label)
      .replace(/^(?:(?:H\.?R\.?H\.?|H\.?M\.?)|(?:His|Her) Royal Highness|(?:His|Her) Majesty)\s+/i, '');
    let startYear = numericYear(period?.startYear ?? period?.start_year ?? period?.fromYear ?? period?.from);
    let endYear = numericYear(period?.endYear ?? period?.end_year ?? period?.toYear ?? period?.to);
    if (startYear != null && endYear != null && endYear < startYear) [startYear, endYear] = [endYear, startYear];
    return {
      id: clean(period?.id) || `name-${encodeURIComponent(name.toLocaleLowerCase())}-${startYear ?? 'open'}-${endYear ?? 'open'}`,
      name,
      startYear,
      endYear,
      sourceUrl: validPublicUrl(period?.sourceUrl || period?.source_url || '')
    };
  }).filter(period => period.name);
  normalized.sort((a, b) => (a.startYear ?? -Infinity) - (b.startYear ?? -Infinity) || (a.endYear ?? Infinity) - (b.endYear ?? Infinity));
  const uniquePeriods = new Map();
  normalized.forEach(period => {
    const semanticKey = `${period.name.toLocaleLowerCase()}|${period.startYear ?? 'open'}|${period.endYear ?? 'open'}`;
    const existing = uniquePeriods.get(semanticKey);
    if (!existing) {
      uniquePeriods.set(semanticKey, period);
      return;
    }
    // Older imports and starter upgrades sometimes assigned different row IDs
    // to the same dated name. Keep one stable row and retain the best source.
    if (!existing.sourceUrl && period.sourceUrl) existing.sourceUrl = period.sourceUrl;
  });
  return [...uniquePeriods.values()];
}

function normalizeGlobalEvents(events) {
  return (Array.isArray(events) ? events : []).map(event => {
    const name = clean(event?.name || event?.title || event?.label);
    const range = clean(event?.year || '').match(/(-?\d{1,4})(?:\s*(?:-|–|—|~|to)\s*(-?\d{1,4}))?/i);
    const startYear = numericYear(event?.startYear ?? event?.start_year ?? range?.[1]);
    const endYear = numericYear(event?.endYear ?? event?.end_year ?? range?.[2] ?? startYear);
    if (!name || startYear == null) return null;
    return {
      id: clean(event?.id) || uniqueId('global'),
      name,
      startYear,
      endYear: endYear ?? startYear,
      color: paletteColor(event?.color, DEFAULT_GLOBAL_EVENT_COLOR)
    };
  }).filter(Boolean);
}

function isReignLabel(value) {
  return /^reign(?:\b|\s*·)/i.test(clean(value));
}

function parseReignValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    const direct = normalizePersonalEvents([{ name: 'Reign', ...value }])[0];
    if (direct) return direct;
    value = value.value ?? value.text ?? value.content ?? value.years ?? value.date ?? '';
  }
  const years = String(value).match(/-?\d{3,4}/g)?.map(Number).filter(Number.isFinite) || [];
  if (!years.length) return null;
  return { name: 'Reign', startYear: years[0], endYear: years[1] ?? years[0], source: 'geni' };
}

function extractGeniReignEvents(events) {
  return normalizePersonalEvents(events).filter(event => isReignLabel(event.name)).map(event => ({ ...event, source: 'geni' }));
}

function extractGeniReignFacts(profile) {
  const found = [...extractGeniReignEvents(profile?.events)];
  const seen = new Set();
  const visit = (value, key = '') => {
    if (value == null || seen.has(value)) return;
    if (typeof value === 'object') seen.add(value);
    if (isReignLabel(key)) {
      const event = parseReignValue(value);
      if (event) found.push(event);
    }
    if (Array.isArray(value)) {
      value.forEach(item => visit(item));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const label = clean(value.label || value.name || value.title);
    if (isReignLabel(label)) {
      const event = parseReignValue(value.value ?? value.text ?? value.content ?? value.years ?? value.date ?? value);
      if (event) found.push(event);
    }
    Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey));
  };
  visit(profile?.custom_fields);
  visit(profile?.custom_facts);
  visit(profile?.details);
  visit(profile?.detail_strings);
  return normalizePersonalEvents(found);
}

function reignEvents(person) {
  return person.personalEvents.filter(event => isReignLabel(event.name));
}

function formatEventYearRange(startYear, endYear = startYear) {
  const start = numericYear(startYear);
  const end = numericYear(endYear);
  if (start == null) return '';
  if (end == null || end === start) return String(start);
  const sameCentury = start >= 0 && end >= 0 && Math.floor(start / 100) === Math.floor(end / 100);
  return `${start}\u2013${sameCentury ? String(end).padStart(4, '0').slice(-2) : end}`;
}

function normalizePerson(source, fallbackId) {
  const id = clean(source.id || fallbackId) || uniqueId('local');
  const birth = source.birth || source.birth_date_parts || {};
  const death = source.death || source.death_date_parts || {};
  const dateYear = value => clean(value).match(/-?\d{3,4}/)?.[0] || '';
  const sourceUrl = validPublicUrl(source.sourceUrl || source.profile_url || source.profileUrl || '');
  const marriageYears = Object.fromEntries(Object.entries(source.marriageYears || {}).map(([partnerId, year]) => [refId(partnerId), clean(year)]).filter(([partnerId, year]) => partnerId && numericYear(year) != null));
  const relationshipEndYears = Object.fromEntries(Object.entries(source.relationshipEndYears || source.divorceYears || {}).map(([partnerId, year]) => [refId(partnerId), clean(year)]).filter(([partnerId, year]) => partnerId && numericYear(year) != null));
  const relationshipEndStatuses = Object.fromEntries(Object.entries(source.relationshipEndStatuses || {}).map(([partnerId, status]) => [refId(partnerId), clean(status).toLowerCase()]).filter(([partnerId, status]) => partnerId && ['annulled', 'divorced', 'ended'].includes(status)));
  const partners = uniqueRefs(source.partners || source.spouses);
  const rawGender = clean(source.gender).toLowerCase();
  const rawNamePeriods = source.namePeriods || source.historicalNames || source.names;
  const namePeriods = normalizeNamePeriods(rawNamePeriods);
  const requestedDefaultPeriodId = clean(source.defaultNamePeriodId || source.default_name_period_id);
  const rawDefaultPeriod = (Array.isArray(rawNamePeriods) ? rawNamePeriods : []).find(period => clean(period?.id) === requestedDefaultPeriodId);
  const normalizedRawDefaultName = clean(rawDefaultPeriod?.name || rawDefaultPeriod?.displayName || rawDefaultPeriod?.display_name || rawDefaultPeriod?.label)
    .replace(/^(?:(?:H\.?R\.?H\.?|H\.?M\.?)|(?:His|Her) Royal Highness|(?:His|Her) Majesty)\s+/i, '');
  const displayName = clean(source.displayName || source.display_name || (typeof source.name === 'string' ? source.name : ''));
  const defaultNamePeriodId = namePeriods.find(period => period.id === requestedDefaultPeriodId)?.id
    || namePeriods.find(period => normalizedRawDefaultName && period.name === normalizedRawDefaultName)?.id
    || namePeriods.find(period => displayName && period.name.toLocaleLowerCase() === displayName.toLocaleLowerCase())?.id
    || '';
  return {
    id,
    firstName: clean(source.firstName || source.firstname || source.first_name),
    lastName: clean(source.lastName || source.surname || source.last_name || source.maiden_name),
    displayName,
    title: clean(source.title || source.display_title || source.occupation),
    nameOrder: 'western',
    gender: rawGender === 'm' ? 'male' : rawGender === 'f' ? 'female' : ['male', 'female'].includes(rawGender) ? rawGender : 'unknown',
    birthYear: clean(source.birthYear || source.bYear || birth.year || birth.date?.year || dateYear(source.birth_date)),
    deathYear: clean(source.deathYear || source.dYear || death.year || death.date?.year || dateYear(source.death_date)),
    isLiving: source.isLiving === true || source.is_alive === true,
    place: clean(source.place || source.hometown || source.jiguan || birth.location?.place_name || birth.location?.city),
    note: clean(source.note || source.addendum || source.about_me),
    parents: uniqueRefs(source.parents || [source.fatherId, source.motherId]),
    children: uniqueRefs(source.children),
    // `partners` preserves the complete imported graph. Only `spouses` is
    // rendered; Geni partners, engagements, and mistresses stay available as
    // parentage facts without appearing as spouse boxes or marriage lines.
    partners,
    spouses: uniqueRefs(source.spouses || source.spouseIds || Object.keys(marriageYears)),
    nonSpouses: uniqueRefs(source.nonSpouses || source.nonSpouseIds),
    divorcedSpouses: uniqueRefs(source.divorcedSpouses || source.divorcedSpouseIds),
    marriageYears,
    relationshipEndYears,
    relationshipEndStatuses,
    namePeriods,
    defaultNamePeriodId,
    personalEvents: normalizePersonalEvents([...(Array.isArray(source.personalEvents) ? source.personalEvents : []), ...extractGeniReignFacts(source)]),
    sourceUrl,
    sourceId: clean(source.sourceId || (/^profile-/i.test(id) ? id : '')),
    sourceProvider: clean(source.sourceProvider || source.provenance?.provider || sourceProviderFromUrl(sourceUrl)),
    importedAt: clean(source.importedAt || source.provenance?.importedAt),
    geniImmediateFamilyLoaded: source.geniImmediateFamilyLoaded === true,
    geniImmediateFamilyVerifiedAt: clean(source.geniImmediateFamilyVerifiedAt),
    geniImmediateFamilyIds: uniqueRefs(source.geniImmediateFamilyIds),
    starterProfile: source.starterProfile === true
  };
}

let britishRoyalStarterData = null;
let britishRoyalStarterLoadError = null;

async function loadBritishRoyalStarterData() {
  try {
    const response = await fetch("./data/british-royal-line.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Bundled royal line request failed (${response.status})`);
    const payload = await response.json();
    if (payload?.schema !== "lineage-starter"
      || !Number.parseInt(payload.version, 10)
      || !payload.people
      || typeof payload.people !== "object"
      || !payload.people[clean(payload.rootId)]) {
      throw new Error("Bundled royal line has an unsupported format");
    }
    britishRoyalStarterData = payload;
  } catch (error) {
    britishRoyalStarterLoadError = error;
    console.error(error);
  }
}

function britishRoyalStarterVersion() {
  return Number.parseInt(britishRoyalStarterData?.version, 10) || 0;
}

function britishRoyalStarterRootId() {
  return clean(britishRoyalStarterData?.rootId) || profileIdFromInput(HENRY_VII_GENI_URL);
}

function createBritishRoyalSample() {
  if (!britishRoyalStarterData?.people) return {};
  return migrateGeniPeople(structuredClone(britishRoyalStarterData.people)).people;
}

function createBritishHistoryEvents() {
  return normalizeGlobalEvents(structuredClone(britishRoyalStarterData?.globalEvents || []));
}

function loadBritishRoyalExample({ persistResult = true } = {}) {
  const button = els['royal-example-button'];
  if (!britishRoyalStarterData) {
    toast('The bundled British royal line could not be loaded.', true);
    return;
  }
  state.people = createBritishRoyalSample();
  state.globalEvents = createBritishHistoryEvents();
  state.asOfYear = null;
  state.rootId = britishRoyalStarterRootId();
  state.selectedId = '';
  state.ephemeral = false;
  state.relationVisibility = {};
  state.collapsedIds.clear();
  state.zoom = 1;
  state.treeFilter = clean(britishRoyalStarterData.treeFilter) || 'king queen';
  state.starterDataVersion = britishRoyalStarterVersion();
  state.manualTree = false;
  state.title = clean(britishRoyalStarterData.title) || 'The British royal line from Henry VII';
  pendingTimelineViewport = null;
  timelineViewportInitialized = false;
  els['tree-filter'].value = state.treeFilter;
  if (persistResult) persist('Bundled royal line restored');
  render();
  button.textContent = '♔ Restore the bundled British royal line';
}

function upgradeBundledBritishRoyalLine() {
  const starterVersion = britishRoyalStarterVersion();
  if (!starterVersion || state.starterDataVersion >= starterVersion) return false;
  const starterRootId = britishRoyalStarterRootId();
  const isBundledLine = state.rootId === starterRootId && (
    state.title === 'The British royal line from Henry VII' ||
    Object.values(state.people).some(person => person.starterProfile)
  );
  if (!isBundledLine) return false;

  const bundledPeople = createBritishRoyalSample();
  const revisedImperialNamePeriods = {
    [canonicalGeniProfileId('6000000001651648070')]: ['edward-vii-name-1901', 'Edward VII, King of the United Kingdom'],
    [canonicalGeniProfileId('6000000000701511040')]: ['george-v-name-1910', 'George V, King of the United Kingdom'],
    [canonicalGeniProfileId('5031922362950130285')]: ['edward-viii-name-1936', 'Edward VIII, King of the United Kingdom'],
    [canonicalGeniProfileId('6000000001217955606')]: ['george-vi-name-1936', 'George VI, King of the United Kingdom']
  };
  Object.entries(bundledPeople).forEach(([id, bundled]) => {
    const saved = state.people[id];
    if (!saved) {
      state.people[id] = bundled;
      return;
    }
    // Preserve locally edited profile fields while adding relationships and
    // profiles introduced by newer versions of the bundled starter tree.
    const merged = mergePersonRecords(saved, bundled);
    const oldBaseName = [saved.firstName, saved.lastName].filter(Boolean).join(' ');
    const oldTitleClause = clean(saved.note).split(/[;,]/)[0];
    const oldRoyalTitle = oldTitleClause.match(/\b(?:King|Queen)(?:\s+consort)?\s+of\s+.+$/i)?.[0] || '';
    const oldGeneratedName = oldRoyalTitle && !/\b(?:king|queen)\b/i.test(oldBaseName) ? `${oldBaseName}, ${oldRoyalTitle}` : oldBaseName;
    const apiPlainName = [saved.firstName, saved.lastName].filter(Boolean).join(' ');
    const wasReducedBySparseGeniRefresh = saved.starterProfile && saved.importedAt && saved.displayName === apiPlainName;
    if (saved.starterProfile && (saved.displayName === oldGeneratedName || wasReducedBySparseGeniRefresh) && bundled.displayName !== saved.displayName) {
      merged.displayName = bundled.displayName;
    }
    if (id === CAMILLA_GENI_PROFILE_ID) {
      merged.isLiving = true;
      merged.deathYear = '';
    }
    if (id === canonicalGeniProfileId('6000000008852088113')) {
      merged.namePeriods = normalizeNamePeriods(merged.namePeriods.map(period => (
        period.id === 'victoria-name-1837'
          && period.name === 'Victoria, Queen of the United Kingdom'
          && numericYear(period.endYear) === 1901
          ? { ...period, endYear: 1876 }
          : period
      )));
    }
    const revisedPeriod = revisedImperialNamePeriods[id];
    if (revisedPeriod) {
      const [periodId, formerName] = revisedPeriod;
      const bundledPeriod = bundled.namePeriods.find(period => period.id === periodId);
      merged.namePeriods = normalizeNamePeriods(merged.namePeriods.map(period => (
        period.id === periodId && period.name === formerName && bundledPeriod ? bundledPeriod : period
      )));
      merged.defaultNamePeriodId = bundled.defaultNamePeriodId;
    }
    merged.marriageYears = { ...bundled.marriageYears, ...saved.marriageYears };
    merged.personalEvents = normalizePersonalEvents([...bundled.personalEvents, ...saved.personalEvents]);
    state.people[id] = merged;
  });
  createBritishHistoryEvents().forEach(event => {
    const alreadyPresent = state.globalEvents.some(existing => existing.id === event.id || (
      numericYear(existing.startYear) === event.startYear && numericYear(existing.endYear) === event.endYear
    ));
    if (!alreadyPresent) state.globalEvents.push(event);
  });
  state.starterDataVersion = starterVersion;
  return true;
}

function migrateGeniPeople(rawPeople) {
  const people = {};
  let migrated = false;
  const remap = value => {
    const id = clean(value);
    const canonical = /^profile-/i.test(id) ? canonicalGeniProfileId(id) : id;
    if (canonical !== id) migrated = true;
    return canonical;
  };
  const remapMap = value => Object.fromEntries(Object.entries(value || {}).map(([id, detail]) => [remap(id), detail]));
  Object.entries(rawPeople || {}).forEach(([key, source]) => {
    const normalized = normalizePerson(source, key);
    const rawNamePeriods = source?.namePeriods || source?.historicalNames || source?.names;
    if (Array.isArray(rawNamePeriods) && normalized.namePeriods.length < rawNamePeriods.filter(Boolean).length) migrated = true;
    if (!clean(source?.defaultNamePeriodId || source?.default_name_period_id) && normalized.defaultNamePeriodId) migrated = true;
    const oldId = normalized.id;
    normalized.id = remap(oldId);
    normalized.sourceId = remap(normalized.sourceId);
    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses'].forEach(field => {
      normalized[field] = unique(normalized[field].map(remap));
    });
    normalized.marriageYears = remapMap(normalized.marriageYears);
    normalized.relationshipEndYears = remapMap(normalized.relationshipEndYears);
    normalized.relationshipEndStatuses = remapMap(normalized.relationshipEndStatuses);
    people[normalized.id] = people[normalized.id] ? mergePersonRecords(people[normalized.id], normalized) : normalized;
  });
  return { people, migrated };
}

function migrateRelationVisibility(rawVisibility) {
  let migrated = false;
  const relationVisibility = Object.fromEntries(Object.entries(rawVisibility || {}).filter(([, value]) => typeof value === 'boolean').map(([key, value]) => {
    const canonicalKey = key.replace(/profile-(\d{15,})/gi, 'profile-g$1');
    if (canonicalKey !== key) migrated = true;
    return [canonicalKey, value];
  }));
  return { relationVisibility, migrated };
}

function treeSnapshot(id = treeWorkspace.activeTreeId) {
  const viewport = els['canvas-viewport'];
  return {
    id: id || uniqueId('tree'), title: state.title, rootId: state.rootId, people: state.people,
    globalEvents: state.globalEvents, reignColor: state.reignColor,
    timelineYearWidth: state.timelineYearWidth, timelineNodeHeight: state.timelineNodeHeight,
    asOfYear: state.asOfYear, treeFilter: state.treeFilter, relationVisibility: state.relationVisibility,
    starterDataVersion: state.starterDataVersion, manualTree: state.manualTree,
    collapsedIds: [...state.collapsedIds], zoom: state.zoom,
    viewportLeft: viewport?.scrollLeft || 0, viewportTop: viewport?.scrollTop || 0
  };
}

function saveActiveTreeSnapshot() {
  if (!treeWorkspace.activeTreeId) treeWorkspace.activeTreeId = uniqueId('tree');
  const snapshot = treeSnapshot(treeWorkspace.activeTreeId);
  const index = treeWorkspace.trees.findIndex(tree => tree.id === treeWorkspace.activeTreeId);
  if (index >= 0) treeWorkspace.trees[index] = snapshot;
  else treeWorkspace.trees.push(snapshot);
}

function writeTreeWorkspace() {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(treeWorkspace));
}

function applyTreeSnapshot(saved) {
  const savedRootId = /^profile-/i.test(clean(saved.rootId)) ? canonicalGeniProfileId(saved.rootId) : clean(saved.rootId);
  const migratedPeople = migrateGeniPeople(saved.people);
  const migratedVisibility = migrateRelationVisibility(saved.relationVisibility);
  state.title = clean(saved.title) || 'Untitled family';
  state.rootId = savedRootId;
  state.reignColor = paletteColor(saved.reignColor, DEFAULT_REIGN_EVENT_COLOR);
  state.timelineYearWidth = timelineYearWidth(saved.timelineYearWidth);
  state.timelineNodeHeight = timelineNodeHeight(saved.timelineNodeHeight);
  state.asOfYear = numericYear(saved.asOfYear);
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
}

function restore() {
  try {
    const workspaceSaved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || 'null');
    if (workspaceSaved?.version === 1 && Array.isArray(workspaceSaved.trees) && workspaceSaved.trees.length) {
      treeWorkspace.trees = workspaceSaved.trees.filter(tree => tree && typeof tree === 'object').map(tree => ({ ...tree, id: clean(tree.id) || uniqueId('tree') }));
      treeWorkspace.activeTreeId = treeWorkspace.trees.some(tree => tree.id === workspaceSaved.activeTreeId)
        ? workspaceSaved.activeTreeId : treeWorkspace.trees[0].id;
      return applyTreeSnapshot(treeWorkspace.trees.find(tree => tree.id === treeWorkspace.activeTreeId));
    }
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
    treeWorkspace.activeTreeId = uniqueId('tree');
    if (!saved || typeof saved !== 'object') return false;
    treeWorkspace.trees = [{ ...saved, id: treeWorkspace.activeTreeId }];
    applyTreeSnapshot(saved);
    return true; // Persist the legacy single-tree cache as a tabbed workspace.
  } catch {
    treeWorkspace.activeTreeId ||= uniqueId('tree');
    return false; /* A malformed local cache should not prevent the app from opening. */
  }
}

function persist(message = 'All changes saved locally') {
  if (state.ephemeral) {
    els['save-status'].textContent = message || 'Live Geni data · not saved';
    window.setTimeout(() => { els['save-status'].textContent = 'Live Geni data · not saved'; }, 1600);
    return;
  }
  saveActiveTreeSnapshot();
  writeTreeWorkspace();
  renderTreeTabs();
  els['save-status'].textContent = message;
  window.setTimeout(() => { els['save-status'].textContent = 'All changes saved locally'; }, 1600);
}

function beginGeniAuthorization(intent) {
  const appId = clean(document.querySelector('meta[name="geni-app-id"]')?.content);
  if (!appId) throw new Error('Live Geni loading needs the public Geni application ID.');
  const pendingSince = Number(sessionValue(GENI_OAUTH_PENDING_KEY));
  if (pendingSince && Date.now() - pendingSince < 120000) {
    sessionValue(GENI_OAUTH_PENDING_KEY, null);
    sessionValue(GENI_IMPORT_INTENT_KEY, null);
    throw new Error('Geni returned without an access token. Authorization was stopped to prevent a redirect loop.');
  }
  const authorize = new URL('https://www.geni.com/platform/oauth/authorize');
  authorize.searchParams.set('client_id', appId);
  authorize.searchParams.set('redirect_uri', `${location.origin}${location.pathname}`);
  authorize.searchParams.set('response_type', 'token');
  sessionValue(GENI_OAUTH_PENDING_KEY, String(Date.now()));
  sessionValue(GENI_IMPORT_INTENT_KEY, intent);
  location.assign(authorize.href);
}
function toast(message, long = false) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), long ? 6500 : 2800);
}

function geniProfileIdForApiProfile(profile, fallbackId = '') {
  const guid = clean(profile?.guid);
  if (/^\d{15,}$/.test(guid)) return canonicalGeniProfileId(guid);
  const publicProfileId = profileIdFromInput(profile?.profile_url);
  return publicProfileId || canonicalGeniProfileId(fallbackId || refId(profile?.id || profile?.url));
}

function geniGraphNodeRecords(nodes) {
  return Object.entries(nodes || {}).map(([key, node]) => (
    node && typeof node === 'object' ? { ...node, id: refId(node.id || node.url || key) } : null
  )).filter(Boolean);
}

function inferRelationsFromUnions(nodes, preferredIds = {}) {
  // Geni's immediate-family graph is a hash. Depending on the API response,
  // a node's ID may exist only as its hash key rather than inside the node.
  const nodeRecords = geniGraphNodeRecords(nodes);
  const profiles = nodeRecords.filter(node => clean(node.id).startsWith('profile-'));
  const aliases = {};
  const profileMap = {};
  profiles.forEach(profile => {
    const rawId = clean(profile.id);
    const id = preferredIds[rawId] || geniProfileIdForApiProfile(profile, rawId);
    aliases[rawId] = id;
    profileMap[id] = { ...profile, id };
  });
  nodeRecords.filter(node => clean(node.id).startsWith('union-')).forEach(union => {
    const partners = uniqueRefs(union.partners || union.partner_ids || union.profiles).map(id => aliases[id] || canonicalGeniProfileId(id)).filter(id => profileMap[id]);
    const children = uniqueRefs(union.children || union.child_ids).map(id => aliases[id] || canonicalGeniProfileId(id)).filter(id => profileMap[id]);
  const marriageYear = clean(
      union.marriage?.date?.year ?? union.marriage?.year ?? union.marriage?.date
      ?? union.marriage_date?.year ?? union.marriage_date
    ).match(/-?\d{3,4}/)?.[0] || '';
    const divorceEvent = union.divorce || union.divorce_date;
    const relationshipEndYear = clean(
      union.divorce?.date?.year ?? union.divorce?.year ?? union.divorce?.date
      ?? union.divorce_date?.year ?? union.divorce_date
      ?? union.annulment_date?.year ?? union.annulment_date
    ).match(/-?\d{3,4}/)?.[0] || '';
    const status = clean(union.status || union.relationship_status || union.type).toLowerCase().replace(/[\s-]+/g, '_');
    const isSpouseUnion = ['spouse', 'ex_spouse', 'current', 'ex', 'married', 'divorced', 'annulled'].includes(status) || Boolean(marriageYear);
    const relationshipEndStatus = status === 'annulled' ? 'annulled'
      : divorceEvent || status === 'divorced' ? 'divorced'
        : ['ex_spouse', 'ex'].includes(status) ? 'ended' : '';
    const isEndedUnion = Boolean(relationshipEndStatus);
    partners.forEach(id => {
      profileMap[id].partners = unique([...(profileMap[id].partners || []), ...partners.filter(other => other !== id)]);
      const relationKey = isSpouseUnion ? 'spouses' : 'nonSpouses';
      profileMap[id][relationKey] = unique([...(profileMap[id][relationKey] || []), ...partners.filter(other => other !== id)]);
      if (isEndedUnion) profileMap[id].divorcedSpouses = unique([...(profileMap[id].divorcedSpouses || []), ...partners.filter(other => other !== id)]);
      if (relationshipEndStatus) {
        profileMap[id].relationshipEndStatuses = { ...(profileMap[id].relationshipEndStatuses || {}) };
        profileMap[id].relationshipEndYears = { ...(profileMap[id].relationshipEndYears || {}) };
        partners.filter(other => other !== id).forEach(other => {
          profileMap[id].relationshipEndStatuses[other] = relationshipEndStatus;
          if (relationshipEndYear) profileMap[id].relationshipEndYears[other] = relationshipEndYear;
        });
      }
      profileMap[id].children = unique([...(profileMap[id].children || []), ...children]);
      if (marriageYear) {
        profileMap[id].marriageYears = { ...(profileMap[id].marriageYears || {}) };
        partners.filter(other => other !== id).forEach(other => { profileMap[id].marriageYears[other] = marriageYear; });
      }
    });
    children.forEach(id => { profileMap[id].parents = unique([...(profileMap[id].parents || []), ...partners]); });
  });
  // Normalize every relationship in both directions before merging it into
  // the local tree. This repairs sparse immediate-family payloads in which a
  // relation is present on only one of the returned profiles.
  Object.values(profileMap).forEach(profile => {
    uniqueRefs(profile.parents).forEach(parentId => {
      if (profileMap[parentId]) profileMap[parentId].children = unique([...(profileMap[parentId].children || []), profile.id]);
    });
    uniqueRefs(profile.children).forEach(childId => {
      if (profileMap[childId]) profileMap[childId].parents = unique([...(profileMap[childId].parents || []), profile.id]);
    });
    uniqueRefs(profile.partners).forEach(partnerId => {
      if (profileMap[partnerId]) profileMap[partnerId].partners = unique([...(profileMap[partnerId].partners || []), profile.id]);
    });
    uniqueRefs(profile.spouses).forEach(spouseId => {
      if (profileMap[spouseId]) profileMap[spouseId].spouses = unique([...(profileMap[spouseId].spouses || []), profile.id]);
    });
  });
  return profileMap;
}
function refId(value) {
  if (typeof value === 'string') return value.split('/').pop();
  return clean(value?.id || value?.url).split('/').pop();
}

function fetchGeniJsonp(path, params = {}) {
  if (!state.geniAccessToken) return Promise.reject(new Error('Geni OAuth authorization is required.'));
  return new Promise((resolve, reject) => {
    const callbackName = `__lineageGeni${uniqueId('callback').replace(/-/g, '')}`;
    const script = document.createElement('script');
    const timer = window.setTimeout(() => finish(new Error('Geni did not respond to the authorized request.')), 20000);
    function finish(error, payload) {
      window.clearTimeout(timer);
      script.remove();
      delete window[callbackName];
      if (error) reject(error); else resolve(payload);
    }
    window[callbackName] = payload => {
      const apiMessage = clean([
        payload?.error?.message,
        typeof payload?.error === 'string' ? payload.error : '',
        payload?.error?.type,
        payload?.error?.code,
        payload?.message
      ].filter(Boolean).join(' ')).replace(/[_-]+/g, ' ');
      if (/invalid.*access.*token|access.*token.*invalid|expired.*access.*token/i.test(apiMessage)) {
        const error = new Error('Geni authorization has expired.');
        error.code = 'GENI_INVALID_ACCESS_TOKEN';
        finish(error);
        return;
      }
      finish(null, payload);
    };
    script.onerror = () => finish(new Error('The authorized Geni request could not be loaded.'));
    const query = new URLSearchParams({ ...params, access_token: state.geniAccessToken, callback: callbackName });
    script.src = `https://www.geni.com/api/${path}?${query}`;
    document.head.append(script);
  });
}

function geniUnionPayloadRecords(payload) {
  if (payload && typeof payload === 'object' && /^union-/i.test(refId(payload.id || payload.url))) return [payload];
  const collection = payload?.results ?? payload?.unions ?? payload;
  const records = Array.isArray(collection)
    ? collection
    : collection && typeof collection === 'object'
      ? Object.entries(collection).map(([key, value]) => (
        value && typeof value === 'object' ? { ...value, id: value.id || refId(key) } : null
      ))
      : [];
  return records.filter(value => value && refId(value.id || value.url).startsWith('union-'));
}

async function fetchGeniUnionDetails(unionIds) {
  const detailsById = {};
  const ids = unique(unionIds).filter(id => /^union-/i.test(id));
  for (let index = 0; index < ids.length; index += 25) {
    const chunk = ids.slice(index, index + 25);
    const fields = 'id,url,partners,children,status,marriage,divorce,marriage_date,divorce_date';
    // Geni's bulk dispatcher returns an empty result for a one-ID request.
    // Use the resource URL directly for singletons, including a final batch
    // containing only one union.
    const payload = chunk.length === 1
      ? await fetchGeniJsonp(encodeURIComponent(chunk[0]), { fields })
      : await fetchGeniJsonp('union', {
        ids: chunk.map(id => id.replace(/^union-/i, '')).join(','),
        fields
      });
    if (payload.error) throw new Error(payload.error.message || 'Geni did not return union details.');
    geniUnionPayloadRecords(payload).forEach(raw => {
      const id = refId(raw.id || raw.url);
      if (id) detailsById[id] = { ...raw, id };
    });
  }
  return detailsById;
}

async function fetchGeniNeighborhood(id) {
  const requestedFocusId = canonicalGeniProfileId(id);
  const initialProfiles = await fetchGeniProfileDetails([requestedFocusId]);
  const focusRaw = initialProfiles[requestedFocusId] || Object.values(initialProfiles)[0];
  if (!focusRaw) throw new Error('Geni did not return the selected public profile.');

  const rawFocusId = refId(focusRaw.id || focusRaw.url);
  const focusId = geniProfileIdForApiProfile(focusRaw, requestedFocusId);
  const unionIds = uniqueRefs(focusRaw.unions);
  const unionDetails = unionIds.length ? await fetchGeniUnionDetails(unionIds) : {};
  const relatedProfileIds = unique([
    rawFocusId,
    requestedFocusId,
    ...Object.values(unionDetails).flatMap(union => [
      ...uniqueRefs(union.partners || union.partner_ids || union.profiles),
      ...uniqueRefs(union.children || union.child_ids)
    ])
  ]).filter(profileId => /^profile-/i.test(profileId));
  const detailedProfiles = await fetchGeniProfileDetails(relatedProfileIds);
  const profileRecords = Object.values({ ...initialProfiles, ...detailedProfiles });
  if (!profileRecords.length) throw new Error('Geni returned no public profiles for the selected profile’s unions.');

  // A profile's unions include both its parents' family group and each family
  // group it formed. Union partners and children therefore provide an exact
  // family structure; individual profile calls supply the names and dates.
  const preferredIds = rawFocusId ? { [rawFocusId]: focusId } : {};
  const mapped = inferRelationsFromUnions([
    ...profileRecords,
    ...Object.values(unionDetails)
  ], preferredIds);
  const canonicalFocus = { ...focusRaw, id: focusId };
  if (!mapped[focusId]) mapped[focusId] = canonicalFocus;
  if (!Object.keys(mapped).length) throw new Error('Geni returned no verifiable profiles from the selected profile’s unions.');
  return { mapped, focusRaw: canonicalFocus };
}

function geniProfilePayloadRecords(payload) {
  if (payload && typeof payload === 'object' && /^profile-/i.test(refId(payload.id || payload.url))) return [payload];
  const collection = payload?.results ?? payload?.profiles ?? payload;
  if (Array.isArray(collection)) return collection.filter(value => value && typeof value === 'object');
  if (!collection || typeof collection !== 'object') return [];
  return Object.entries(collection).map(([key, value]) => (
    value && typeof value === 'object' ? { ...value, id: value.id || refId(key) } : null
  )).filter(value => value && refId(value.id || value.url).startsWith('profile-'));
}

async function fetchGeniProfileDetails(profileIds) {
  const detailsById = {};
  const ids = unique(profileIds).filter(id => /^profile-/i.test(id));
  for (let index = 0; index < ids.length; index += 25) {
    const chunk = ids.slice(index, index + 25);
    const fields = 'id,guid,url,profile_url,public,display_name,first_name,middle_name,last_name,maiden_name,title,gender,is_alive,birth,death,birth_date,birth_date_parts,death_date,death_date_parts,unions';
    const payload = chunk.length === 1
      ? await fetchGeniJsonp(encodeURIComponent(chunk[0]), { fields })
      : await fetchGeniJsonp('profile', {
        ids: chunk.map(id => id.replace(/^profile-/i, '')).join(','),
        fields
      });
    if (payload.error) throw new Error(payload.error.message || 'Geni did not return profile details.');
    geniProfilePayloadRecords(payload).forEach(raw => {
      const rawId = refId(raw.id || raw.url);
      if (!rawId) return;
      detailsById[geniProfileIdForApiProfile(raw, rawId)] = raw;
    });
  }
  return detailsById;
}

async function loadGeniImmediateFamily(profileId) {
  const person = state.people[profileId];
  if (!person || !/^profile-/i.test(profileId)) {
    throw new Error('This local profile is not linked to a Geni profile ID.');
  }
  if (!state.geniAccessToken) {
    beginGeniAuthorization(`family-import:immediate:${profileId}`);
    return;
  }
  const existingFamilyIds = new Set([...person.parents, ...person.children, ...allPartnerIds(person)]);
  const importedAt = new Date().toISOString();
  const { mapped } = await fetchGeniNeighborhood(profileId);
  const existingIds = new Set(Object.keys(state.people));
  const existingDateState = new Map(Object.keys(mapped).filter(id => existingIds.has(id)).map(id => [id, {
    birth: numericYear(state.people[id]?.birthYear),
    death: numericYear(state.people[id]?.deathYear)
  }]));
  Object.entries(mapped).forEach(([id, raw]) => {
    if (raw.public === false) return;
    const incoming = normalizePerson({
      ...raw,
      id,
      sourceId: id,
      sourceUrl: validGeniUrl(raw.profile_url) || `https://www.geni.com/profile/index/${geniProfileUrlId(id)}`,
      sourceProvider: 'geni',
      importedAt
    }, id);
    state.people[id] = mergePersonRecords(state.people[id], incoming);
  });
  const receivedIds = Object.keys(mapped).filter(id => state.people[id]);
  const newIds = receivedIds.filter(id => !existingIds.has(id));
  const completedExistingProfiles = [...existingDateState].filter(([id, before]) => (
    (before.birth == null && numericYear(state.people[id]?.birthYear) != null)
    || (before.death == null && numericYear(state.people[id]?.deathYear) != null)
  )).length;
  if (!state.people[profileId]) throw new Error('Geni did not return the selected public profile.');
  const refreshedFamilyIds = new Set([
    ...state.people[profileId].parents,
    ...state.people[profileId].children,
    ...allPartnerIds(state.people[profileId])
  ]);
  const restoredRelations = [...refreshedFamilyIds].filter(id => !existingFamilyIds.has(id)).length;
  state.people[profileId].geniImmediateFamilyLoaded = true;
  state.people[profileId].geniImmediateFamilyVerifiedAt = importedAt;
  state.people[profileId].geniImmediateFamilyIds = unique([
    ...state.people[profileId].geniImmediateFamilyIds,
    ...receivedIds.filter(id => id !== profileId)
  ]);
  if (state.geniImport?.profileId === profileId) {
    state.geniImport.loaded = Object.keys(mapped).length;
    state.geniImport.requests = 1;
  }
  try {
    const eventsByProfile = await fetchGeniReignEvents(Object.keys(mapped));
    Object.entries(eventsByProfile).forEach(([id, events]) => {
      if (state.people[id] && events.length) {
        state.people[id].personalEvents = normalizePersonalEvents([...state.people[id].personalEvents, ...events]);
      }
    });
  } catch { /* Optional event enrichment must not block family import. */ }
  persist('Immediate family imported from Geni');
  render();
  const countSummary = newIds.length
    ? `${newIds.length} new profile${newIds.length === 1 ? '' : 's'} added`
    : restoredRelations
      ? `no new profiles, but ${restoredRelations} missing family link${restoredRelations === 1 ? '' : 's'} restored`
      : 'no new public profiles or family links';
  const undatedCount = receivedIds.filter(id => numericYear(state.people[id]?.birthYear) == null).length;
  const dateSummary = undatedCount
    ? `${undatedCount} still ${undatedCount === 1 ? 'has' : 'have'} no public birth year.`
    : 'All returned profiles now have birth years.';
  const updateSummary = completedExistingProfiles
    ? ` ${completedExistingProfiles} existing profile${completedExistingProfiles === 1 ? '' : 's'} received missing date data.`
    : '';
  toast(`Geni returned ${receivedIds.length} union-linked family profiles; ${countSummary}.${updateSummary} ${dateSummary} All are listed in this profile’s family panel.`, true);
}

async function fetchGeniReignEvents(profileIds) {
  const eventsByProfile = {};
  const ids = unique(profileIds).filter(id => /^profile-/i.test(id));
  for (let index = 0; index < ids.length; index += 25) {
    const chunk = ids.slice(index, index + 25);
    const params = new URLSearchParams({
      ids: chunk.map(id => id.replace(/^profile-/i, '')).join(','),
      fields: 'id,events,detail_strings'
    });
    const payload = await fetchGeniJsonp('profile', Object.fromEntries(params));
    if (payload.error) throw new Error(payload.error.message || 'Geni did not return profile events.');
    geniProfilePayloadRecords(payload).forEach(raw => {
      const rawId = refId(raw.id || raw.url);
      if (!rawId) return;
      const id = geniProfileIdForApiProfile(raw, rawId);
      eventsByProfile[id] = extractGeniReignFacts(raw);
    });
  }
  return eventsByProfile;
}

function mergePersonRecords(existing, incoming) {
  if (!existing) return incoming;
  const preferred = { ...incoming, ...existing, id: existing.id || incoming.id };
  ['firstName', 'lastName', 'displayName', 'title', 'birthYear', 'deathYear', 'place', 'note'].forEach(field => {
    if (!clean(existing[field]) && clean(incoming[field])) preferred[field] = incoming[field];
  });
  if (!clean(existing.defaultNamePeriodId) && clean(incoming.defaultNamePeriodId)) {
    preferred.defaultNamePeriodId = incoming.defaultNamePeriodId;
  }
  // A placeholder such as "?" is missing data, not a local edit that should
  // prevent Geni from filling a real year on an existing profile.
  if (numericYear(existing.birthYear) == null && numericYear(incoming.birthYear) != null) preferred.birthYear = incoming.birthYear;
  if (numericYear(existing.deathYear) == null && numericYear(incoming.deathYear) != null) preferred.deathYear = incoming.deathYear;
  if (!['male', 'female'].includes(existing.gender) && ['male', 'female'].includes(incoming.gender)) preferred.gender = incoming.gender;
  preferred.isLiving = existing.isLiving === true || (!clean(existing.deathYear) && incoming.isLiving === true);
  const merged = normalizePerson(preferred, existing.id || incoming.id);
  merged.parents = unique([...incoming.parents, ...existing.parents]);
  merged.children = unique([...incoming.children, ...existing.children]);
  merged.partners = unique([...incoming.partners, ...existing.partners]);
  merged.spouses = unique([...incoming.spouses, ...existing.spouses]);
  merged.nonSpouses = unique([...incoming.nonSpouses, ...existing.nonSpouses]).filter(id => !merged.spouses.includes(id));
  merged.divorcedSpouses = unique([...incoming.divorcedSpouses, ...existing.divorcedSpouses]).filter(id => merged.spouses.includes(id));
  merged.marriageYears = { ...incoming.marriageYears, ...existing.marriageYears };
  merged.relationshipEndYears = { ...incoming.relationshipEndYears, ...existing.relationshipEndYears };
  merged.relationshipEndStatuses = { ...incoming.relationshipEndStatuses, ...existing.relationshipEndStatuses };
  merged.namePeriods = normalizeNamePeriods([...incoming.namePeriods, ...existing.namePeriods]);
  if (!merged.namePeriods.some(period => period.id === merged.defaultNamePeriodId)) {
    const formerDefaultName = defaultNamePeriod(existing)?.name || defaultNamePeriod(incoming)?.name;
    merged.defaultNamePeriodId = merged.namePeriods.find(period => formerDefaultName && period.name === formerDefaultName)?.id || '';
  }
  merged.personalEvents = normalizePersonalEvents([...incoming.personalEvents, ...existing.personalEvents]);
  merged.sourceUrl = incoming.sourceUrl || existing.sourceUrl;
  merged.sourceId = incoming.sourceId || existing.sourceId;
  merged.sourceProvider = incoming.sourceProvider || existing.sourceProvider;
  merged.importedAt = incoming.importedAt || existing.importedAt;
  merged.geniImmediateFamilyLoaded = incoming.geniImmediateFamilyLoaded || existing.geniImmediateFamilyLoaded;
  merged.geniImmediateFamilyVerifiedAt = incoming.geniImmediateFamilyVerifiedAt || existing.geniImmediateFamilyVerifiedAt;
  merged.geniImmediateFamilyIds = unique([...incoming.geniImmediateFamilyIds, ...existing.geniImmediateFamilyIds]);
  merged.starterProfile = incoming.starterProfile || existing.starterProfile;
  return merged;
}

async function importFromGeni(input, requestedDepth = 2, options = {}) {
  const id = profileIdFromInput(input);
  if (!id) throw new Error('Enter a valid geni.com public profile URL or profile ID.');
  const mode = options.mode === 'descendants' ? 'descendants' : 'connections';
  const persistResult = options.persistResult !== false;
  const allDescendants = mode === 'descendants' && options.allDescendants === true;
  const depthLimit = mode === 'descendants' ? 32 : 4;
  const depth = allDescendants ? Number.POSITIVE_INFINITY : Math.min(depthLimit, Math.max(1, Number.parseInt(requestedDepth, 10) || 2));
  const maxProfiles = 160;
  const maxRequests = 80;
  const importedAt = new Date().toISOString();
  const submittedSourceUrl = validGeniUrl(/^https?:/i.test(clean(input)) ? clean(input) : `https://${clean(input)}`);
  const discovered = {};
  const visited = new Set();
  const queued = new Set([id]);
  const queue = [{ id, distance: 0 }];
  let requests = 0;
  let skipped = 0;
  let focusId = id;
  if (persistResult) state.ephemeral = false;

  while (queue.length && Object.keys(discovered).length < maxProfiles && requests < maxRequests) {
    const current = queue.shift();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    requests += 1;
    toast(`Reading Geni connection ${requests} · ${Object.keys(discovered).length} profiles growing…`, true);
    let neighborhood;
    try { neighborhood = await fetchGeniNeighborhood(current.id); }
    catch (error) {
      if (current.id === id) throw error;
      skipped += 1;
      continue;
    }
    const rawFocusRef = refId(neighborhood.focusRaw?.id);
    const neighborhoodFocusId = /^profile-/i.test(rawFocusRef) ? rawFocusRef : (rawFocusRef ? `profile-${rawFocusRef}` : '');
    if (current.id === id) focusId = neighborhoodFocusId || id;
    Object.entries(neighborhood.mapped).forEach(([profileId, raw]) => {
      if (raw.public === false) return;
      if (Object.keys(discovered).length >= maxProfiles && !discovered[profileId]) return;
      const incoming = normalizePerson({ ...raw, id: profileId }, profileId);
      incoming.sourceId = profileId;
      incoming.sourceUrl = validGeniUrl(raw.profile_url) || (profileId === focusId ? submittedSourceUrl : '');
      incoming.sourceProvider = 'geni';
      incoming.importedAt = importedAt;
      discovered[profileId] = mergePersonRecords(discovered[profileId], incoming);
    });
    const loadedFocusId = discovered[current.id] ? current.id : neighborhoodFocusId;
    if (discovered[loadedFocusId]) {
      discovered[loadedFocusId].geniImmediateFamilyLoaded = true;
      discovered[loadedFocusId].geniImmediateFamilyVerifiedAt = importedAt;
    }

    Object.entries(discovered).forEach(([profileId, person]) => {
      state.people[profileId] = mergePersonRecords(state.people[profileId], person);
    });
    if (state.geniImport?.profileId === id) {
      state.geniImport.loaded = Object.keys(discovered).length;
      state.geniImport.requests = requests;
    }
    state.rootId = state.rootId || focusId;
    state.selectedId = state.selectedId || focusId;
    if (options.title) state.title = options.title;
    else if (state.title === 'Untitled family') state.title = `${fullName(state.people[focusId] || {})} family`;
    els['save-status'].textContent = `Geni import · ${Object.keys(discovered).length} profiles`;
    render();
    await new Promise(resolve => requestAnimationFrame(resolve));

    if (current.distance + 1 < depth) {
      const currentProfile = discovered[current.id] || discovered[neighborhoodFocusId];
      const nextIds = mode === 'descendants'
        ? (currentProfile?.children || [])
        : Object.keys(neighborhood.mapped);
      nextIds.forEach(profileId => {
        if (!discovered[profileId] || visited.has(profileId) || queued.has(profileId)) return;
        queued.add(profileId);
        queue.push({ id: profileId, distance: current.distance + 1 });
      });
    }
  }
  try {
    const reignEvents = await fetchGeniReignEvents(Object.keys(discovered));
    Object.entries(reignEvents).forEach(([profileId, events]) => {
      if (discovered[profileId] && events.length) discovered[profileId].personalEvents = normalizePersonalEvents([...discovered[profileId].personalEvents, ...events]);
    });
  } catch {
    // Reign events are optional enrichment; a restricted event request must not discard the family graph.
  }
  Object.entries(discovered).forEach(([profileId, person]) => {
    state.people[profileId] = mergePersonRecords(state.people[profileId], person);
  });
  state.rootId = state.rootId || focusId;
  state.selectedId = focusId;
  if (options.title) state.title = options.title;
  else if (state.title === 'Untitled family') state.title = `${fullName(state.people[focusId] || {})} family`;
  if (persistResult) persist(`Imported from Geni · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  else els['save-status'].textContent = 'Live Geni data · not saved';
  render();
  const limitNote = Object.keys(discovered).length >= maxProfiles || requests >= maxRequests ? ' Safety limit reached.' : '';
  const skipNote = skipped ? ` ${skipped} restricted connection${skipped === 1 ? '' : 's'} skipped.` : '';
  const scopeNote = allDescendants ? ' through all reachable descendant generations' : ` across depth ${depth}`;
  toast(`Grew ${Object.keys(discovered).length} live Geni profiles${scopeNote}.${skipNote}${limitNote}`, true);
}

const GENI_FAMILY_IMPORT_SCOPES = {
  immediate: { label: 'Immediate family', depth: 1 },
  'descendants-2': { label: 'Descendants · 2 generations', depth: 2 },
  'descendants-all': { label: 'All descendants', depth: 2, allDescendants: true }
};

function geniFamilyImportIntent(intent) {
  const legacyPrefix = 'immediate-family:';
  if (intent.startsWith(legacyPrefix)) return { scope: 'immediate', profileId: intent.slice(legacyPrefix.length) };
  const match = intent.match(/^family-import:(immediate|descendants-2|descendants-all):(profile-.+)$/i);
  return match ? { scope: match[1].toLowerCase(), profileId: match[2] } : null;
}

async function runGeniFamilyImport(profileId, scope) {
  const config = GENI_FAMILY_IMPORT_SCOPES[scope];
  const person = state.people[profileId];
  if (!config || !person || !/^profile-/i.test(profileId)) {
    throw new Error('This local profile is not linked to a Geni profile ID.');
  }
  if (state.geniImport) return toast('Another Geni import is already running.', true);
  if (!state.geniAccessToken) {
    beginGeniAuthorization(`family-import:${scope}:${profileId}`);
    return;
  }
  state.geniImport = { profileId, scope, loaded: 0, requests: 0 };
  render();
  try {
    if (scope === 'immediate') await loadGeniImmediateFamily(profileId);
    else await importFromGeni(profileId, config.depth, { mode: 'descendants', allDescendants: config.allDescendants === true });
  } catch (error) {
    if (error?.code === 'GENI_INVALID_ACCESS_TOKEN') {
      // Resume this exact operation after Geni returns a fresh token. Clear
      // both the stale token and any prior redirect guard before authorizing.
      state.geniAccessToken = '';
      sessionValue(GENI_TOKEN_SESSION_KEY, null);
      sessionValue(GENI_OAUTH_PENDING_KEY, null);
      beginGeniAuthorization(`family-import:${scope}:${profileId}`);
      return;
    }
    throw error;
  } finally {
    state.geniImport = null;
    render();
  }
}

function importGedcom(text, fileName = 'GEDCOM tree') {
  const records = new Map();
  let current = null;
  let event = '';
  String(text).split(/\r?\n/).forEach(line => {
    const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([^\s]+)(?:\s+(.*))?$/);
    if (!match) return;
    const level = Number(match[1]);
    const pointer = clean(match[2]);
    const tag = clean(match[3]);
    const value = clean(match[4]);
    if (level === 0) {
      current = pointer ? { pointer, type: tag, fields: {}, children: [] } : null;
      if (current) records.set(pointer, current);
      event = '';
      return;
    }
    if (!current) return;
    if (level === 1) event = ['BIRT', 'DEAT', 'MARR'].includes(tag) ? tag : '';
    if ((level === 1 && ['NAME', 'SEX', 'AGE', 'HUSB', 'WIFE', 'CHIL'].includes(tag)) || (level <= 2 && ['GIVN', 'SURN'].includes(tag))) {
      if (tag === 'CHIL') current.children.push(value);
      else current.fields[tag] = value;
    } else if (level === 2 && event && ['DATE', 'PLAC'].includes(tag)) {
      current.fields[`${event}_${tag}`] = value;
    }
  });
  const people = {};
  const pointerToId = pointer => `gedcom-${pointer.replace(/@/g, '')}`;
  const yearFromDate = value => clean(value).match(/-?\d{3,4}/)?.[0] || '';
  [...records.values()].filter(record => record.type === 'INDI').forEach(record => {
    const slashName = record.fields.NAME?.match(/^(.*?)\s*\/([^/]*)\//);
    const id = pointerToId(record.pointer);
    people[id] = normalizePerson({
      id,
      firstName: clean(record.fields.GIVN || slashName?.[1]),
      lastName: clean(record.fields.SURN || slashName?.[2]),
      nameOrder: 'western',
      gender: record.fields.SEX === 'M' ? 'male' : record.fields.SEX === 'F' ? 'female' : 'unknown',
      birthYear: yearFromDate(record.fields.BIRT_DATE),
      deathYear: yearFromDate(record.fields.DEAT_DATE),
      place: clean(record.fields.BIRT_PLAC || record.fields.DEAT_PLAC),
      sourceProvider: 'gedcom', importedAt: new Date().toISOString()
    }, id);
  });
  [...records.values()].filter(record => record.type === 'FAM').forEach(record => {
    const parents = [record.fields.HUSB, record.fields.WIFE].filter(Boolean).map(pointerToId).filter(id => people[id]);
    const children = record.children.map(pointerToId).filter(id => people[id]);
    const marriageYear = yearFromDate(record.fields.MARR_DATE);
    parents.forEach(parentId => {
      people[parentId].children = unique([...people[parentId].children, ...children]);
      people[parentId].partners = unique([...people[parentId].partners, ...parents.filter(id => id !== parentId)]);
      people[parentId].spouses = unique([...people[parentId].spouses, ...parents.filter(id => id !== parentId)]);
      if (marriageYear) parents.filter(id => id !== parentId).forEach(partnerId => { people[parentId].marriageYears[partnerId] = marriageYear; });
    });
    children.forEach(childId => { people[childId].parents = unique([...people[childId].parents, ...parents]); });
  });
  if (!Object.keys(people).length) throw new Error('No individual records were found in that GEDCOM file.');
  state.people = people;
  state.manualTree = true;
  state.globalEvents = normalizeGlobalEvents(payload.globalEvents || payload.timelineEvents || payload.db?.timelineEvents);
  state.rootId = Object.keys(people).find(id => !people[id].parents.length) || Object.keys(people)[0];
  state.selectedId = state.rootId;
  state.title = clean(fileName.replace(/\.(ged|gedcom)$/i, '')) || 'Imported family';
  persist('GEDCOM imported');
  render();
  toast(`Imported ${Object.keys(people).length} profiles from GEDCOM.`);
}

function stitchPrompt(anchorId = '') {
  const anchorIds = unique([anchorId, state.rootId]).filter(id => state.people[id]);
  const anchors = anchorIds.map(id => {
    const person = state.people[id];
    return {
      id: person.id,
      displayName: fullName(person),
      birthYear: person.birthYear || null,
      deathYear: person.isLiving ? null : (person.deathYear || null),
      isLiving: person.isLiving,
      sourceUrl: person.sourceUrl || null,
      sourceId: person.sourceId || null,
      sourceProvider: person.sourceProvider || null,
      defaultNamePeriodId: person.defaultNamePeriodId || null,
      namePeriods: person.namePeriods
    };
  });
  const task = anchorId && state.people[anchorId]
    ? `Research the publicly documented family I request around ${fullName(state.people[anchorId])}. Include the relatives and generations I specify when I give you this prompt.`
    : 'Research the publicly documented family branch I describe when I give you this prompt.';
  return `${task}

Prepare an import package for the Lineage genealogy-timeline web app:
Repository: ${REPOSITORY_URL}
Schema: ${STITCH_SCHEMA_URL}
Example JSON: ${STITCH_EXAMPLE_URL}

Read the schema and example before answering. Return exactly one JSON object using schema "lineage-stitch" and version 1. Do not wrap it in Markdown and do not add commentary.

Requirements:
- Use public, attributable sources only. Do not infer uncertain relationships as facts.
- Include every person referenced by a parent, child, partner, or spouse ID.
- Preserve the exact IDs of matching anchors below so the web app can stitch new records into its existing tree.
- For other people, use a durable public identifier prefixed by its provider, such as "profile-g…" or "wikidata-Q…". Never use a bare name as an ID.
- Put formally married people in both "partners" and "spouses". Put non-marital partners in "partners" and "nonSpouses", never in "spouses".
- Make parent/child and partner/spouse relationships reciprocal. Group children under the correct two parents.
- Give marriage years in "marriageYears" keyed by spouse ID. Use relationshipEndStatuses values "annulled", "divorced", or "ended" when supported.
- Prefer displayName as publicly displayed, including titles useful for searching. Use four-digit years where known; use null or omit fields when unknown.
- When a ruler or noble is identified by a numeral, follow it with the substantive title after a comma—for example, "Louis IV, Grand Duke of Hesse and by Rhine"—rather than treating the territory as a surname or putting the title in parentheses. Keep geographic or dynastic bynames for children distinct from titles.
- Research the names and titles by which each person was known during different periods of life. Consult Wikipedia and other reliable public biographical or official sources in addition to genealogy profiles.
- For royal and noble profiles, use Wikipedia's "Titles and styles" chronology where available, checking important transitions against official or other reliable sources.
- Store readable names and substantive titles only. Omit honorific style prefixes such as HM, HRH, His or Her Majesty, and His or Her Royal Highness.
- Put those chronological labels in "namePeriods" as objects with id, name, startYear, endYear, and sourceUrl. Use open null boundaries when necessary, avoid overlapping periods, and do not invent unsupported titles.
- Set "defaultNamePeriodId" to the one dated name by which the person is best known. It need not be the final title; do not choose a temporary widowhood, dowager, abdication, or retirement title merely because it came last.
- Include sourceUrl, sourceId, and sourceProvider for every researched profile.
- Set focusId to the main person researched. Do not include global events unless I explicitly ask for them.

Existing anchors (these are facts from the current local tree; do not rename their IDs):
${JSON.stringify(anchors, null, 2)}

My specific research request:
[Replace this line with the relatives, direction, and generation depth you want researched.]`;
}

function normalizeStitchPeople(rawPeople) {
  if (Array.isArray(rawPeople)) {
    return Object.fromEntries(rawPeople.map((person, index) => {
      const id = clean(person?.id);
      if (!id) throw new Error(`AI import profile ${index + 1} has no stable ID.`);
      return [id, person];
    }));
  }
  if (!rawPeople || typeof rawPeople !== 'object') throw new Error('AI import must contain a people object or array.');
  return rawPeople;
}

function stitchImport(payload) {
  if (payload?.schema !== 'lineage-stitch' || Number(payload.version) !== 1) {
    throw new Error('This is not a lineage-stitch version 1 package.');
  }
  const importedAt = new Date().toISOString();
  const incomingPeople = migrateGeniPeople(normalizeStitchPeople(payload.people)).people;
  const incomingIds = Object.keys(incomingPeople);
  if (!incomingIds.length) throw new Error('The AI import contains no profiles.');
  const previousIds = new Set(Object.keys(state.people));

  incomingIds.forEach(id => {
    const incoming = normalizePerson({ ...incomingPeople[id], importedAt: incomingPeople[id].importedAt || importedAt }, id);
    state.people[id] = mergePersonRecords(state.people[id], incoming);
  });

  const missingRefs = new Set();
  const existingRef = id => {
    if (state.people[id]) return true;
    missingRefs.add(id);
    return false;
  };
  incomingIds.forEach(id => {
    const person = state.people[id];
    person.parents = person.parents.filter(existingRef);
    person.children = person.children.filter(existingRef);
    person.partners = person.partners.filter(existingRef);
    person.spouses = person.spouses.filter(existingRef);
    person.nonSpouses = person.nonSpouses.filter(existingRef);
    person.divorcedSpouses = person.divorcedSpouses.filter(existingRef);
    person.parents.forEach(parentId => { state.people[parentId].children = unique([...state.people[parentId].children, id]); });
    person.children.forEach(childId => { state.people[childId].parents = unique([...state.people[childId].parents, id]); });
    person.partners.forEach(partnerId => { state.people[partnerId].partners = unique([...state.people[partnerId].partners, id]); });
    person.spouses.forEach(spouseId => {
      state.people[spouseId].partners = unique([...state.people[spouseId].partners, id]);
      state.people[spouseId].spouses = unique([...state.people[spouseId].spouses, id]);
      person.partners = unique([...person.partners, spouseId]);
      const marriageYear = clean(person.marriageYears[spouseId]);
      if (marriageYear && !clean(state.people[spouseId].marriageYears[id])) state.people[spouseId].marriageYears[id] = marriageYear;
    });
  });

  if (Array.isArray(payload.globalEvents)) {
    const combined = [...state.globalEvents, ...normalizeGlobalEvents(payload.globalEvents)];
    state.globalEvents = combined.filter((event, index) => combined.findIndex(other => other.id === event.id) === index);
  }
  const focusId = clean(payload.focusId);
  if (!state.rootId || !state.people[state.rootId]) state.rootId = state.people[clean(payload.rootId)] ? clean(payload.rootId) : incomingIds[0];
  if (state.people[focusId]) state.selectedId = focusId;
  state.manualTree = true;
  persist('AI research stitched into this tree');
  render();
  const newCount = incomingIds.filter(id => !previousIds.has(id)).length;
  const updatedCount = incomingIds.length - newCount;
  const missingNote = missingRefs.size ? ` ${missingRefs.size} dangling reference${missingRefs.size === 1 ? '' : 's'} omitted.` : '';
  toast(`Stitched ${newCount} new and ${updatedCount} matching profile${updatedCount === 1 ? '' : 's'} into this tree.${missingNote}`, true);
  return { newCount, updatedCount, missingCount: missingRefs.size };
}

function importBackup(payload) {
  if (payload?.schema === 'lineage-stitch') return stitchImport(payload);
  const rawPeople = payload.people || payload.db?.people;
  if (!rawPeople || typeof rawPeople !== 'object') throw new Error('This file does not contain a supported people collection.');
  state.reignColor = paletteColor(payload.reignColor || payload.db?.reignColor, DEFAULT_REIGN_EVENT_COLOR);
  state.timelineYearWidth = timelineYearWidth(payload.timelineYearWidth || payload.db?.timelineYearWidth);
  state.timelineNodeHeight = timelineNodeHeight(payload.timelineNodeHeight || payload.db?.timelineNodeHeight);
  state.asOfYear = numericYear(payload.asOfYear || payload.db?.asOfYear);
  state.treeFilter = clean(payload.treeFilter || payload.db?.treeFilter);
  state.relationVisibility = migrateRelationVisibility(payload.relationVisibility || payload.db?.relationVisibility).relationVisibility;
  const people = migrateGeniPeople(rawPeople).people;
  // The mini-program stores children/spouses on profiles. Reconstruct reverse parent links for the web layout.
  Object.values(people).forEach(person => {
    person.children.forEach(childId => {
      if (people[childId]) people[childId].parents = unique([...people[childId].parents, person.id]);
    });
    person.partners.forEach(partnerId => {
      if (people[partnerId]) people[partnerId].partners = unique([...people[partnerId].partners, person.id]);
    });
    person.spouses.forEach(spouseId => {
      if (people[spouseId]) people[spouseId].spouses = unique([...people[spouseId].spouses, person.id]);
    });
    person.divorcedSpouses.forEach(spouseId => {
      if (people[spouseId]) people[spouseId].divorcedSpouses = unique([...people[spouseId].divorcedSpouses, person.id]);
    });
  });
  state.people = people;
  state.manualTree = payload.manualTree !== false;
  const importedRootId = clean(payload.activeRootId || payload.db?.activeRootId);
  state.rootId = (/^profile-/i.test(importedRootId) ? canonicalGeniProfileId(importedRootId) : importedRootId) || Object.keys(people)[0] || '';
  state.title = clean(payload.title || payload.familyName) || `${fullName(people[state.rootId] || {})} family`;
  state.selectedId = state.rootId;
  els['tree-filter'].value = state.treeFilter;
  persist('Backup imported');
  render();
  toast(`Imported ${Object.keys(people).length} profiles.`);
}

function exportBackup() {
  const payload = {
    schema: 'lineage-web', version: 1, exportedAt: new Date().toISOString(),
    title: state.title, activeRootId: state.rootId, people: state.people, globalEvents: state.globalEvents, reignColor: state.reignColor, timelineYearWidth: state.timelineYearWidth, timelineNodeHeight: state.timelineNodeHeight, asOfYear: state.asOfYear, treeFilter: state.treeFilter, relationVisibility: state.relationVisibility, manualTree: state.manualTree,
    provenance: { sources: ['public APIs', 'linked public profiles', 'portable tree files'], disclaimer: 'Independent software; not endorsed by linked genealogy services.' }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'family'}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast('Tree exported as JSON.');
}

function exportFileStem() {
  return state.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'family';
}

function svgDocumentStyles() {
  return [...document.styleSheets].flatMap(sheet => {
    try { return [...sheet.cssRules].map(rule => rule.cssText); }
    catch { return []; }
  }).join('\n');
}

async function saveTimelineImage() {
  const button = els['save-image-button'];
  const timeline = els['timeline-canvas'];
  const ruler = els['timeline-ruler'];
  if (timeline.hidden || !timeline.childNodes.length) {
    toast('Add a dated profile before saving an image.', true);
    return;
  }

  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Rendering…';
  try {
    await document.fonts?.ready;
    const timelineBox = timeline.viewBox.baseVal;
    const rulerBox = ruler.viewBox.baseVal;
    const rulerHeight = rulerBox.height || 60;
    // The live canvas includes generous drag space on every side. It is useful
    // while navigating, but an exported image should end at the actual layout
    // bounds rather than preserving those four panning margins.
    const exportBox = {
      x: timelineBox.x + TIMELINE_PAN_MARGIN.left,
      y: timelineBox.y + TIMELINE_PAN_MARGIN.top,
      width: timelineBox.width - TIMELINE_PAN_MARGIN.left - TIMELINE_PAN_MARGIN.right,
      height: timelineBox.height - TIMELINE_PAN_MARGIN.top - TIMELINE_PAN_MARGIN.bottom
    };
    const logicalWidth = Math.ceil(exportBox.width);
    const logicalHeight = Math.ceil(rulerHeight + exportBox.height);
    const maximumDimension = 14000;
    const maximumPixels = 80000000;
    const scale = Math.max(.01, Math.min(
      2,
      maximumDimension / logicalWidth,
      maximumDimension / logicalHeight,
      Math.sqrt(maximumPixels / (logicalWidth * logicalHeight))
    ));
    const pixelWidth = Math.max(1, Math.floor(logicalWidth * scale));
    const pixelHeight = Math.max(1, Math.floor(logicalHeight * scale));

    const exported = document.createElementNS(SVG_NS, 'svg');
    exported.setAttribute('xmlns', SVG_NS);
    exported.setAttribute('width', logicalWidth);
    exported.setAttribute('height', logicalHeight);
    exported.setAttribute('viewBox', `${exportBox.x} 0 ${logicalWidth} ${logicalHeight}`);
    exported.append(svg('title', {}, `${state.title} genealogy timeline`));
    const defs = svg('defs');
    defs.append(svg('style', { type: 'text/css' }, svgDocumentStyles()));
    exported.append(defs);
    exported.append(svg('rect', { x: exportBox.x, y: 0, width: logicalWidth, height: logicalHeight, fill: '#fff' }));

    const timelineClone = timeline.cloneNode(true);
    const timelineGroup = svg('g', { transform: `translate(0 ${rulerHeight - exportBox.y})` });
    timelineGroup.append(...timelineClone.childNodes);
    exported.append(timelineGroup);

    const rulerClone = ruler.cloneNode(true);
    const rulerGroup = svg('g', { class: 'timeline-grid' });
    rulerGroup.append(...rulerClone.childNodes);
    exported.append(rulerGroup);

    const source = new Blob([new XMLSerializer().serializeToString(exported)], { type: 'image/svg+xml;charset=utf-8' });
    const sourceUrl = URL.createObjectURL(source);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('The timeline image could not be rendered.'));
        image.src = sourceUrl;
      });
      const bitmap = document.createElement('canvas');
      bitmap.width = pixelWidth;
      bitmap.height = pixelHeight;
      const context = bitmap.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, pixelWidth, pixelHeight);
      context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
      const png = await new Promise(resolve => bitmap.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('The browser could not create the PNG file.');
      const downloadUrl = URL.createObjectURL(png);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${exportFileStem()}-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      toast(`Saved full timeline as ${pixelWidth.toLocaleString()} × ${pixelHeight.toLocaleString()} PNG.`);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  } catch (error) {
    toast(error.message || 'Could not save the timeline image.', true);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function partnerRelationKey(firstId, secondId) {
  return `partner:${[firstId, secondId].sort().join('|')}`;
}
function childRelationKey(parentId, childId) { return `child:${parentId}>${childId}`; }
function profileVisibilityKey(profileId) { return `profile:${profileId}`; }
function relationOverride(key) { return Object.hasOwn(state.relationVisibility, key) ? state.relationVisibility[key] : null; }
function marriageYearFor(firstId, secondId) {
  return numericYear(state.people[firstId]?.marriageYears?.[secondId] || state.people[secondId]?.marriageYears?.[firstId]);
}
function allPartnerIds(person) { return unique([...(person?.spouses || []), ...(person?.partners || [])]).filter(id => state.people[id]); }
function activeDescendantScope() {
  return computeDescendantScope(state.people, state.rootId);
}
function scopedSpouseIds(person, scope = activeDescendantScope()) {
  return [...(scope.spouseIdsByPerson.get(person?.id) || [])].filter(id => state.people[id]);
}
function scopedHouseholdChildren(personId, partnerId = '', scope = activeDescendantScope()) {
  return householdChildren(personId, partnerId).filter(childId => scope.descendantIds.has(childId));
}
function householdChildren(personId, partnerId = '') {
  const person = state.people[personId];
  if (!person) return [];
  return person.children.filter(childId => {
    const child = state.people[childId];
    if (!child) return false;
    if (!partnerId) return !child.parents.some(parentId => parentId !== personId && allPartnerIds(person).includes(parentId));
    return child.parents.includes(partnerId);
  });
}

function buildTimelineVisibility() {
  const scope = activeDescendantScope();
  const allIds = [...scope.allowedIds];
  // Child visibility belongs to the whole parental household. A descendant
  // can be hidden, but no override is allowed to pull a collateral relative,
  // an ancestor, or a spouse's other family into the active tree.
  const childEdgeVisible = (parentId, childId) => {
    if (!scope.descendantIds.has(childId) || !scope.allowedIds.has(parentId)) return false;
    if (relationOverride(childRelationKey(parentId, childId)) === false) return false;
    const parentIds = state.people[childId]?.parents || [];
    return !parentIds.some(id => relationOverride(childRelationKey(id, childId)) === false);
  };

  const descendantsOfRoot = new Set();
  const descendantQueue = scope.descendantIds.has(state.rootId) ? [state.rootId] : [];
  while (descendantQueue.length) {
    const id = descendantQueue.shift();
    if (descendantsOfRoot.has(id) || !scope.descendantIds.has(id) || !state.people[id]) continue;
    descendantsOfRoot.add(id);
    state.people[id].children.forEach(childId => {
      if (scope.descendantIds.has(childId) && childEdgeVisible(id, childId)) descendantQueue.push(childId);
    });
  }

  const query = clean(els['tree-filter']?.value).toLocaleLowerCase();
  const keywords = query.split(/\s+/).filter(Boolean);
  const matches = allIds.filter(id => keywords.some(keyword => matchesKeyword(state.people[id], keyword)));
  const hasRoot = scope.descendantIds.has(state.rootId);
  const visible = new Set(query ? (hasRoot ? [state.rootId] : matches) : descendantsOfRoot);
  const matchedPartnerPairs = new Set();

  if (query) {
    const pathSeeds = new Set();
    matches.forEach(id => {
      if (descendantsOfRoot.has(id)) {
        visible.add(id);
        pathSeeds.add(id);
        return;
      }
      if (!scope.affinalIds.has(id)) return;
      // A matching spouse is attached only to the descendant whom they married.
      // Their parents, siblings, other spouses, and unrelated children remain
      // outside this root's descendant projection.
      scopedSpouseIds(state.people[id], scope).forEach(partnerId => {
        if (!descendantsOfRoot.has(partnerId)) return;
        const pairKey = partnerRelationKey(id, partnerId);
        visible.add(id);
        visible.add(partnerId);
        pathSeeds.add(partnerId);
        matchedPartnerPairs.add(pairKey);
      });
    });
    const queue = [...pathSeeds];
    while (queue.length) {
      const childId = queue.shift();
      const child = state.people[childId];
      if (!child) continue;
      child.parents.forEach(parentId => {
        if (!descendantsOfRoot.has(parentId) || !childEdgeVisible(parentId, childId) || visible.has(parentId)) return;
        visible.add(parentId);
        queue.push(parentId);
      });
    }
  } else {
    Object.entries(state.relationVisibility).forEach(([key, shown]) => {
      if (shown || !key.startsWith('child:')) return;
      const childId = key.split('>').pop();
      if (!scope.descendantIds.has(childId)) return;
      const queue = [childId];
      while (queue.length) {
        const id = queue.shift();
        if (!visible.delete(id)) continue;
        (state.people[id]?.children || []).forEach(nextId => {
          if (scope.descendantIds.has(nextId)) queue.push(nextId);
        });
      }
    });
  }

  // A manually shown child can be inspected even when it is not part of the
  // current keyword path, but only when it is structurally below this root.
  Object.entries(state.relationVisibility).forEach(([key, shown]) => {
    if (!shown || !key.startsWith('child:')) return;
    const relation = key.slice('child:'.length);
    const split = relation.lastIndexOf('>');
    const parentId = relation.slice(0, split);
    const childId = relation.slice(split + 1);
    if (scope.allowedIds.has(parentId) && scope.descendantIds.has(childId) && visible.has(parentId)) visible.add(childId);
  });
  // Legacy profile overrides are honored only inside the current descendant
  // scope. They can never resurrect an unrelated mini-tree.
  Object.entries(state.relationVisibility).forEach(([key, shown]) => {
    if (!shown || !key.startsWith('profile:')) return;
    const profileId = key.slice('profile:'.length);
    if (scope.allowedIds.has(profileId)) visible.add(profileId);
  });

  const renderedPartnerPairs = new Set();
  scope.spousePairs.forEach(key => {
    const [firstId, secondId] = key.slice('partner:'.length).split('|');
    if (!state.people[firstId] || !state.people[secondId]) return;
    const override = relationOverride(key);
    if (override === false) return;
    const touchesVisibleDescendant = [firstId, secondId].some(id => descendantsOfRoot.has(id) && visible.has(id));
    if (!touchesVisibleDescendant) return;
    const carriesVisibleChild = unique([
      ...scopedHouseholdChildren(firstId, secondId, scope),
      ...scopedHouseholdChildren(secondId, firstId, scope)
    ]).some(childId => visible.has(childId));
    const defaultVisible = !query || carriesVisibleChild;
    if (override === true || matchedPartnerPairs.has(key) || defaultVisible) renderedPartnerPairs.add(key);
  });

  renderedPartnerPairs.forEach(key => {
    const [firstId, secondId] = key.slice('partner:'.length).split('|');
    if (visible.has(firstId) || visible.has(secondId)) {
      visible.add(firstId);
      visible.add(secondId);
    }
  });

  // An affinal profile survives only as the spouse occurrence attached to a
  // visible lineal descendant. This is the boundary that excludes, for
  // example, John Neville's separate marriage tree from Henry VII's view.
  [...visible].forEach(id => {
    if (!scope.allowedIds.has(id)) {
      visible.delete(id);
      return;
    }
    if (!scope.affinalIds.has(id)) return;
    const hasRenderedHousehold = scopedSpouseIds(state.people[id], scope).some(partnerId =>
      descendantsOfRoot.has(partnerId)
      && visible.has(partnerId)
      && renderedPartnerPairs.has(partnerRelationKey(id, partnerId))
    );
    if (!hasRenderedHousehold) visible.delete(id);
  });

  return { visibleIds: visible, renderedPartnerPairs, descendantsOfRoot, childEdgeVisible, scope };
}

function svg(tag, attrs = {}, text = '') {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  if (text) node.textContent = text;
  return node;
}

function leftRoundedRectPath(width, height, radius = 5) {
  const r = Math.min(radius, width / 2, height / 2);
  return `M ${r} 0 H ${width} V ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

function timelineNodeRange(node) {
  const gutter = 4;
  return { left: node.x - gutter, right: node.x + Math.max(node.occupancyWidth, 2) + gutter };
}

function timelineRowsConflict(firstIndex, secondIndex, nodeRanges, horizontalRangesByKey, nodes) {
  const overlaps = (a, b) => a.left < b.right && b.left < a.right;
  const firstNodeRange = nodeRanges[firstIndex];
  const secondNodeRange = nodeRanges[secondIndex];
  if (overlaps(firstNodeRange, secondNodeRange)) return true;
  const firstLines = horizontalRangesByKey.get(nodes[firstIndex].key) || [];
  const secondLines = horizontalRangesByKey.get(nodes[secondIndex].key) || [];
  return firstLines.some(line => overlaps(line, secondNodeRange))
    || secondLines.some(line => overlaps(line, firstNodeRange));
}

function timelineNodesAreImmediateFamily(firstNode, secondNode) {
  if (!firstNode || !secondNode || firstNode.id === secondNode.id) return true;
  const first = state.people[firstNode.id];
  const second = state.people[secondNode.id];
  if (!first || !second) return false;
  const spouses = first.spouses.includes(second.id) || second.spouses.includes(first.id);
  const parentChild = first.children.includes(second.id) || second.children.includes(first.id)
    || first.parents.includes(second.id) || second.parents.includes(first.id);
  const siblings = first.parents.some(parentId => second.parents.includes(parentId));
  return spouses || parentChild || siblings;
}

function timelineVerticalSeparation(firstIndex, secondIndex, nodes, rowStep) {
  const unrelatedExtraGutter = 6;
  return rowStep + (timelineNodesAreImmediateFamily(nodes[firstIndex], nodes[secondIndex]) ? 0 : unrelatedExtraGutter);
}

function stabilizeTimelineOrder(nodes, displayParentByKey, rowHeight, rowStep, horizontalRangesByKey) {
  const ranges = nodes.map(timelineNodeRange);
  // Match the mini-program's row invariant: intersecting horizontal ranges must
  // occupy distinct full rows. Using only rowHeight allowed adjacent strokes to
  // touch after the fractional-row compaction passes; rowStep retains the
  // intended six-pixel vertical gutter for the web's 36px boxes on 42px rows.
  const requiredVerticalSeparation = Math.max(rowHeight, rowStep);
  const indexByKey = new Map(nodes.map((node, index) => [node.key, index]));
  const preferredY = nodes.map(node => Math.max(0, node.y));
  const childrenByIndex = new Map(nodes.map((_, index) => [index, []]));
  const parentIndexByIndex = new Map();
  nodes.forEach((node, index) => {
    const parentIndex = indexByKey.get(displayParentByKey.get(node.key));
    if (parentIndex == null || parentIndex === index) return;
    parentIndexByIndex.set(index, parentIndex);
    childrenByIndex.get(parentIndex).push(index);
  });
  const subtreeCache = new Map();
  const subtreeIndexes = rootIndex => {
    if (subtreeCache.has(rootIndex)) return subtreeCache.get(rootIndex);
    const indexes = [rootIndex];
    childrenByIndex.get(rootIndex).forEach(childIndex => indexes.push(...subtreeIndexes(childIndex)));
    subtreeCache.set(rootIndex, indexes);
    return indexes;
  };
  const depthOf = index => {
    let depth = 0;
    for (let parent = parentIndexByIndex.get(index); parent != null; parent = parentIndexByIndex.get(parent)) depth += 1;
    return depth;
  };
  // A sibling is not just one box: it owns a whole descendant branch. Reassign
  // the compacted branch slots in birth order, translating every node in each
  // block together. This keeps the compact layout without leaving one sibling
  // sitting on top of another sibling's descendants.
  const siblingHouseholdConstraints = new Map();
  [...childrenByIndex.entries()]
    .filter(([, childIndexes]) => childIndexes.length > 1)
    .sort(([firstParent], [secondParent]) => depthOf(secondParent) - depthOf(firstParent))
    .forEach(([, childIndexes]) => {
      const branches = childIndexes.map(rootIndex => ({ rootIndex, indexes: subtreeIndexes(rootIndex) }));
      const originalSlots = branches.map(branch => Math.min(...branch.indexes.map(index => preferredY[index])));
      const compactedSlots = [...originalSlots].sort((first, second) => first - second);
      branches.forEach((branch, branchIndex) => {
        const top = Math.min(...branch.indexes.map(index => preferredY[index]));
        const shift = compactedSlots[branchIndex] - top;
        branch.indexes.forEach(index => { preferredY[index] += shift; });
      });
      // Keep the next sibling below the preceding sibling's immediate
      // household. A spouse root is different: it begins an ordered marriage
      // group, so its complete descendant block must finish before the next
      // spouse group starts. Otherwise contour compaction can put one wife's
      // child among another wife's branch.
      for (let branchIndex = 1; branchIndex < branches.length; branchIndex += 1) {
        const precedingRoot = branches[branchIndex - 1].rootIndex;
        const followingRoot = branches[branchIndex].rootIndex;
        const precedingHousehold = [precedingRoot];
        childrenByIndex.get(precedingRoot).forEach(childIndex => {
          precedingHousehold.push(childIndex);
          if (nodes[childIndex].isSpouse) precedingHousehold.push(...childrenByIndex.get(childIndex));
        });
        const protectsMarriageOrder = nodes[precedingRoot].isSpouse || nodes[followingRoot].isSpouse;
        const uniquePrecedingHousehold = protectsMarriageOrder
          ? branches[branchIndex - 1].indexes
          : unique(precedingHousehold);
        const householdBottom = Math.max(...uniquePrecedingHousehold.map(index => preferredY[index]));
        const followingTop = Math.min(...branches[branchIndex].indexes.map(index => preferredY[index]));
        const householdShift = Math.max(0, householdBottom + rowStep - followingTop);
        if (householdShift) branches[branchIndex].indexes.forEach(index => { preferredY[index] += householdShift; });
        branches[branchIndex].indexes.forEach(index => {
          if (!siblingHouseholdConstraints.has(index)) siblingHouseholdConstraints.set(index, []);
          siblingHouseholdConstraints.get(index).push(uniquePrecedingHousehold);
        });
      }
  });
  // Consecutive direct relatives form a rigid packing run. Place and move the
  // run as one object so a collision can never insert an unrelated row between
  // a spouse pair, a parent and child, or adjacent siblings. Unrelated runs
  // retain the extra minimum gutter supplied by timelineVerticalSeparation and
  // may be farther apart when another occupied range blocks them.
  const directRuns = [];
  nodes.forEach((_, index) => {
    const currentRun = directRuns.at(-1);
    const previousIndex = currentRun?.at(-1);
    if (previousIndex != null && timelineNodesAreImmediateFamily(nodes[previousIndex], nodes[index])) currentRun.push(index);
    else directRuns.push([index]);
  });
  const runByIndex = new Map();
  directRuns.forEach((run, runIndex) => run.forEach(index => runByIndex.set(index, runIndex)));
  const runDependencies = new Map(directRuns.map((_, runIndex) => [runIndex, new Set()]));
  siblingHouseholdConstraints.forEach((precedingGroups, index) => {
    const runIndex = runByIndex.get(index);
    precedingGroups.flat().forEach(precedingIndex => {
      const precedingRun = runByIndex.get(precedingIndex);
      if (precedingRun != null && precedingRun !== runIndex) runDependencies.get(runIndex).add(precedingRun);
    });
  });
  const preferredRunOrder = directRuns.map((run, runIndex) => ({
    runIndex,
    preferredTop: Math.min(...run.map((index, offset) => preferredY[index] - offset * rowStep))
  })).sort((first, second) => first.preferredTop - second.preferredTop || first.runIndex - second.runIndex);
  const runOrder = [];
  const pendingRuns = [...preferredRunOrder];
  const orderedRuns = new Set();
  while (pendingRuns.length) {
    let nextPosition = pendingRuns.findIndex(item =>
      [...runDependencies.get(item.runIndex)].every(precedingRun => orderedRuns.has(precedingRun))
    );
    if (nextPosition < 0) nextPosition = 0;
    const [nextRun] = pendingRuns.splice(nextPosition, 1);
    runOrder.push(nextRun.runIndex);
    orderedRuns.add(nextRun.runIndex);
  }
  const placed = [];
  const placedSet = new Set();

  runOrder.forEach(runIndex => {
    const run = directRuns[runIndex];
    const offsetByIndex = new Map(run.map((index, offset) => [index, offset * rowStep]));
    let targetTop = 0;
    run.forEach(index => {
      const offset = offsetByIndex.get(index);
      const parentIndex = indexByKey.get(displayParentByKey.get(nodes[index].key));
      if (parentIndex != null && !offsetByIndex.has(parentIndex) && placedSet.has(parentIndex)) {
        targetTop = Math.max(targetTop, nodes[parentIndex].y + rowStep - offset);
      }
      (siblingHouseholdConstraints.get(index) || []).forEach(precedingIndexes => {
        const placedIndexes = precedingIndexes.filter(other => !offsetByIndex.has(other) && placedSet.has(other));
        if (placedIndexes.length) targetTop = Math.max(targetTop, Math.max(...placedIndexes.map(other => nodes[other].y)) + rowStep - offset);
      });
    });

    // Search for the earliest destination that fits the whole direct-family
    // run. When one member meets an obstacle, shift every member together.
    let moved;
    do {
      moved = false;
      for (const index of run) {
        const targetY = targetTop + offsetByIndex.get(index);
        for (const other of placed) {
          if (!timelineRowsConflict(index, other, ranges, horizontalRangesByKey, nodes)) continue;
          const relationshipSeparation = Math.max(requiredVerticalSeparation, timelineVerticalSeparation(index, other, nodes, rowStep));
          if (Math.abs(targetY - nodes[other].y) >= relationshipSeparation) continue;
          targetTop = Math.max(targetTop, nodes[other].y + relationshipSeparation - offsetByIndex.get(index));
          moved = true;
        }
      }
    } while (moved);

    run.forEach(index => {
      nodes[index].y = Math.round((targetTop + offsetByIndex.get(index)) * 1000) / 1000;
      placed.push(index);
      placedSet.add(index);
    });
  });
}

// D3's tidy tree gains its compactness by comparing whole subtree contours,
// rather than assigning every node a permanently distinct row. This rotated
// adaptation keeps time on x, preserves each depth-first household block, and
// lifts that block into the earliest y-space where its occupied x-ranges fit.
function compactTimelineTidyContours(nodes, displayParentByKey, rowHeight, rowStep, horizontalRangesByKey) {
  if (nodes.length < 2) return;
  const indexByKey = new Map(nodes.map((node, index) => [node.key, index]));
  const childrenByIndex = new Map(nodes.map((_, index) => [index, []]));
  const parentIndexByIndex = new Map();
  nodes.forEach((node, index) => {
    const parentIndex = indexByKey.get(displayParentByKey.get(node.key));
    if (parentIndex == null || parentIndex >= index) return;
    parentIndexByIndex.set(index, parentIndex);
    childrenByIndex.get(parentIndex).push(index);
  });
  const depthOf = index => {
    let depth = 0;
    for (let parent = parentIndexByIndex.get(index); parent != null; parent = parentIndexByIndex.get(parent)) depth += 1;
    return depth;
  };
  const subtreeIndexes = rootIndex => {
    const result = [];
    const queue = [rootIndex];
    while (queue.length) {
      const index = queue.shift();
      result.push(index);
      queue.unshift(...childrenByIndex.get(index));
    }
    return result;
  };
  const nodeRanges = nodes.map(timelineNodeRange);
  const verticallyOverlap = (index, targetY, otherIndex) =>
    Math.abs(targetY - nodes[otherIndex].y) < timelineVerticalSeparation(index, otherIndex, nodes, rowStep);
  const blocks = nodes.map((_, index) => ({
    rootIndex: index,
    parentIndex: parentIndexByIndex.get(index),
    indexes: subtreeIndexes(index),
    depth: depthOf(index)
  })).sort((a, b) => b.depth - a.depth || b.rootIndex - a.rootIndex);

  blocks.forEach(block => {
    const contained = new Set(block.indexes);
    const rootY = nodes[block.rootIndex].y;
    const minimumRootY = block.parentIndex == null ? 0 : nodes[block.parentIndex].y + rowStep;
    const maximumLift = rootY - minimumRootY;
    if (maximumLift < rowStep / 2) return;
    const canLift = lift => block.indexes.every(index => {
      const targetY = nodes[index].y - lift;
      if (targetY < 0) return false;
      for (let other = 0; other < nodes.length; other += 1) {
        if (contained.has(other) || !timelineRowsConflict(index, other, nodeRanges, horizontalRangesByKey, nodes)) continue;
        if (verticallyOverlap(index, targetY, other)) return false;
      }
      return true;
    });
    let bestLift = 0;
    for (let lift = rowStep / 2; lift <= maximumLift + 0.01; lift += rowStep / 2) {
      if (canLift(lift)) bestLift = lift;
    }
    if (bestLift) block.indexes.forEach(index => { nodes[index].y -= bestLift; });
  });
}

function renderTimeline() {
  const canvas = els['timeline-canvas'];
  const ruler = els['timeline-ruler'];
  const timelineKeywords = clean(els['tree-filter']?.value).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  timelineRulerGeometry = null;
  canvas.replaceChildren();
  ruler.replaceChildren();
  const visibility = buildTimelineVisibility();
  const { visibleIds, renderedPartnerPairs, descendantsOfRoot, childEdgeVisible, scope } = visibility;
  // Preserve the pre-collapse branch membership. A collapsed node's children
  // are removed from `visibleIds` below, but its control must remain expandable.
  const expandableIds = new Set(visibleIds);
  const renderedPartnerIds = id => scopedSpouseIds(state.people[id], scope).filter(partnerId => renderedPartnerPairs.has(partnerRelationKey(id, partnerId)));
  // Collapse paths, not people. A cousin-marriage profile can occur once in
  // its natal branch and again beside a spouse. If one route from the root is
  // collapsed, the other route must keep the shared household alive.
  const activeLineageIds = new Set();
  const lineageQueue = state.people[state.rootId] && visibleIds.has(state.rootId) ? [state.rootId] : [];
  while (lineageQueue.length) {
    const id = lineageQueue.shift();
    if (activeLineageIds.has(id) || !visibleIds.has(id) || !state.people[id]) continue;
    activeLineageIds.add(id);
    if (state.collapsedIds.has(id)) continue;
    state.people[id].children.forEach(childId => {
      if (visibleIds.has(childId) && childEdgeVisible(id, childId)) lineageQueue.push(childId);
    });
  }
  if (!state.people[state.rootId]) {
    visibleIds.forEach(id => activeLineageIds.add(id));
  }
  if (state.collapsedIds.size && state.people[state.rootId]) {
    const activeVisibleIds = new Set(activeLineageIds);
    // Spouses are occurrences attached to an active lineage household. They
    // remain visible without opening their unrelated branches. A collapsed
    // profile closes its household as well as its descendants, so do not add
    // that occurrence's spouses back during the visibility pass.
    activeLineageIds.forEach(id => renderedPartnerIds(id).forEach(partnerId => {
      if (state.collapsedIds.has(id)) return;
      if (visibleIds.has(partnerId)) activeVisibleIds.add(partnerId);
    }));
    visibleIds.clear();
    activeVisibleIds.forEach(id => visibleIds.add(id));
  }
  const datedVisibleDescendants = new Set([...descendantsOfRoot].filter(id =>
    visibleIds.has(id) && numericYear(state.people[id]?.birthYear) != null
  ));
  const people = Object.values(state.people).filter(person => {
    if (!visibleIds.has(person.id) || numericYear(person.birthYear) == null) return false;
    if (descendantsOfRoot.has(person.id)) return true;
    return scopedSpouseIds(person, scope).some(partnerId =>
      datedVisibleDescendants.has(partnerId)
      && renderedPartnerPairs.has(partnerRelationKey(person.id, partnerId))
    );
  });
  if (!people.length) {
    ruler.toggleAttribute('hidden', true);
    canvas.setAttribute('width', 820); canvas.setAttribute('height', 560); canvas.setAttribute('viewBox', '0 0 820 560');
    canvas.append(svg('text', { x: 410, y: 260, class: 'filter-empty-label', 'text-anchor': 'middle' }, clean(els['tree-filter'].value) ? 'No branches contain that name' : 'Add birth years to see this view'));
    canvas.append(svg('text', { x: 410, y: 284, class: 'filter-empty-hint', 'text-anchor': 'middle' }, 'The timeline positions every profile by its birth and lifespan'));
    canvas.style.transform = `scale(${state.zoom})`;
    return;
  }

  const currentYear = new Date().getFullYear();
  const historicalYear = numericYear(state.asOfYear);
  if (historicalYear == null) timelineAsOfGripClientY = null;
  const yearWidth = state.timelineYearWidth;
  const rowHeight = state.timelineNodeHeight;
  const rowStep = rowHeight + 6;
  const top = 58;
  const left = 36;
  const birthYear = person => numericYear(person.birthYear);
  // Living profiles always terminate exactly at the current-year line. A
  // stale or future death value must never push their lifespan beyond it.
  const endYear = person => person.isLiving ? currentYear : (numericYear(person.deathYear) ?? birthYear(person) + 80);
  const lifespanWidthFor = person => {
    const rawWidth = Math.max(0, (endYear(person) - birthYear(person)) * yearWidth);
    return person.isLiving ? rawWidth : Math.max(2, rawWidth);
  };
  const earliestTimelineYear = Math.min(...people.map(birthYear), ...(historicalYear == null ? [] : [historicalYear]));
  const minYear = Math.floor((earliestTimelineYear - 40) / 20) * 20;
  const latestLifeYear = Math.max(...people.map(endYear), ...(people.some(person => person.isLiving) ? [currentYear] : []));
  const maxYear = Math.ceil((Math.max(latestLifeYear, historicalYear ?? latestLifeYear) + 20) / 20) * 20;
  // A year without a month/day is represented at the midpoint of that year.
  const xForYear = year => left + (year - minYear + 0.5) * yearWidth;

  // Row order follows the family. Time controls only horizontal position and width.
  const datedIds = new Set(people.map(person => person.id));
  const familyKey = parentIds => [...parentIds].sort().join('|');
  const transportedParent = parentIds => {
    // Duplicate an in-line spouse only while both natal occurrences survive.
    // When one ancestral route is collapsed, the one remaining occurrence
    // becomes the household owner and the descendants move there.
    if (parentIds.length !== 2 || parentIds.some(id => state.collapsedIds.has(id))
      || !parentIds.every(id => descendantsOfRoot.has(id) && activeLineageIds.has(id))) return '';
    // Western cousin-marriage transport always duplicates the woman. If the
    // imported genders do not identify one, keep a single household rather
    // than arbitrarily transporting the man.
    return parentIds.find(id => state.people[id]?.gender === 'female') || '';
  };
  const childrenByParent = new Map();
  people.forEach(person => person.parents.forEach(parentId => {
    if (!datedIds.has(parentId)) return;
    if (!childEdgeVisible(parentId, person.id)) return;
    if (state.collapsedIds.has(parentId)) return;
    // Profiles retained only as spouses must not reopen a branch that was
    // collapsed above their natal occurrence. Traverse descendants solely
    // along the lineage routes that still survive from the root; the family
    // record below will still connect the retained spouse to the children.
    if (state.collapsedIds.size && state.people[state.rootId]
      && (!activeLineageIds.has(parentId) || !activeLineageIds.has(person.id))) return;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(person.id);
  }));
  const byBirth = (a, b) => birthYear(state.people[a]) - birthYear(state.people[b]) || visibleName(state.people[a]).localeCompare(visibleName(state.people[b]));
  childrenByParent.forEach(ids => ids.sort(byBirth));
  // Start layout traversal from independently surviving lineage occurrences.
  // A spouse retained only through the other side of a cousin marriage must
  // not become a detached root and claim the household before that lineage is
  // visited.
  const lineageRoots = people.filter(person => activeLineageIds.has(person.id)
    && !person.parents.some(id => datedIds.has(id) && activeLineageIds.has(id)));
  const roots = (lineageRoots.length ? lineageRoots : people.filter(person => !person.parents.some(id => datedIds.has(id))))
    .map(person => person.id).sort(byBirth);
  if (datedIds.has(state.rootId)) roots.sort((a, b) => (a === state.rootId ? -1 : b === state.rootId ? 1 : byBirth(a, b)));
  const order = [];
  const placed = new Set();
  const expanded = new Set();
  const spouseIds = new Set();
  const displayParentByKey = new Map();
  function place(id, asSpouse = false, displayParentId = '') {
    if (!datedIds.has(id) || placed.has(id)) return;
    placed.add(id);
    if (displayParentId) displayParentByKey.set(id, displayParentId);
    if (asSpouse) spouseIds.add(id);
    order.push(id);
  }
  function visit(id, displayParentId = '') {
    if (!datedIds.has(id) || expanded.has(id)) return;
    place(id, false, displayParentId);
    expanded.add(id);
    // Collapsing a profile is unconditional: its household groups may survive
    // through another cousin-marriage route, but this occurrence must not
    // continue traversing or claiming them.
    if (state.collapsedIds.has(id)) return;

    const groups = new Map();
    (childrenByParent.get(id) || []).forEach(childId => {
      const otherParent = state.people[childId]?.parents.find(parentId => parentId !== id && datedIds.has(parentId) && renderedPartnerPairs.has(partnerRelationKey(id, parentId))) || '';
      const partnerId = otherParent;
      if (!groups.has(partnerId)) groups.set(partnerId, []);
      groups.get(partnerId).push(childId);
    });
    renderedPartnerIds(id).filter(partnerId => datedIds.has(partnerId)).forEach(partnerId => {
      if (!groups.has(partnerId)) groups.set(partnerId, []);
    });
    const partnerOrder = new Map(renderedPartnerIds(id).map((partnerId, index) => [partnerId, index]));
    const orderedGroups = [...groups.entries()].map(([partnerId, childIds], sourceOrder) => ({
      partnerId,
      childIds: childIds.sort(byBirth),
      marriageYear: partnerId ? marriageYearFor(id, partnerId) : null,
      firstBirth: childIds.length ? Math.min(...childIds.map(childId => birthYear(state.people[childId]))) : Number.POSITIVE_INFINITY,
      sourceOrder: partnerOrder.get(partnerId) ?? sourceOrder
    })).sort((a, b) => {
      if (a.marriageYear != null || b.marriageYear != null) {
        const yearOrder = (a.marriageYear ?? Number.POSITIVE_INFINITY) - (b.marriageYear ?? Number.POSITIVE_INFINITY);
        if (yearOrder) return yearOrder;
      }
      return a.firstBirth - b.firstBirth
        || a.sourceOrder - b.sourceOrder
        || byBirth(a.partnerId || a.childIds[0], b.partnerId || b.childIds[0]);
    });

    const groupedPartners = new Set();
    orderedGroups.forEach(group => {
      const pendingChildren = group.childIds.filter(childId => !expanded.has(childId));
      if (!pendingChildren.length && !group.partnerId) return;
      const transportedId = group.partnerId ? transportedParent([id, group.partnerId]) : '';
      // A cousin-marriage household is rendered on the non-transported side.
      // The transported spouse retains their primary occurrence in the natal
      // branch; an auxiliary spouse occurrence is inserted below.
      if (transportedId === id) return;
      let householdParentId = id;
      if (group.partnerId) {
        groupedPartners.add(group.partnerId);
        if (!transportedId) {
          const partnerWasPlaced = placed.has(group.partnerId);
          place(group.partnerId, true, id);
          if (partnerWasPlaced && state.collapsedIds.has(group.partnerId)) spouseIds.add(group.partnerId);
          if (!partnerWasPlaced) householdParentId = group.partnerId;
        }
      }
      pendingChildren.forEach(childId => visit(childId, householdParentId));
    });

    renderedPartnerIds(id)
      .filter(partnerId => datedIds.has(partnerId) && !groupedPartners.has(partnerId))
      .sort((firstId, secondId) => {
        const firstYear = marriageYearFor(id, firstId);
        const secondYear = marriageYearFor(id, secondId);
        if (firstYear != null || secondYear != null) return (firstYear ?? Number.POSITIVE_INFINITY) - (secondYear ?? Number.POSITIVE_INFINITY);
        return byBirth(firstId, secondId);
      })
      .forEach(partnerId => {
        const transportedId = transportedParent([id, partnerId]);
        if (transportedId === id || transportedId === partnerId) return;
        place(partnerId, true, id);
      });
  }
  roots.forEach(visit);
  people.map(person => person.id).sort(byBirth).forEach(visit);

  const families = new Map();
  const familyKeyByChild = new Map();
  people.forEach(child => {
    // A profile retained only as a spouse belongs to the surviving marriage
    // household, not to a natal branch hidden by an ancestor's collapse.
    // Omitting that inactive natal family also removes its obsolete vertical
    // stem and dotted transport line.
    if (state.collapsedIds.size && state.people[state.rootId] && !activeLineageIds.has(child.id)) return;
    let parentIds = child.parents.filter(id => datedIds.has(id) && childEdgeVisible(id, child.id) && !state.collapsedIds.has(id));
    if (!parentIds.length) return;
    if (parentIds.length === 2 && !renderedPartnerPairs.has(partnerRelationKey(parentIds[0], parentIds[1]))) {
      parentIds = [parentIds.find(id => state.people[id]?.gender === 'male') || parentIds[0]];
    }
    const key = familyKey(parentIds);
    if (!families.has(key)) families.set(key, { parents: parentIds, children: [] });
    families.get(key).children.push(child.id);
    familyKeyByChild.set(child.id, key);
  });
  people.forEach(person => renderedPartnerIds(person.id).forEach(partnerId => {
    if (person.id >= partnerId || !datedIds.has(partnerId)
      || state.collapsedIds.has(person.id) || state.collapsedIds.has(partnerId)) return;
    const key = familyKey([person.id, partnerId]);
    if (!families.has(key)) families.set(key, { parents: [person.id, partnerId], children: [] });
  }));

  const marriageIsDivorced = parentIds => parentIds.some(id =>
    parentIds.some(other => other !== id && state.people[id]?.divorcedSpouses?.includes(other))
  );
  const familyTimingByKey = new Map([...families.entries()].map(([key, family]) => {
    const parentIds = family.parents.filter(id => datedIds.has(id));
    const childIds = family.children.filter(id => datedIds.has(id));
    const recordedMarriageYear = parentIds.map(id => parentIds.map(other => state.people[id]?.marriageYears?.[other])).flat().map(numericYear).find(year => year != null);
    const fallbackYear = childIds.length
      ? Math.min(...childIds.map(id => birthYear(state.people[id]))) - 4.5
      : Math.max(...parentIds.map(id => birthYear(state.people[id]))) + 20;
    const junctionYear = recordedMarriageYear ?? fallbackYear;
    return [key, { recordedMarriageYear, junctionYear, trunkX: xForYear(junctionYear) }];
  }));

  const estimateTextWidth = text => Array.from(String(text || '')).reduce((sum, char) => sum + (/[^\x00-\x7F]/.test(char) ? 13 : 7), 0);
  const layoutEntries = order.map(id => ({ key: id, id, isSpouse: spouseIds.has(id), isTransportedCopy: false }));
  const familyPersonKey = (key, personId) => `${key}::${personId}`;
  const occurrenceKeyByFamilyPerson = new Map();
  const natalOccurrenceKeyByPerson = new Map();
  const transportedChildrenByNatalId = new Map();

  // Record the marriage household already represented by a person's primary
  // occurrence. A person with several visible spouses needs one occurrence in
  // each household; when their visible parents also supply a natal occurrence,
  // every marriage receives a copy and the natal box remains independent.
  layoutEntries.forEach(entry => {
    if (!entry.isSpouse) return;
    const partnerId = displayParentByKey.get(entry.key);
    const key = partnerId ? familyKey([entry.id, partnerId]) : '';
    if (key && families.has(key)) occurrenceKeyByFamilyPerson.set(familyPersonKey(key, entry.id), entry.key);
  });
  const spouseFamilyKeysByPerson = new Map();
  families.forEach((family, key) => {
    if (family.parents.length !== 2) return;
    family.parents.forEach(id => {
      if (!spouseFamilyKeysByPerson.has(id)) spouseFamilyKeysByPerson.set(id, new Set());
      spouseFamilyKeysByPerson.get(id).add(key);
    });
  });

  // A repeated spouse whose primary occurrence was claimed by a marriage may
  // later acquire visible parents through an import. Create a separate natal
  // occurrence so the parents' family keeps its own child box instead of
  // borrowing either marriage occurrence.
  spouseFamilyKeysByPerson.forEach((keys, id) => {
    if (state.people[id]?.gender !== 'female' || keys.size < 2) return;
    const natalFamilyKey = familyKeyByChild.get(id);
    const natalFamily = families.get(natalFamilyKey);
    const primaryEntry = layoutEntries.find(entry => entry.key === id);
    if (!natalFamily || !primaryEntry) return;
    if (!primaryEntry.isSpouse) {
      natalOccurrenceKeyByPerson.set(id, id);
      return;
    }
    const natalKey = `natal:${natalFamilyKey}:${id}`;
    const laterSiblingIndex = [...natalFamily.children]
      .sort(byBirth)
      .filter(childId => childId !== id && birthYear(state.people[childId]) >= birthYear(state.people[id]))
      .map(childId => layoutEntries.findIndex(entry => entry.key === childId))
      .find(index => index >= 0);
    const siblingIndexes = natalFamily.children
      .filter(childId => childId !== id)
      .map(childId => layoutEntries.findIndex(entry => entry.key === childId))
      .filter(index => index >= 0);
    const parentIndexes = natalFamily.parents
      .map(parentId => layoutEntries.findIndex(entry => entry.key === parentId))
      .filter(index => index >= 0);
    const insertAt = laterSiblingIndex ?? (siblingIndexes.length
      ? Math.max(...siblingIndexes) + 1
      : parentIndexes.length ? Math.max(...parentIndexes) + 1 : layoutEntries.length);
    layoutEntries.splice(insertAt, 0, { key: natalKey, id, isSpouse: false, isTransportedCopy: false, isNatalCopy: true, familyKey: natalFamilyKey });
    const householdParentId = natalFamily.parents.find(parentId => state.people[parentId]?.gender === 'female') || natalFamily.parents.at(-1);
    if (householdParentId) displayParentByKey.set(natalKey, householdParentId);
    natalOccurrenceKeyByPerson.set(id, natalKey);
  });

  const insertTransportedOccurrence = (key, family, transportedId) => {
    const associationKey = familyPersonKey(key, transportedId);
    if (occurrenceKeyByFamilyPerson.has(associationKey)) return occurrenceKeyByFamilyPerson.get(associationKey);
    const otherParentId = family.parents.find(id => id !== transportedId);
    const copyKey = `transport:${key}:${transportedId}`;
    const childIndexes = family.children.map(childId => layoutEntries.findIndex(entry => entry.key === childId)).filter(index => index >= 0);
    const otherParentIndex = layoutEntries.findIndex(entry => entry.key === otherParentId);
    const insertAt = childIndexes.length ? Math.min(...childIndexes) : Math.max(0, otherParentIndex + 1);
    layoutEntries.splice(insertAt, 0, { key: copyKey, id: transportedId, isSpouse: true, isTransportedCopy: true, familyKey: key });
    occurrenceKeyByFamilyPerson.set(associationKey, copyKey);
    return copyKey;
  };

  // Preserve the established cousin-marriage transport. For successive
  // marriages, duplicate a woman only when her primary occurrence is already
  // a spouse in another male-line household. This gives Catherine of Aragon
  // one box beside Arthur and another beside Henry VIII (plus a natal box if
  // her parents are visible), while a branch owner such as Mary, Queen of
  // Scots stays single and has both husbands grouped beneath her.
  [...families.entries()].forEach(([key, family]) => {
    const parentIds = family.parents.filter(id => datedIds.has(id));
    if (parentIds.length !== 2) return;
    const cousinTransportId = transportedParent(parentIds);
    parentIds.forEach(id => {
      const primaryOccurrenceIsSpouse = layoutEntries.find(entry => entry.key === id)?.isSpouse === true;
      const hasSeveralMarriageHouseholds = primaryOccurrenceIsSpouse
        && state.people[id]?.gender === 'female'
        && (spouseFamilyKeysByPerson.get(id)?.size || 0) > 1;
      if (id !== cousinTransportId && !hasSeveralMarriageHouseholds) return;
      insertTransportedOccurrence(key, family, id);
    });
  });

  // Once every occurrence exists, attach each copy to the other occurrence in
  // that marriage. Children follow the transported spouse immediately below
  // the appropriate union, never the same person's box in another household.
  layoutEntries.filter(entry => entry.isTransportedCopy).forEach(entry => {
    const family = families.get(entry.familyKey);
    const otherParentId = family?.parents.find(id => id !== entry.id);
    const otherParentKey = otherParentId
      ? (occurrenceKeyByFamilyPerson.get(familyPersonKey(entry.familyKey, otherParentId)) || otherParentId)
      : '';
    if (otherParentKey) displayParentByKey.set(entry.key, otherParentKey);
    if (!transportedChildrenByNatalId.has(entry.id)) transportedChildrenByNatalId.set(entry.id, new Set());
    (family?.children || []).forEach(childId => transportedChildrenByNatalId.get(entry.id).add(childId));
  });
  families.forEach((family, key) => {
    const transportedEntries = layoutEntries.filter(entry => entry.familyKey === key && entry.isTransportedCopy);
    if (!transportedEntries.length) return;
    const householdParent = transportedEntries.find(entry => state.people[entry.id]?.gender === 'female') || transportedEntries.at(-1);
    family.children.forEach(childId => displayParentByKey.set(childId, householdParent.key));
  });

  const layoutNodes = layoutEntries.map((entry, index) => {
    const person = state.people[entry.id];
    const lifespanWidth = lifespanWidthFor(person);
    const labelWidth = 38 + estimateTextWidth(visibleName(person)) + 12 + estimateTextWidth(timelineLifeLabel(person, historicalYear)) + 18;
    return { ...entry, x: xForYear(birthYear(person)), y: index * rowStep, occupancyWidth: Math.max(lifespanWidth, labelWidth) };
  });
  // Horizontal relationship segments remain collision obstacles, while their
  // vertical stems deliberately do not. This lets otherwise unrelated rows
  // cross marriage/transport stems without letting a label obscure a branch.
  const layoutNodeByKey = new Map(layoutNodes.map(node => [node.key, node]));
  const occurrenceKeyFor = (key, personId) => occurrenceKeyByFamilyPerson.get(familyPersonKey(key, personId)) || personId;
  const childOccurrenceKeyFor = personId => natalOccurrenceKeyByPerson.get(personId) || personId;
  const transportedOccurrenceGroups = new Map();
  layoutNodes.forEach(node => {
    if (!transportedOccurrenceGroups.has(node.id)) transportedOccurrenceGroups.set(node.id, []);
    transportedOccurrenceGroups.get(node.id).push(node.key);
  });
  [...transportedOccurrenceGroups.entries()].forEach(([id, keys]) => {
    if (keys.length < 2) transportedOccurrenceGroups.delete(id);
  });
  const transportAnchorX = id => {
    const natalFamilyKey = familyKeyByChild.get(id);
    const natalTrunkX = familyTimingByKey.get(natalFamilyKey)?.trunkX;
    if (natalTrunkX != null && layoutNodeByKey.has(childOccurrenceKeyFor(id))) return natalTrunkX;
    return Math.min(...transportedOccurrenceGroups.get(id).map(key => layoutNodeByKey.get(key).x)) - 18;
  };
  const incomingConnectorEndOffset = id => {
    const childrenShownAtAnotherOccurrence = transportedChildrenByNatalId.get(id) || new Set();
    const hasControlHere = state.people[id]?.children.some(childId =>
      !childrenShownAtAnotherOccurrence.has(childId) && expandableIds.has(childId) && childEdgeVisible(id, childId)
    );
    return hasControlHere ? 18 : 12;
  };
  const horizontalRangesByKey = new Map();
  const addHorizontalRange = (nodeKey, x1, x2) => {
    if (!layoutNodeByKey.has(nodeKey)) return;
    const strokeAllowance = 2;
    const range = {
      left: Math.min(x1, x2) - strokeAllowance,
      right: Math.max(x1, x2) + strokeAllowance
    };
    if (range.right - range.left < 0.5) return;
    if (!horizontalRangesByKey.has(nodeKey)) horizontalRangesByKey.set(nodeKey, []);
    horizontalRangesByKey.get(nodeKey).push(range);
  };
  families.forEach((family, key) => {
    const parentIds = family.parents.filter(id => datedIds.has(id));
    const parentKeys = parentIds.map(id => occurrenceKeyFor(key, id));
    const childEntries = family.children.map(id => ({ id, key: childOccurrenceKeyFor(id) })).filter(entry => layoutNodeByKey.has(entry.key));
    if (!parentIds.length || (!childEntries.length && parentIds.length < 2)) return;
    const trunkX = familyTimingByKey.get(key).trunkX;
    parentKeys.forEach(parentKey => {
      const node = layoutNodeByKey.get(parentKey);
      if (node) addHorizontalRange(parentKey, node.x + 24, trunkX);
    });
    childEntries.forEach(child => {
      const node = layoutNodeByKey.get(child.key);
      if (node) addHorizontalRange(child.key, trunkX, node.x + incomingConnectorEndOffset(child.id));
    });
  });
  transportedOccurrenceGroups.forEach((keys, id) => {
    const anchorX = transportAnchorX(id);
    const natalFamilyKey = familyKeyByChild.get(id);
    const natalOccurrenceKey = childOccurrenceKeyFor(id);
    keys.forEach(key => {
      if (key === natalOccurrenceKey && natalFamilyKey && familyTimingByKey.has(natalFamilyKey)) return;
      addHorizontalRange(key, anchorX, layoutNodeByKey.get(key).x);
    });
  });
  compactTimelineTidyContours(layoutNodes, displayParentByKey, rowHeight, rowStep, horizontalRangesByKey);
  stabilizeTimelineOrder(layoutNodes, displayParentByKey, rowHeight, rowStep, horizontalRangesByKey);

  const contentWidth = Math.max(
    900,
    xForYear(maxYear) + 42,
    ...layoutNodes.map(node => node.x + node.occupancyWidth + 48)
  );
  const contentHeight = Math.max(560, top + Math.max(...layoutNodes.map(node => node.y)) + rowHeight + 38);
  const width = contentWidth + TIMELINE_PAN_MARGIN.left + TIMELINE_PAN_MARGIN.right;
  const height = contentHeight + TIMELINE_PAN_MARGIN.top + TIMELINE_PAN_MARGIN.bottom;
  const rulerBaseline = 43;
  const rulerHeight = 60;
  const eventTop = -TIMELINE_PAN_MARGIN.top;
  const eventBottom = contentHeight + TIMELINE_PAN_MARGIN.bottom;
  canvas.setAttribute('width', width); canvas.setAttribute('height', height);
  canvas.setAttribute('viewBox', `${-TIMELINE_PAN_MARGIN.left} ${-TIMELINE_PAN_MARGIN.top} ${width} ${height}`);
  ruler.toggleAttribute('hidden', false);
  ruler.setAttribute('width', width); ruler.setAttribute('height', rulerHeight); ruler.setAttribute('viewBox', `${-TIMELINE_PAN_MARGIN.left} 0 ${width} ${rulerHeight}`);
  ruler.style.transform = `scaleX(${state.zoom})`;
  timelineRulerGeometry = { minYear, maxYear, left, yearWidth, viewBoxX: -TIMELINE_PAN_MARGIN.left, viewBoxWidth: width };
  const positions = new Map(layoutNodes.map(node => [node.key, { x: node.x, y: top + node.y }]));

  const rulerMarks = svg('g');
  ruler.append(svg('title', {}, 'Hover to preview a year; click to place the As of line'));
  rulerMarks.append(svg('rect', { x: -TIMELINE_PAN_MARGIN.left, y: 0, width, height: rulerHeight, class: 'ruler-band' }));
  for (let year = minYear; year <= maxYear; year += 5) {
    const x = xForYear(year);
    const isMajor = year % 20 === 0;
    const isDecade = year % 10 === 0;
    rulerMarks.append(svg('line', { x1: x, y1: isMajor ? 29 : isDecade ? 33 : 36, x2: x, y2: rulerBaseline, class: `year-tick ${isMajor ? 'major' : isDecade ? 'decade' : 'minor'}` }));
    if (isDecade && Math.abs(year - currentYear) >= 8) rulerMarks.append(svg('text', { x, y: 22, 'text-anchor': 'middle', class: isMajor ? 'major-label' : 'decade-label' }, String(year)));
  }
  const currentYearX = xForYear(currentYear);
  rulerMarks.append(svg('line', { x1: currentYearX, y1: 25, x2: currentYearX, y2: rulerBaseline, class: 'year-tick current-year' }));
  rulerMarks.append(svg('text', { x: currentYearX, y: 22, 'text-anchor': 'middle', class: 'current-year-label' }, String(currentYear)));
  rulerMarks.append(svg('line', { x1: left, y1: rulerBaseline, x2: xForYear(maxYear), y2: rulerBaseline, class: 'ruler-line' }));
  if (historicalYear != null) {
    const historicalX = xForYear(historicalYear);
    rulerMarks.append(svg('line', { class: 'year-tick as-of-year', x1: historicalX, y1: 7, x2: historicalX, y2: rulerBaseline }));
    const handle = svg('g', {
      class: 'timeline-as-of-handle', transform: `translate(${historicalX} 0)`, role: 'slider', tabindex: '0',
      'aria-label': 'Historical snapshot year', 'aria-valuemin': minYear, 'aria-valuemax': maxYear, 'aria-valuenow': historicalYear,
      'aria-valuetext': `As of ${historicalYear}`
    });
    handle.append(svg('rect', { class: 'as-of-handle-box', x: -25, y: 2, width: 50, height: 18, rx: 4 }));
    handle.append(svg('text', { class: 'as-of-year-label', x: 0, y: 14, 'text-anchor': 'middle' }, `As of ${historicalYear}`));
    handle.append(svg('path', { class: 'as-of-handle-pointer', d: 'M -5 20 L 5 20 L 0 27 Z' }));
    handle.addEventListener('pointerdown', beginHistoricalYearSlide);
    handle.addEventListener('mousedown', beginHistoricalYearMouseSlide);
    handle.addEventListener('keydown', event => {
      const delta = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
          : event.key === 'PageDown' ? -10 : event.key === 'PageUp' ? 10 : 0;
      if (!delta) return;
      event.preventDefault();
      state.asOfYear = Math.max(minYear, Math.min(maxYear, historicalYear + delta));
      persist(`Historical snapshot set to ${state.asOfYear}`);
      render();
    });
    rulerMarks.append(handle);
  }
  const rulerPreview = svg('g', { class: 'timeline-as-of-preview', hidden: '' });
  rulerPreview.append(svg('line', { class: 'year-tick as-of-year-preview', x1: 0, y1: 7, x2: 0, y2: rulerBaseline }));
  rulerPreview.append(svg('rect', { class: 'as-of-preview-box', x: -42, y: 2, width: 84, height: 18, rx: 4 }));
  rulerPreview.append(svg('text', { class: 'as-of-preview-label', x: 0, y: 14, 'text-anchor': 'middle' }, 'Set As of'));
  rulerPreview.append(svg('path', { class: 'as-of-preview-pointer', d: 'M -5 20 L 5 20 L 0 27 Z' }));
  rulerMarks.append(rulerPreview);
  ruler.append(rulerMarks);

  const globalEvents = svg('g', { class: 'global-events' });
  const stickyGlobalEventLabels = svg('g', { class: 'sticky-global-event-labels' });
  state.globalEvents.forEach(event => {
    const rawStartYear = numericYear(event.startYear);
    const rawEndYear = numericYear(event.endYear) ?? rawStartYear;
    if (rawStartYear == null || rawEndYear < minYear || rawStartYear > maxYear) return;
    const startYear = Math.max(minYear, rawStartYear);
    const endYear = Math.min(maxYear, rawEndYear);
    const x = xForYear(startYear);
    const eventWidth = Math.max(2, (Math.max(startYear, endYear) - startYear) * yearWidth);
    const color = paletteColor(event.color, DEFAULT_GLOBAL_EVENT_COLOR);
    const band = svg('rect', { class: 'global-event-range', x, y: eventTop, width: eventWidth, height: eventBottom - eventTop, fill: color, 'fill-opacity': '.13' });
    band.append(svg('title', {}, `${event.name} · ${formatEventYearRange(event.startYear, event.endYear)}`));
    globalEvents.append(band);
    globalEvents.append(svg('line', { class: 'global-event-edge', x1: x, y1: eventTop, x2: x, y2: eventBottom, stroke: color }));
    if (eventWidth > 2) globalEvents.append(svg('line', { class: 'global-event-edge', x1: x + eventWidth, y1: eventTop, x2: x + eventWidth, y2: eventBottom, stroke: color }));
    stickyGlobalEventLabels.append(svg('text', { class: 'global-event-label', x: x + 4, y: 56, fill: color }, event.name));
  });
  ruler.append(stickyGlobalEventLabels);
  canvas.append(globalEvents);
  canvas.append(svg('line', { class: 'timeline-current-year-line', x1: currentYearX, y1: eventTop, x2: currentYearX, y2: eventBottom, 'aria-label': `Current year ${currentYear}` }));

  const connectors = svg('g', { class: 'timeline-connectors' });
  const marriageOverlaysByParent = new Map();
  const descendantOverlaysByChild = new Map();
  const horizontalOverlaysByNode = new Map();
  const addHorizontalOverlay = (nodeKey, overlay) => {
    if (!horizontalOverlaysByNode.has(nodeKey)) horizontalOverlaysByNode.set(nodeKey, []);
    horizontalOverlaysByNode.get(nodeKey).push(overlay);
  };
  const addDescendantOverlay = (nodeKey, overlay) => {
    if (!descendantOverlaysByChild.has(nodeKey)) descendantOverlaysByChild.set(nodeKey, []);
    descendantOverlaysByChild.get(nodeKey).push(overlay);
  };
  families.forEach((family, key) => {
    const parentIds = family.parents.filter(id => datedIds.has(id));
    const parentKeys = parentIds.map(id => occurrenceKeyFor(key, id)).filter(parentKey => positions.has(parentKey));
    const childEntries = family.children.map(id => ({ id, key: childOccurrenceKeyFor(id) })).filter(entry => positions.has(entry.key));
    if (!parentIds.length || (!childEntries.length && parentIds.length < 2)) return;
    const { recordedMarriageYear, trunkX } = familyTimingByKey.get(key);
    const parentYs = parentKeys.map(parentKey => positions.get(parentKey).y + rowHeight / 2);
    const childYs = childEntries.map(child => positions.get(child.key).y + rowHeight / 2);
    const hasPaternalParent = parentIds.some(id => state.people[id]?.gender === 'male');
    const stemClass = hasPaternalParent ? 'paternal' : 'maternal';
    const isDivorced = marriageIsDivorced(parentIds);
    const marriageClass = `marriage-couple${isDivorced ? ' divorced' : ''}`;
    parentIds.forEach((id, parentIndex) => {
      const pos = positions.get(parentKeys[parentIndex]);
      const lineage = state.people[id]?.gender === 'male' ? 'paternal' : 'maternal';
      connectors.append(svg('path', { d: `M ${pos.x + 24} ${pos.y + rowHeight / 2} H ${trunkX}`, class: `timeline-edge horizontal ${lineage}` }));
    });
    if (parentYs.length > 1 && Math.max(...parentYs) > Math.min(...parentYs)) {
      const marriageLine = svg('line', { x1: trunkX, y1: Math.min(...parentYs), x2: trunkX, y2: Math.max(...parentYs), class: `timeline-edge family-stem vertical ${marriageClass}`, 'data-family-key': key, 'data-marriage-year': recordedMarriageYear || '' });
      if (isDivorced) marriageLine.append(svg('title', {}, `Divorced marriage: ${parentIds.map(id => visibleName(state.people[id])).join(' and ')}`));
      connectors.append(marriageLine);
    }
    // The continuous stem stays behind the whole tree. Repaint only the two
    // short sections that cross the married profiles when the year is known.
    if (recordedMarriageYear != null && parentIds.length === 2) {
      parentIds.forEach((parentId, parentIndex) => {
        const parentKey = parentKeys[parentIndex];
        if (!marriageOverlaysByParent.has(parentKey)) marriageOverlaysByParent.set(parentKey, []);
        marriageOverlaysByParent.get(parentKey).push({
          x: trunkX,
          year: recordedMarriageYear,
          className: marriageClass,
          title: `Married ${visibleName(state.people[parentIds.find(id => id !== parentId)])} in ${recordedMarriageYear}`
        });
      });
    }
    const familyBaseY = parentYs.length > 1 ? Math.max(...parentYs) : parentYs[0];
    if (childYs.length) {
      const descendantYs = [familyBaseY, ...childYs];
      const stemStartY = Math.min(...descendantYs);
      const stemEndY = Math.max(...descendantYs);
      if (stemEndY > stemStartY) {
        connectors.append(svg('line', { x1: trunkX, y1: stemStartY, x2: trunkX, y2: stemEndY, class: `timeline-edge family-stem vertical ${stemClass}` }));
        childEntries.forEach(child => addDescendantOverlay(child.key, {
          x: trunkX,
          y1: stemStartY,
          y2: stemEndY,
          className: stemClass,
          familyKey: key
        }));
      }
    }
    childEntries.forEach(child => {
      const pos = positions.get(child.key);
      connectors.append(svg('path', { d: `M ${trunkX} ${pos.y + rowHeight / 2} H ${pos.x + 1}`, class: `timeline-edge horizontal ${stemClass}` }));
      addHorizontalOverlay(child.key, { x1: trunkX, x2: pos.x + incomingConnectorEndOffset(child.id), className: stemClass });
    });
  });
  // Join every occurrence of a transported profile with one dotted spine.
  // Use the biological parents' marriage line as its x-coordinate when that
  // natal family is visible; otherwise place a synthetic anchor just left of
  // the repeated boxes, as for Catherine of Aragon in the bundled example.
  transportedOccurrenceGroups.forEach((keys, id) => {
    const anchorX = transportAnchorX(id);
    const natalFamilyKey = familyKeyByChild.get(id) || '';
    const natalOccurrenceKey = childOccurrenceKeyFor(id);
    const hasNatalAnchor = !!natalFamilyKey && familyTimingByKey.has(natalFamilyKey) && positions.has(natalOccurrenceKey);
    const occurrenceYs = keys.map(key => positions.get(key)?.y + rowHeight / 2).filter(Number.isFinite);
    if (occurrenceYs.length < 2) return;
    const transportLine = svg('line', {
      x1: anchorX, y1: Math.min(...occurrenceYs), x2: anchorX, y2: Math.max(...occurrenceYs),
      class: 'timeline-edge transport vertical',
      'data-source-family-key': natalFamilyKey,
      'data-transported-id': id
    });
    transportLine.append(svg('title', {}, hasNatalAnchor
      ? `${visibleName(state.people[id])} transported from the biological parents’ marriage line to each marriage household`
      : `${visibleName(state.people[id])} appears in more than one marriage household`));
    connectors.append(transportLine);
    keys.forEach(key => {
      if (key === natalOccurrenceKey && hasNatalAnchor) return;
      const occurrence = positions.get(key);
      if (!occurrence || Math.abs(anchorX - occurrence.x) < 0.5) return;
      connectors.append(svg('path', {
        d: `M ${anchorX} ${occurrence.y + rowHeight / 2} H ${occurrence.x}`,
        class: 'timeline-edge transport transport-bridge horizontal',
        'data-source-family-key': natalFamilyKey,
        'data-transported-id': id,
        'data-occurrence-key': key
      }));
    });
  });
  canvas.append(connectors);

  const nodeDefs = svg('defs');
  const maleGradient = svg('linearGradient', { id: 'geni-male-gradient', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  maleGradient.append(svg('stop', { offset: '0%', 'stop-color': '#d3e7f3' }));
  maleGradient.append(svg('stop', { offset: '100%', 'stop-color': '#a9cfe7' }));
  const femaleGradient = svg('linearGradient', { id: 'geni-female-gradient', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  femaleGradient.append(svg('stop', { offset: '0%', 'stop-color': '#fbdaec' }));
  femaleGradient.append(svg('stop', { offset: '100%', 'stop-color': '#f6b8db' }));
  nodeDefs.append(maleGradient, femaleGradient);
  const personalEventGradients = new Map();
  const personalEventFill = color => {
    if (personalEventGradients.has(color)) return `url(#${personalEventGradients.get(color)})`;
    const gradientId = `personal-event-gradient-${color.slice(1)}`;
    const gradient = svg('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    gradient.append(svg('stop', { offset: '0%', 'stop-color': lightenHex(color) }));
    gradient.append(svg('stop', { offset: '100%', 'stop-color': color }));
    nodeDefs.append(gradient);
    personalEventGradients.set(color, gradientId);
    return `url(#${gradientId})`;
  };
  canvas.append(nodeDefs);
  const snapshotLabelLayer = historicalYear == null ? null : svg('g', { class: 'timeline-snapshot-labels' });

  layoutNodes.forEach((layoutNode, nodeIndex) => {
    const { id, key: nodeKey } = layoutNode;
    const person = state.people[id];
    const pos = positions.get(nodeKey);
    const lifespanWidth = lifespanWidthFor(person);
    const hasReign = reignEvents(person).length > 0;
    const isSpouseNode = layoutNode.isSpouse;
    const cornerRadius = Math.min(5, rowHeight / 4);
    const nodeShape = attrs => person.isLiving
      ? svg('path', { ...attrs, d: leftRoundedRectPath(lifespanWidth, rowHeight, cornerRadius) })
      : svg('rect', { ...attrs, x: 0, y: 0, width: lifespanWidth, height: rowHeight, rx: cornerRadius, ry: cornerRadius });
    const historicalDisplayName = visibleName(person);
    const historicalLifeLabel = timelineLifeLabel(person, historicalYear);
    const group = svg('g', { class: `timeline-node ${person.gender} ${isSpouseNode ? 'spouse' : ''} ${layoutNode.isTransportedCopy ? 'transport-copy' : ''} ${hasReign ? 'reigned' : ''} ${id === state.selectedId ? 'selected' : ''}`, transform: `translate(${pos.x} ${pos.y})`, 'data-node-key': nodeKey, 'data-person-id': id, tabindex: '0', role: 'button', 'aria-label': `${historicalDisplayName}, ${historicalLifeLabel}${isSpouseNode ? ', spouse' : ''}${layoutNode.isTransportedCopy ? ', transported copy' : ''}${hasReign ? ', reigning monarch' : ''}` });
    group.append(svg('title', {}, `${historicalDisplayName} · ${historicalLifeLabel}`));
    group.append(nodeShape({ class: 'lifespan' }));
    const eventClipId = `node-events-${nodeIndex}`;
    const eventClip = svg('clipPath', { id: eventClipId, clipPathUnits: 'userSpaceOnUse' });
    eventClip.append(nodeShape({}));
    nodeDefs.append(eventClip);
    const personalEventLayer = svg('g', { class: 'personal-event-layer', 'clip-path': `url(#${eventClipId})` });
    person.personalEvents.forEach(event => {
      const start = Math.max(birthYear(person), event.startYear);
      const finish = Math.min(endYear(person), event.endYear ?? event.startYear);
      if (finish < start) return;
      const eventX = (start - birthYear(person)) * yearWidth;
      const eventWidth = Math.max(0, (finish - start) * yearWidth);
      const eventColor = isReignLabel(event.name) ? state.reignColor : paletteColor(event.color, DEFAULT_PERSONAL_EVENT_COLOR);
      if (eventWidth > 0) {
        const mark = svg('rect', { class: 'personal-event-range', x: eventX, y: 0, width: eventWidth, height: rowHeight, fill: personalEventFill(eventColor) });
        const yearLabel = formatEventYearRange(event.startYear, event.endYear);
        mark.append(svg('title', {}, `${event.name} · ${yearLabel}`));
        personalEventLayer.append(mark);
        personalEventLayer.append(svg('line', { class: 'personal-event-edge', x1: eventX, y1: 0, x2: eventX, y2: rowHeight, stroke: eventColor }));
        personalEventLayer.append(svg('line', { class: 'personal-event-edge', x1: eventX + eventWidth, y1: 0, x2: eventX + eventWidth, y2: rowHeight, stroke: eventColor }));
      } else {
        const mark = svg('line', { class: 'personal-event-point', x1: eventX, y1: 0, x2: eventX, y2: rowHeight, stroke: eventColor });
        const yearLabel = formatEventYearRange(event.startYear, event.endYear);
        mark.append(svg('title', {}, `${event.name} · ${yearLabel}`));
        personalEventLayer.append(mark);
      }
    });
    // The opaque event layer is clipped to the rounded lifespan, then painted
    // over the base outline so no gender-color trace crosses an event segment.
    group.append(nodeShape({ class: 'lifespan-outline' }));
    group.append(personalEventLayer);
    // Repaint the part of each horizontal connector that intersects this node.
    // The control is drawn later, so the line visually terminates beneath it.
    (horizontalOverlaysByNode.get(nodeKey) || []).forEach(connection => {
      const localX1 = Math.max(0, Math.min(lifespanWidth, connection.x1 - pos.x));
      const localX2 = Math.max(0, Math.min(lifespanWidth, connection.x2 - pos.x));
      if (Math.abs(localX2 - localX1) < 0.5) return;
      group.append(svg('line', {
        class: `timeline-edge node-horizontal-overlay horizontal ${connection.className}`,
        x1: localX1, y1: rowHeight / 2, x2: localX2, y2: rowHeight / 2
      }));
    });
    // A birth can precede, or fall in the same year as, the parents' marriage.
    // Repaint the exact portion of that family's descendant stem which crosses
    // the child's box; the text and controls remain above the line.
    (descendantOverlaysByChild.get(nodeKey) || []).forEach(connection => {
      const localX = connection.x - pos.x;
      const localY1 = Math.max(0, Math.min(rowHeight, connection.y1 - pos.y));
      const localY2 = Math.max(0, Math.min(rowHeight, connection.y2 - pos.y));
      if (localX < 0 || localX > lifespanWidth || localY2 - localY1 < 0.5) return;
      group.append(svg('line', {
        class: `timeline-edge descendant-node-overlay vertical ${connection.className}`,
        x1: localX, y1: localY1, x2: localX, y2: localY2,
        'data-family-key': connection.familyKey
      }));
    });
    // Marriage stems cross above both spouse boxes, including their borders,
    // so each stem reads as one uninterrupted line down to its children. Text
    // and controls are painted afterward to remain legible and interactive.
    (marriageOverlaysByParent.get(nodeKey) || []).forEach(marriage => {
      const localX = marriage.x - pos.x;
      if (localX < 0 || localX > lifespanWidth) return;
      const overlay = svg('line', {
        class: `timeline-edge marriage-node-overlay vertical ${marriage.className}`,
        x1: localX, y1: 0, x2: localX, y2: rowHeight,
        'data-marriage-year': marriage.year
      });
      overlay.append(svg('title', {}, marriage.title));
      group.append(overlay);
    });
    // Keep marriage markers inside the root's descendant scope. A spouse's
    // other family belongs to a different descendant-tree view.
    if (isSpouseNode) {
      const attachedKey = displayParentByKey.get(nodeKey);
      const attachedPartnerId = layoutNodeByKey.get(attachedKey)?.id || attachedKey || '';
      scopedSpouseIds(person, scope).forEach(partnerId => {
        const partner = state.people[partnerId];
        const pairKey = partnerRelationKey(id, partnerId);
        const isFormal = person.spouses.includes(partnerId) || partner?.spouses?.includes(id);
        const marriageYear = marriageYearFor(id, partnerId);
        if (!isFormal || partnerId === attachedPartnerId || renderedPartnerPairs.has(pairKey) || marriageYear == null) return;
        const localX = (marriageYear - birthYear(person)) * yearWidth;
        if (localX < 0 || localX > lifespanWidth) return;
        const marker = svg('line', {
          class: 'timeline-edge unconnected-marriage-marker vertical',
          x1: localX, y1: 0, x2: localX, y2: rowHeight,
          'data-marriage-year': marriageYear,
          'data-partner-id': partnerId
        });
        marker.append(svg('title', {}, `Married ${visibleName(partner)} in ${marriageYear}; profile not shown in this tree`));
        group.append(marker);
      });
    }
    const childrenShownAtAnotherOccurrence = transportedChildrenByNatalId.get(id) || new Set();
    const hasChildren = person.children.some(childId =>
      !childrenShownAtAnotherOccurrence.has(childId) && expandableIds.has(childId) && childEdgeVisible(id, childId)
    );
    const isCollapsed = state.collapsedIds.has(id);
    // A cousin-marriage collapse can move this profile into the surviving
    // household as the occurrence immediately above its descendants. That
    // occurrence keeps the control; a natal occurrence whose children are
    // rendered elsewhere does not receive one.
    const showBranchControl = !isSpouseNode || (isCollapsed && hasChildren);
    const icon = showBranchControl
      ? svg('g', { class: `timeline-expander ${hasChildren ? (isCollapsed ? 'collapsed' : 'expanded') : 'leaf'}`, role: hasChildren ? 'button' : 'img', tabindex: hasChildren ? '0' : '-1', 'aria-label': hasChildren ? `${isCollapsed ? 'Expand' : 'Collapse'} descendants of ${historicalDisplayName}` : 'No descendants' })
      : svg('g', { class: 'timeline-marriage-link', role: 'img', 'aria-label': 'Marriage link' });
    const nodeCenterY = rowHeight / 2;
    if (showBranchControl) {
      icon.append(svg('rect', { class: 'expander-box', x: 12, y: nodeCenterY - 6, width: 12, height: 12, rx: 2 }));
      if (hasChildren) icon.append(svg('text', { class: 'node-symbol', x: 18, y: nodeCenterY }, isCollapsed ? '+' : '−'));
    } else icon.append(svg('text', { class: 'marriage-symbol', x: 18, y: nodeCenterY }, '⚭'));
    const toggleBranch = event => {
      event.stopPropagation();
      if (isCollapsed) state.collapsedIds.delete(id); else state.collapsedIds.add(id);
      render();
    };
    if (hasChildren && showBranchControl) {
      icon.addEventListener('click', toggleBranch);
      icon.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') toggleBranch(event); });
    }
    group.append(icon);
    const textMaskId = `node-text-outside-${nodeIndex}`;
    const textMask = svg('mask', { id: textMaskId, maskUnits: 'userSpaceOnUse', x: -80, y: -12, width: Math.max(lifespanWidth, layoutNodes[nodeIndex].occupancyWidth) + 180, height: rowHeight + 24 });
    textMask.append(svg('rect', { x: -80, y: -12, width: Math.max(lifespanWidth, layoutNodes[nodeIndex].occupancyWidth) + 180, height: rowHeight + 24, fill: '#fff' }));
    textMask.append(nodeShape({ fill: '#000' }));
    nodeDefs.append(textMask);
    const makeLabel = className => {
      const text = svg('text', { class: className, x: 38, y: nodeCenterY + 1 });
      highlightedNameParts(historicalDisplayName, timelineKeywords).forEach(part => {
        text.append(svg('tspan', { class: `timeline-name${part.matched ? ' timeline-name-match' : ''}` }, part.text));
      });
      text.append(svg('tspan', { class: 'timeline-life-label', dx: 8 }, historicalLifeLabel));
      return text;
    };
    const halo = makeLabel('timeline-label timeline-label-halo');
    halo.setAttribute('mask', `url(#${textMaskId})`);
    const label = makeLabel('timeline-label');
    if (snapshotLabelLayer) {
      const snapshotLabel = svg('g', {
        class: `timeline-snapshot-label ${isSpouseNode ? 'spouse' : ''}`,
        transform: `translate(${pos.x} ${pos.y})`,
        'data-person-id': id
      });
      snapshotLabel.append(halo, label);
      snapshotLabelLayer.append(snapshotLabel);
    } else group.append(halo, label);
    if (person.isLiving) group.append(svg('line', { class: 'current-year-edge', x1: lifespanWidth, y1: 0, x2: lifespanWidth, y2: rowHeight }));
    group.addEventListener('click', () => selectPerson(id));
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') selectPerson(id); });
    canvas.append(group);
  });
  if (historicalYear != null) {
    const historicalX = xForYear(historicalYear);
    const snapshotLayer = svg('g', { class: 'timeline-as-of-layer', 'aria-label': `Historical snapshot at ${historicalYear}` });
    snapshotLayer.append(svg('rect', { class: 'timeline-as-of-dim', x: historicalX, y: eventTop, width: Math.max(0, xForYear(maxYear) - historicalX + TIMELINE_PAN_MARGIN.right), height: eventBottom - eventTop }));
    const historicalHitLine = svg('line', { class: 'timeline-as-of-hit', x1: historicalX, y1: eventTop, x2: historicalX, y2: eventBottom });
    historicalHitLine.addEventListener('pointerenter', event => updateTimelineAsOfGrip(event.clientY));
    historicalHitLine.addEventListener('pointermove', event => updateTimelineAsOfGrip(event.clientY));
    historicalHitLine.addEventListener('pointerleave', () => { if (!timelineAsOfDrag) hideTimelineAsOfGrip(); });
    historicalHitLine.addEventListener('pointerdown', beginHistoricalYearSlide);
    historicalHitLine.addEventListener('mousedown', beginHistoricalYearMouseSlide);
    snapshotLayer.append(historicalHitLine);
    snapshotLayer.append(svg('line', { class: 'timeline-as-of-line', x1: historicalX, y1: eventTop, x2: historicalX, y2: eventBottom }));
    canvas.append(snapshotLayer);
    canvas.append(snapshotLabelLayer);
    const grip = svg('g', {
      class: 'timeline-as-of-grip', hidden: '', 'aria-hidden': 'true',
      'data-x': historicalX, 'data-min-y': eventTop + 28, 'data-max-y': eventBottom - 28
    });
    grip.append(svg('rect', { class: 'timeline-as-of-grip-box', x: -7, y: -27, width: 14, height: 54, rx: 5 }));
    grip.append(svg('line', { class: 'timeline-as-of-grip-bar', x1: -2, y1: -17, x2: -2, y2: 17 }));
    grip.append(svg('line', { class: 'timeline-as-of-grip-bar', x1: 2, y1: -17, x2: 2, y2: 17 }));
    canvas.append(grip);
  }
  canvas.style.transform = `scale(${state.zoom})`;
  if (historicalYear != null && timelineAsOfGripClientY != null) updateTimelineAsOfGrip(timelineAsOfGripClientY);
  if (pendingTimelineViewport) {
    const destination = pendingTimelineViewport;
    pendingTimelineViewport = null;
    timelineViewportInitialized = true;
    requestAnimationFrame(() => {
      els['canvas-viewport'].scrollLeft = destination.left;
      els['canvas-viewport'].scrollTop = destination.top;
    });
  } else if (!timelineViewportInitialized) {
    timelineViewportInitialized = true;
    requestAnimationFrame(() => {
      els['canvas-viewport'].scrollLeft = TIMELINE_PAN_MARGIN.left * state.zoom;
      els['canvas-viewport'].scrollTop = TIMELINE_PAN_MARGIN.top * state.zoom;
    });
  }
}
function escapeHtml(value) {
  const node = document.createElement('span'); node.textContent = value; return node.innerHTML;
}

function appendHighlightedName(container, value, keywords) {
  highlightedNameParts(value, keywords).forEach(part => {
    if (!part.matched) {
      container.append(document.createTextNode(part.text));
      return;
    }
    const mark = document.createElement('mark');
    mark.className = 'person-name-match';
    mark.textContent = part.text;
    container.append(mark);
  });
}

function highlightedNameParts(value, keywords) {
  const text = String(value || '');
  const terms = [...new Set(keywords.map(clean).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ text, matched: false }];
  const pattern = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const matcher = new RegExp(pattern, 'giu');
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: text.slice(cursor, index), matched: false });
    parts.push({ text: match[0], matched: true });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), matched: false });
  return parts.length ? parts : [{ text, matched: false }];
}

function centerTimelinePerson(id) {
  requestAnimationFrame(() => {
    const primaryNode = els['timeline-canvas'].querySelector(`.timeline-node[data-node-key="${CSS.escape(id)}"]`);
    if (!primaryNode) return;
    const viewport = els['canvas-viewport'];
    const viewportRect = viewport.getBoundingClientRect();
    const visibleRight = els['detail-sidebar'].classList.contains('open')
      ? Math.max(viewportRect.left, viewportRect.right - els['detail-sidebar'].offsetWidth)
      : viewportRect.right;
    const targetX = viewportRect.left + (visibleRight - viewportRect.left) / 2;
    const targetY = viewportRect.top + viewportRect.height / 2;
    const nodeRect = primaryNode.getBoundingClientRect();
    viewport.scrollBy({
      left: nodeRect.left + nodeRect.width / 2 - targetX,
      top: nodeRect.top + nodeRect.height / 2 - targetY,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  });
}

function clearTimelinePersonPreview(id = '') {
  if (id && hoveredListPersonId !== id) return;
  hoveredListPersonId = '';
  const canvas = els['timeline-canvas'];
  canvas.querySelectorAll('.timeline-node.list-hover').forEach(node => node.classList.remove('list-hover'));
  canvas.querySelectorAll('.timeline-snapshot-label.list-hover-label').forEach(label => label.classList.remove('list-hover-label'));
}

function previewTimelinePerson(id) {
  hoveredListPersonId = id;
  const canvas = els['timeline-canvas'];
  canvas.querySelectorAll('.timeline-node.list-hover').forEach(node => node.classList.remove('list-hover'));
  canvas.querySelectorAll('.timeline-snapshot-label.list-hover-label').forEach(label => label.classList.remove('list-hover-label'));
  const nodes = [...canvas.querySelectorAll(`.timeline-node[data-person-id="${CSS.escape(id)}"]`)];
  if (!nodes.length) return;
  nodes.forEach(node => node.classList.add('list-hover'));
  canvas.querySelectorAll(`.timeline-snapshot-label[data-person-id="${CSS.escape(id)}"]`).forEach(label => label.classList.add('list-hover-label'));

  const viewport = els['canvas-viewport'];
  const viewportRect = viewport.getBoundingClientRect();
  const rulerHeight = els['timeline-ruler'].hidden ? 0 : els['timeline-ruler'].getBoundingClientRect().height;
  const visibleRight = els['detail-sidebar'].classList.contains('open')
    ? Math.max(viewportRect.left, viewportRect.right - els['detail-sidebar'].offsetWidth)
    : viewportRect.right;
  const bounds = {
    left: viewportRect.left + 12,
    right: visibleRight - 12,
    top: viewportRect.top + rulerHeight + 10,
    bottom: viewportRect.bottom - 12
  };
  const adjustment = node => {
    const rect = node.getBoundingClientRect();
    const availableWidth = bounds.right - bounds.left;
    const availableHeight = bounds.bottom - bounds.top;
    const dx = rect.width > availableWidth
      ? rect.left + rect.width / 2 - (bounds.left + bounds.right) / 2
      : rect.left < bounds.left ? rect.left - bounds.left : rect.right > bounds.right ? rect.right - bounds.right : 0;
    const dy = rect.height > availableHeight
      ? rect.top + rect.height / 2 - (bounds.top + bounds.bottom) / 2
      : rect.top < bounds.top ? rect.top - bounds.top : rect.bottom > bounds.bottom ? rect.bottom - bounds.bottom : 0;
    return { dx, dy, distance: Math.abs(dx) + Math.abs(dy) };
  };
  const best = nodes.map(adjustment).sort((a, b) => a.distance - b.distance)[0];
  if (best.distance > 0) viewport.scrollBy({
    left: best.dx,
    top: best.dy,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  });
}

function selectPerson(id, { center = false } = {}) {
  if (!activeDescendantScope().allowedIds.has(id)) return;
  if (els['events-dialog'].open) els['events-dialog'].close();
  state.selectedId = id;
  state.editingProfileId = '';
  render();
  els['detail-sidebar'].scrollTop = 0;
  if (center) centerTimelinePerson(id);
}
function renderPersonList() {
  clearTimelinePersonPreview();
  const scope = activeDescendantScope();
  const keywords = clean(els['tree-filter'].value).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const people = [...scope.allowedIds].map(id => state.people[id]).filter(Boolean)
    .filter(person => !keywords.length || keywords.some(keyword => matchesKeyword(person, keyword)));
  people.sort((a, b) => visibleName(a).localeCompare(visibleName(b)));
  els['people-count'].textContent = people.length;
  els['people-label'].textContent = keywords.length ? (people.length === 1 ? 'match' : 'matches') : (people.length === 1 ? 'profile' : 'profiles');
  els['people-list'].replaceChildren(...people.map(person => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `person-list-item${person.id === state.selectedId ? ' active' : ''}`; button.dataset.gender = person.gender; button.dataset.personId = person.id;
    const gender = document.createElement('span');
    gender.className = 'person-gender';
    gender.setAttribute('role', 'img');
    gender.setAttribute('aria-label', person.gender === 'male' ? 'Male' : person.gender === 'female' ? 'Female' : 'Gender unknown');
    gender.textContent = person.gender === 'male' ? '♂' : person.gender === 'female' ? '♀' : '·';
    const summary = document.createElement('span');
    const name = document.createElement('strong');
    const displayedName = visibleName(person);
    appendHighlightedName(name, displayedName, keywords);
    const lifespan = document.createElement('small');
    lifespan.textContent = life(person);
    const matchedAlias = keywords.length && !keywords.some(keyword => displayedName.toLocaleLowerCase().includes(keyword))
      ? person.namePeriods.find(period => keywords.some(keyword => period.name.toLocaleLowerCase().includes(keyword)))
      : null;
    summary.append(name);
    if (matchedAlias) {
      const alias = document.createElement('small');
      alias.className = 'person-list-alias';
      alias.append(document.createTextNode('Also known as '));
      appendHighlightedName(alias, matchedAlias.name, keywords);
      summary.append(alias);
    }
    summary.append(lifespan);
    button.append(gender, summary);
    button.addEventListener('pointerenter', () => previewTimelinePerson(person.id));
    button.addEventListener('pointerleave', () => clearTimelinePersonPreview(person.id));
    button.addEventListener('focus', () => previewTimelinePerson(person.id));
    button.addEventListener('blur', () => clearTimelinePersonPreview(person.id));
    button.addEventListener('click', () => selectPerson(person.id, { center: true }));
    return button;
  }));
}

function updateEventColorPalette(picker, value, fallback = DEFAULT_PERSONAL_EVENT_COLOR) {
  picker.value = paletteColor(value, fallback);
  const current = picker.querySelector('.event-color-current');
  if (current) {
    current.style.setProperty('--swatch-color', picker.value);
    current.title = `Current colour: ${EVENT_COLOR_PALETTE.find(([candidate]) => candidate === picker.value)?.[1] || picker.value}`;
  }
  picker.querySelectorAll('.event-color-swatch').forEach(swatch => {
    const selected = swatch.dataset.color === picker.value;
    swatch.setAttribute('aria-selected', String(selected));
    swatch.tabIndex = selected ? 0 : -1;
  });
}

function initializeEventColorPalette(picker, value, fallback = DEFAULT_PERSONAL_EVENT_COLOR) {
  picker.replaceChildren();
  picker.classList.add('event-color-picker');
  const popupId = uniqueId('event-colours');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'event-color-current';
  trigger.setAttribute('aria-label', `Choose ${picker.getAttribute('aria-label') || 'event colour'}`);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', popupId);
  const options = document.createElement('div');
  options.id = popupId;
  options.className = 'event-color-options';
  options.setAttribute('role', 'listbox');
  options.setAttribute('aria-label', picker.getAttribute('aria-label') || 'Event colour');
  options.setAttribute('popover', 'auto');
  const positionPopup = () => {
    const rect = trigger.getBoundingClientRect();
    const width = options.offsetWidth || 86;
    const height = options.offsetHeight || 50;
    options.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    options.style.top = `${rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - height - 5)}px`;
  };
  trigger.addEventListener('click', () => {
    if (options.matches(':popover-open')) options.hidePopover();
    else {
      options.showPopover();
      positionPopup();
    }
  });
  options.addEventListener('toggle', event => {
    const open = event.newState === 'open';
    trigger.setAttribute('aria-expanded', String(open));
    if (open) positionPopup();
  });
  EVENT_COLOR_PALETTE.forEach(([optionValue, optionLabel]) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'event-color-swatch';
    swatch.dataset.color = optionValue;
    swatch.style.setProperty('--swatch-color', optionValue);
    swatch.title = optionLabel;
    swatch.setAttribute('role', 'option');
    swatch.setAttribute('aria-label', optionLabel);
    swatch.addEventListener('click', () => {
      updateEventColorPalette(picker, optionValue, fallback);
      picker.dispatchEvent(new Event('change', { bubbles: true }));
      options.hidePopover();
    });
    options.append(swatch);
  });
  picker.append(trigger, options);
  updateEventColorPalette(picker, value, fallback);
}

function eventColorPalette(value, label, onColor, fallback) {
  const picker = document.createElement('div');
  picker.className = 'event-color-picker';
  picker.setAttribute('aria-label', label);
  initializeEventColorPalette(picker, value, fallback);
  picker.addEventListener('change', () => onColor(picker.value));
  return picker;
}

function setSharedReignColor(value) {
  state.reignColor = paletteColor(value, DEFAULT_REIGN_EVENT_COLOR);
  Object.values(state.people).forEach(person => person.personalEvents.forEach(event => {
    if (isReignLabel(event.name)) event.color = state.reignColor;
  }));
  persist('Shared reign colour saved');
  render();
}

function rowActionButton(className, symbol, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = symbol;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.addEventListener('click', onClick);
  return button;
}

function inlineYearInput(value, label) {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.value = value ?? '';
  input.placeholder = label;
  input.setAttribute('aria-label', label);
  return input;
}

function eventEditorRow(event, onSave, onColor, onDelete, fallback = DEFAULT_PERSONAL_EVENT_COLOR, prefix = '') {
  const row = document.createElement('div');
  row.className = 'event-editor-row';
  const name = document.createElement('strong');
  name.textContent = [prefix, event.name].filter(Boolean).join(' · ');
  const years = document.createElement('small');
  years.textContent = formatEventYearRange(event.startYear, event.endYear);
  const color = eventColorPalette(isReignLabel(event.name) ? state.reignColor : event.color, `Colour for ${event.name}`, onColor, fallback);
  const edit = rowActionButton('row-edit', '✎', `Edit ${event.name}`, () => {
    row.classList.add('editing');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = event.name;
    nameInput.setAttribute('aria-label', 'Event name');
    const startInput = inlineYearInput(event.startYear, 'Start year');
    const endInput = inlineYearInput(event.endYear, 'End year');
    const draftColor = eventColorPalette(isReignLabel(event.name) ? state.reignColor : event.color, `Colour for ${event.name}`, () => {}, fallback);
    const save = rowActionButton('row-save', '✓', `Save ${event.name}`, () => {
      const nextName = clean(nameInput.value);
      let startYear = numericYear(startInput.value);
      let endYear = numericYear(endInput.value) ?? startYear;
      if (!nextName || startYear == null) return toast('Enter an event name and start year.', true);
      if (endYear < startYear) [startYear, endYear] = [endYear, startYear];
      onSave({ ...event, name: nextName, startYear, endYear, color: paletteColor(draftColor.value, fallback) });
    });
    const remove = rowActionButton('row-delete', '×', `Delete ${event.name}`, onDelete);
    row.replaceChildren(nameInput, startInput, endInput, draftColor, save, remove);
    nameInput.focus();
    nameInput.select();
  });
  row.append(name, years, color, edit);
  return row;
}

function personalEventAgePrefix(person, event) {
  const birthYear = numericYear(person?.birthYear);
  const startYear = numericYear(event?.startYear);
  if (birthYear == null || startYear == null || startYear < birthYear) return '';
  const startAge = startYear - birthYear + 1;
  return `Age ${startAge}`;
}

function formatNamePeriod(period) {
  const start = period.startYear == null ? 'earlier' : period.startYear;
  const end = period.endYear == null ? 'later' : period.endYear;
  return `${start}–${end}`;
}

function renderNamePeriods(person) {
  const list = els['name-periods-list'];
  if (!person?.namePeriods?.length) {
    const empty = document.createElement('span');
    empty.className = 'event-editor-empty';
    empty.textContent = 'No dated names yet; the default name is used.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...person.namePeriods.map((period, index) => {
    const row = document.createElement('div');
    row.className = 'name-period-row';
    const isDefault = period.id === person.defaultNamePeriodId;
    const text = period.sourceUrl ? document.createElement('a') : document.createElement('strong');
    text.textContent = period.name;
    if (period.sourceUrl) { text.href = period.sourceUrl; text.target = '_blank'; text.rel = 'noreferrer'; }
    const years = document.createElement('small');
    years.textContent = formatNamePeriod(period);
    const defaultMarker = document.createElement('span');
    defaultMarker.className = 'name-period-default';
    defaultMarker.textContent = isDefault ? 'default' : '';
    const edit = rowActionButton('row-edit', '✎', `Edit name period ${period.name}`, () => {
      row.classList.add('editing');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = period.name;
      nameInput.setAttribute('aria-label', 'Historical name');
      const startInput = inlineYearInput(period.startYear, 'From year');
      const endInput = inlineYearInput(period.endYear, 'To year');
      let makeDefault = isDefault;
      const defaultControl = rowActionButton('row-default', makeDefault ? '★' : '☆', `Use ${period.name} as the default name`, () => {
        makeDefault = true;
        defaultControl.textContent = '★';
        defaultControl.setAttribute('aria-pressed', 'true');
      });
      defaultControl.setAttribute('aria-pressed', String(makeDefault));
      const save = rowActionButton('row-save', '✓', `Save name period ${period.name}`, () => {
        const nextName = clean(nameInput.value);
        let startYear = numericYear(startInput.value);
        let endYear = numericYear(endInput.value);
        if (!nextName) return toast('Enter the historical name or title.', true);
        if (startYear != null && endYear != null && endYear < startYear) [startYear, endYear] = [endYear, startYear];
        person.namePeriods[index] = { ...period, name: nextName, startYear, endYear };
        person.namePeriods = normalizeNamePeriods(person.namePeriods);
        if (makeDefault) person.defaultNamePeriodId = period.id;
        persist('Historical name saved');
        render();
      });
      const remove = rowActionButton('row-delete', '×', `Delete name period ${period.name}`, () => {
        person.namePeriods.splice(index, 1);
        person.namePeriods = normalizeNamePeriods(person.namePeriods);
        if (isDefault) {
          person.defaultNamePeriodId = person.namePeriods.find(candidate => candidate.name.toLocaleLowerCase() === clean(person.displayName).toLocaleLowerCase())?.id
            || person.namePeriods.at(-1)?.id || '';
        }
        persist('Historical name deleted');
        render();
      });
      row.replaceChildren(nameInput, startInput, endInput, defaultControl, save, remove);
      nameInput.focus();
      nameInput.select();
    });
    row.append(text, years, defaultMarker, edit);
    return row;
  }));
}

function renderPersonalEvents(person) {
  const list = els['personal-events-list'];
  if (!person?.personalEvents?.length) {
    const empty = document.createElement('span');
    empty.className = 'event-editor-empty';
    empty.textContent = 'No personal events yet.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...person.personalEvents.map((event, index) => eventEditorRow(event, updated => {
    person.personalEvents[index] = updated;
    if (isReignLabel(updated.name)) {
      state.reignColor = paletteColor(updated.color, DEFAULT_REIGN_EVENT_COLOR);
      Object.values(state.people).forEach(profile => profile.personalEvents.forEach(item => {
        if (isReignLabel(item.name)) item.color = state.reignColor;
      }));
    }
    person.personalEvents = normalizePersonalEvents(person.personalEvents);
    persist('Personal event saved');
    render();
  }, value => {
    if (isReignLabel(event.name)) return setSharedReignColor(value);
    person.personalEvents[index].color = paletteColor(value, DEFAULT_PERSONAL_EVENT_COLOR);
    persist('Event colour saved');
    render();
  }, () => {
    person.personalEvents.splice(index, 1);
    persist('Personal event deleted');
    render();
  }, DEFAULT_PERSONAL_EVENT_COLOR, personalEventAgePrefix(person, event))));
}

function renderGlobalEventsEditor() {
  const list = els['global-events-list'];
  if (!state.globalEvents.length) {
    const empty = document.createElement('span');
    empty.className = 'event-editor-empty';
    empty.textContent = 'No global events yet.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...state.globalEvents.map((event, index) => eventEditorRow(event, updated => {
    state.globalEvents[index] = updated;
    state.globalEvents = normalizeGlobalEvents(state.globalEvents);
    persist('Global event saved');
    render();
  }, value => {
    state.globalEvents[index].color = paletteColor(value, DEFAULT_GLOBAL_EVENT_COLOR);
    persist('Global event colour saved');
    render();
  }, () => {
    state.globalEvents.splice(index, 1);
    persist('Global event deleted');
    render();
  }, DEFAULT_GLOBAL_EVENT_COLOR)));
}

function renderRelationshipHouseholds(person) {
  const container = els['relationship-households'];
  const scope = activeDescendantScope();
  if (!person || !scope.allowedIds.has(person.id)) { container.replaceChildren(); return; }
  const visibility = buildTimelineVisibility();
  const visibleOccurrences = [...els['timeline-canvas'].querySelectorAll(`.timeline-node[data-person-id="${CSS.escape(person.id)}"]`)];
  const shownOnlyAsSpouse = visibleOccurrences.length > 0 && visibleOccurrences.every(node => node.classList.contains('spouse'));
  const byBirth = (firstId, secondId) => (numericYear(state.people[firstId]?.birthYear) ?? 9999) - (numericYear(state.people[secondId]?.birthYear) ?? 9999) || visibleName(state.people[firstId]).localeCompare(visibleName(state.people[secondId]));
  const partnerIds = scopedSpouseIds(person, scope).sort((firstId, secondId) => {
    const firstYear = marriageYearFor(person.id, firstId);
    const secondYear = marriageYearFor(person.id, secondId);
    if (firstYear != null || secondYear != null) return (firstYear ?? Number.POSITIVE_INFINITY) - (secondYear ?? Number.POSITIVE_INFINITY);
    const firstChildYear = Math.min(...scopedHouseholdChildren(person.id, firstId, scope).map(id => numericYear(state.people[id]?.birthYear) ?? 9999), 9999);
    const secondChildYear = Math.min(...scopedHouseholdChildren(person.id, secondId, scope).map(id => numericYear(state.people[id]?.birthYear) ?? 9999), 9999);
    return firstChildYear - secondChildYear || byBirth(firstId, secondId);
  });
  const assignedChildren = new Set();
  const groups = partnerIds.map(partnerId => {
    const children = scopedHouseholdChildren(person.id, partnerId, scope).sort(byBirth);
    children.forEach(id => assignedChildren.add(id));
    return { partnerId, children };
  });
  const ungroupedChildren = person.children.filter(id => scope.descendantIds.has(id) && state.people[id] && !assignedChildren.has(id)).sort(byBirth);
  if (ungroupedChildren.length) groups.push({ partnerId: '', children: ungroupedChildren });
  const parentIds = person.parents.filter(id => scope.allowedIds.has(id) && state.people[id]).sort(byBirth);

  if (!groups.length && !parentIds.length) {
    const empty = document.createElement('p');
    empty.className = 'relationship-empty';
    empty.textContent = 'No family members in the local tree.';
    container.replaceChildren(empty);
    return;
  }

  const makeRow = ({ targetId, kind, visible, label, detail, relationKeys = [], canToggle = true, toggleDisabled = false }) => {
    const row = document.createElement('div');
    row.className = `relationship-row ${kind}${visible ? '' : ' is-hidden'}`;
    const branch = document.createElement('span');
    branch.className = 'relationship-branch';
    branch.textContent = kind === 'spouse' ? '⚭' : kind === 'parent' ? '↑' : '└';
    const copy = document.createElement('span');
    copy.className = 'relationship-copy';
    const name = document.createElement('strong');
    name.textContent = visibleName(state.people[targetId]);
    const meta = document.createElement('small');
    meta.textContent = detail;
    copy.append(name, meta);
    row.append(branch, copy);
    if (canToggle) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'relationship-visibility';
      toggle.textContent = visible ? '◉' : '○';
      toggle.disabled = toggleDisabled;
      toggle.title = toggleDisabled
        ? `${label} belongs to another marriage outside the visible tree`
        : `${visible ? 'Hide' : 'Show'} ${label} in the timeline`;
      toggle.setAttribute('aria-label', toggle.title);
      if (!toggleDisabled) toggle.addEventListener('click', () => {
        const keys = relationKeys.length ? relationKeys
          : [kind === 'spouse' ? partnerRelationKey(person.id, targetId) : childRelationKey(person.id, targetId)];
        keys.forEach(key => { state.relationVisibility[key] = !visible; });
        persist(`${label} ${visible ? 'hidden' : 'shown'} in the timeline`);
        render();
        if (!visible && numericYear(state.people[targetId]?.birthYear) == null) {
          toast(`${fullName(state.people[targetId])} has no birth year, so it cannot be positioned on the timeline yet.`, true);
        }
      });
      row.append(toggle);
    }
    return row;
  };

  const sections = [];
  if (parentIds.length) {
    const origin = document.createElement('div');
    origin.className = 'relationship-household family-origin';
    const heading = document.createElement('p');
    heading.className = 'relationship-group-label';
    heading.textContent = 'Parents';
    origin.append(heading);
    parentIds.forEach(parentId => {
      const parent = state.people[parentId];
      const role = parent.gender === 'male' ? 'Father' : parent.gender === 'female' ? 'Mother' : 'Parent';
      const key = childRelationKey(parentId, person.id);
      const visible = visibility.visibleIds.has(parentId) && visibility.childEdgeVisible(parentId, person.id);
      origin.append(makeRow({ targetId: parentId, kind: 'parent', visible, label: role.toLowerCase(), detail: `${role} · ${life(parent)}`, relationKeys: [key], canToggle: false }));
    });
    sections.push(origin);
  }

  sections.push(...groups.map(group => {
    const household = document.createElement('div');
    household.className = 'relationship-household';
    if (group.partnerId) {
      const partner = state.people[group.partnerId];
      const pairKey = partnerRelationKey(person.id, group.partnerId);
      const visible = visibility.renderedPartnerPairs.has(pairKey);
      const partnerHasVisibleOccurrence = !!els['timeline-canvas'].querySelector(`.timeline-node[data-person-id="${CSS.escape(group.partnerId)}"]`);
      const formal = person.spouses.includes(group.partnerId) || partner.spouses.includes(person.id);
      const divorced = person.divorcedSpouses.includes(group.partnerId) || partner.divorcedSpouses.includes(person.id);
      const year = clean(person.marriageYears[group.partnerId] || partner.marriageYears[person.id]);
      const relationshipEndStatus = clean(person.relationshipEndStatuses[group.partnerId] || partner.relationshipEndStatuses[person.id] || (divorced ? 'ended' : ''));
      const relationshipEndYear = clean(person.relationshipEndYears[group.partnerId] || partner.relationshipEndYears[person.id]);
      const ended = relationshipEndStatus === 'ended'
        ? (relationshipEndYear ? `Ended ${relationshipEndYear}` : '')
        : relationshipEndStatus && `${relationshipEndStatus[0].toUpperCase()}${relationshipEndStatus.slice(1)} ${relationshipEndYear}`.trim();
      household.append(makeRow({
        targetId: group.partnerId,
        kind: 'spouse',
        visible,
        label: visibleName(partner),
        detail: [formal && year && `Married ${year}`, !formal && year && `Relationship ${year}`, ended].filter(Boolean).join(' · '),
        toggleDisabled: shownOnlyAsSpouse && !partnerHasVisibleOccurrence
      }));
    } else {
      const label = document.createElement('p');
      label.className = 'relationship-empty';
      label.textContent = 'Children without another recorded parent';
      household.append(label);
    }
    group.children.forEach(childId => {
      const visible = visibility.visibleIds.has(childId) && visibility.childEdgeVisible(person.id, childId);
      const childRelationKeys = state.people[childId].parents
        .filter(parentId => scope.allowedIds.has(parentId) && state.people[parentId])
        .map(parentId => childRelationKey(parentId, childId));
      household.append(makeRow({ targetId: childId, kind: 'child', visible, label: 'child', detail: `Child · ${life(state.people[childId])}`, relationKeys: childRelationKeys }));
    });
    return household;
  }));
  container.replaceChildren(...sections);
}

function renderDetails() {
  const scope = activeDescendantScope();
  const person = scope.allowedIds.has(state.selectedId) ? state.people[state.selectedId] : null;
  if (!person && state.selectedId) { state.selectedId = ''; state.editingProfileId = ''; }
  const isOpen = !!person;
  els['detail-backdrop'].hidden = !isOpen;
  els['detail-sidebar'].classList.toggle('open', isOpen);
  els['detail-sidebar'].setAttribute('aria-hidden', String(!isOpen));
  els['detail-sidebar'].inert = !isOpen;
  els['detail-empty'].hidden = !!person;
  els['person-form'].hidden = !person;
  if (!person) return;
  els['person-heading'].textContent = visibleName(person);
  els['person-life'].textContent = life(person);
  els['person-avatar'].textContent = initials(person);
  els['person-avatar'].style.background = '#fff';
  const form = els['person-form'];
  const isEditing = state.editingProfileId === person.id;
  els['edit-person'].hidden = isEditing;
  els['person-edit-fields'].hidden = !isEditing;
  els['person-edit-actions'].hidden = !isEditing;
  form.elements.displayName.value = fullName(person);
  form.elements.birthYear.value = person.birthYear || '';
  form.elements.deathYear.value = person.deathYear || '';
  form.elements.geniId.value = person.sourceProvider === 'geni' || /^profile-/i.test(person.sourceId)
    ? clean(person.sourceId || person.id).replace(/^profile-/i, '')
    : '';
  const sourceLink = els['person-source-link'];
  const source = sourceMeta(person);
  els['person-source-name'].textContent = source.name;
  els['person-source-mark'].textContent = source.mark;
  if (person.sourceUrl) sourceLink.href = person.sourceUrl;
  else sourceLink.removeAttribute('href');
  sourceLink.textContent = person.sourceUrl ? 'Open original profile ↗' : 'No profile linked';
  els['source-updated'].textContent = person.importedAt
    ? `Imported ${new Date(person.importedAt).toLocaleString()}.`
    : person.sourceUrl ? 'Public source linked to this local profile.' : 'No public source is linked.';
  renderRelationshipHouseholds(person);
  renderNamePeriods(person);
  renderPersonalEvents(person);
  els['add-relative'].disabled = false;
  els['add-relative'].removeAttribute('title');
  els['ai-family-status'].textContent = `The generated prompt will preserve “${fullName(person)}” as anchor ID ${person.id}.`;
}
function renderParentOptions() {
  const scope = activeDescendantScope();
  const people = [...scope.allowedIds].map(id => state.people[id]).filter(Boolean)
    .sort((a, b) => visibleName(a).localeCompare(visibleName(b)));
  const options = ['<option value="">No profile selected</option>', ...people.map(person => `<option value="${escapeHtml(person.id)}">${escapeHtml(visibleName(person))}</option>`)].join('');
  els['parent-select'].innerHTML = options;
}

function renderTreeTabs() {
  if (!els['tree-tabs']) return;
  els['tree-tabs'].replaceChildren(...treeWorkspace.trees.map(tree => {
    const active = tree.id === treeWorkspace.activeTreeId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tree-tab';
    button.dataset.treeId = tree.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    button.textContent = clean(tree.title) || 'Untitled family';
    button.title = button.textContent;
    return button;
  }));
  requestAnimationFrame(() => els['tree-tabs'].querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
}

function switchTree(treeId) {
  if (!treeId || treeId === treeWorkspace.activeTreeId) return;
  if (!state.ephemeral) saveActiveTreeSnapshot();
  const nextTree = treeWorkspace.trees.find(tree => tree.id === treeId);
  if (!nextTree) return;
  treeWorkspace.activeTreeId = treeId;
  applyTreeSnapshot(nextTree);
  els['tree-filter'].value = state.treeFilter;
  writeTreeWorkspace();
  render();
  els['save-status'].textContent = 'Tree switched';
  window.setTimeout(() => { els['save-status'].textContent = 'All changes saved locally'; }, 1200);
}

function beginNewTree() {
  els['new-tree-form'].elements.title.value = '';
  els['new-tree-dialog'].showModal();
}

function render() {
  const count = activeDescendantScope().allowedIds.size;
  els['tree-title'].textContent = state.title;
  els['people-count'].textContent = count;
  els['people-label'].textContent = count === 1 ? 'profile' : 'profiles';
  els['empty-state'].hidden = count > 0;
  // SVG elements do not implement HTMLElement.hidden consistently; toggle the attribute explicitly.
  els['timeline-canvas'].toggleAttribute('hidden', !count);
  els['timeline-ruler'].toggleAttribute('hidden', !count);
  renderTreeTabs(); renderPersonList(); renderTimeline(); renderDetails(); renderParentOptions(); renderGlobalEventsEditor();
}

function openAiImport(anchorId = '') {
  els['ai-import-prompt'].value = stitchPrompt(anchorId);
  els['ai-import-json'].value = '';
  els['ai-import-dialog'].showModal();
}

els['prepare-ai-import'].addEventListener('click', () => openAiImport(state.selectedId));
els['prepare-ai-person-import'].addEventListener('click', () => openAiImport(state.selectedId));
els['close-ai-import'].addEventListener('click', () => els['ai-import-dialog'].close());
els['copy-ai-import-prompt'].addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els['ai-import-prompt'].value);
  } catch {
    els['ai-import-prompt'].focus();
    els['ai-import-prompt'].select();
    document.execCommand('copy');
  }
  toast('Research prompt copied.');
});
els['stitch-ai-import'].addEventListener('click', () => {
  try {
    const raw = els['ai-import-json'].value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if (!raw) throw new Error('Paste the returned JSON first.');
    stitchImport(JSON.parse(raw));
    els['ai-import-dialog'].close();
  } catch (error) { toast(error.message || 'Could not stitch that JSON.', true); }
});
els['upload-ai-import'].addEventListener('click', () => els['file-input'].click());
els['import-file-button'].addEventListener('click', () => els['file-input'].click());
els['empty-file-button'].addEventListener('click', () => els['file-input'].click());
els['file-input'].addEventListener('change', async () => {
  try {
    const file = els['file-input'].files[0];
    if (file) {
      const text = await file.text();
      if (/\.(ged|gedcom)$/i.test(file.name) || /^0\s+HEAD\b/m.test(text)) importGedcom(text, file.name);
      else {
        importBackup(JSON.parse(text));
        if (els['ai-import-dialog'].open) els['ai-import-dialog'].close();
      }
    }
  }
  catch (error) { toast(error.message || 'Could not read that backup.', true); }
  els['file-input'].value = '';
});
els['export-button'].addEventListener('click', exportBackup);
els['save-image-button'].addEventListener('click', saveTimelineImage);
function syncTimelineSettingControls() {
  const sync = (options, value, output, down, up) => {
    const index = options.findIndex(([candidate]) => candidate === value);
    output.textContent = options[index]?.[1] || String(value);
    down.disabled = index <= 0;
    up.disabled = index < 0 || index >= options.length - 1;
  };
  sync(TIMELINE_YEAR_WIDTH_OPTIONS, state.timelineYearWidth, els['timeline-scale-value'], els['timeline-scale-down'], els['timeline-scale-up']);
  sync(TIMELINE_NODE_HEIGHT_OPTIONS, state.timelineNodeHeight, els['timeline-height-value'], els['timeline-height-down'], els['timeline-height-up']);
  els['timeline-as-of-year'].value = state.asOfYear ?? '';
  els['clear-timeline-as-of'].disabled = state.asOfYear == null;
}

function applyHistoricalYear() {
  const year = numericYear(els['timeline-as-of-year'].value);
  if (year == null) return toast('Enter a year for the historical snapshot.', true);
  state.asOfYear = year;
  persist(`Historical snapshot set to ${year}`);
  render();
  syncTimelineSettingControls();
}

function stepTimelineSetting(stateKey, options, direction, message) {
  const index = options.findIndex(([value]) => value === state[stateKey]);
  const nextIndex = Math.max(0, Math.min(options.length - 1, index + direction));
  if (nextIndex === index) return;
  state[stateKey] = options[nextIndex][0];
  syncTimelineSettingControls();
  persist(message);
  render();
}

els['global-events-button'].addEventListener('click', () => {
  if (els['events-dialog'].open) return els['events-dialog'].close();
  if (state.selectedId) {
    state.selectedId = '';
    state.editingProfileId = '';
    render();
  }
  syncTimelineSettingControls();
  renderGlobalEventsEditor();
  els['events-dialog'].show();
});
els['close-events-dialog'].addEventListener('click', () => els['events-dialog'].close());
els['set-timeline-as-of'].addEventListener('click', applyHistoricalYear);
els['timeline-as-of-year'].addEventListener('keydown', event => { if (event.key === 'Enter') applyHistoricalYear(); });
els['clear-timeline-as-of'].addEventListener('click', () => {
  state.asOfYear = null;
  persist('Historical snapshot cleared');
  render();
  syncTimelineSettingControls();
});
els['timeline-scale-down'].addEventListener('click', () => stepTimelineSetting('timelineYearWidth', TIMELINE_YEAR_WIDTH_OPTIONS, -1, 'Timeline scale updated'));
els['timeline-scale-up'].addEventListener('click', () => stepTimelineSetting('timelineYearWidth', TIMELINE_YEAR_WIDTH_OPTIONS, 1, 'Timeline scale updated'));
els['timeline-height-down'].addEventListener('click', () => stepTimelineSetting('timelineNodeHeight', TIMELINE_NODE_HEIGHT_OPTIONS, -1, 'Node height updated'));
els['timeline-height-up'].addEventListener('click', () => stepTimelineSetting('timelineNodeHeight', TIMELINE_NODE_HEIGHT_OPTIONS, 1, 'Node height updated'));
els['add-global-event'].addEventListener('click', () => {
  const name = clean(els['global-event-name'].value);
  const startYear = numericYear(els['global-event-start'].value);
  const endYear = numericYear(els['global-event-end'].value) ?? startYear;
  if (!name || startYear == null) return toast('Enter a global event name and start year.', true);
  state.globalEvents.push({
    id: uniqueId('global'),
    name,
    startYear: Math.min(startYear, endYear),
    endYear: Math.max(startYear, endYear),
    color: paletteColor(els['global-event-color'].value, DEFAULT_GLOBAL_EVENT_COLOR)
  });
  state.globalEvents.sort((a, b) => a.startYear - b.startYear || a.endYear - b.endYear);
  els['global-event-name'].value = '';
  els['global-event-start'].value = '';
  els['global-event-end'].value = '';
  persist('Global event added');
  render();
});
function openAddPersonDialog(parentId = '') {
  const parent = state.people[parentId];
  if (/^profile-/i.test(parent?.id) && !parent.geniImmediateFamilyVerifiedAt) {
    toast('Verify this Geni profile’s complete immediate family before adding a local relative.', true);
    return;
  }
  const isFirstProfile = !Object.keys(state.people).length;
  els['add-dialog-heading'].textContent = isFirstProfile ? 'Add the first profile' : 'Add a relative';
  els['relation-type'].value = isFirstProfile ? 'none' : 'child';
  els['relation-type'].disabled = isFirstProfile;
  els['parent-select'].disabled = isFirstProfile;
  els['add-dialog'].showModal();
  els['parent-select'].value = parent ? parent.id : '';
}
els['empty-add-person-button'].addEventListener('click', () => openAddPersonDialog());
els['relation-type'].addEventListener('change', () => {
  els['parent-select'].disabled = els['relation-type'].value === 'none';
});
els['new-tree-button'].addEventListener('click', beginNewTree);
els['add-tree-tab'].addEventListener('click', beginNewTree);
els['tree-tabs'].addEventListener('click', event => switchTree(event.target.closest('.tree-tab')?.dataset.treeId));
els['tree-tabs'].addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || treeWorkspace.trees.length < 2) return;
  event.preventDefault();
  const currentIndex = treeWorkspace.trees.findIndex(tree => tree.id === treeWorkspace.activeTreeId);
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? treeWorkspace.trees.length - 1
    : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + treeWorkspace.trees.length) % treeWorkspace.trees.length;
  switchTree(treeWorkspace.trees[nextIndex].id);
  requestAnimationFrame(() => els['tree-tabs'].querySelector('[aria-selected="true"]')?.focus());
});
els['new-tree-form'].addEventListener('submit', event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const title = clean(new FormData(event.currentTarget).get('title'));
  if (!state.ephemeral) saveActiveTreeSnapshot();
  treeWorkspace.activeTreeId = uniqueId('tree');
  state.title = title || 'Untitled family';
  state.people = {};
  state.globalEvents = [];
  state.asOfYear = null;
  state.rootId = '';
  state.selectedId = '';
  state.editingProfileId = '';
  state.relationVisibility = {};
  state.treeFilter = '';
  state.starterDataVersion = 0;
  state.manualTree = true;
  state.collapsedIds.clear();
  state.zoom = 1;
  pendingTimelineViewport = null;
  timelineViewportInitialized = false;
  els['tree-filter'].value = '';
  els['new-tree-dialog'].close();
  persist('New tree tab created');
  render();
  openAddPersonDialog();
});
els['royal-example-button'].addEventListener('click', () => {
  const starterRootId = britishRoyalStarterRootId();
  const existing = treeWorkspace.trees.find(tree => tree.rootId === starterRootId && tree.id !== treeWorkspace.activeTreeId);
  if (existing) {
    switchTree(existing.id);
    toast('British royal line opened in its tab.');
    return;
  }
  if (state.rootId === starterRootId) {
    if (!window.confirm('Restore the bundled British royal line in this tab? Local changes to this tree will be replaced.')) return;
  } else {
    if (!state.ephemeral) saveActiveTreeSnapshot();
    treeWorkspace.activeTreeId = uniqueId('tree');
  }
  loadBritishRoyalExample();
});
els['tree-filter'].addEventListener('input', () => {
  state.treeFilter = els['tree-filter'].value;
  persist('Filter saved');
  render();
});
els['tree-title'].addEventListener('click', () => {
  const title = window.prompt('Tree title', state.title);
  if (clean(title)) { state.title = clean(title); persist('Title updated'); render(); }
});
function changeZoom(delta) { state.zoom = Math.min(1.8, Math.max(.45, Math.round((state.zoom + delta) * 20) / 20)); render(); }
els['canvas-viewport'].addEventListener('wheel', event => {
  if (!(event.ctrlKey || event.metaKey)) return;
  event.preventDefault(); changeZoom(event.deltaY > 0 ? -.08 : .08);
}, { passive: false });

let canvasDrag = null;
els['canvas-viewport'].addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('.timeline-ruler, .timeline-as-of-hit, .timeline-node, button, input, select, textarea, a')) return;
  const viewport = els['canvas-viewport'];
  canvasDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
  viewport.setPointerCapture?.(event.pointerId);
});
els['canvas-viewport'].addEventListener('pointermove', event => {
  if (!canvasDrag || canvasDrag.pointerId !== event.pointerId) return;
  const dx = event.clientX - canvasDrag.x;
  const dy = event.clientY - canvasDrag.y;
  if (!canvasDrag.moved && Math.hypot(dx, dy) > 3) {
    canvasDrag.moved = true;
    els['canvas-viewport'].classList.add('dragging');
  }
  if (!canvasDrag.moved) return;
  els['canvas-viewport'].scrollLeft = canvasDrag.left - dx;
  els['canvas-viewport'].scrollTop = canvasDrag.top - dy;
});
function endCanvasDrag(event) {
  if (!canvasDrag || canvasDrag.pointerId !== event.pointerId) return;
  els['canvas-viewport'].releasePointerCapture?.(event.pointerId);
  els['canvas-viewport'].classList.remove('dragging');
  canvasDrag = null;
}
els['canvas-viewport'].addEventListener('pointerup', endCanvasDrag);
els['canvas-viewport'].addEventListener('pointercancel', endCanvasDrag);
els['canvas-viewport'].addEventListener('dragstart', event => event.preventDefault());

function historicalYearFromRulerPointer(event) {
  const geometry = timelineRulerGeometry;
  const rect = els['timeline-ruler'].getBoundingClientRect();
  if (!geometry || rect.width <= 0) return null;
  const svgX = geometry.viewBoxX + ((event.clientX - rect.left) / rect.width) * geometry.viewBoxWidth;
  const year = Math.round(geometry.minYear + (svgX - geometry.left) / geometry.yearWidth - 0.5);
  return Math.max(geometry.minYear, Math.min(geometry.maxYear, year));
}
function historicalYearRulerX(year) {
  const geometry = timelineRulerGeometry;
  return geometry ? geometry.left + (year - geometry.minYear + 0.5) * geometry.yearWidth : 0;
}
function hideTimelineAsOfGrip() {
  timelineAsOfGripClientY = null;
  els['timeline-canvas'].querySelector('.timeline-as-of-grip')?.setAttribute('hidden', '');
}
function updateTimelineAsOfGrip(clientY) {
  if (!Number.isFinite(clientY)) return;
  timelineAsOfGripClientY = clientY;
  const canvas = els['timeline-canvas'];
  const grip = canvas.querySelector('.timeline-as-of-grip');
  const matrix = canvas.getScreenCTM?.();
  if (!grip || !matrix) return;
  const screenPoint = canvas.createSVGPoint();
  screenPoint.x = 0;
  screenPoint.y = clientY;
  const point = screenPoint.matrixTransform(matrix.inverse());
  const x = Number(grip.dataset.x);
  const minY = Number(grip.dataset.minY);
  const maxY = Number(grip.dataset.maxY);
  const y = Math.max(minY, Math.min(maxY, point.y));
  grip.setAttribute('transform', `translate(${x} ${y}) scale(${1 / state.zoom})`);
  grip.removeAttribute('hidden');
}
function hideHistoricalYearPreview() {
  els['timeline-ruler'].querySelector('.timeline-as-of-preview')?.setAttribute('hidden', '');
}
function previewHistoricalYear(event) {
  const preview = els['timeline-ruler'].querySelector('.timeline-as-of-preview');
  if (!preview || timelineAsOfDrag || event.target.closest?.('.timeline-as-of-handle')) {
    hideHistoricalYearPreview();
    return;
  }
  const year = historicalYearFromRulerPointer(event);
  if (year == null) return;
  preview.removeAttribute('hidden');
  preview.setAttribute('transform', `translate(${historicalYearRulerX(year)} 0)`);
  const label = preview.querySelector('.as-of-preview-label');
  if (label) label.textContent = `Set As of ${year}`;
}
function placeHistoricalYearFromRuler(event) {
  if (event.target.closest?.('.timeline-as-of-handle')) return;
  const year = historicalYearFromRulerPointer(event);
  if (year == null) return;
  state.asOfYear = year;
  els['timeline-as-of-year'].value = year;
  persist(`Historical snapshot set to ${year}`);
  render();
}
els['timeline-ruler'].addEventListener('mousemove', previewHistoricalYear);
els['timeline-ruler'].addEventListener('mouseleave', hideHistoricalYearPreview);
els['timeline-ruler'].addEventListener('click', placeHistoricalYearFromRuler);
els['timeline-ruler'].addEventListener('pointerdown', event => event.stopPropagation());
function slideHistoricalYear(event) {
  if (!timelineAsOfDrag || timelineAsOfDrag.kind !== 'pointer' || event.pointerId !== timelineAsOfDrag.pointerId) return;
  updateTimelineAsOfGrip(event.clientY);
  updateHistoricalYearFromRuler(event);
}
function updateHistoricalYearFromRuler(event) {
  const year = historicalYearFromRulerPointer(event);
  if (year == null || year === state.asOfYear) return;
  state.asOfYear = year;
  els['timeline-as-of-year'].value = year;
  render();
}
function beginHistoricalYearSlide(event) {
  event.stopPropagation();
  updateTimelineAsOfGrip(event.clientY);
  // Mouse dragging is handled by the document-level fallback below. Keeping
  // pointer capture for touch and pen avoids losing those drags off the handle.
  if (event.pointerType === 'mouse') return;
  event.preventDefault();
  const surface = event.target.closest?.('.timeline-as-of-hit') ? els['timeline-canvas'] : els['timeline-ruler'];
  timelineAsOfDrag = { kind: 'pointer', pointerId: event.pointerId, surface };
  els['canvas-viewport'].classList.add('as-of-dragging');
  surface.setPointerCapture?.(event.pointerId);
  slideHistoricalYear(event);
}
els['timeline-ruler'].addEventListener('pointermove', slideHistoricalYear);
els['timeline-canvas'].addEventListener('pointermove', slideHistoricalYear);
function finishHistoricalYearSlide(event) {
  if (!timelineAsOfDrag || timelineAsOfDrag.kind !== 'pointer' || event.pointerId !== timelineAsOfDrag.pointerId) return;
  slideHistoricalYear(event);
  timelineAsOfDrag.surface?.releasePointerCapture?.(event.pointerId);
  timelineAsOfDrag = null;
  els['canvas-viewport'].classList.remove('as-of-dragging');
  persist(`Historical snapshot set to ${state.asOfYear}`);
}
els['timeline-ruler'].addEventListener('pointerup', finishHistoricalYearSlide);
els['timeline-ruler'].addEventListener('pointercancel', finishHistoricalYearSlide);
els['timeline-canvas'].addEventListener('pointerup', finishHistoricalYearSlide);
els['timeline-canvas'].addEventListener('pointercancel', finishHistoricalYearSlide);
function beginHistoricalYearMouseSlide(event) {
  if (timelineAsOfDrag) return;
  event.preventDefault();
  event.stopPropagation();
  timelineAsOfDrag = { kind: 'mouse' };
  els['canvas-viewport'].classList.add('as-of-dragging');
  updateHistoricalYearFromRuler(event);
}
function slideHistoricalYearWithMouse(event) {
  if (timelineAsOfDrag?.kind !== 'mouse') return;
  updateTimelineAsOfGrip(event.clientY);
  updateHistoricalYearFromRuler(event);
}
function finishHistoricalYearMouseSlide(event) {
  if (timelineAsOfDrag?.kind !== 'mouse') return;
  updateHistoricalYearFromRuler(event);
  timelineAsOfDrag = null;
  els['canvas-viewport'].classList.remove('as-of-dragging');
  persist(`Historical snapshot set to ${state.asOfYear}`);
}
document.addEventListener('mousemove', slideHistoricalYearWithMouse);
document.addEventListener('mouseup', finishHistoricalYearMouseSlide);
document.addEventListener('pointermove', event => {
  if (!timelineAsOfDrag && !event.target.closest?.('.timeline-as-of-hit')) hideTimelineAsOfGrip();
});

function closeDetails() {
  state.selectedId = '';
  state.editingProfileId = '';
  render();
}
els['close-detail'].addEventListener('click', closeDetails);
els['detail-backdrop'].addEventListener('click', closeDetails);
els['edit-person'].addEventListener('click', () => {
  if (!state.selectedId) return;
  state.editingProfileId = state.selectedId;
  render();
  els['person-form'].elements.displayName.focus();
  els['person-form'].elements.displayName.select();
});
els['cancel-person-edit'].addEventListener('click', () => { state.editingProfileId = ''; render(); });
els['add-relative'].addEventListener('click', () => openAddPersonDialog(state.selectedId));
els['add-name-period'].addEventListener('click', () => {
  const person = state.people[state.selectedId];
  if (!person) return;
  const name = clean(els['name-period-name'].value);
  let startYear = numericYear(els['name-period-start'].value);
  let endYear = numericYear(els['name-period-end'].value);
  if (!name) return toast('Enter the historical name or title.', true);
  if (startYear != null && endYear != null && endYear < startYear) [startYear, endYear] = [endYear, startYear];
  const newPeriodId = uniqueId('name');
  person.namePeriods = normalizeNamePeriods([...person.namePeriods, {
    id: newPeriodId, name, startYear, endYear, sourceUrl: '', source: 'local'
  }]);
  if (!person.defaultNamePeriodId) person.defaultNamePeriodId = person.namePeriods.find(period => period.id === newPeriodId)?.id || '';
  els['name-period-name'].value = '';
  els['name-period-start'].value = '';
  els['name-period-end'].value = '';
  persist('Historical name added');
  render();
});
els['add-personal-event'].addEventListener('click', () => {
  const person = state.people[state.selectedId];
  if (!person) return;
  const name = clean(els['personal-event-name'].value);
  const startYear = numericYear(els['personal-event-start'].value);
  const endYear = numericYear(els['personal-event-end'].value) ?? startYear;
  if (!name || startYear == null) return toast('Enter a personal event name and start year.', true);
  if (isReignLabel(name)) {
    state.reignColor = paletteColor(els['personal-event-color'].value, DEFAULT_REIGN_EVENT_COLOR);
    Object.values(state.people).forEach(profile => profile.personalEvents.forEach(event => {
      if (isReignLabel(event.name)) event.color = state.reignColor;
    }));
  }
  person.personalEvents = normalizePersonalEvents([...person.personalEvents, {
    name,
    startYear: Math.min(startYear, endYear),
    endYear: Math.max(startYear, endYear),
    color: paletteColor(els['personal-event-color'].value, DEFAULT_PERSONAL_EVENT_COLOR),
    source: 'local'
  }]);
  els['personal-event-name'].value = '';
  els['personal-event-start'].value = '';
  els['personal-event-end'].value = '';
  persist('Personal event added');
  render();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.selectedId && !els['add-dialog'].open) {
    if (state.editingProfileId) {
      state.editingProfileId = '';
      render();
      return;
    }
    state.selectedId = '';
    render();
  }
});
els['person-form'].addEventListener('submit', event => {
  event.preventDefault(); const person = state.people[state.selectedId]; if (!person) return;
  if (state.editingProfileId !== person.id) return;
  const data = new FormData(event.currentTarget);
  const displayName = clean(data.get('displayName'));
  if (!displayName) return toast('Enter a profile name.', true);
  const geniInput = clean(data.get('geniId'));
  const geniLink = optionalGeniLink(geniInput);
  if (geniInput && !geniLink) return toast('Enter a Geni public ID such as g600000… or a Geni profile URL.', true);
  person.displayName = displayName;
  const selectedDefaultPeriod = defaultNamePeriod(person);
  if (selectedDefaultPeriod) selectedDefaultPeriod.name = displayName;
  person.birthYear = clean(data.get('birthYear'));
  person.deathYear = clean(data.get('deathYear'));
  if (person.deathYear) person.isLiving = false;
  if (geniLink) Object.assign(person, geniLink);
  else if (!/^profile-/i.test(person.id) && person.sourceProvider === 'geni') {
    person.sourceId = '';
    person.sourceUrl = '';
    person.sourceProvider = '';
  }
  state.editingProfileId = '';
  persist('Profile saved'); render(); toast('Profile saved.');
});
els['delete-person'].addEventListener('click', () => {
  const person = state.people[state.selectedId];
  if (!person || !window.confirm(`Delete ${fullName(person)} from this local tree?`)) return;
  const id = person.id; delete state.people[id];
  Object.values(state.people).forEach(other => {
    other.parents = other.parents.filter(x => x !== id);
    other.children = other.children.filter(x => x !== id);
    other.partners = other.partners.filter(x => x !== id);
    other.spouses = other.spouses.filter(x => x !== id);
    other.nonSpouses = other.nonSpouses.filter(x => x !== id);
    other.divorcedSpouses = other.divorcedSpouses.filter(x => x !== id);
    delete other.marriageYears[id];
    delete other.relationshipEndYears[id];
    delete other.relationshipEndStatuses[id];
  });
  state.rootId = state.rootId === id ? Object.keys(state.people)[0] || '' : state.rootId; state.selectedId = '';
  persist('Profile deleted'); render();
});
els['add-person-button'].addEventListener('click', () => {
  if (state.selectedId) return openAddPersonDialog(state.selectedId);
  if (Object.keys(state.people).length) return toast('Select the profile to whom you want to add a local relative.', true);
  openAddPersonDialog();
});
els['add-form'].addEventListener('submit', event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault(); const data = new FormData(event.currentTarget); const id = uniqueId('local');
  const geniInput = clean(data.get('geniId'));
  const geniLink = optionalGeniLink(geniInput);
  if (geniInput && !geniLink) return toast('Enter a Geni public ID such as g600000… or a Geni profile URL.', true);
  const person = normalizePerson({ id, ...Object.fromEntries(data.entries()), ...(geniLink || {}) }, id);
  const relationType = clean(data.get('relationType')) || 'none';
  const relatedId = clean(data.get('relatedPersonId'));
  const related = state.people[relatedId];
  if (relationType !== 'none' && !related) return toast('Choose the existing profile this person is related to.', true);
  if (relationType === 'child') {
    person.parents = [relatedId];
    related.children = unique([...related.children, id]);
  } else if (relationType === 'parent') {
    person.children = [relatedId];
    related.parents = unique([...related.parents, id]);
    if (state.rootId === relatedId) state.rootId = id;
  } else if (relationType === 'spouse') {
    person.partners = [relatedId];
    person.spouses = [relatedId];
    related.partners = unique([...related.partners, id]);
    related.spouses = unique([...related.spouses, id]);
  }
  state.people[id] = person; state.rootId = state.rootId || id; state.selectedId = id;
  if (state.title === 'Untitled family' && Object.keys(state.people).length === 1) state.title = `${fullName(person)} family`;
  els['add-dialog'].close(); event.currentTarget.reset(); els['relation-type'].disabled = false; els['parent-select'].disabled = false; persist('Profile added'); render();
});

initializeEventColorPalette(els['personal-event-color'], DEFAULT_PERSONAL_EVENT_COLOR);
initializeEventColorPalette(els['global-event-color'], DEFAULT_GLOBAL_EVENT_COLOR, DEFAULT_GLOBAL_EVENT_COLOR);
let personalColorForReign = false;
els['personal-event-name'].addEventListener('input', () => {
  const nextIsReign = isReignLabel(els['personal-event-name'].value);
  if (nextIsReign === personalColorForReign) return;
  personalColorForReign = nextIsReign;
  updateEventColorPalette(els['personal-event-color'], nextIsReign ? state.reignColor : DEFAULT_PERSONAL_EVENT_COLOR);
});

await loadBritishRoyalStarterData();
const migratedStoredGeniIds = restore();
if (!Object.keys(state.people).length && !state.manualTree && britishRoyalStarterData) {
  loadBritishRoyalExample({ persistResult: true });
} else {
  const upgradedBundledLine = upgradeBundledBritishRoyalLine();
  if (upgradedBundledLine || migratedStoredGeniIds) persist(upgradedBundledLine ? 'Bundled royal example updated' : 'Geni profile IDs updated');
}
els['tree-filter'].value = state.treeFilter;
render();
if (britishRoyalStarterLoadError) {
  toast(Object.keys(state.people).length
    ? 'The saved tree opened, but the bundled royal example could not be refreshed.'
    : 'The bundled royal example could not be loaded. You can still create a manual tree.', true);
}
