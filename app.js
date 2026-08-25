const STORAGE_KEY = 'lineage-web-v1';
const LEGACY_STORAGE_KEY = 'jiapu-web-v1';
const GENI_TOKEN_SESSION_KEY = 'lineage-geni-access-token';
const GENI_OAUTH_PENDING_KEY = 'lineage-geni-oauth-pending';
const GENI_IMPORT_INTENT_KEY = 'lineage-geni-import-intent';
const SVG_NS = 'http://www.w3.org/2000/svg';
const HENRY_VII_GENI_URL = 'https://www.geni.com/people/Henry-VII-King-of-England/6000000003760873898';
const EVENT_COLOR_PALETTE = [
  ['#c62828', 'Red'], ['#e65100', 'Orange'], ['#c2892b', 'Amber'], ['#6b7d2a', 'Olive'],
  ['#2e7d32', 'Green'], ['#00796b', 'Teal'], ['#00838f', 'Cyan'], ['#1565c0', 'Blue'],
  ['#3949ab', 'Indigo'], ['#7b1fa2', 'Violet'], ['#ad1457', 'Rose'], ['#616161', 'Grey']
];
const DEFAULT_REIGN_EVENT_COLOR = '#c62828';
const DEFAULT_PERSONAL_EVENT_COLOR = '#1565c0';
const DEFAULT_GLOBAL_EVENT_COLOR = '#c2892b';
const DEFAULT_TIMELINE_YEAR_WIDTH = 4;
const BRITISH_ROYAL_STARTER_VERSION = 2;

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

