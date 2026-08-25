const STORAGE_KEY = 'lineage-web-v1';
const LEGACY_STORAGE_KEY = 'jiapu-web-v1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const HENRY_VII_GENI_URL = 'https://www.geni.com/people/Henry-VII-King-of-England/6000000003760873898';
const oauthFragment = new URLSearchParams(location.hash.replace(/^#/, ''));
const initialGeniAccessToken = clean(oauthFragment.get('access_token'));
if (initialGeniAccessToken) history.replaceState(null, '', `${location.pathname}${location.search}`);

const state = {
  title: 'Untitled family',
  people: {},
  selectedId: '',
  rootId: '',
  zoom: 1,
  ephemeral: false,
  geniAccessToken: initialGeniAccessToken,
  collapsedIds: new Set()
};

const els = Object.fromEntries([
  'tree-title', 'import-file-button', 'export-button', 'file-input', 'source-form', 'source-provider', 'source-input', 'source-depth',
  'people-count', 'people-label', 'people-list', 'add-person-button', 'canvas-viewport',
  'empty-state', 'timeline-ruler', 'timeline-canvas', 'empty-geni-button', 'empty-file-button',
  'detail-empty', 'person-form', 'person-heading', 'person-life', 'person-avatar',
  'person-source-link', 'person-source-name', 'person-source-mark', 'source-updated', 'close-detail', 'delete-person', 'add-dialog',
  'add-form', 'parent-select', 'toast', 'save-status', 'source-download-link', 'tree-filter', 'royal-example-button'
].map(id => [id, document.getElementById(id)]));

function clean(value) { return value == null ? '' : String(value).trim(); }
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
  return `${start} – ${end}`;
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
    return { name, startYear, endYear: endYear ?? startYear, source: clean(event?.source || '') };
  }).filter(event => event.name && event.startYear != null);
  return [...new Map(normalized.map(event => [`${event.name.toLocaleLowerCase()}|${event.startYear}|${event.endYear}`, event])).values()];
}