const oauthCallback = oauthCallbackParams();
if (oauthCallback.accessToken) {
  sessionValue(GENI_TOKEN_SESSION_KEY, oauthCallback.accessToken);
  sessionValue(GENI_OAUTH_PENDING_KEY, null);
}
if (oauthCallback.status) {
  sessionValue(GENI_OAUTH_PENDING_KEY, null);
  sessionValue(GENI_IMPORT_INTENT_KEY, null);
}
const initialGeniAccessToken = oauthCallback.accessToken || sessionValue(GENI_TOKEN_SESSION_KEY);
if (oauthCallback.accessToken || oauthCallback.status || oauthCallback.message) {
  const cleanUrl = new URL(location.href);
  ['access_token', 'expires_in', 'status', 'message'].forEach(name => cleanUrl.searchParams.delete(name));
  cleanUrl.hash = '';
  history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}`);
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
  starterDataVersion: 0,
  geniAccessToken: initialGeniAccessToken,
  collapsedIds: new Set()
};

const els = Object.fromEntries([
  'tree-title', 'global-events-button', 'import-file-button', 'export-button', 'file-input', 'source-form', 'source-provider', 'source-input', 'source-depth',
  'people-count', 'people-label', 'people-list', 'add-person-button', 'canvas-viewport',
  'empty-state', 'timeline-ruler', 'timeline-canvas', 'empty-add-person-button', 'empty-file-button',
  'detail-sidebar', 'detail-empty', 'person-form', 'person-heading', 'person-life', 'person-avatar',
  'person-source-link', 'person-source-name', 'person-source-mark', 'source-updated', 'close-detail', 'delete-person', 'add-dialog',
  'geni-family-actions', 'geni-family-status', 'load-immediate-family', 'add-local-relative',
  'personal-events-list', 'personal-event-name', 'personal-event-start', 'personal-event-end', 'personal-event-color', 'add-personal-event',
  'events-dialog', 'close-events-dialog', 'timeline-scale', 'global-events-list', 'global-event-name', 'global-event-start', 'global-event-end', 'global-event-color', 'add-global-event',
  'add-form', 'parent-select', 'toast', 'save-status', 'source-download-link', 'tree-filter', 'royal-example-button'
].map(id => [id, document.getElementById(id)]));

function clean(value) { return value == null ? '' : String(value).trim(); }
function normalizeColor(value, fallback) { return /^#[0-9a-f]{6}$/i.test(clean(value)) ? clean(value).toLowerCase() : fallback; }
function paletteColor(value, fallback) {
  const normalized = normalizeColor(value, fallback);
  return EVENT_COLOR_PALETTE.some(([candidate]) => candidate === normalized) ? normalized : fallback;
}
function timelineYearWidth(value) {
  const width = Number(value);
  return [3, 4, 5, 6, 8].includes(width) ? width : DEFAULT_TIMELINE_YEAR_WIDTH;
}
function uniqueId(prefix = 'id') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
function array(value) { return Array.isArray(value) ? value.filter(Boolean).map(String) : []; }
function initials(person) {
  const parts = [person.firstName, person.lastName].filter(Boolean);
  return (parts.map(part => Array.from(part)[0]).join('') || '?').slice(0, 2).toUpperCase();
}
function fullName(person) {
  return clean(person.displayName) || [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unnamed profile';
}
function searchableText(person) {
  return [fullName(person), person.title].filter(Boolean).join(' ').toLocaleLowerCase();
}
function matchesKeyword(person, keyword) {
  const escaped = clean(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(searchableText(person));
}
function life(person) {
  const start = clean(person.birthYear) || '?';
  const end = person.isLiving ? 'living' : (clean(person.deathYear) || '?');
  return `${start}–${end}`;
}
function numericYear(value) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}
function unique(values) { return [...new Set(array(values))]; }
function uniqueRefs(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(refId).filter(Boolean))];
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
function validWikiTreeUrl(value) {
  const href = validPublicUrl(value);
  if (!href) return '';
  return /(^|\.)wikitree\.com$/i.test(new URL(href).hostname) ? href : '';
}
function profileIdFromInput(input) {
  const raw = clean(input);
  if (!raw) return '';
  const direct = raw.match(/profile-[a-z0-9-]+/i);
  if (direct) return direct[0];
  try {
    const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
    if (!/(^|\.)geni\.com$/i.test(url.hostname)) return '';
    const segment = url.pathname.split('/').filter(Boolean).pop();
    return segment ? `profile-${segment}` : '';
  } catch {
    return /^[a-z0-9-]+$/i.test(raw) ? `profile-${raw}` : '';
  }
}
function wikiTreeIdFromInput(input) {
  const raw = clean(input);
  if (!raw) return '';
  if (/^[^\s/]+-\d+$/.test(raw)) return raw;
  try {
    const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
    if (!/(^|\.)wikitree\.com$/i.test(url.hostname)) return '';
    return clean(url.pathname.match(/\/wiki\/([^/?#]+)/i)?.[1]);
  } catch { return ''; }
}
function sourceProviderFromUrl(url) {
  const href = validPublicUrl(url);
  if (!href) return '';
  const host = new URL(href).hostname.toLowerCase();
  if (/(^|\.)geni\.com$/.test(host)) return 'geni';
  if (/(^|\.)wikitree\.com$/.test(host)) return 'wikitree';
  return 'web';
}
function sourceMeta(person) {
  const provider = person.sourceProvider || sourceProviderFromUrl(person.sourceUrl);
  if (provider === 'geni') return { name: 'Geni public profile', mark: 'G' };
  if (provider === 'wikitree') return { name: 'WikiTree public profile', mark: 'W' };
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
  const birth = source.birth || {};
  const death = source.death || {};
  const sourceUrl = validPublicUrl(source.sourceUrl || source.profile_url || source.profileUrl || '');
  const marriageYears = Object.fromEntries(Object.entries(source.marriageYears || {}).map(([partnerId, year]) => [refId(partnerId), clean(year)]).filter(([partnerId, year]) => partnerId && numericYear(year) != null));
  const partners = uniqueRefs(source.partners || source.spouses);
  return {
    id,
    firstName: clean(source.firstName || source.firstname || source.first_name),
    lastName: clean(source.lastName || source.surname || source.last_name || source.maiden_name),
    displayName: clean(source.displayName || source.display_name || (typeof source.name === 'string' ? source.name : '')),
    title: clean(source.title || source.display_title || source.occupation),
    nameOrder: 'western',
    gender: ['male', 'female'].includes(source.gender) ? source.gender : 'unknown',
    birthYear: clean(source.birthYear || source.bYear || birth.year || birth.date?.year),
    deathYear: clean(source.deathYear || source.dYear || death.year || death.date?.year),
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
    personalEvents: normalizePersonalEvents([...(Array.isArray(source.personalEvents) ? source.personalEvents : []), ...extractGeniReignFacts(source)]),
    sourceUrl,
    sourceId: clean(source.sourceId || (/^profile-/i.test(id) ? id : '')),
    sourceProvider: clean(source.sourceProvider || source.provenance?.provider || sourceProviderFromUrl(sourceUrl)),
    importedAt: clean(source.importedAt || source.provenance?.importedAt),
    geniImmediateFamilyLoaded: source.geniImmediateFamilyLoaded === true,
    starterProfile: source.starterProfile === true
  };
}

function createBritishRoyalSample() {
  const historyUrl = 'https://www.royal.uk/kings-and-queens-1066';
  const rows = [
    ['henry-vii', 'Henry', 'VII', '1457', '1509', 'male', 'Founder of the Tudor dynasty', 'https://www.royal.uk/henry-vii'],
    ['elizabeth-york', 'Elizabeth', 'of York', '1466', '1503', 'female', 'Queen consort of England', historyUrl],
    ['henry-viii', 'Henry', 'VIII', '1491', '1547', 'male', 'King of England, 1509–1547', 'https://www.royal.uk/henry-viii'],
    ['margaret-tudor', 'Margaret', 'Tudor', '1489', '1541', 'female', 'Queen of Scots; elder sister of Henry VIII', historyUrl],
    ['mary-i', 'Mary', 'I', '1516', '1558', 'female', 'Queen of England and Ireland, 1553–1558', historyUrl],
    ['elizabeth-i', 'Elizabeth', 'I', '1533', '1603', 'female', 'Queen of England and Ireland, 1558–1603', historyUrl],
    ['edward-vi', 'Edward', 'VI', '1537', '1553', 'male', 'King of England and Ireland, 1547–1553', historyUrl],
    ['james-iv', 'James', 'IV', '1473', '1513', 'male', 'King of Scots, 1488–1513', 'https://www.royal.uk/james-iv-r1488-1513'],
    ['james-v', 'James', 'V', '1512', '1542', 'male', 'King of Scots, 1513–1542', historyUrl],
    ['mary-scots', 'Mary', 'Queen of Scots', '1542', '1587', 'female', 'Queen of Scots, 1542–1567', historyUrl],
    ['darnley', 'Henry Stuart', 'Lord Darnley', '1545', '1567', 'male', 'King consort of Scots', historyUrl],
    ['james-vi-i', 'James', 'VI & I', '1566', '1625', 'male', 'King of Scots and later England and Ireland', historyUrl],
    ['elizabeth-stuart', 'Elizabeth', 'Stuart', '1596', '1662', 'female', 'Electress Palatine; daughter of James VI and I', historyUrl],
    ['frederick-v', 'Frederick', 'V', '1596', '1632', 'male', 'Elector Palatine', historyUrl],
    ['sophia-hanover', 'Sophia', 'of Hanover', '1630', '1714', 'female', 'Heiress presumptive under the Act of Settlement', historyUrl],
    ['ernest-augustus', 'Ernest Augustus', 'of Hanover', '1629', '1698', 'male', 'Elector of Hanover', historyUrl],
    ['george-i', 'George', 'I', '1660', '1727', 'male', 'King of Great Britain and Ireland, 1714–1727', historyUrl],
    ['george-ii', 'George', 'II', '1683', '1760', 'male', 'King of Great Britain and Ireland, 1727–1760', historyUrl],
    ['frederick-wales', 'Frederick', 'Prince of Wales', '1707', '1751', 'male', 'Heir apparent who predeceased George II', historyUrl],
    ['george-iii', 'George', 'III', '1738', '1820', 'male', 'King of Great Britain and Ireland; later United Kingdom', historyUrl],
    ['edward-kent', 'Edward', 'Duke of Kent', '1767', '1820', 'male', 'Fourth son of George III; father of Victoria', historyUrl],
    ['victoria', 'Victoria', '', '1819', '1901', 'female', 'Queen of the United Kingdom, 1837–1901', 'https://www.royal.uk/encyclopedia/victoria-r-1837-1901'],
    ['albert', 'Albert', 'Prince Consort', '1819', '1861', 'male', 'Consort of Queen Victoria', historyUrl],
    ['edward-vii', 'Edward', 'VII', '1841', '1910', 'male', 'King of the United Kingdom, 1901–1910', historyUrl],
    ['george-v', 'George', 'V', '1865', '1936', 'male', 'King of the United Kingdom, 1910–1936', 'https://www.royal.uk/george-v'],
    ['edward-viii', 'Edward', 'VIII', '1894', '1972', 'male', 'King of the United Kingdom in 1936; abdicated', historyUrl],
    ['george-vi', 'George', 'VI', '1895', '1952', 'male', 'King of the United Kingdom, 1936–1952', historyUrl],
    ['elizabeth-ii', 'Elizabeth', 'II', '1926', '2022', 'female', 'Queen of the United Kingdom, 1952–2022', 'https://www.royal.uk/her-majesty-queen-elizabeth-ii'],
    ['philip', 'Philip', 'Duke of Edinburgh', '1921', '2021', 'male', 'Consort of Elizabeth II', 'https://www.royal.uk/the-duke-of-edinburgh'],
    ['charles-iii', 'Charles', 'III', '1948', '', 'male', 'Present King of the United Kingdom', 'https://www.royal.uk/the-king']
  ];
  rows.push(
    ['arthur-tudor', 'Arthur', 'Tudor', '1486', '1502', 'male', 'Prince of Wales; eldest son of Henry VII', historyUrl],
    ['mary-tudor', 'Mary', 'Tudor', '1496', '1533', 'female', 'Queen consort of France; daughter of Henry VII', historyUrl],
    ['frances-brandon', 'Frances', 'Brandon', '1517', '1559', 'female', 'Duchess of Suffolk; granddaughter of Henry VII', historyUrl],
    ['jane-grey', 'Jane', 'Grey', '1537', '1554', 'female', 'Queen of England in 1553; great-granddaughter of Henry VII', historyUrl],
    ['charles-i', 'Charles', 'I', '1600', '1649', 'male', 'King of England, Scotland and Ireland, 1625–1649', historyUrl],
    ['charles-ii', 'Charles', 'II', '1630', '1685', 'male', 'King of England, Scotland and Ireland, 1660–1685', historyUrl],
    ['james-ii-vii', 'James', 'II & VII', '1633', '1701', 'male', 'King of England, Scotland and Ireland, 1685–1688', historyUrl],
    ['mary-princess-royal', 'Mary', 'Stuart', '1631', '1660', 'female', 'Princess Royal; daughter of Charles I', historyUrl],
    ['william-iii', 'William', 'III', '1650', '1702', 'male', 'King of England, Scotland and Ireland, 1689–1702', historyUrl],
    ['mary-ii', 'Mary', 'II', '1662', '1694', 'female', 'Queen of England, Scotland and Ireland, 1689–1694', historyUrl],
    ['anne', 'Anne', 'Stuart', '1665', '1714', 'female', 'Queen of Great Britain and Ireland, 1702–1714', historyUrl],
    ['george-iv', 'George', 'IV', '1762', '1830', 'male', 'King of the United Kingdom, 1820–1830', historyUrl],
    ['william-iv', 'William', 'IV', '1765', '1837', 'male', 'King of the United Kingdom, 1830–1837', historyUrl],
    ['ernest-cumberland', 'Ernest Augustus', 'of Cumberland', '1771', '1851', 'male', 'King of Hanover, 1837–1851', historyUrl],
    ['adolphus-cambridge', 'Adolphus', 'of Cambridge', '1774', '1850', 'male', 'Duke of Cambridge; son of George III', historyUrl],
    ['mary-adelaide', 'Mary Adelaide', 'of Cambridge', '1833', '1897', 'female', 'Duchess of Teck; granddaughter of George III', historyUrl],
    ['mary-teck', 'Mary', 'of Teck', '1867', '1953', 'female', 'Queen consort of the United Kingdom; great-granddaughter of George III', historyUrl],
    ['victoria-royal', 'Victoria', 'Princess Royal', '1840', '1901', 'female', 'German Empress and Queen of Prussia; daughter of Victoria', historyUrl],
    ['alice-uk', 'Alice', 'of the United Kingdom', '1843', '1878', 'female', 'Grand Duchess of Hesse; daughter of Victoria', historyUrl],
    ['alfred-saxe', 'Alfred', 'of Saxe-Coburg and Gotha', '1844', '1900', 'male', 'Duke of Edinburgh; son of Victoria', historyUrl],
    ['helena-uk', 'Helena', 'of the United Kingdom', '1846', '1923', 'female', 'Princess Christian; daughter of Victoria', historyUrl],
    ['louise-uk', 'Louise', 'of the United Kingdom', '1848', '1939', 'female', 'Duchess of Argyll; daughter of Victoria', historyUrl],
    ['arthur-connaught', 'Arthur', 'of Connaught', '1850', '1942', 'male', 'Duke of Connaught; son of Victoria', historyUrl],
    ['leopold-albany', 'Leopold', 'of Albany', '1853', '1884', 'male', 'Duke of Albany; son of Victoria', historyUrl],
    ['beatrice-uk', 'Beatrice', 'of the United Kingdom', '1857', '1944', 'female', 'Princess of Battenberg; daughter of Victoria', historyUrl],
    ['victoria-hesse', 'Victoria', 'of Hesse', '1863', '1950', 'female', 'Marchioness of Milford Haven; granddaughter of Victoria', historyUrl],
    ['alice-battenberg', 'Alice', 'of Battenberg', '1885', '1969', 'female', 'Princess of Greece and Denmark; great-granddaughter of Victoria', historyUrl],
    ['maud-norway', 'Maud', 'of Wales', '1869', '1938', 'female', 'Queen of Norway; daughter of Edward VII', historyUrl],
    ['olav-v', 'Olav', 'V', '1903', '1991', 'male', 'King of Norway, 1957–1991', historyUrl],
    ['harald-v', 'Harald', 'V', '1937', '', 'male', 'King of Norway since 1991', historyUrl],
    ['margaret-snowdon', 'Margaret', 'Snowdon', '1930', '2002', 'female', 'Princess; daughter of George VI', historyUrl],
    ['anne-royal', 'Anne', 'Princess Royal', '1950', '', 'female', 'Princess Royal; daughter of Elizabeth II', historyUrl],
    ['andrew-york', 'Andrew', 'of York', '1960', '', 'male', 'Duke of York; son of Elizabeth II', historyUrl],
    ['edward-edinburgh', 'Edward', 'of Edinburgh', '1964', '', 'male', 'Duke of Edinburgh; son of Elizabeth II', historyUrl],
    ['william-wales', 'William', 'of Wales', '1982', '', 'male', 'Prince of Wales; son of Charles III', historyUrl],
    ['harry-sussex', 'Harry', 'of Sussex', '1984', '', 'male', 'Duke of Sussex; son of Charles III', historyUrl],
    ['george-wales', 'George', 'of Wales', '2013', '', 'male', 'Prince; grandson of Charles III', historyUrl],
    ['charlotte-wales', 'Charlotte', 'of Wales', '2015', '', 'female', 'Princess; granddaughter of Charles III', historyUrl],
    ['louis-wales', 'Louis', 'of Wales', '2018', '', 'male', 'Prince; grandson of Charles III', historyUrl]
  );
  // Public Geni-linked spouses of the bundled line. Unmarried partners and
  // mistresses are deliberately not part of the starter data.
  rows.push(
    ['victoria-saxe-coburg', 'Victoria', 'of Saxe-Coburg-Saalfeld', '1786', '1861', 'female', 'Duchess of Kent; wife of Prince Edward', historyUrl],
    ['maria-fitzherbert', 'Maria', 'Fitzherbert', '1756', '1837', 'female', 'Wife of George IV in a marriage not recognized under English law', historyUrl],
    ['caroline-brunswick', 'Caroline', 'of Brunswick', '1768', '1821', 'female', 'Queen consort; wife of George IV', historyUrl],
    ['adelaide-saxe-meiningen', 'Adelaide', 'of Saxe-Meiningen', '1792', '1849', 'female', 'Queen consort; wife of William IV', historyUrl],
    ['henrietta-maria', 'Henrietta Maria', 'of France', '1609', '1669', 'female', 'Queen consort; wife of Charles I', historyUrl],
    ['caroline-ansbach', 'Caroline', 'of Ansbach', '1683', '1737', 'female', 'Queen consort; wife of George II', historyUrl],
    ['philip-ii-spain', 'Philip', 'II of Spain', '1527', '1598', 'male', 'King consort of England; husband of Mary I', historyUrl],
    ['wallis-simpson', 'Wallis', 'Simpson', '1896', '1986', 'female', 'Duchess of Windsor; wife of Edward VIII', historyUrl],
    ['augusta-hesse-kassel', 'Augusta', 'of Hesse-Kassel', '1797', '1889', 'female', 'Duchess of Cambridge; wife of Adolphus', historyUrl],
    ['louis-xii-france', 'Louis', 'XII of France', '1462', '1515', 'male', 'King of France; first husband of Mary Tudor', historyUrl],
    ['charles-brandon', 'Charles Brandon', 'Duke of Suffolk', '1484', '1545', 'male', 'Second husband of Mary Tudor', historyUrl],
    ['louis-iv-hesse', 'Louis', 'IV of Hesse', '1837', '1892', 'male', 'Grand Duke of Hesse; husband of Princess Alice', historyUrl],
    ['queen-mother', 'Elizabeth', 'the Queen Mother', '1900', '2002', 'female', 'Queen consort; wife of George VI', historyUrl],
    ['alexandra-denmark', 'Alexandra', 'of Denmark', '1844', '1925', 'female', 'Queen consort; wife of Edward VII', historyUrl],
    ['catherine-braganza', 'Catherine', 'of Braganza', '1638', '1705', 'female', 'Queen consort; wife of Charles II', historyUrl],
    ['camilla', 'Camilla', 'Queen of the United Kingdom', '1947', '', 'female', 'Queen consort; wife of Charles III', historyUrl],
    ['diana', 'Diana', 'Princess of Wales', '1961', '1997', 'female', 'First wife of Charles III', historyUrl],
    ['andrew-greece', 'Andrew', 'of Greece and Denmark', '1882', '1944', 'male', 'Prince; husband of Alice of Battenberg', historyUrl],
    ['charlotte-mecklenburg', 'Charlotte', 'of Mecklenburg-Strelitz', '1744', '1818', 'female', 'Queen consort; wife of George III', historyUrl],
    ['louis-battenberg', 'Louis', 'of Battenberg', '1854', '1921', 'male', 'Marquess of Milford Haven; husband of Victoria of Hesse', historyUrl],
    ['mary-lorraine', 'Mary', 'of Guise', '1515', '1560', 'female', 'Queen consort; wife of James V', historyUrl],
    ['madeleine-valois', 'Madeleine', 'of Valois', '1520', '1537', 'female', 'Queen consort; first wife of James V', historyUrl],
    ['james-hepburn', 'James Hepburn', 'Earl of Bothwell', '1534', '1578', 'male', 'Third husband of Mary, Queen of Scots', historyUrl],
    ['francis-ii-france', 'Francis', 'II of France', '1544', '1560', 'male', 'King of France; first husband of Mary, Queen of Scots', historyUrl],
    ['francis-teck', 'Francis', 'Duke of Teck', '1837', '1900', 'male', 'Husband of Mary Adelaide of Cambridge', historyUrl],
    ['george-cumberland', 'George', 'of Denmark', '1653', '1708', 'male', 'Prince consort; husband of Queen Anne', historyUrl],
    ['henry-grey', 'Henry Grey', 'Duke of Suffolk', '1517', '1554', 'male', 'Husband of Frances Brandon', historyUrl],
    ['archibald-douglas', 'Archibald Douglas', 'Earl of Angus', '1489', '1557', 'male', 'Second husband of Margaret Tudor', historyUrl],
    ['william-ii-orange', 'William', 'II of Orange', '1626', '1650', 'male', 'Prince of Orange; husband of Mary Stuart', historyUrl],
    ['augusta-saxe-gotha', 'Augusta', 'of Saxe-Gotha', '1719', '1772', 'female', 'Princess of Wales; wife of Frederick', historyUrl],
    ['catherine-aragon', 'Catherine', 'of Aragon', '1485', '1536', 'female', 'Queen consort; first wife of Henry VIII', historyUrl],
    ['anne-boleyn', 'Anne', 'Boleyn', '1501', '1536', 'female', 'Queen consort; second wife of Henry VIII', historyUrl],
    ['jane-seymour', 'Jane', 'Seymour', '1508', '1537', 'female', 'Queen consort; third wife of Henry VIII', historyUrl],
    ['anne-cleves', 'Anne', 'of Cleves', '1515', '1557', 'female', 'Queen consort; fourth wife of Henry VIII', historyUrl],
    ['catherine-howard', 'Catherine', 'Howard', '1523', '1542', 'female', 'Queen consort; fifth wife of Henry VIII', historyUrl],
    ['catherine-parr', 'Catherine', 'Parr', '1512', '1548', 'female', 'Queen consort; sixth wife of Henry VIII', historyUrl],
    ['anne-hyde', 'Anne', 'Hyde', '1637', '1671', 'female', 'Duchess of York; first wife of James II', historyUrl],
    ['mary-modena', 'Mary', 'of Modena', '1658', '1718', 'female', 'Queen consort; second wife of James II', historyUrl],
    ['anne-denmark', 'Anne', 'of Denmark', '1574', '1619', 'female', 'Queen consort; wife of James VI and I', historyUrl],
    ['sophia-dorothea-celle', 'Sophia Dorothea', 'of Celle', '1666', '1726', 'female', 'Wife of George I', historyUrl],
    ['guildford-dudley', 'Guildford', 'Dudley', '1535', '1554', 'male', 'Husband of Lady Jane Grey', historyUrl],
    ['henry-methven', 'Henry Stewart', 'Lord Methven', '1495', '1552', 'male', 'Third husband of Margaret Tudor', historyUrl],
    ['adrian-stokes', 'Adrian', 'Stokes, MP', '1519', '1585', 'male', 'Second husband of Frances Brandon', historyUrl],
    ['jeanne-france', 'Jeanne', 'of France', '1464', '1505', 'female', 'First wife of Louis XII of France', historyUrl],
    ['anne-brittany', 'Anne', 'of Brittany', '1477', '1514', 'female', 'Second wife of Louis XII of France', historyUrl],
    ['anne-browne', 'Anne', 'Browne Brandon', '1489', '1511', 'female', 'Wife of Charles Brandon', historyUrl],
    ['margaret-neville', 'Margaret', 'Neville', '1466', '1528', 'female', 'Wife of Charles Brandon', historyUrl],
    ['katherine-willoughby', 'Katherine', 'Willoughby', '1519', '1580', 'female', 'Duchess of Suffolk; wife of Charles Brandon', historyUrl],
    ['jean-gordon', 'Jean', 'Gordon', '1546', '1629', 'female', 'First wife of James Hepburn', historyUrl],
    ['louis-longueville', 'Louis II', 'of Longueville', '1510', '1537', 'male', 'First husband of Mary of Guise', historyUrl],
    ['edward-burgh', 'Edward', 'Burgh', '1508', '1533', 'male', 'First husband of Catherine Parr', historyUrl],
    ['john-neville-latimer', 'John Neville', 'Baron Latimer', '1493', '1543', 'male', 'Second husband of Catherine Parr', historyUrl],
    ['thomas-seymour', 'Thomas Seymour', 'Baron Sudeley', '1508', '1549', 'male', 'Fourth husband of Catherine Parr', historyUrl],
    ['thomas-fitzherbert', 'Thomas', 'FitzHerbert', '1746', '1781', 'male', 'Second husband of Maria Fitzherbert', historyUrl],
    ['edward-weld', 'Edward', 'Weld', '1741', '1775', 'male', 'First husband of Maria Fitzherbert', historyUrl],
    ['emich-carl-leiningen', 'Emich Carl', 'Prince of Leiningen', '1763', '1814', 'male', 'First husband of Victoria of Saxe-Coburg-Saalfeld', historyUrl],
    ['anna-austria-spain', 'Anna of Austria', 'Queen of Spain', '1549', '1580', 'female', 'Fourth wife of Philip II of Spain', historyUrl],
    ['elisabeth-valois', 'Elisabeth', 'of Valois', '1545', '1568', 'female', 'Third wife of Philip II of Spain', historyUrl],
    ['maria-manuela', 'Maria Manuela', 'Princess of Portugal', '1527', '1545', 'female', 'First wife of Philip II of Spain', historyUrl],
    ['andrew-parker-bowles', 'Andrew', 'Parker Bowles', '1939', '', 'male', 'First husband of Camilla, Queen of the United Kingdom', historyUrl],
    ['alexandrine-hutten', 'Alexandrine', 'von Hutten-Czapska', '1854', '1941', 'female', 'Second wife of Louis IV, Grand Duke of Hesse', historyUrl],
    ['earl-winfield-spencer', 'Earl Winfield', 'Spencer Jr.', '1888', '1950', 'male', 'First husband of Wallis Simpson', historyUrl],
    ['ernest-aldrich-simpson', 'Ernest Aldrich', 'Simpson', '1897', '1958', 'male', 'Second husband of Wallis Simpson', historyUrl],
    ['margaret-hepburn', 'Margaret', 'Hepburn', '1491', '1513', 'female', 'First wife of Archibald Douglas; born after 1490', historyUrl],
    ['jane-stewart-douglas', 'Jane Stewart', 'Douglas', '1496', '', 'female', 'Wife of Archibald Douglas', historyUrl],
    ['margaret-maxwell', 'Margaret', 'Maxwell', '1520', '1593', 'female', 'Wife of Archibald Douglas', historyUrl],
    ['janet-stewart-sutherland', 'Janet Stewart', 'Countess of Sutherland', '1505', '1580', 'female', 'Wife of Henry Stewart, Lord Methven', historyUrl],
    ['lady-leslie', 'Lady', 'Leslie', '1495', '', 'female', 'Wife of Henry Stewart, Lord Methven; birth year estimated within Geni range', historyUrl]
  );
  // Geni IDs are bundled so the starter timeline works without authorization.
  // They are also the merge keys used when an authorized visitor refreshes a profile.
  const geniIds = {
    'henry-vii': '6000000003760873898', 'elizabeth-york': '5111879481690102566', 'arthur-tudor': '6000000003409427757',
    'henry-viii': '6000000007442241030', 'margaret-tudor': '6000000003858820967',
    'mary-i': '5027356653020040914', 'elizabeth-i': '4476035', 'edward-vi': '6000000008813849008',
    'james-iv': '4229916861440069622', 'james-v': '6000000003233882803',
    'mary-scots': '6000000003234018546', 'darnley': '6000000003876051113',
    'james-vi-i': '6000000028418914022', 'elizabeth-stuart': '304430340510004215',
    'frederick-v': '304433105310001815', 'sophia-hanover': '6000000003879438150',
    'ernest-augustus': '6000000003890906681',
    'george-i': '6000000017824487111', 'george-ii': '4555899',
    'frederick-wales': '6000000003891739213', 'george-iii': '6000000003091034586',
    'edward-kent': '4087038607800049893', 'victoria': '6000000008852088113',
    'albert': '6000000000697518124', 'edward-vii': '6000000001651648070',
    'george-v': '6000000000701511040', 'edward-viii': '5031922362950130285',
    'george-vi': '6000000001217955606', 'elizabeth-ii': '6000000003075071669',
    'philip': '6000000003075171096', 'charles-iii': '6000000003075030887',
    'mary-tudor': '6000000000307250674', 'frances-brandon': '6000000003760910764',
    'jane-grey': '368988617700011508', 'charles-i': '4498828',
    'charles-ii': '6000000002529545042', 'james-ii-vii': '6000000013038690528',
    'mary-princess-royal': '6000000003885198846', 'william-iii': '6000000003285553237',
    'mary-ii': '6000000003285472970', 'anne': '6000000003285572645',
    'george-iv': '4137986493320052463', 'william-iv': '4137989648200126749',
    'adolphus-cambridge': '6000000000307240333', 'mary-adelaide': '6000000003245250586',
    'mary-teck': '6000000001324056123', 'alice-uk': '6000000000703284437',
    'victoria-hesse': '6000000003221554850', 'alice-battenberg': '6000000003075330310',
    'victoria-saxe-coburg': '6000000000697437319', 'maria-fitzherbert': '6000000000769944531',
    'caroline-brunswick': '4138652783200125692', 'adelaide-saxe-meiningen': '4138662614410074729',
    'henrietta-maria': '6000000000851678345', 'caroline-ansbach': '4555944',
    'philip-ii-spain': '6000000001600060051', 'wallis-simpson': '6000000000701830018',
    'augusta-hesse-kassel': '6000000001260403655', 'louis-xii-france': '6000000000440363134',
    'charles-brandon': '6000000003572141177', 'louis-iv-hesse': '6000000000703378021',
    'queen-mother': '3940609086280075061', 'alexandra-denmark': '6000000003070981015',
    'catherine-braganza': '6000000001566391625', 'camilla': '6000000003081589893',
    'diana': '6000000013313514628', 'andrew-greece': '5495575341940116659',
    'charlotte-mecklenburg': '6000000003891728922', 'louis-battenberg': '6000000003221640265',
    'mary-lorraine': '6000000001323878378', 'madeleine-valois': '6000000002322323932',
    'james-hepburn': '6000000001723257706', 'francis-ii-france': '6000000003232545902',
    'francis-teck': '6000000001543481636', 'george-cumberland': '4033341615700026163',
    'henry-grey': '6000000000307262142', 'archibald-douglas': '6000000003232538566',
    'william-ii-orange': '6000000001562593113', 'augusta-saxe-gotha': '6000000003891753089',
    'catherine-aragon': '4475169', 'anne-boleyn': '6000000003702650070',
    'jane-seymour': '6000000001465721422', 'anne-cleves': '4475232',
    'catherine-howard': '6000000001465827019', 'catherine-parr': '6000000001465762273',
    'anne-hyde': '4033453667340030515', 'mary-modena': '6000000001573653856',
    'anne-denmark': '4104662', 'sophia-dorothea-celle': '4555856',
    'guildford-dudley': '6000000003409098325', 'henry-methven': '6000000005412245713',
    'adrian-stokes': '6000000000307271644', 'jeanne-france': '6000000003122346868',
    'anne-brittany': '6000000003219788977', 'anne-browne': '6000000006444128280',
    'margaret-neville': '6000000005599087163', 'katherine-willoughby': '5466010055340136751',
    'jean-gordon': '6000000007464078514', 'louis-longueville': '6000000007103452983',
    'edward-burgh': '6000000015653621535', 'john-neville-latimer': '6000000000628783459',
    'thomas-seymour': '6000000000173186819', 'thomas-fitzherbert': '6000000010030843512',
    'edward-weld': '6000000021567940842', 'emich-carl-leiningen': '6000000005599033002',
    'anna-austria-spain': '6000000001142154909', 'elisabeth-valois': '6000000001777536029',
    'maria-manuela': '6000000001599879609', 'andrew-parker-bowles': '5032563093790088828',
    'alexandrine-hutten': '6000000002343276289', 'earl-winfield-spencer': '6000000003419417080',
    'ernest-aldrich-simpson': '6000000003419427107', 'margaret-hepburn': '6000000018986012932',
    'jane-stewart-douglas': '6000000219298892824', 'margaret-maxwell': '6000000006806744528',
    'janet-stewart-sutherland': '6000000005559708008', 'lady-leslie': '6000000042163396821'
  };
  const people = {};
  const displayNameOverrides = { 'henry-vii': 'Henry VII, King of England' };
  rows.filter(([slug]) => geniIds[slug]).forEach(([slug, firstName, lastName, birthYear, deathYear, gender, note]) => {
    const geniId = geniIds[slug];
    const id = `profile-${geniId}`;
    const baseName = [firstName, lastName].filter(Boolean).join(' ');
    const titleClause = clean(note).split(/[;,]/)[0];
    const royalTitle = titleClause.match(/\b(?:King|Queen)(?:\s+consort)?\s+of\s+.+$/i)?.[0] || '';
    const displayName = displayNameOverrides[slug] || (royalTitle && !/\b(?:king|queen)\b/i.test(baseName) ? `${baseName}, ${royalTitle}` : baseName);
    people[id] = normalizePerson({
      id, firstName, lastName, displayName, title: royalTitle, birthYear, deathYear, gender, note,
      nameOrder: 'western', isLiving: slug === 'charles-iii', place: '',
      sourceUrl: `https://www.geni.com/profile/index/${geniId}`, sourceProvider: 'geni', sourceId: id,
      starterProfile: true
    }, id);
  });
  const id = slug => geniIds[slug] ? `profile-${geniIds[slug]}` : '';
  const parentLinks = {
    'arthur-tudor': ['henry-vii', 'elizabeth-york'], 'henry-viii': ['henry-vii', 'elizabeth-york'],
    'margaret-tudor': ['henry-vii', 'elizabeth-york'], 'mary-tudor': ['henry-vii', 'elizabeth-york'],
    'mary-i': ['henry-viii', 'catherine-aragon'], 'elizabeth-i': ['henry-viii', 'anne-boleyn'], 'edward-vi': ['henry-viii', 'jane-seymour'],
    'frances-brandon': ['mary-tudor', 'charles-brandon'], 'jane-grey': ['frances-brandon', 'henry-grey'],
    'james-v': ['james-iv', 'margaret-tudor'], 'mary-scots': ['james-v', 'mary-lorraine'],
    'james-vi-i': ['darnley', 'mary-scots'], 'charles-i': ['james-vi-i', 'anne-denmark'], 'elizabeth-stuart': ['james-vi-i', 'anne-denmark'],
    'charles-ii': ['charles-i', 'henrietta-maria'], 'james-ii-vii': ['charles-i', 'henrietta-maria'], 'mary-princess-royal': ['charles-i', 'henrietta-maria'],
    'william-iii': ['mary-princess-royal', 'william-ii-orange'], 'mary-ii': ['james-ii-vii', 'anne-hyde'], 'anne': ['james-ii-vii', 'anne-hyde'],
    'sophia-hanover': ['frederick-v', 'elizabeth-stuart'], 'george-i': ['ernest-augustus', 'sophia-hanover'],
    'george-ii': ['george-i', 'sophia-dorothea-celle'], 'frederick-wales': ['george-ii', 'caroline-ansbach'], 'george-iii': ['frederick-wales', 'augusta-saxe-gotha'],
    'george-iv': ['george-iii'], 'william-iv': ['george-iii'], 'edward-kent': ['george-iii'],
    'ernest-cumberland': ['george-iii'], 'adolphus-cambridge': ['george-iii'], 'mary-adelaide': ['adolphus-cambridge'],
    'mary-teck': ['mary-adelaide', 'francis-teck'], 'victoria': ['edward-kent', 'victoria-saxe-coburg'],
    'victoria-royal': ['albert', 'victoria'], 'edward-vii': ['albert', 'victoria'], 'alice-uk': ['albert', 'victoria'],
    'alfred-saxe': ['albert', 'victoria'], 'helena-uk': ['albert', 'victoria'], 'louise-uk': ['albert', 'victoria'],
    'arthur-connaught': ['albert', 'victoria'], 'leopold-albany': ['albert', 'victoria'], 'beatrice-uk': ['albert', 'victoria'],
    'victoria-hesse': ['alice-uk', 'louis-iv-hesse'], 'alice-battenberg': ['victoria-hesse', 'louis-battenberg'], 'philip': ['alice-battenberg', 'andrew-greece'],
    'george-v': ['edward-vii', 'alexandra-denmark'], 'maud-norway': ['edward-vii', 'alexandra-denmark'], 'olav-v': ['maud-norway'], 'harald-v': ['olav-v'],
    'edward-viii': ['george-v', 'mary-teck'], 'george-vi': ['george-v', 'mary-teck'],
    'elizabeth-ii': ['george-vi', 'queen-mother'], 'margaret-snowdon': ['george-vi', 'queen-mother'],
    'charles-iii': ['philip', 'elizabeth-ii'], 'anne-royal': ['philip', 'elizabeth-ii'],
    'andrew-york': ['philip', 'elizabeth-ii'], 'edward-edinburgh': ['philip', 'elizabeth-ii'],
    'william-wales': ['charles-iii'], 'harry-sussex': ['charles-iii'],
    'george-wales': ['william-wales'], 'charlotte-wales': ['william-wales'], 'louis-wales': ['william-wales']
  };
  Object.entries(parentLinks).forEach(([childSlug, parentSlugs]) => {
    const childId = id(childSlug);
    if (!people[childId]) return;
    const retainedParents = parentSlugs.map(id).filter(parentId => people[parentId]);
    people[childId].parents = retainedParents;
    retainedParents.forEach(parentId => { people[parentId].children = unique([...people[parentId].children, childId]); });
  });
  [
   ['henry-vii','elizabeth-york','1486'], ['james-iv','margaret-tudor','1503'],
   ['margaret-tudor','archibald-douglas','1514'], ['margaret-tudor','henry-methven','1528'],
   ['henry-methven','janet-stewart-sutherland',''], ['henry-methven','lady-leslie',''],
   ['mary-tudor','louis-xii-france','1514'], ['mary-tudor','charles-brandon','1515'],
   ['frances-brandon','henry-grey','1533'], ['frances-brandon','adrian-stokes','1555'], ['jane-grey','guildford-dudley','1553'],
   ['louis-xii-france','jeanne-france','1476'], ['louis-xii-france','anne-brittany','1499'],
   ['charles-brandon','margaret-neville','1507'], ['charles-brandon','anne-browne','1508'], ['charles-brandon','katherine-willoughby','1533'],
   ['archibald-douglas','margaret-hepburn','1509'], ['archibald-douglas','jane-stewart-douglas',''], ['archibald-douglas','margaret-maxwell','1543'],
   ['henry-viii','catherine-aragon','1509'], ['henry-viii','anne-boleyn','1533'],
   ['henry-viii','jane-seymour','1536'], ['henry-viii','anne-cleves','1540'], ['henry-viii','catherine-howard','1540'], ['henry-viii','catherine-parr','1543'],
   ['catherine-aragon','arthur-tudor','1501'],
   ['catherine-parr','edward-burgh','1529'], ['catherine-parr','john-neville-latimer','1534'], ['catherine-parr','thomas-seymour','1547'],
   ['mary-i','philip-ii-spain','1554'], ['james-v','madeleine-valois','1537'], ['james-v','mary-lorraine','1538'],
   ['mary-lorraine','louis-longueville','1534'],
   ['mary-scots','francis-ii-france','1558'], ['darnley','mary-scots','1565'], ['james-hepburn','jean-gordon','1566','divorced'], ['mary-scots','james-hepburn','1567'],
   ['philip-ii-spain','maria-manuela','1543'], ['philip-ii-spain','elisabeth-valois','1560'], ['philip-ii-spain','anna-austria-spain','1570'],
   ['james-vi-i','anne-denmark','1589'], ['frederick-v','elizabeth-stuart','1613'], ['ernest-augustus','sophia-hanover','1658'],
   ['george-i','sophia-dorothea-celle','1682'], ['charles-i','henrietta-maria','1625'],
   ['mary-princess-royal','william-ii-orange','1641'],
   ['james-ii-vii','anne-hyde','1659'], ['charles-ii','catherine-braganza','1662'], ['james-ii-vii','mary-modena','1673'],
   ['william-iii','mary-ii','1677'], ['anne','george-cumberland','1683'], ['george-ii','caroline-ansbach','1705'],
   ['frederick-wales','augusta-saxe-gotha','1736'], ['george-iii','charlotte-mecklenburg','1761'],
   ['george-iv','maria-fitzherbert','1785'], ['george-iv','caroline-brunswick','1795'],
   ['maria-fitzherbert','edward-weld','1775'], ['maria-fitzherbert','thomas-fitzherbert','1778'],
   ['victoria-saxe-coburg','emich-carl-leiningen','1803'], ['edward-kent','victoria-saxe-coburg','1818'], ['william-iv','adelaide-saxe-meiningen','1818'], ['adolphus-cambridge','augusta-hesse-kassel','1818'],
   ['albert','victoria','1840'], ['alice-uk','louis-iv-hesse','1862'], ['edward-vii','alexandra-denmark','1863'],
   ['louis-iv-hesse','alexandrine-hutten','1884'],
   ['mary-adelaide','francis-teck','1866'], ['victoria-hesse','louis-battenberg','1884'], ['george-v','mary-teck','1893'],
   ['alice-battenberg','andrew-greece','1903'], ['wallis-simpson','earl-winfield-spencer','1916','divorced'],
   ['george-vi','queen-mother','1923'], ['wallis-simpson','ernest-aldrich-simpson','1928','divorced'], ['edward-viii','wallis-simpson','1937'],
   ['philip','elizabeth-ii','1947'], ['camilla','andrew-parker-bowles','1973','divorced'], ['charles-iii','diana','1981','divorced'], ['charles-iii','camilla','2005']
  ].forEach(([a, b, marriageYear, marriageStatus]) => {
    if (!people[id(a)] || !people[id(b)]) return;
    people[id(a)].partners = unique([...people[id(a)].partners, id(b)]);
    people[id(b)].partners = unique([...people[id(b)].partners, id(a)]);
    people[id(a)].spouses = unique([...people[id(a)].spouses, id(b)]);
    people[id(b)].spouses = unique([...people[id(b)].spouses, id(a)]);
    if (marriageStatus === 'divorced') {
      people[id(a)].divorcedSpouses = unique([...people[id(a)].divorcedSpouses, id(b)]);
      people[id(b)].divorcedSpouses = unique([...people[id(b)].divorcedSpouses, id(a)]);
    }
    people[id(a)].marriageYears[id(b)] = marriageYear;
    people[id(b)].marriageYears[id(a)] = marriageYear;
  });
  const reigns = {
    'henry-vii': [['Reign', 1485, 1509]], 'henry-viii': [['Reign', 1509, 1547]],
    'jane-grey': [['Reign', 1553, 1553]], 'mary-i': [['Reign', 1553, 1558]], 'elizabeth-i': [['Reign', 1558, 1603]], 'edward-vi': [['Reign', 1547, 1553]],
    'james-iv': [['Reign', 1488, 1513]], 'james-v': [['Reign', 1513, 1542]], 'mary-scots': [['Reign', 1542, 1567]],
    'james-vi-i': [['Reign · Scotland', 1567, 1625], ['Reign · England and Ireland', 1603, 1625]],
    'charles-i': [['Reign', 1625, 1649]], 'charles-ii': [['Reign', 1660, 1685]], 'james-ii-vii': [['Reign', 1685, 1688]],
    'william-iii': [['Reign', 1689, 1702]], 'mary-ii': [['Reign', 1689, 1694]], 'anne': [['Reign', 1702, 1714]],
    'george-i': [['Reign', 1714, 1727]], 'george-ii': [['Reign', 1727, 1760]], 'george-iii': [['Reign', 1760, 1820]],
    'victoria': [['Reign', 1837, 1901]], 'edward-vii': [['Reign', 1901, 1910]], 'george-v': [['Reign', 1910, 1936]],
    'edward-viii': [['Reign', 1936, 1936]], 'george-vi': [['Reign', 1936, 1952]], 'elizabeth-ii': [['Reign', 1952, 2022]],
    'george-iv': [['Reign', 1820, 1830]], 'william-iv': [['Reign', 1830, 1837]], 'ernest-cumberland': [['Reign · Hanover', 1837, 1851]],
    'maud-norway': [['Reign as queen consort', 1905, 1938]], 'olav-v': [['Reign · Norway', 1957, 1991]],
    'harald-v': [['Reign · Norway', 1991, new Date().getFullYear()]], 'charles-iii': [['Reign', 2022, new Date().getFullYear()]]
  };
  Object.entries(reigns).forEach(([slug, events]) => {
    if (!people[id(slug)]) return;
    people[id(slug)].personalEvents = events.map(([name, startYear, endYear]) => ({ name, startYear, endYear, source: 'royal', color: state.reignColor }));
  });
  return people;
}

function loadBritishRoyalExample({ persistResult = true } = {}) {
  const button = els['royal-example-button'];
  state.people = createBritishRoyalSample();
  state.globalEvents = [];
  state.rootId = profileIdFromInput(HENRY_VII_GENI_URL);
  state.selectedId = '';
  state.ephemeral = false;
  state.starterDataVersion = BRITISH_ROYAL_STARTER_VERSION;
  state.title = 'The British royal line from Henry VII';
  els['tree-filter'].value = 'king queen';
  if (persistResult) persist('Bundled royal line restored');
  render();
  button.textContent = '♔ Restore the bundled British royal line';
}

function upgradeBundledBritishRoyalLine() {
  if (state.starterDataVersion >= BRITISH_ROYAL_STARTER_VERSION) return false;
  const starterRootId = profileIdFromInput(HENRY_VII_GENI_URL);
  const isBundledLine = state.rootId === starterRootId && (
    state.title === 'The British royal line from Henry VII' ||
    Object.values(state.people).some(person => person.starterProfile)
  );
  if (!isBundledLine) return false;

  const bundledPeople = createBritishRoyalSample();
  Object.entries(bundledPeople).forEach(([id, bundled]) => {
    const saved = state.people[id];
    if (!saved) {
      state.people[id] = bundled;
      return;
    }
    // Preserve locally edited profile fields while adding relationships and
    // profiles introduced by newer versions of the bundled starter tree.
    const merged = mergePersonRecords(bundled, saved);
    merged.marriageYears = { ...bundled.marriageYears, ...saved.marriageYears };
    merged.personalEvents = normalizePersonalEvents([...bundled.personalEvents, ...saved.personalEvents]);
    state.people[id] = merged;
  });
  state.starterDataVersion = BRITISH_ROYAL_STARTER_VERSION;
  return true;
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return;
    const savedRootId = clean(saved.rootId);
    state.title = clean(saved.title) || state.title;
    state.rootId = savedRootId;
    state.reignColor = paletteColor(saved.reignColor, DEFAULT_REIGN_EVENT_COLOR);
    state.timelineYearWidth = timelineYearWidth(saved.timelineYearWidth);
    state.starterDataVersion = Number.parseInt(saved.starterDataVersion, 10) || 0;
    state.globalEvents = normalizeGlobalEvents(saved.globalEvents || saved.timelineEvents);
    Object.entries(saved.people || {}).forEach(([id, person]) => { state.people[id] = normalizePerson(person, id); });
  } catch { /* A malformed local cache should not prevent the app from opening. */ }
}
function persist(message = 'All changes saved locally') {
  if (state.ephemeral) {
    els['save-status'].textContent = message || 'Live Geni data · not saved';
    window.setTimeout(() => { els['save-status'].textContent = 'Live Geni data · not saved'; }, 1600);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: state.title, rootId: state.rootId, people: state.people, globalEvents: state.globalEvents, reignColor: state.reignColor, timelineYearWidth: state.timelineYearWidth, starterDataVersion: state.starterDataVersion }));
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