function isReignLabel(value) {
  return /^reign$/i.test(clean(value));
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
  const id = clean(source.id || fallbackId) || `local-${crypto.randomUUID()}`;
  const birth = source.birth || {};
  const death = source.death || {};
  const sourceUrl = validPublicUrl(source.sourceUrl || source.profile_url || source.profileUrl || '');
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
    partners: uniqueRefs(source.partners || source.spouses),
    marriageYears: Object.fromEntries(Object.entries(source.marriageYears || {}).map(([partnerId, year]) => [refId(partnerId), clean(year)]).filter(([partnerId, year]) => partnerId && numericYear(year) != null)),
    personalEvents: normalizePersonalEvents([...(Array.isArray(source.personalEvents) ? source.personalEvents : []), ...extractGeniReignFacts(source)]),
    sourceUrl,
    sourceId: clean(source.sourceId || (/^profile-/i.test(id) ? id : '')),
    sourceProvider: clean(source.sourceProvider || source.provenance?.provider || sourceProviderFromUrl(sourceUrl)),
    importedAt: clean(source.importedAt || source.provenance?.importedAt)
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
    ['augusta-cambridge', 'Augusta', 'of Cambridge', '1822', '1916', 'female', 'Grand Duchess of Mecklenburg-Strelitz', historyUrl],
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
  const people = {};
  const displayNameOverrides = { 'henry-vii': 'Henry VII, King of England' };
  rows.forEach(([slug, firstName, lastName, birthYear, deathYear, gender, note, sourceUrl]) => {
    const id = `royal-${slug}`;
    const baseName = [firstName, lastName].filter(Boolean).join(' ');
    const royalTitle = clean(note).match(/\b(?:King|Queen)(?:\s+consort)?\s+of\s+[^;,]+/i)?.[0] || '';
    const displayName = displayNameOverrides[slug] || (royalTitle && !/\b(?:king|queen)\b/i.test(baseName) ? `${baseName}, ${royalTitle}` : baseName);
    people[id] = normalizePerson({
      id, firstName, lastName, displayName, title: royalTitle, birthYear, deathYear, gender, note,
      nameOrder: 'western', isLiving: slug === 'charles-iii', place: '',
      sourceUrl, sourceProvider: 'royal', sourceId: slug
    }, id);
  });
  const id = slug => `royal-${slug}`;
  const parentLinks = {
    'arthur-tudor': ['henry-vii', 'elizabeth-york'], 'henry-viii': ['henry-vii', 'elizabeth-york'],
    'margaret-tudor': ['henry-vii', 'elizabeth-york'], 'mary-tudor': ['henry-vii', 'elizabeth-york'],
    'mary-i': ['henry-viii'], 'elizabeth-i': ['henry-viii'], 'edward-vi': ['henry-viii'],
    'frances-brandon': ['mary-tudor'], 'jane-grey': ['frances-brandon'],
    'james-v': ['james-iv', 'margaret-tudor'], 'mary-scots': ['james-v'],
    'james-vi-i': ['darnley', 'mary-scots'], 'charles-i': ['james-vi-i'], 'elizabeth-stuart': ['james-vi-i'],
    'charles-ii': ['charles-i'], 'james-ii-vii': ['charles-i'], 'mary-princess-royal': ['charles-i'],
    'william-iii': ['mary-princess-royal'], 'mary-ii': ['james-ii-vii'], 'anne': ['james-ii-vii'],
    'sophia-hanover': ['frederick-v', 'elizabeth-stuart'], 'george-i': ['ernest-augustus', 'sophia-hanover'],
    'george-ii': ['george-i'], 'frederick-wales': ['george-ii'], 'george-iii': ['frederick-wales'],
    'george-iv': ['george-iii'], 'william-iv': ['george-iii'], 'edward-kent': ['george-iii'],
    'ernest-cumberland': ['george-iii'], 'adolphus-cambridge': ['george-iii'], 'augusta-cambridge': ['adolphus-cambridge'],
    'mary-teck': ['augusta-cambridge'], 'victoria': ['edward-kent'],
    'victoria-royal': ['albert', 'victoria'], 'edward-vii': ['albert', 'victoria'], 'alice-uk': ['albert', 'victoria'],
    'alfred-saxe': ['albert', 'victoria'], 'helena-uk': ['albert', 'victoria'], 'louise-uk': ['albert', 'victoria'],
    'arthur-connaught': ['albert', 'victoria'], 'leopold-albany': ['albert', 'victoria'], 'beatrice-uk': ['albert', 'victoria'],
    'victoria-hesse': ['alice-uk'], 'alice-battenberg': ['victoria-hesse'], 'philip': ['alice-battenberg'],
    'george-v': ['edward-vii'], 'maud-norway': ['edward-vii'], 'olav-v': ['maud-norway'], 'harald-v': ['olav-v'],
    'edward-viii': ['george-v', 'mary-teck'], 'george-vi': ['george-v', 'mary-teck'],
    'elizabeth-ii': ['george-vi'], 'margaret-snowdon': ['george-vi'],
    'charles-iii': ['philip', 'elizabeth-ii'], 'anne-royal': ['philip', 'elizabeth-ii'],
    'andrew-york': ['philip', 'elizabeth-ii'], 'edward-edinburgh': ['philip', 'elizabeth-ii'],
    'william-wales': ['charles-iii'], 'harry-sussex': ['charles-iii'],
    'george-wales': ['william-wales'], 'charlotte-wales': ['william-wales'], 'louis-wales': ['william-wales']
  };
  Object.entries(parentLinks).forEach(([childSlug, parentSlugs]) => {
    const childId = id(childSlug);
    people[childId].parents = parentSlugs.map(id);
    parentSlugs.forEach(parentSlug => { people[id(parentSlug)].children = unique([...people[id(parentSlug)].children, childId]); });
  });
  [['henry-vii','elizabeth-york','1486'], ['james-iv','margaret-tudor','1503'], ['darnley','mary-scots','1565'],
   ['william-iii','mary-ii','1677'], ['frederick-v','elizabeth-stuart','1613'], ['ernest-augustus','sophia-hanover','1658'],
   ['albert','victoria','1840'], ['george-v','mary-teck','1893'], ['philip','elizabeth-ii','1947']].forEach(([a, b, marriageYear]) => {
    people[id(a)].partners = unique([...people[id(a)].partners, id(b)]);
    people[id(b)].partners = unique([...people[id(b)].partners, id(a)]);
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
    people[id(slug)].personalEvents = events.map(([name, startYear, endYear]) => ({ name, startYear, endYear, source: 'royal' }));
  });
  return people;
}