function inferRelationsFromUnions(nodes) {
  const profiles = Object.values(nodes).filter(node => node && clean(node.id).startsWith('profile-'));
  const profileMap = Object.fromEntries(profiles.map(profile => [clean(profile.id), profile]));
  Object.values(nodes).filter(node => node && clean(node.id).startsWith('union-')).forEach(union => {
    const partners = uniqueRefs(union.partners || union.partner_ids || union.profiles).filter(id => profileMap[id]);
    const children = uniqueRefs(union.children || union.child_ids).filter(id => profileMap[id]);
    const marriageYear = clean(
      union.marriage?.date?.year ?? union.marriage?.year ?? union.marriage?.date
      ?? union.marriage_date?.year ?? union.marriage_date
    ).match(/-?\d{3,4}/)?.[0] || '';
    const status = clean(union.status || union.relationship_status || union.type).toLowerCase().replace(/[\s-]+/g, '_');
    const isSpouseUnion = ['spouse', 'ex_spouse', 'married', 'divorced'].includes(status) || Boolean(marriageYear);
    const isDivorcedUnion = ['ex_spouse', 'divorced'].includes(status);
    partners.forEach(id => {
      profileMap[id].partners = unique([...(profileMap[id].partners || []), ...partners.filter(other => other !== id)]);
      const relationKey = isSpouseUnion ? 'spouses' : 'nonSpouses';
      profileMap[id][relationKey] = unique([...(profileMap[id][relationKey] || []), ...partners.filter(other => other !== id)]);
      if (isDivorcedUnion) profileMap[id].divorcedSpouses = unique([...(profileMap[id].divorcedSpouses || []), ...partners.filter(other => other !== id)]);
      profileMap[id].children = unique([...(profileMap[id].children || []), ...children]);
      if (marriageYear) {
        profileMap[id].marriageYears = { ...(profileMap[id].marriageYears || {}) };
        partners.filter(other => other !== id).forEach(other => { profileMap[id].marriageYears[other] = marriageYear; });
      }
    });
    children.forEach(id => { profileMap[id].parents = unique([...(profileMap[id].parents || []), ...partners]); });
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
    window[callbackName] = payload => finish(null, payload);
    script.onerror = () => finish(new Error('The authorized Geni request could not be loaded.'));
    const query = new URLSearchParams({ ...params, access_token: state.geniAccessToken, callback: callbackName });
    script.src = `https://www.geni.com/api/${path}?${query}`;
    document.head.append(script);
  });
}

async function fetchGeniNeighborhood(id) {
  const payload = await fetchGeniJsonp(`${encodeURIComponent(id)}/immediate-family`);
  if (payload.error) throw new Error(payload.error.message || 'Geni did not return a public profile.');
  const nodes = payload.nodes || payload.focus?.nodes || {};
  const mapped = inferRelationsFromUnions(nodes);
  const focusRaw = payload.focus?.id ? payload.focus : (nodes[payload.focus] || payload);
  if (focusRaw?.id && !mapped[focusRaw.id]) mapped[focusRaw.id] = focusRaw;
  return { mapped, focusRaw };
}

async function loadGeniImmediateFamily(profileId) {
  const person = state.people[profileId];
  if (!person || person.sourceProvider !== 'geni' || !/^profile-/i.test(profileId)) {
    throw new Error('This local profile is not linked to a Geni profile ID.');
  }
  if (!state.geniAccessToken) {
    beginGeniAuthorization(`immediate-family:${profileId}`);
    return;
  }
  const button = els['load-immediate-family'];
  button.disabled = true;
  button.textContent = 'Loading public family…';
  try {
    const importedAt = new Date().toISOString();
    const { mapped } = await fetchGeniNeighborhood(profileId);
    Object.entries(mapped).forEach(([id, raw]) => {
      if (raw.public === false) return;
      const incoming = normalizePerson({
        ...raw,
        id,
        sourceId: id,
        sourceUrl: validGeniUrl(raw.profile_url) || `https://www.geni.com/profile/index/${id.replace(/^profile-/i, '')}`,
        sourceProvider: 'geni',
        importedAt
      }, id);
      state.people[id] = mergePersonRecords(state.people[id], incoming);
    });
    if (!state.people[profileId]) throw new Error('Geni did not return the selected public profile.');
    state.people[profileId].geniImmediateFamilyLoaded = true;
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
    toast(`Loaded ${Object.keys(mapped).length} public profiles from this immediate family.`, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Refresh complete immediate family';
  }
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
    const candidates = Array.isArray(payload) ? payload
      : Array.isArray(payload.results) ? payload.results
        : Array.isArray(payload.profiles) ? payload.profiles
          : Object.values(payload).filter(value => value && typeof value === 'object' && value.id);
    candidates.forEach(raw => {
      const rawId = refId(raw.id || raw.url);
      if (!rawId) return;
      const id = /^profile-/i.test(rawId) ? rawId : `profile-${rawId}`;
      eventsByProfile[id] = extractGeniReignFacts(raw);
    });
  }
  return eventsByProfile;
}

function mergePersonRecords(existing, incoming) {
  if (!existing) return incoming;
  const merged = normalizePerson({ ...existing, ...incoming, id: incoming.id || existing.id }, incoming.id || existing.id);
  merged.parents = unique([...incoming.parents, ...existing.parents]);
  merged.children = unique([...incoming.children, ...existing.children]);
  merged.partners = unique([...incoming.partners, ...existing.partners]);
  merged.spouses = unique([...incoming.spouses, ...existing.spouses]);
  merged.nonSpouses = unique([...incoming.nonSpouses, ...existing.nonSpouses]).filter(id => !merged.spouses.includes(id));
  merged.divorcedSpouses = unique([...incoming.divorcedSpouses, ...existing.divorcedSpouses]).filter(id => merged.spouses.includes(id));
  merged.marriageYears = { ...incoming.marriageYears, ...existing.marriageYears };
  merged.personalEvents = normalizePersonalEvents([...incoming.personalEvents, ...existing.personalEvents]);
  merged.sourceUrl = incoming.sourceUrl || existing.sourceUrl;
  merged.sourceId = incoming.sourceId || existing.sourceId;
  merged.sourceProvider = incoming.sourceProvider || existing.sourceProvider;
  merged.importedAt = incoming.importedAt || existing.importedAt;
  merged.geniImmediateFamilyLoaded = incoming.geniImmediateFamilyLoaded || existing.geniImmediateFamilyLoaded;
  merged.starterProfile = incoming.starterProfile || existing.starterProfile;
  return merged;
}