async function loadBritishRoyalExample() {
  const button = els['royal-example-button'];
  button.disabled = true;
  button.textContent = '♔ Growing latest Geni tree…';
  state.people = {};
  state.rootId = '';
  state.selectedId = '';
  state.ephemeral = true;
  state.title = 'Descendants of Henry VII';
  els['tree-filter'].value = 'king queen';
  els['save-status'].textContent = 'Connecting to Geni · not saved';
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  render();
  if (!state.geniAccessToken) {
    const appId = clean(document.querySelector('meta[name="geni-app-id"]')?.content);
    if (!appId) {
      button.disabled = false;
      button.textContent = '♔ Reload latest Henry VII tree';
      throw new Error('Live Geni loading needs the public Geni application ID in the geni-app-id meta tag.');
    }
    const redirectUri = `${location.origin}${location.pathname}`;
    const authorize = new URL('https://www.geni.com/platform/oauth/authorize');
    authorize.searchParams.set('client_id', appId);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('response_type', 'token');
    location.assign(authorize.href);
    return;
  }
  try {
    await importFromGeni(HENRY_VII_GENI_URL, 14, {
      mode: 'descendants',
      persistResult: false,
      title: 'Descendants of Henry VII'
    });
  } catch (error) {
    els['save-status'].textContent = 'Geni authorization required · no cached data';
    throw error;
  } finally {
    button.disabled = false;
    button.textContent = '♔ Reload latest Henry VII tree';
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return;
    const savedRootId = clean(saved.rootId);
    const savedIds = Object.keys(saved.people || {});
    const isRoyalCache = savedRootId === 'royal-henry-vii'
      || (savedRootId === 'profile-6000000003760873898' && clean(saved.title) === 'Descendants of Henry VII')
      || (savedIds.length && savedIds.every(id => id.startsWith('royal-')));
    if (isRoyalCache) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }
    state.title = clean(saved.title) || state.title;
    state.rootId = savedRootId;
    Object.entries(saved.people || {}).forEach(([id, person]) => { state.people[id] = normalizePerson(person, id); });
  } catch { /* A malformed local cache should not prevent the app from opening. */ }
}
function persist(message = 'All changes saved locally') {
  if (state.ephemeral) {
    els['save-status'].textContent = message || 'Live Geni data · not saved';
    window.setTimeout(() => { els['save-status'].textContent = 'Live Geni data · not saved'; }, 1600);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: state.title, rootId: state.rootId, people: state.people }));
  els['save-status'].textContent = message;
  window.setTimeout(() => { els['save-status'].textContent = 'All changes saved locally'; }, 1600);
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
    partners.forEach(id => {
      profileMap[id].partners = unique([...(profileMap[id].partners || []), ...partners.filter(other => other !== id)]);
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
    const callbackName = `__lineageGeni${crypto.randomUUID().replace(/-/g, '')}`;
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
  merged.marriageYears = { ...incoming.marriageYears, ...existing.marriageYears };
  merged.personalEvents = normalizePersonalEvents([...incoming.personalEvents, ...existing.personalEvents]);
  merged.sourceUrl = incoming.sourceUrl || existing.sourceUrl;
  merged.sourceId = incoming.sourceId || existing.sourceId;
  merged.sourceProvider = incoming.sourceProvider || existing.sourceProvider;
  merged.importedAt = incoming.importedAt || existing.importedAt;
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
  Object.values(item.person.Children || {}).forEach(child => {
    const childId = `wikitree-${child.Id}`;
    if (imported[childId]) imported[childId].parents = [child.Father, child.Mother].filter(Boolean).map(value => `wikitree-${value}`);
  });
  Object.values(item.person.Spouses || {}).forEach(spouse => {
    const spouseId = `wikitree-${spouse.Id}`;
    if (imported[spouseId]) imported[spouseId].partners = unique([...imported[spouseId].partners, focusId]);
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
      if (marriageYear) parents.filter(id => id !== parentId).forEach(partnerId => { people[parentId].marriageYears[partnerId] = marriageYear; });
    });
    children.forEach(childId => { people[childId].parents = unique([...people[childId].parents, ...parents]); });
  });
  if (!Object.keys(people).length) throw new Error('No individual records were found in that GEDCOM file.');
  state.people = people;
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
    title: state.title, activeRootId: state.rootId, people: state.people,
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
  const ids = Object.keys(state.people);
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
    person.partners.forEach(partnerId => {
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

function compactTimelineBranchesBottomUp(nodes, lines, rowHeight, rowStep) {
  if (nodes.length < 2) return;
  const normalizeRow = row => Math.round(row * 1000) / 1000;
  const originalRows = nodes.map(node => normalizeRow(node.y / rowStep));
  const nodeRows = [...originalRows];
  const ranges = nodes.map(node => ({ left: node.x - 36, right: node.x + Math.max(node.occupancyWidth, 2) + 36 }));
  const overlaps = (a, b) => a.left < b.right && b.left < a.right;
  const rowsOverlap = (a, b) => Math.abs(a - b) * rowStep < rowHeight;
  const rowAtCenter = y => normalizeRow((y - rowHeight / 2) / rowStep);
  const lineRows = line => line.type === 'stem' ? [rowAtCenter(line.y), rowAtCenter(line.y + line.h)] : [rowAtCenter(line.y)];
  const currentRowMap = () => {
    const map = new Map();
    originalRows.forEach((row, index) => map.set(row, map.has(row) ? Math.min(map.get(row), nodeRows[index]) : nodeRows[index]));
    return map;
  };
  const lineRect = (line, map) => {
    const remap = y => {
      const row = rowAtCenter(y);
      return (map.has(row) ? map.get(row) : row) * rowStep + rowHeight / 2;
    };
    if (line.type === 'branch') {
      const y = remap(line.y);
      return { left: Math.min(line.x, line.x + line.w) - 3, right: Math.max(line.x, line.x + line.w) + 3, top: y - 3, bottom: y + 3 };
    }
    const y1 = remap(line.y), y2 = remap(line.y + line.h);
    return { left: line.x - 3, right: line.x + 3, top: Math.min(y1, y2) - 3, bottom: Math.max(y1, y2) + 3 };
  };
  const rectsOverlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const eligibleLines = lines.filter(line => !line.isDashed);
  const sorted = nodes.map((node, index) => ({ node, index, row: nodeRows[index] })).sort((a, b) => a.row - b.row || a.node.x - b.node.x);
  const blocks = [];
  sorted.forEach((item, order) => {
    if (item.node.isSpouse) return;
    const indexes = [item.index];
    for (let next = order + 1; next < sorted.length; next += 1) {
      const candidate = sorted[next].node;
      if (!candidate.isSpouse && candidate.x <= item.node.x) break;
      indexes.push(sorted[next].index);
    }
    const parent = [...sorted].slice(0, order).reverse().find(candidate => !candidate.node.isSpouse && candidate.node.x < item.node.x);
    blocks.push({ indexes, parentIndex: parent ? parent.index : -1, maxX: Math.max(...indexes.map(index => nodes[index].x)), startRow: nodeRows[item.index] });
  });
  const locked = new Set();
  blocks.sort((a, b) => b.maxX - a.maxX || b.startRow - a.startRow || b.indexes.length - a.indexes.length).forEach(block => {
    if (block.indexes.some(index => locked.has(index))) return;
    const contained = new Set(block.indexes);
    const parentRow = block.parentIndex >= 0 ? nodeRows[block.parentIndex] : -1;
    const canShift = delta => {
      const blockOriginalRows = new Set(block.indexes.map(index => originalRows[index]));
      const externalLines = eligibleLines.filter(line => !lineRows(line).some(row => blockOriginalRows.has(row)));
      const rowMap = currentRowMap();
      return block.indexes.every(index => {
        const targetRow = normalizeRow(nodeRows[index] + delta);
        if (targetRow <= parentRow || targetRow < 0) return false;
        for (let other = 0; other < nodes.length; other += 1) {
          if (contained.has(other) || !rowsOverlap(nodeRows[other], targetRow)) continue;
          if (overlaps(ranges[index], ranges[other])) return false;
        }
        const nodeRect = { left: ranges[index].left, right: ranges[index].right, top: targetRow * rowStep, bottom: targetRow * rowStep + rowHeight };
        return !externalLines.some(line => rectsOverlap(nodeRect, lineRect(line, rowMap)));
      });
    };
    let bestDelta = 0;
    for (let delta = -0.5; block.indexes.every(index => nodeRows[index] + delta > parentRow && nodeRows[index] + delta >= 0); delta -= 0.5) {
      if (canShift(delta)) bestDelta = delta;
    }
    if (!bestDelta) return;
    let chosen = 0;
    for (let delta = Math.min(0, bestDelta + 0.5); delta >= bestDelta; delta -= 0.5) {
      if (canShift(delta)) { chosen = delta; break; }
    }
    if (!chosen) return;
    block.indexes.forEach(index => { nodeRows[index] = normalizeRow(nodeRows[index] + chosen); locked.add(index); });
  });
  nodes.forEach((node, index) => { node.y = nodeRows[index] * rowStep; });
}

function compactTimelineRows(nodes, rowStep) {
  const normalizeRow = row => Math.round(row * 1000) / 1000;
  const rows = [...new Set(nodes.map(node => normalizeRow(node.y / rowStep)))].sort((a, b) => a - b);
  const map = new Map();
  let mapped = 0;
  rows.forEach((row, index) => {
    if (index) mapped = normalizeRow(mapped + Math.min(Math.max(0, row - rows[index - 1]), 1.5));
    map.set(row, mapped);
  });
  nodes.forEach(node => { node.y = map.get(normalizeRow(node.y / rowStep)) * rowStep; });
}

function stabilizeTimelineOrder(nodes, rowHeight, rowStep) {
  const ranges = nodes.map(node => ({ left: node.x - 36, right: node.x + Math.max(node.occupancyWidth, 2) + 36 }));
  const overlapsHorizontally = (a, b) => a.left < b.right && b.left < a.right;
  nodes.forEach((node, index) => {
    let targetY = index ? Math.max(node.y, nodes[index - 1].y + rowStep / 2) : Math.max(0, node.y);
    for (let previous = 0; previous < index; previous += 1) {
      if (!overlapsHorizontally(ranges[index], ranges[previous])) continue;
      if (targetY - nodes[previous].y < rowHeight) targetY = nodes[previous].y + rowHeight;
    }
    node.y = Math.round(targetY * 1000) / 1000;
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
      queue.push(...(state.people[childId]?.children || []), ...(state.people[childId]?.partners || []));
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
  const yearWidth = 6;
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
  function place(id, asSpouse = false) {
    if (!datedIds.has(id) || placed.has(id)) return;
    placed.add(id);
    if (asSpouse) spouseIds.add(id);
    order.push(id);
  }
  function visit(id) {
    if (!datedIds.has(id) || expanded.has(id)) return;
    place(id);
    expanded.add(id);

    const groups = new Map();
    (childrenByParent.get(id) || []).forEach(childId => {
      const otherParent = state.people[childId]?.parents.find(parentId => parentId !== id && datedIds.has(parentId)) || '';
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
      if (group.partnerId) {
        groupedPartners.add(group.partnerId);
        place(group.partnerId, true);
      }
      pendingChildren.forEach(visit);
    });

    state.people[id].partners
      .filter(partnerId => datedIds.has(partnerId) && !groupedPartners.has(partnerId))
      .sort(byBirth)
      .forEach(partnerId => place(partnerId, true));
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
  people.forEach(person => person.partners.forEach(partnerId => {
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

  const estimateTextWidth = text => Array.from(String(text || '')).reduce((sum, char) => sum + (/[^\x00-\x7F]/.test(char) ? 13 : 7), 0);
  const layoutNodes = order.map((id, index) => {
    const person = state.people[id];
    const lifespanWidth = Math.max(2, (endYear(person) - birthYear(person)) * yearWidth);
    const labelWidth = 48 + estimateTextWidth(fullName(person)) + 12 + estimateTextWidth(life(person)) + 18;
    return { id, x: xForYear(birthYear(person)), y: index * rowStep, occupancyWidth: Math.max(lifespanWidth, labelWidth), isSpouse: spouseIds.has(id) };
  });
  const layoutById = () => new Map(layoutNodes.map(node => [node.id, node]));
  const buildCompactionLines = () => {
    const positions = layoutById();
    const lines = [];
    families.forEach(family => {
      const parentIds = family.parents.filter(id => positions.has(id));
      const childIds = family.children.filter(id => positions.has(id));
      if (!parentIds.length || (!childIds.length && parentIds.length < 2)) return;
      const recordedMarriageYear = parentIds.flatMap(id => parentIds.map(other => state.people[id]?.marriageYears?.[other])).map(numericYear).find(year => year != null);
      const fallbackYear = childIds.length ? Math.min(...childIds.map(id => birthYear(state.people[id]))) - 4.5 : Math.max(...parentIds.map(id => birthYear(state.people[id]))) + 20;
      const trunkX = xForYear(recordedMarriageYear ?? fallbackYear);
      const parentYs = parentIds.map(id => positions.get(id).y + rowHeight / 2);
      const childYs = childIds.map(id => positions.get(id).y + rowHeight / 2);
      const hasPaternalParent = parentIds.some(id => state.people[id]?.gender === 'male');
      const transportedId = transportedParent(parentIds);
      parentIds.forEach(id => {
        const pos = positions.get(id);
        lines.push({ type: 'branch', x: Math.min(pos.x + 24, trunkX), y: pos.y + rowHeight / 2, w: Math.abs(trunkX - pos.x - 24), isDashed: id === transportedId || state.people[id]?.gender !== 'male' });
      });
      const allYs = [...parentYs, ...childYs];
      if (Math.max(...allYs) > Math.min(...allYs)) lines.push({ type: 'stem', x: trunkX, y: Math.min(...allYs), h: Math.max(...allYs) - Math.min(...allYs), isDashed: !hasPaternalParent });
      childIds.forEach(id => {
        const pos = positions.get(id);
        lines.push({ type: 'branch', x: Math.min(trunkX, pos.x + 1), y: pos.y + rowHeight / 2, w: Math.abs(pos.x + 1 - trunkX), isDashed: !hasPaternalParent });
      });
    });
    return lines;
  };
  compactTimelineBranchesBottomUp(layoutNodes, buildCompactionLines(), rowHeight, rowStep);
  compactTimelineRows(layoutNodes, rowStep);
  compactTimelineBranchesBottomUp(layoutNodes, buildCompactionLines(), rowHeight, rowStep);
  compactTimelineRows(layoutNodes, rowStep);
  stabilizeTimelineOrder(layoutNodes, rowHeight, rowStep);

  const width = Math.max(900, xForYear(maxYear) + 42);
  const height = Math.max(560, top + Math.max(...layoutNodes.map(node => node.y)) + rowHeight + 38);
  canvas.setAttribute('width', width); canvas.setAttribute('height', height); canvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
  ruler.toggleAttribute('hidden', false);
  ruler.setAttribute('width', width); ruler.setAttribute('height', 43); ruler.setAttribute('viewBox', `0 0 ${width} 43`);
  ruler.style.transform = `scaleX(${state.zoom})`;
  const positions = new Map(layoutNodes.map(node => [node.id, { x: node.x, y: top + node.y }]));

  const grid = svg('g', { class: 'timeline-grid' });
  const rulerMarks = svg('g');
  rulerMarks.append(svg('rect', { x: 0, y: 0, width, height: 43, class: 'ruler-band' }));
  for (let year = minYear; year <= maxYear; year += 5) {
    const x = xForYear(year);
    const isMajor = year % 20 === 0;
    const isDecade = year % 10 === 0;
    if (isMajor) grid.append(svg('line', { x1: x, y1: 43, x2: x, y2: height - 18, class: 'year-grid-line' }));
    rulerMarks.append(svg('line', { x1: x, y1: isMajor ? 29 : isDecade ? 33 : 36, x2: x, y2: 43, class: `year-tick ${isMajor ? 'major' : isDecade ? 'decade' : 'minor'}` }));
    if (isDecade) rulerMarks.append(svg('text', { x, y: 22, 'text-anchor': 'middle', class: isMajor ? 'major-label' : 'decade-label' }, String(year)));
  }
  rulerMarks.append(svg('line', { x1: left, y1: 43, x2: xForYear(maxYear), y2: 43, class: 'ruler-line' }));
  ruler.append(rulerMarks);
  canvas.append(grid);

  const connectors = svg('g', { class: 'timeline-connectors' });
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
    const allYs = [...parentYs, ...childYs];
    const hasPaternalParent = parentIds.some(id => state.people[id]?.gender === 'male');
    const stemClass = hasPaternalParent ? 'paternal' : 'maternal';
    const transportedId = transportedParent(parentIds);
    parentIds.forEach(id => {
      const pos = positions.get(id);
      const lineage = state.people[id]?.gender === 'male' ? 'paternal' : 'maternal';
      const branch = svg('path', { d: `M ${pos.x + 24} ${pos.y + rowHeight / 2} H ${trunkX}`, class: `timeline-edge ${lineage}${id === transportedId ? ' transport' : ''}` });
      if (id === transportedId) branch.append(svg('title', {}, `${fullName(state.people[id])} transported from their birth branch to this cousin marriage`));
      connectors.append(branch);
    });
    if (Math.max(...allYs) > Math.min(...allYs)) {
      connectors.append(svg('line', { x1: trunkX, y1: Math.min(...allYs), x2: trunkX, y2: Math.max(...allYs), class: `timeline-edge family-stem ${stemClass}`, 'data-marriage-year': recordedMarriageYear || '' }));
    }
    childIds.forEach(id => {
      const pos = positions.get(id);
      connectors.append(svg('path', { d: `M ${trunkX} ${pos.y + rowHeight / 2} H ${pos.x + 1}`, class: `timeline-edge ${stemClass}` }));
    });
    if (recordedMarriageYear) {
      const markerY = parentYs.length > 1 ? (Math.min(...parentYs) + Math.max(...parentYs)) / 2 : parentYs[0];
      connectors.append(svg('rect', { x: trunkX - 3, y: markerY - 3, width: 6, height: 6, transform: `rotate(45 ${trunkX} ${markerY})`, class: 'marriage-marker' }));
      connectors.append(svg('title', {}, `Married ${recordedMarriageYear}`));
    }
  });
  canvas.append(connectors);

  order.forEach(id => {
    const person = state.people[id];
    const pos = positions.get(id);
    const lifespanWidth = Math.max(2, (endYear(person) - birthYear(person)) * yearWidth);
    const hasReign = reignEvents(person).length > 0;
    const group = svg('g', { class: `timeline-node ${person.gender} ${hasReign ? 'reigned' : ''} ${id === state.selectedId ? 'selected' : ''}`, transform: `translate(${pos.x} ${pos.y})`, tabindex: '0', role: 'button', 'aria-label': `${fullName(person)}, ${life(person)}${hasReign ? ', reigning monarch' : ''}` });
    group.append(svg('title', {}, `${fullName(person)} · ${life(person)}`));
    group.append(svg('rect', { class: 'lifespan', x: 0, y: 0, width: lifespanWidth, height: rowHeight }));
    person.personalEvents.forEach(event => {
      const start = Math.max(birthYear(person), event.startYear);
      const finish = Math.min(endYear(person), event.endYear ?? event.startYear);
      if (finish < start) return;
      const eventX = (start - birthYear(person)) * yearWidth;
      const eventWidth = Math.max(0, (finish - start) * yearWidth);
      if (eventWidth > 0) {
        const mark = svg('rect', { class: 'personal-event-range', x: eventX, y: 2, width: eventWidth, height: rowHeight - 4 });
        const yearLabel = formatEventYearRange(event.startYear, event.endYear);
        mark.append(svg('title', {}, `${event.name} · ${yearLabel}`));
        group.append(mark);
        group.append(svg('line', { class: 'personal-event-edge', x1: eventX, y1: 1, x2: eventX, y2: rowHeight - 1 }));
        group.append(svg('line', { class: 'personal-event-edge', x1: eventX + eventWidth, y1: 1, x2: eventX + eventWidth, y2: rowHeight - 1 }));
        if (isReignLabel(event.name)) group.append(svg('text', { class: 'reign-event-label', x: eventX + 4, y: 8 }, yearLabel));
      } else {
        const mark = svg('line', { class: 'personal-event-point', x1: eventX, y1: 1, x2: eventX, y2: rowHeight - 1 });
        const yearLabel = formatEventYearRange(event.startYear, event.endYear);
        mark.append(svg('title', {}, `${event.name} · ${yearLabel}`));
        group.append(mark);
        if (isReignLabel(event.name)) group.append(svg('text', { class: 'reign-event-label', x: eventX + 4, y: 8 }, yearLabel));
      }
    });
    const hasChildren = person.children.some(childId => state.people[childId]);
    const isCollapsed = state.collapsedIds.has(id);
    const icon = svg('g', { class: `timeline-expander ${hasChildren ? (isCollapsed ? 'collapsed' : 'expanded') : 'leaf'}`, role: hasChildren ? 'button' : 'img', tabindex: hasChildren ? '0' : '-1', 'aria-label': hasChildren ? `${isCollapsed ? 'Expand' : 'Collapse'} descendants of ${fullName(person)}` : 'No descendants' });
    icon.append(svg('rect', { class: 'expander-box', x: 15, y: 9, width: 18, height: 18, rx: 3 }));
    if (hasChildren) icon.append(svg('text', { class: 'node-symbol', x: 24, y: 18 }, isCollapsed ? '+' : '−'));
    const toggleBranch = event => {
      event.stopPropagation();
      if (isCollapsed) state.collapsedIds.delete(id); else state.collapsedIds.add(id);
      render();
    };
    if (hasChildren) {
      icon.addEventListener('click', toggleBranch);
      icon.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') toggleBranch(event); });
    }
    group.append(icon);
    const label = svg('text', { class: 'timeline-label', x: 48, y: 19 });
    label.append(svg('tspan', { class: 'timeline-name' }, fullName(person)));
    label.append(svg('tspan', { class: 'timeline-life-label', dx: 12 }, life(person)));
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
  els['people-list'].replaceChildren(...people.map(person => {
    const button = document.createElement('button');
    const source = sourceMeta(person);
    button.type = 'button'; button.className = `person-list-item${person.id === state.selectedId ? ' active' : ''}`; button.dataset.gender = person.gender;
    button.innerHTML = `<span class="mini-avatar">${escapeHtml(initials(person))}</span><span><strong>${escapeHtml(fullName(person))}</strong><small>${escapeHtml(life(person))}</small></span>${person.sourceUrl ? `<span class="source-tick" title="${escapeHtml(source.name)}">${escapeHtml(source.mark)}</span>` : ''}`;
    button.addEventListener('click', () => selectPerson(person.id));
    return button;
  }));
}
function renderDetails() {
  const person = state.people[state.selectedId];
  els['detail-empty'].hidden = !!person;
  els['person-form'].hidden = !person;
  if (!person) return;
  els['person-heading'].textContent = fullName(person);
  els['person-life'].textContent = life(person);
  els['person-avatar'].textContent = initials(person);
  els['person-avatar'].style.background = person.gender === 'female' ? 'var(--rose)' : person.gender === 'male' ? 'var(--blue)' : '#e7e1d8';
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
  renderPersonList(); renderTimeline(); renderDetails(); renderParentOptions();
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
els['empty-geni-button'].addEventListener('click', () => { els['source-input'].focus(); els['source-input'].scrollIntoView({ behavior: 'smooth', block: 'center' }); });
els['royal-example-button'].addEventListener('click', async () => {
  if (Object.keys(state.people).length && !window.confirm('Replace the current local tree with the British royal example? Export first if you want to keep it.')) return;
  try { await loadBritishRoyalExample(); }
  catch (error) { toast(`${error.message} No cached royal data was used.`, true); }
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
  Object.values(state.people).forEach(other => { other.parents = other.parents.filter(x => x !== id); other.children = other.children.filter(x => x !== id); other.partners = other.partners.filter(x => x !== id); });
  state.rootId = state.rootId === id ? Object.keys(state.people)[0] || '' : state.rootId; state.selectedId = '';
  persist('Profile deleted'); render();
});
els['add-person-button'].addEventListener('click', () => els['add-dialog'].showModal());
els['add-form'].addEventListener('submit', event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault(); const data = new FormData(event.currentTarget); const id = `local-${crypto.randomUUID()}`;
  const person = normalizePerson({ id, ...Object.fromEntries(data.entries()) }, id);
  const parentId = clean(data.get('parentId'));
  if (parentId && state.people[parentId]) { person.parents = [parentId]; state.people[parentId].children = unique([...state.people[parentId].children, id]); }
  state.people[id] = person; state.rootId = state.rootId || id; state.selectedId = id;
  els['add-dialog'].close(); event.currentTarget.reset(); persist('Profile added'); render();
});

restore();
if (Object.keys(state.people).length) render();
else loadBritishRoyalExample().catch(error => {
  toast(`${error.message} No cached royal data was used.`, true);
  render();
});