async function importFromGeni(input, requestedDepth = 2, options = {}) {
  const id = profileIdFromInput(input);
  if (!id) throw new Error('Enter a valid geni.com public profile URL or profile ID.');
  const mode = options.mode === 'descendants' ? 'descendants' : 'connections';
  const persistResult = options.persistResult !== false;
  const depthLimit = mode === 'descendants' ? 16 : 4;
  const depth = Math.min(depthLimit, Math.max(1, Number.parseInt(requestedDepth, 10) || 2));
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
    if (current.id === id) focusId = clean(neighborhood.focusRaw?.id) || id;
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

    Object.entries(discovered).forEach(([profileId, person]) => {
      state.people[profileId] = mergePersonRecords(state.people[profileId], person);
    });
    state.rootId = state.rootId || focusId;
    state.selectedId = state.selectedId || focusId;
    if (options.title) state.title = options.title;
    else if (state.title === 'Untitled family') state.title = `${fullName(state.people[focusId] || {})} family`;
    els['save-status'].textContent = `Geni import · ${Object.keys(discovered).length} profiles`;
    render();
    await new Promise(resolve => requestAnimationFrame(resolve));

    if (current.distance + 1 < depth) {
      const rawFocusRef = refId(neighborhood.focusRaw?.id);
      const neighborhoodFocusId = /^profile-/i.test(rawFocusRef) ? rawFocusRef : (rawFocusRef ? `profile-${rawFocusRef}` : '');
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
  toast(`Grew ${Object.keys(discovered).length} live Geni profiles across depth ${depth}.${skipNote}${limitNote}`, true);
}

function wikiTreePerson(raw, importedAt) {
  const numericId = clean(raw.Id || raw.id);
  const wikiId = clean(raw.Name || raw.name);
  const id = `wikitree-${numericId || wikiId}`;
  const dateYear = value => clean(value).match(/^-?\d{1,4}/)?.[0] || '';
  const gender = clean(raw.Gender).toLowerCase();
  return normalizePerson({
    id,
    firstName: [clean(raw.FirstName), clean(raw.MiddleName)].filter(Boolean).join(' '),
    lastName: clean(raw.LastNameAtBirth || raw.LastNameCurrent),
    nameOrder: 'western',
    gender: gender === 'male' || gender === 'female' ? gender : 'unknown',
    birthYear: dateYear(raw.BirthDate),
    deathYear: dateYear(raw.DeathDate),
    isLiving: raw.IsLiving === 1 || raw.IsLiving === '1',
    place: clean(raw.BirthLocation || raw.DeathLocation),
    parents: [raw.Father, raw.Mother].filter(Boolean).map(value => `wikitree-${value}`),
    sourceUrl: wikiId ? `https://www.wikitree.com/wiki/${encodeURIComponent(wikiId)}` : '',
    sourceId: wikiId,
    sourceProvider: 'wikitree',
    importedAt
  }, id);
}

async function importFromWikiTree(input) {
  const wikiId = wikiTreeIdFromInput(input);
  if (!wikiId) throw new Error('Enter a valid WikiTree public profile URL or WikiTree ID such as Clemens-1.');
  const params = new URLSearchParams({
    action: 'getRelatives', keys: wikiId, appId: 'LineageTimeline',
    fields: 'Id,Name,FirstName,MiddleName,LastNameAtBirth,LastNameCurrent,Gender,BirthDate,BirthLocation,DeathDate,DeathLocation,Father,Mother,IsLiving,Privacy',
    getParents: '1', getChildren: '1', getSpouses: '1', getSiblings: '0'
  });
  const endpoint = `https://api.wikitree.com/api.php?${params}`;
  els['source-download-link'].href = endpoint;
  els['source-download-link'].hidden = false;
  let response;
  try { response = await fetch(endpoint, { headers: { Accept: 'application/json' }, credentials: 'omit' }); }
  catch { throw new Error('WikiTree blocks cross-origin API calls from GitHub Pages. Open its official API JSON below, save it, then use Import file.'); }
  if (!response.ok) throw new Error(`WikiTree returned ${response.status}.`);
  return applyWikiTreePayload(await response.json(), wikiId);
}

function applyWikiTreePayload(payload, requestedWikiId = '') {
  const envelope = Array.isArray(payload) ? payload[0] : payload;
  if (envelope?.status && envelope.status !== 0) throw new Error(String(envelope.status));
  const item = envelope?.items?.[0];
  if (!item?.person) throw new Error('WikiTree did not return that public profile.');
  const importedAt = new Date().toISOString();
  const rawPeople = [item.person, ...Object.values(item.person.Parents || {}), ...Object.values(item.person.Children || {}), ...Object.values(item.person.Spouses || {})];
  const imported = {};
  rawPeople.forEach(raw => {
    const person = wikiTreePerson(raw, importedAt);
    imported[person.id] = { ...state.people[person.id], ...person };
  });
  const focusId = `wikitree-${clean(item.person.Id) || requestedWikiId}`;
  const focus = imported[focusId];
  if (!focus) throw new Error('WikiTree returned an unsupported profile response.');
  focus.children = Object.values(item.person.Children || {}).map(child => `wikitree-${child.Id}`);
  focus.partners = Object.values(item.person.Spouses || {}).map(spouse => `wikitree-${spouse.Id}`);
  focus.spouses = [...focus.partners];
  Object.values(item.person.Children || {}).forEach(child => {
    const childId = `wikitree-${child.Id}`;
    if (imported[childId]) imported[childId].parents = [child.Father, child.Mother].filter(Boolean).map(value => `wikitree-${value}`);
  });
  Object.values(item.person.Spouses || {}).forEach(spouse => {
    const spouseId = `wikitree-${spouse.Id}`;
    if (imported[spouseId]) {
      imported[spouseId].partners = unique([...imported[spouseId].partners, focusId]);
      imported[spouseId].spouses = unique([...imported[spouseId].spouses, focusId]);
    }
  });
  Object.assign(state.people, imported);
  state.rootId = state.rootId || focusId;
  state.selectedId = focusId;
  if (state.title === 'Untitled family') state.title = `${fullName(focus)} family`;
  persist(`Imported from WikiTree · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  render();
  toast(`Imported ${Object.keys(imported).length} public profiles from WikiTree.`);
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
  state.globalEvents = normalizeGlobalEvents(payload.globalEvents || payload.timelineEvents || payload.db?.timelineEvents);
  state.rootId = Object.keys(people).find(id => !people[id].parents.length) || Object.keys(people)[0];
  state.selectedId = state.rootId;
  state.title = clean(fileName.replace(/\.(ged|gedcom)$/i, '')) || 'Imported family';
  persist('GEDCOM imported');
  render();
  toast(`Imported ${Object.keys(people).length} profiles from GEDCOM.`);
}

async function importFromSource(input, provider = 'auto', depth = 2) {
  const detected = validGeniUrl(input) || /^profile-/i.test(clean(input)) ? 'geni'
    : validWikiTreeUrl(input) || /^[^\s/]+-\d+$/.test(clean(input)) ? 'wikitree' : '';
  const selected = provider === 'auto' ? detected : provider;
  if (selected === 'geni') return importFromGeni(input, depth);
  if (selected === 'wikitree') return importFromWikiTree(input);
  throw new Error('Choose a supported public source, or import a JSON/GEDCOM file exported by that service.');
}

function importBackup(payload) {
  const wikiEnvelope = Array.isArray(payload) ? payload[0] : payload;
  if (wikiEnvelope?.items?.[0]?.person) return applyWikiTreePayload(payload);
  const rawPeople = payload.people || payload.db?.people;
  if (!rawPeople || typeof rawPeople !== 'object') throw new Error('This file does not contain a supported people collection.');
  state.reignColor = paletteColor(payload.reignColor || payload.db?.reignColor, DEFAULT_REIGN_EVENT_COLOR);
  state.timelineYearWidth = timelineYearWidth(payload.timelineYearWidth || payload.db?.timelineYearWidth);
  const people = {};
  Object.entries(rawPeople).forEach(([id, source]) => { people[id] = normalizePerson(source, id); });
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
  state.rootId = clean(payload.activeRootId || payload.db?.activeRootId) || Object.keys(people)[0] || '';
  state.title = clean(payload.title || payload.familyName) || `${fullName(people[state.rootId] || {})} family`;
  state.selectedId = state.rootId;
  persist('Backup imported');
  render();
  toast(`Imported ${Object.keys(people).length} profiles.`);
}

function exportBackup() {
  const payload = {
    schema: 'lineage-web', version: 1, exportedAt: new Date().toISOString(),
    title: state.title, activeRootId: state.rootId, people: state.people, globalEvents: state.globalEvents, reignColor: state.reignColor, timelineYearWidth: state.timelineYearWidth,
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

function branchFilterIds() {
  const nonSpouseOnly = new Set();
  Object.values(state.people).forEach(person => person.nonSpouses.forEach(id => nonSpouseOnly.add(id)));
  Object.values(state.people).forEach(person => person.spouses.forEach(id => nonSpouseOnly.delete(id)));
  nonSpouseOnly.delete(state.rootId);
  const ids = Object.keys(state.people).filter(id => !nonSpouseOnly.has(id));
  const query = clean(els['tree-filter']?.value).toLocaleLowerCase();
  if (!query) return new Set(ids);
  const keywords = query.split(/\s+/).filter(Boolean);
  const matches = ids.filter(id => keywords.some(keyword => matchesKeyword(state.people[id], keyword)));
  const visible = new Set(matches);
  const queue = [...matches];
  while (queue.length) {
    const person = state.people[queue.shift()];
    if (!person) continue;
    person.parents.forEach(parentId => {
      if (state.people[parentId] && !visible.has(parentId)) { visible.add(parentId); queue.push(parentId); }
    });
    person.spouses.forEach(partnerId => {
      if (state.people[partnerId] && !visible.has(partnerId)) { visible.add(partnerId); queue.push(partnerId); }
    });
  }
  return visible;
}

function svg(tag, attrs = {}, text = '') {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  if (text) node.textContent = text;
  return node;
}

function stabilizeTimelineOrder(nodes, rowHeight, rowStep) {
  const ranges = nodes.map(node => ({ left: node.x - 36, right: node.x + Math.max(node.occupancyWidth, 2) + 36 }));
  const overlapsHorizontally = (a, b) => a.left < b.right && b.left < a.right;
  // Match the mini-program's row invariant: intersecting horizontal ranges must
  // occupy distinct full rows. Using only rowHeight allowed adjacent strokes to
  // touch after the fractional-row compaction passes; rowStep retains the
  // intended six-pixel vertical gutter for the web's 36px boxes on 42px rows.
  const requiredVerticalSeparation = Math.max(rowHeight, rowStep);
  nodes.forEach((node, index) => {
    let targetY = Math.max(0, node.y);
    for (let previous = 0; previous < index; previous += 1) {
      if (!overlapsHorizontally(ranges[index], ranges[previous])) continue;
      if (targetY - nodes[previous].y < requiredVerticalSeparation) {
        targetY = nodes[previous].y + requiredVerticalSeparation;
      }
    }
    node.y = Math.round(targetY * 1000) / 1000;
  });
}

// D3's tidy tree gains its compactness by comparing whole subtree contours,
// rather than assigning every node a permanently distinct row. This rotated
// adaptation keeps time on x, preserves each depth-first household block, and
// lifts that block into the earliest y-space where its occupied x-ranges fit.
function compactTimelineTidyContours(nodes, displayParentById, rowHeight, rowStep) {
  if (nodes.length < 2) return;
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const childrenByIndex = new Map(nodes.map((_, index) => [index, []]));
  const parentIndexByIndex = new Map();
  nodes.forEach((node, index) => {
    const parentIndex = indexById.get(displayParentById.get(node.id));
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
  const horizontalRanges = nodes.map(node => ({
    left: node.x - 36,
    right: node.x + Math.max(node.occupancyWidth, 2) + 36
  }));
  const rangesOverlap = (a, b) => a.left < b.right && b.left < a.right;
  const verticallyOverlap = (a, b) => Math.abs(a - b) < rowStep;
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
        if (contained.has(other) || !rangesOverlap(horizontalRanges[index], horizontalRanges[other])) continue;
        if (verticallyOverlap(targetY, nodes[other].y)) return false;
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
  canvas.replaceChildren();
  ruler.replaceChildren();
  const visibleIds = branchFilterIds();
  state.collapsedIds.forEach(id => {
    if (!visibleIds.has(id)) return;
    const queue = [...(state.people[id]?.children || [])];
    const hiddenDescendants = new Set();
    while (queue.length) {
      const childId = queue.shift();
      if (hiddenDescendants.has(childId)) continue;
      hiddenDescendants.add(childId);
      queue.push(...(state.people[childId]?.children || []), ...(state.people[childId]?.spouses || []));
    }
    hiddenDescendants.forEach(childId => visibleIds.delete(childId));
  });
  const people = Object.values(state.people).filter(person => visibleIds.has(person.id) && numericYear(person.birthYear) != null);
  if (!people.length) {
    ruler.toggleAttribute('hidden', true);
    canvas.setAttribute('width', 820); canvas.setAttribute('height', 560); canvas.setAttribute('viewBox', '0 0 820 560');
    canvas.append(svg('text', { x: 410, y: 260, class: 'filter-empty-label', 'text-anchor': 'middle' }, clean(els['tree-filter'].value) ? 'No branches contain that name' : 'Add birth years to see this view'));
    canvas.append(svg('text', { x: 410, y: 284, class: 'filter-empty-hint', 'text-anchor': 'middle' }, 'The timeline positions every profile by its birth and lifespan'));
    canvas.style.transform = `scale(${state.zoom})`;
    return;
  }

  const currentYear = new Date().getFullYear();
  const yearWidth = state.timelineYearWidth;
  const rowHeight = 36;
  const rowStep = 42;
  const top = 58;
  const left = 36;
  const birthYear = person => numericYear(person.birthYear);
  const endYear = person => numericYear(person.deathYear) ?? (person.isLiving ? currentYear : birthYear(person) + 80);
  const minYear = Math.floor((Math.min(...people.map(birthYear)) - 40) / 20) * 20;
  const latestLifeYear = Math.max(...people.map(endYear), ...(people.some(person => person.isLiving) ? [currentYear] : []));
  const maxYear = Math.ceil((latestLifeYear + 20) / 20) * 20;
  const xForYear = year => left + (year - minYear) * yearWidth;

  // Row order follows the family. Time controls only horizontal position and width.
  const datedIds = new Set(people.map(person => person.id));
  const childrenByParent = new Map();
  people.forEach(person => person.parents.forEach(parentId => {
    if (!datedIds.has(parentId)) return;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(person.id);
  }));
  const byBirth = (a, b) => birthYear(state.people[a]) - birthYear(state.people[b]) || fullName(state.people[a]).localeCompare(fullName(state.people[b]));
  childrenByParent.forEach(ids => ids.sort(byBirth));
  const roots = people.filter(person => !person.parents.some(id => datedIds.has(id))).map(person => person.id).sort(byBirth);
  if (datedIds.has(state.rootId)) roots.sort((a, b) => (a === state.rootId ? -1 : b === state.rootId ? 1 : byBirth(a, b)));
  const order = [];
  const placed = new Set();
  const expanded = new Set();
  const spouseIds = new Set();
  const displayParentById = new Map();
  function place(id, asSpouse = false, displayParentId = '') {
    if (!datedIds.has(id) || placed.has(id)) return;
    placed.add(id);
    if (displayParentId) displayParentById.set(id, displayParentId);
    if (asSpouse) spouseIds.add(id);
    order.push(id);
  }
  function visit(id, displayParentId = '') {
    if (!datedIds.has(id) || expanded.has(id)) return;
    place(id, false, displayParentId);
    expanded.add(id);

    const groups = new Map();
    (childrenByParent.get(id) || []).forEach(childId => {
      const otherParent = state.people[childId]?.parents.find(parentId => parentId !== id && datedIds.has(parentId) && state.people[id].spouses.includes(parentId)) || '';
      const partnerId = otherParent;
      if (!groups.has(partnerId)) groups.set(partnerId, []);
      groups.get(partnerId).push(childId);
    });
    const orderedGroups = [...groups.entries()].map(([partnerId, childIds]) => ({
      partnerId,
      childIds: childIds.sort(byBirth),
      firstBirth: Math.min(...childIds.map(childId => birthYear(state.people[childId])))
    })).sort((a, b) => a.firstBirth - b.firstBirth || byBirth(a.partnerId || a.childIds[0], b.partnerId || b.childIds[0]));

    const groupedPartners = new Set();
    orderedGroups.forEach(group => {
      const pendingChildren = group.childIds.filter(childId => !expanded.has(childId));
      if (!pendingChildren.length) return;
      let householdParentId = id;
      if (group.partnerId) {
        groupedPartners.add(group.partnerId);
        const partnerWasPlaced = placed.has(group.partnerId);
        place(group.partnerId, true, id);
        if (!partnerWasPlaced) householdParentId = group.partnerId;
      }
      pendingChildren.forEach(childId => visit(childId, householdParentId));
    });

    state.people[id].spouses
      .filter(partnerId => datedIds.has(partnerId) && !groupedPartners.has(partnerId))
      .sort(byBirth)
      .forEach(partnerId => place(partnerId, true, id));
  }
  roots.forEach(visit);
  people.map(person => person.id).sort(byBirth).forEach(visit);

  const familyKey = parentIds => [...parentIds].sort().join('|');
  const families = new Map();
  people.forEach(child => {
    const parentIds = child.parents.filter(id => datedIds.has(id));
    if (!parentIds.length) return;
    const key = familyKey(parentIds);
    if (!families.has(key)) families.set(key, { parents: parentIds, children: [] });
    families.get(key).children.push(child.id);
  });
  people.forEach(person => person.spouses.forEach(partnerId => {
    if (person.id >= partnerId || !datedIds.has(partnerId)) return;
    const key = familyKey([person.id, partnerId]);
    if (!families.has(key)) families.set(key, { parents: [person.id, partnerId], children: [] });
  }));

  // A spouse who is also descended from the active root already has a natal
  // position in the tree. Treat that second appearance as a transported branch,
  // matching the mini-program's cousin-marriage convention.
  const descendantsOfRoot = new Set();
  const descendantQueue = state.people[state.rootId] ? [state.rootId] : [];
  while (descendantQueue.length) {
    const id = descendantQueue.shift();
    if (descendantsOfRoot.has(id)) continue;
    descendantsOfRoot.add(id);
    descendantQueue.push(...(state.people[id]?.children || []));
  }
  const transportedParent = parentIds => {
    if (parentIds.length !== 2 || !parentIds.every(id => descendantsOfRoot.has(id))) return '';
    return parentIds.find(id => state.people[id]?.gender === 'female') || parentIds[1];
  };
  const marriageIsDivorced = parentIds => parentIds.some(id =>
    parentIds.some(other => other !== id && state.people[id]?.divorcedSpouses?.includes(other))
  );

  const estimateTextWidth = text => Array.from(String(text || '')).reduce((sum, char) => sum + (/[^\x00-\x7F]/.test(char) ? 13 : 7), 0);
  const layoutNodes = order.map((id, index) => {
    const person = state.people[id];
    const lifespanWidth = Math.max(2, (endYear(person) - birthYear(person)) * yearWidth);
    const labelWidth = 48 + estimateTextWidth(fullName(person)) + 12 + estimateTextWidth(life(person)) + 18;
    return { id, x: xForYear(birthYear(person)), y: index * rowStep, occupancyWidth: Math.max(lifespanWidth, labelWidth), isSpouse: spouseIds.has(id) };
  });
  compactTimelineTidyContours(layoutNodes, displayParentById, rowHeight, rowStep);
  stabilizeTimelineOrder(layoutNodes, rowHeight, rowStep);

  const width = Math.max(900, xForYear(maxYear) + 42);
  const height = Math.max(560, top + Math.max(...layoutNodes.map(node => node.y)) + rowHeight + 38);
  canvas.setAttribute('width', width); canvas.setAttribute('height', height); canvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
  ruler.toggleAttribute('hidden', false);
  ruler.setAttribute('width', width); ruler.setAttribute('height', 43); ruler.setAttribute('viewBox', `0 0 ${width} 43`);
  ruler.style.transform = `scaleX(${state.zoom})`;
  const positions = new Map(layoutNodes.map(node => [node.id, { x: node.x, y: top + node.y }]));

  const rulerMarks = svg('g');
  rulerMarks.append(svg('rect', { x: 0, y: 0, width, height: 43, class: 'ruler-band' }));
  for (let year = minYear; year <= maxYear; year += 5) {
    const x = xForYear(year);
    const isMajor = year % 20 === 0;
    const isDecade = year % 10 === 0;
    rulerMarks.append(svg('line', { x1: x, y1: isMajor ? 29 : isDecade ? 33 : 36, x2: x, y2: 43, class: `year-tick ${isMajor ? 'major' : isDecade ? 'decade' : 'minor'}` }));
    if (isDecade) rulerMarks.append(svg('text', { x, y: 22, 'text-anchor': 'middle', class: isMajor ? 'major-label' : 'decade-label' }, String(year)));
  }
  rulerMarks.append(svg('line', { x1: left, y1: 43, x2: xForYear(maxYear), y2: 43, class: 'ruler-line' }));
  ruler.append(rulerMarks);

  const globalEvents = svg('g', { class: 'global-events' });
  state.globalEvents.forEach(event => {
    const rawStartYear = numericYear(event.startYear);
    const rawEndYear = numericYear(event.endYear) ?? rawStartYear;
    if (rawStartYear == null || rawEndYear < minYear || rawStartYear > maxYear) return;
    const startYear = Math.max(minYear, rawStartYear);
    const endYear = Math.min(maxYear, rawEndYear);
    const x = xForYear(startYear);
    const eventWidth = Math.max(2, (Math.max(startYear, endYear) - startYear) * yearWidth);
    const color = paletteColor(event.color, DEFAULT_GLOBAL_EVENT_COLOR);
    const band = svg('rect', { class: 'global-event-range', x, y: 43, width: eventWidth, height: height - 61, fill: color, 'fill-opacity': '.13' });
    band.append(svg('title', {}, `${event.name} · ${formatEventYearRange(event.startYear, event.endYear)}`));
    globalEvents.append(band);
    globalEvents.append(svg('line', { class: 'global-event-edge', x1: x, y1: 43, x2: x, y2: height - 18, stroke: color }));
    if (eventWidth > 2) globalEvents.append(svg('line', { class: 'global-event-edge', x1: x + eventWidth, y1: 43, x2: x + eventWidth, y2: height - 18, stroke: color }));
    globalEvents.append(svg('text', { class: 'global-event-label', x: x + 4, y: 56, fill: color }, event.name));
  });
  canvas.append(globalEvents);

  const connectors = svg('g', { class: 'timeline-connectors' });
  const marriageOverlaysByParent = new Map();
  families.forEach(family => {
    const parentIds = family.parents.filter(id => positions.has(id));
    const childIds = family.children.filter(id => positions.has(id));
    if (!parentIds.length || (!childIds.length && parentIds.length < 2)) return;
    const recordedMarriageYear = parentIds.map(id => parentIds.map(other => state.people[id]?.marriageYears?.[other])).flat().map(numericYear).find(year => year != null);
    const fallbackYear = childIds.length
      ? Math.min(...childIds.map(id => birthYear(state.people[id]))) - 4.5
      : Math.max(...parentIds.map(id => birthYear(state.people[id]))) + 20;
    const junctionYear = recordedMarriageYear ?? fallbackYear;
    const trunkX = xForYear(junctionYear);
    const parentYs = parentIds.map(id => positions.get(id).y + rowHeight / 2);
    const childYs = childIds.map(id => positions.get(id).y + rowHeight / 2);
    const hasPaternalParent = parentIds.some(id => state.people[id]?.gender === 'male');
    const stemClass = hasPaternalParent ? 'paternal' : 'maternal';
    const transportedId = transportedParent(parentIds);
    const isDivorced = marriageIsDivorced(parentIds);
    const marriageClass = transportedId ? 'transport' : isDivorced ? 'divorced' : stemClass;
    parentIds.forEach(id => {
      const pos = positions.get(id);
      const lineage = state.people[id]?.gender === 'male' ? 'paternal' : 'maternal';
      connectors.append(svg('path', { d: `M ${pos.x + 24} ${pos.y + rowHeight / 2} H ${trunkX}`, class: `timeline-edge horizontal ${lineage}` }));
    });
    if (parentYs.length > 1 && Math.max(...parentYs) > Math.min(...parentYs)) {
      const marriageLine = svg('line', { x1: trunkX, y1: Math.min(...parentYs), x2: trunkX, y2: Math.max(...parentYs), class: `timeline-edge family-stem vertical ${marriageClass}`, 'data-marriage-year': recordedMarriageYear || '' });
      if (transportedId) marriageLine.append(svg('title', {}, `${fullName(state.people[transportedId])} transported from their birth branch to this marriage`));
      else if (isDivorced) marriageLine.append(svg('title', {}, `Divorced marriage: ${parentIds.map(id => fullName(state.people[id])).join(' and ')}`));
      connectors.append(marriageLine);
    }
    // The continuous stem stays behind the whole tree. Repaint only the two
    // short sections that cross the married profiles when the year is known.
    if (recordedMarriageYear != null && parentIds.length === 2) {
      parentIds.forEach(parentId => {
        if (!marriageOverlaysByParent.has(parentId)) marriageOverlaysByParent.set(parentId, []);
        marriageOverlaysByParent.get(parentId).push({
          x: trunkX,
          year: recordedMarriageYear,
          className: marriageClass,
          title: `Married ${fullName(state.people[parentIds.find(id => id !== parentId)])} in ${recordedMarriageYear}`
        });
      });
    }
    const familyBaseY = parentYs.length > 1 ? Math.max(...parentYs) : parentYs[0];
    if (childYs.length) {
      const descendantYs = [familyBaseY, ...childYs];
      if (Math.max(...descendantYs) > Math.min(...descendantYs)) {
        connectors.append(svg('line', { x1: trunkX, y1: Math.min(...descendantYs), x2: trunkX, y2: Math.max(...descendantYs), class: `timeline-edge family-stem vertical ${stemClass}` }));
      }
    }
    childIds.forEach(id => {
      const pos = positions.get(id);
      connectors.append(svg('path', { d: `M ${trunkX} ${pos.y + rowHeight / 2} H ${pos.x + 1}`, class: `timeline-edge horizontal ${stemClass}` }));
    });
    if (recordedMarriageYear) {
      const markerY = parentYs.length > 1 ? (Math.min(...parentYs) + Math.max(...parentYs)) / 2 : parentYs[0];
      connectors.append(svg('rect', { x: trunkX - 3, y: markerY - 3, width: 6, height: 6, transform: `rotate(45 ${trunkX} ${markerY})`, class: 'marriage-marker' }));
      connectors.append(svg('title', {}, `Married ${recordedMarriageYear}`));
    }
  });
  canvas.append(connectors);

  const nodeDefs = svg('defs');
  canvas.append(nodeDefs);

  order.forEach((id, nodeIndex) => {
    const person = state.people[id];
    const pos = positions.get(id);
    const lifespanWidth = Math.max(2, (endYear(person) - birthYear(person)) * yearWidth);
    const hasReign = reignEvents(person).length > 0;
    const isSpouseNode = spouseIds.has(id);
    const group = svg('g', { class: `timeline-node ${person.gender} ${isSpouseNode ? 'spouse' : ''} ${hasReign ? 'reigned' : ''} ${id === state.selectedId ? 'selected' : ''}`, transform: `translate(${pos.x} ${pos.y})`, tabindex: '0', role: 'button', 'aria-label': `${fullName(person)}, ${life(person)}${isSpouseNode ? ', spouse' : ''}${hasReign ? ', reigning monarch' : ''}` });
    group.append(svg('title', {}, `${fullName(person)} · ${life(person)}`));
    group.append(svg('rect', { class: 'lifespan', x: 0, y: 0, width: lifespanWidth, height: rowHeight, rx: 5, ry: 5 }));
    const eventClipId = `node-events-${nodeIndex}`;
    const eventClip = svg('clipPath', { id: eventClipId, clipPathUnits: 'userSpaceOnUse' });
    eventClip.append(svg('rect', { x: 0, y: 0, width: lifespanWidth, height: rowHeight, rx: 5, ry: 5 }));
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
        const mark = svg('rect', { class: 'personal-event-range', x: eventX, y: 0, width: eventWidth, height: rowHeight, fill: eventColor });
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
    group.append(svg('rect', { class: 'lifespan-outline', x: 0, y: 0, width: lifespanWidth, height: rowHeight, rx: 5, ry: 5 }));
    group.append(personalEventLayer);
    // Marriage stems cross above both spouse boxes, including their borders,
    // so each stem reads as one uninterrupted line down to its children. Text
    // and controls are painted afterward to remain legible and interactive.
    (marriageOverlaysByParent.get(id) || []).forEach(marriage => {
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
    const hasChildren = person.children.some(childId => state.people[childId]);
    const isCollapsed = state.collapsedIds.has(id);
    const icon = isSpouseNode
      ? svg('g', { class: 'timeline-marriage-link', role: 'img', 'aria-label': 'Marriage link' })
      : svg('g', { class: `timeline-expander ${hasChildren ? (isCollapsed ? 'collapsed' : 'expanded') : 'leaf'}`, role: hasChildren ? 'button' : 'img', tabindex: hasChildren ? '0' : '-1', 'aria-label': hasChildren ? `${isCollapsed ? 'Expand' : 'Collapse'} descendants of ${fullName(person)}` : 'No descendants' });
    if (isSpouseNode) icon.append(svg('text', { class: 'marriage-symbol', x: 24, y: 19 }, '⚭'));
    else {
      icon.append(svg('rect', { class: 'expander-box', x: 15, y: 9, width: 18, height: 18, rx: 3 }));
      if (hasChildren) icon.append(svg('text', { class: 'node-symbol', x: 24, y: 18 }, isCollapsed ? '+' : '−'));
    }
    const toggleBranch = event => {
      event.stopPropagation();
      if (isCollapsed) state.collapsedIds.delete(id); else state.collapsedIds.add(id);
      render();
    };
    if (hasChildren && !isSpouseNode) {
      icon.addEventListener('click', toggleBranch);
      icon.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') toggleBranch(event); });
    }
    group.append(icon);
    const textMaskId = `node-text-outside-${nodeIndex}`;
    const textMask = svg('mask', { id: textMaskId, maskUnits: 'userSpaceOnUse', x: -80, y: -12, width: Math.max(lifespanWidth, layoutNodes[nodeIndex].occupancyWidth) + 180, height: rowHeight + 24 });
    textMask.append(svg('rect', { x: -80, y: -12, width: Math.max(lifespanWidth, layoutNodes[nodeIndex].occupancyWidth) + 180, height: rowHeight + 24, fill: '#fff' }));
    textMask.append(svg('rect', { x: 0, y: 0, width: lifespanWidth, height: rowHeight, rx: 5, ry: 5, fill: '#000' }));
    nodeDefs.append(textMask);
    const makeLabel = className => {
      const text = svg('text', { class: className, x: 48, y: 19 });
      text.append(svg('tspan', { class: 'timeline-name' }, fullName(person)));
      text.append(svg('tspan', { class: 'timeline-life-label', dx: 8 }, life(person)));
      return text;
    };
    const halo = makeLabel('timeline-label timeline-label-halo');
    halo.setAttribute('mask', `url(#${textMaskId})`);
    group.append(halo);
    const label = makeLabel('timeline-label');
    group.append(label);
    if (person.isLiving) group.append(svg('line', { class: 'current-year-edge', x1: lifespanWidth, y1: 0, x2: lifespanWidth, y2: rowHeight }));
    group.addEventListener('click', () => selectPerson(id));
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') selectPerson(id); });
    canvas.append(group);
  });
  canvas.style.transform = `scale(${state.zoom})`;
}
function escapeHtml(value) {
  const node = document.createElement('span'); node.textContent = value; return node.innerHTML;
}

function selectPerson(id) { state.selectedId = id; render(); }
function renderPersonList() {
  const keywords = clean(els['tree-filter'].value).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const people = Object.values(state.people).filter(person => !keywords.length || keywords.some(keyword => matchesKeyword(person, keyword)));
  people.sort((a, b) => fullName(a).localeCompare(fullName(b)));
  els['people-count'].textContent = people.length;
  els['people-label'].textContent = keywords.length ? (people.length === 1 ? 'match' : 'matches') : (people.length === 1 ? 'profile' : 'profiles');
  els['people-list'].replaceChildren(...people.map(person => {
    const button = document.createElement('button');
    const source = sourceMeta(person);
    button.type = 'button'; button.className = `person-list-item${person.id === state.selectedId ? ' active' : ''}`; button.dataset.gender = person.gender;
    button.innerHTML = `<span class="mini-avatar">${escapeHtml(initials(person))}</span><span><strong>${escapeHtml(fullName(person))}</strong><small>${escapeHtml(life(person))}</small></span>${person.sourceUrl ? `<span class="source-tick" title="${escapeHtml(source.name)}">${escapeHtml(source.mark)}</span>` : ''}`;
    button.addEventListener('click', () => selectPerson(person.id));
    return button;
  }));
}

function styleEventColorSelect(select) {
  select.style.setProperty('--event-color', paletteColor(select.value, DEFAULT_PERSONAL_EVENT_COLOR));
}

function eventColorSelect(value, label, onColor, fallback) {
  const select = document.createElement('select');
  select.className = 'event-color-select';
  EVENT_COLOR_PALETTE.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  });
  select.value = paletteColor(value, fallback);
  select.setAttribute('aria-label', label);
  styleEventColorSelect(select);
  select.addEventListener('change', () => {
    styleEventColorSelect(select);
    onColor(select.value);
  });
  return select;
}

function setSharedReignColor(value) {
  state.reignColor = paletteColor(value, DEFAULT_REIGN_EVENT_COLOR);
  Object.values(state.people).forEach(person => person.personalEvents.forEach(event => {
    if (isReignLabel(event.name)) event.color = state.reignColor;
  }));
  persist('Shared reign colour saved');
  render();
}

function eventEditorRow(event, onColor, onDelete, fallback = DEFAULT_PERSONAL_EVENT_COLOR) {
  const row = document.createElement('div');
  row.className = 'event-editor-row';
  const name = document.createElement('strong');
  name.textContent = event.name;
  const years = document.createElement('small');
  years.textContent = formatEventYearRange(event.startYear, event.endYear);
  const color = eventColorSelect(isReignLabel(event.name) ? state.reignColor : event.color, `Colour for ${event.name}`, onColor, fallback);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'event-delete';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `Delete ${event.name}`);
  remove.addEventListener('click', onDelete);
  row.append(name, years, color, remove);
  return row;
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
  list.replaceChildren(...person.personalEvents.map((event, index) => eventEditorRow(event, value => {
    if (isReignLabel(event.name)) return setSharedReignColor(value);
    person.personalEvents[index].color = paletteColor(value, DEFAULT_PERSONAL_EVENT_COLOR);
    persist('Event colour saved');
    render();
  }, () => {
    person.personalEvents.splice(index, 1);
    persist('Personal event deleted');
    render();
  })));
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
  list.replaceChildren(...state.globalEvents.map((event, index) => eventEditorRow(event, value => {
    state.globalEvents[index].color = paletteColor(value, DEFAULT_GLOBAL_EVENT_COLOR);
    persist('Global event colour saved');
    render();
  }, () => {
    state.globalEvents.splice(index, 1);
    persist('Global event deleted');
    render();
  }, DEFAULT_GLOBAL_EVENT_COLOR)));
}

function renderDetails() {
  const person = state.people[state.selectedId];
  const isOpen = !!person;
  els['detail-sidebar'].classList.toggle('open', isOpen);
  els['detail-sidebar'].setAttribute('aria-hidden', String(!isOpen));
  els['detail-sidebar'].inert = !isOpen;
  els['detail-empty'].hidden = !!person;
  els['person-form'].hidden = !person;
  if (!person) return;
  els['person-heading'].textContent = fullName(person);
  els['person-life'].textContent = life(person);
  els['person-avatar'].textContent = initials(person);
  els['person-avatar'].style.background = '#fff';
  const form = els['person-form'];
  ['firstName', 'lastName', 'birthYear', 'deathYear', 'gender', 'place', 'note', 'sourceUrl'].forEach(name => { form.elements[name].value = person[name] || ''; });
  const sourceLink = els['person-source-link'];
  const source = sourceMeta(person);
  els['person-source-name'].textContent = source.name;
  els['person-source-mark'].textContent = source.mark;
  if (person.sourceUrl) sourceLink.href = person.sourceUrl;
  else sourceLink.removeAttribute('href');
  sourceLink.textContent = person.sourceUrl ? 'Open original profile ↗' : 'No profile linked';
  els['source-updated'].textContent = person.importedAt ? `Imported ${new Date(person.importedAt).toLocaleString()}.` : 'Add a source URL to preserve attribution.';
  renderPersonalEvents(person);
  const isGeniProfile = person.sourceProvider === 'geni' && /^profile-/i.test(person.id);
  els['geni-family-actions'].hidden = !isGeniProfile;
  if (isGeniProfile) {
    const complete = person.geniImmediateFamilyLoaded === true;
    els['geni-family-status'].textContent = complete
      ? 'The complete public immediate family has been imported. You can now add a local relative to this profile.'
      : 'Load this profile’s complete public immediate family before adding local relatives.';
    els['load-immediate-family'].textContent = complete ? 'Refresh complete immediate family' : 'Load complete immediate family';
    els['add-local-relative'].disabled = !complete;
  }
}
function renderParentOptions() {
  const options = ['<option value="">No parent selected</option>', ...Object.values(state.people).sort((a,b) => fullName(a).localeCompare(fullName(b))).map(person => `<option value="${escapeHtml(person.id)}">${escapeHtml(fullName(person))}</option>`)].join('');
  els['parent-select'].innerHTML = options;
}
function render() {
  const count = Object.keys(state.people).length;
  els['tree-title'].textContent = state.title;
  els['people-count'].textContent = count;
  els['people-label'].textContent = count === 1 ? 'profile' : 'profiles';
  els['empty-state'].hidden = count > 0;
  // SVG elements do not implement HTMLElement.hidden consistently; toggle the attribute explicitly.
  els['timeline-canvas'].toggleAttribute('hidden', !count);
  els['timeline-ruler'].toggleAttribute('hidden', !count);
  renderPersonList(); renderTimeline(); renderDetails(); renderParentOptions(); renderGlobalEventsEditor();
}

els['source-form'].addEventListener('submit', async event => {
  event.preventDefault();
  els['source-download-link'].hidden = true;
  const submit = event.submitter; if (submit) submit.disabled = true;
  toast('Requesting this profile from its official public API…', true);
  try { await importFromSource(els['source-input'].value, els['source-provider'].value, els['source-depth'].value); els['source-input'].value = ''; }
  catch (error) {
    toast(`${error.message} GitHub Pages cannot proxy restricted requests; use an official export when direct access is unavailable.`, true);
  } finally { if (submit) submit.disabled = false; }
});
els['import-file-button'].addEventListener('click', () => els['file-input'].click());
els['empty-file-button'].addEventListener('click', () => els['file-input'].click());
els['file-input'].addEventListener('change', async () => {
  try {
    const file = els['file-input'].files[0];
    if (file) {
      const text = await file.text();
      if (/\.(ged|gedcom)$/i.test(file.name) || /^0\s+HEAD\b/m.test(text)) importGedcom(text, file.name);
      else importBackup(JSON.parse(text));
    }
  }
  catch (error) { toast(error.message || 'Could not read that backup.', true); }
  els['file-input'].value = '';
});
els['export-button'].addEventListener('click', exportBackup);
els['global-events-button'].addEventListener('click', () => {
  els['timeline-scale'].value = String(state.timelineYearWidth);
  renderGlobalEventsEditor();
  els['events-dialog'].showModal();
});
els['close-events-dialog'].addEventListener('click', () => els['events-dialog'].close());
els['timeline-scale'].addEventListener('change', () => {
  state.timelineYearWidth = timelineYearWidth(els['timeline-scale'].value);
  persist('Timeline scale updated');
  render();
});
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
  if (parent?.sourceProvider === 'geni' && !parent.geniImmediateFamilyLoaded) {
    toast('Load this Geni profile’s complete immediate family before adding a local relative.', true);
    return;
  }
  els['add-dialog'].showModal();
  els['parent-select'].value = parent ? parent.id : '';
}
els['empty-add-person-button'].addEventListener('click', () => openAddPersonDialog());
els['royal-example-button'].addEventListener('click', () => {
  if (Object.keys(state.people).length && !window.confirm('Replace the current local tree with the British royal example? Export first if you want to keep it.')) return;
  loadBritishRoyalExample();
});
els['tree-filter'].addEventListener('input', render);
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
  if (event.button !== 0 || event.target.closest('.timeline-node, button, input, select, textarea, a')) return;
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

els['close-detail'].addEventListener('click', () => { state.selectedId = ''; render(); });
els['load-immediate-family'].addEventListener('click', async () => {
  try { await loadGeniImmediateFamily(state.selectedId); }
  catch (error) { toast(error.message || 'Could not load this Geni family.', true); render(); }
});
els['add-local-relative'].addEventListener('click', () => openAddPersonDialog(state.selectedId));
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
    state.selectedId = '';
    render();
  }
});
els['person-form'].addEventListener('submit', event => {
  event.preventDefault(); const person = state.people[state.selectedId]; if (!person) return;
  const data = new FormData(event.currentTarget);
  ['firstName', 'lastName', 'birthYear', 'deathYear', 'place', 'note'].forEach(name => { person[name] = clean(data.get(name)); });
  person.nameOrder = 'western';
  person.gender = ['male', 'female'].includes(data.get('gender')) ? data.get('gender') : 'unknown';
  person.sourceUrl = validPublicUrl(data.get('sourceUrl'));
  if (clean(data.get('sourceUrl')) && !person.sourceUrl) return toast('Source URL must be a valid public http(s) address.', true);
  person.sourceProvider = sourceProviderFromUrl(person.sourceUrl) || person.sourceProvider;
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
  const person = normalizePerson({ id, ...Object.fromEntries(data.entries()) }, id);
  const parentId = clean(data.get('parentId'));
  if (parentId && state.people[parentId]) { person.parents = [parentId]; state.people[parentId].children = unique([...state.people[parentId].children, id]); }
  state.people[id] = person; state.rootId = state.rootId || id; state.selectedId = id;
  els['add-dialog'].close(); event.currentTarget.reset(); persist('Profile added'); render();
});

els['personal-event-color'].value = DEFAULT_PERSONAL_EVENT_COLOR;
els['global-event-color'].value = DEFAULT_GLOBAL_EVENT_COLOR;
[els['personal-event-color'], els['global-event-color']].forEach(select => {
  styleEventColorSelect(select);
  select.addEventListener('change', () => styleEventColorSelect(select));
});
let personalColorForReign = false;
els['personal-event-name'].addEventListener('input', () => {
  const nextIsReign = isReignLabel(els['personal-event-name'].value);
  if (nextIsReign === personalColorForReign) return;
  personalColorForReign = nextIsReign;
  els['personal-event-color'].value = nextIsReign ? state.reignColor : DEFAULT_PERSONAL_EVENT_COLOR;
  styleEventColorSelect(els['personal-event-color']);
});

restore();
if (!Object.keys(state.people).length) loadBritishRoyalExample({ persistResult: true });
else if (upgradeBundledBritishRoyalLine()) persist('Bundled royal spouses updated');
render();
const pendingGeniIntent = sessionValue(GENI_IMPORT_INTENT_KEY);
if (initialGeniAccessToken && pendingGeniIntent.startsWith('immediate-family:')) {
  sessionValue(GENI_IMPORT_INTENT_KEY, null);
  const profileId = pendingGeniIntent.slice('immediate-family:'.length);
  state.selectedId = state.people[profileId] ? profileId : '';
  render();
  loadGeniImmediateFamily(profileId).catch(error => {
    toast(error.message || 'Could not load this Geni family.', true);
    render();
  });
}
