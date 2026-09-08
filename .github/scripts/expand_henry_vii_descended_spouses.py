from __future__ import annotations

import json
import re
import urllib.parse
from pathlib import Path

DATA = Path('data/british-royal-line.json')
INDEX = Path('index.html')
IDS = Path('.github/henry-vii-spouse-branch-ids.json')

data = json.loads(DATA.read_text(encoding='utf-8'))
people = data['people']
resolved = json.loads(IDS.read_text(encoding='utf-8'))
data['version'] = 29

OTHER_MONARCH_COLOR = '#3949ab'


def gid(wikipedia_title: str) -> str:
    return resolved[wikipedia_title]['geniId']


def wiki_url(wikipedia_title: str) -> str:
    canonical = resolved[wikipedia_title].get('wikipediaTitle', wikipedia_title)
    return 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(canonical.replace(' ', '_'), safe="()_,:%–—'-")


def unique(values):
    result = []
    for value in values:
        if value and value not in result:
            result.append(value)
    return result


def period(period_id: str, name: str, start: int, end: int, url: str) -> dict:
    return {
        'id': period_id,
        'name': name,
        'startYear': start,
        'endYear': end,
        'sourceUrl': url,
    }


def reign(start: int, end: int) -> dict:
    return {
        'name': 'Reign',
        'startYear': start,
        'endYear': end,
        'source': 'royal',
        'color': OTHER_MONARCH_COLOR,
        'kind': 'monarch-reign',
        'monarchGroup': 'other',
    }


def profile(
    wikipedia_title: str,
    first_name: str,
    last_name: str,
    display_name: str,
    title: str,
    gender: str,
    birth_year: int,
    death_year: int,
    note: str,
    periods: list[dict] | None = None,
    default_period_id: str = '',
    personal_events: list[dict] | None = None,
) -> dict:
    person_id = gid(wikipedia_title)
    source_url = wiki_url(wikipedia_title)
    periods = periods or [
        period(f'{person_id}-name-{birth_year}', display_name, birth_year, death_year, source_url)
    ]
    return {
        'id': person_id,
        'firstName': first_name,
        'lastName': last_name,
        'displayName': display_name,
        'title': title,
        'nameOrder': 'western',
        'gender': gender,
        'birthYear': str(birth_year),
        'deathYear': str(death_year),
        'isLiving': False,
        'place': '',
        'note': note,
        'parents': [],
        'children': [],
        'partners': [],
        'spouses': [],
        'nonSpouses': [],
        'divorcedSpouses': [],
        'marriageYears': {},
        'relationshipEndYears': {},
        'relationshipEndStatuses': {},
        'namePeriods': periods,
        'defaultNamePeriodId': default_period_id or periods[-1]['id'],
        'personalEvents': personal_events or [],
        'sourceUrl': source_url,
        'sourceId': person_id,
        'sourceProvider': 'web',
        'importedAt': '',
        'geniImmediateFamilyLoaded': False,
        'geniImmediateFamilyVerifiedAt': '',
        'geniImmediateFamilyIds': [],
        'starterProfile': True,
        'geniAliases': [person_id],
    }


def merge_missing(existing: dict, incoming: dict) -> dict:
    for field in ('parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniAliases'):
        existing[field] = unique([*existing.get(field, []), *incoming.get(field, [])])
    for field in ('marriageYears', 'relationshipEndYears', 'relationshipEndStatuses'):
        existing[field] = {**incoming.get(field, {}), **existing.get(field, {})}
    for field in ('firstName', 'lastName', 'displayName', 'title', 'gender', 'birthYear', 'deathYear', 'note', 'sourceUrl', 'sourceId', 'sourceProvider'):
        if not existing.get(field):
            existing[field] = incoming.get(field, '')
    if not existing.get('namePeriods'):
        existing['namePeriods'] = incoming.get('namePeriods', [])
        existing['defaultNamePeriodId'] = incoming.get('defaultNamePeriodId', '')
    if not existing.get('personalEvents'):
        existing['personalEvents'] = incoming.get('personalEvents', [])
    existing['starterProfile'] = True
    existing.setdefault('geniImmediateFamilyLoaded', False)
    existing.setdefault('geniImmediateFamilyVerifiedAt', '')
    existing.setdefault('geniImmediateFamilyIds', [])
    return existing


def ensure(record: dict) -> str:
    person_id = record['id']
    aliases = set(record.get('geniAliases', [])) | {record.get('sourceId', '')}
    matches = [
        existing_id for existing_id, existing in people.items()
        if existing_id == person_id
        or person_id in set(existing.get('geniAliases', []))
        or existing.get('sourceId') == person_id
        or existing_id in aliases
    ]
    if len(matches) > 1:
        raise SystemExit(f'Duplicate Geni identity before spouse expansion: {person_id} -> {matches}')
    if matches:
        existing_id = matches[0]
        if existing_id != person_id:
            raise SystemExit(f'Existing profile is not keyed by its Geni identity: {existing_id} vs {person_id}')
        people[person_id] = merge_missing(people[person_id], record)
    else:
        people[person_id] = record
    return person_id


def find_one(label: str, *, ids: tuple[str, ...] = (), names: tuple[str, ...] = (), url_parts: tuple[str, ...] = ()) -> str:
    for candidate in ids:
        if candidate in people:
            return candidate
    matches = []
    for person_id, person in people.items():
        display = str(person.get('displayName', '')).casefold()
        source = str(person.get('sourceUrl', '')).casefold()
        if any(name.casefold() in display for name in names) or any(part.casefold() in source for part in url_parts):
            matches.append(person_id)
    matches = unique(matches)
    if len(matches) != 1:
        raise SystemExit(f'Expected one {label}, found {[(pid, people[pid].get("displayName")) for pid in matches]}')
    return matches[0]


def link_child(child_id: str, father_id: str, mother_id: str) -> None:
    child = people[child_id]
    child['parents'] = [father_id, mother_id]
    for parent_id in (father_id, mother_id):
        people[parent_id]['children'] = unique([*people[parent_id].get('children', []), child_id])


def link_marriage(first_id: str, second_id: str, year: int, *, end_year: int | None = None, status: str = '') -> None:
    for person_id, spouse_id in ((first_id, second_id), (second_id, first_id)):
        person = people[person_id]
        person['partners'] = unique([*person.get('partners', []), spouse_id])
        person['spouses'] = unique([*person.get('spouses', []), spouse_id])
        person.setdefault('marriageYears', {})[spouse_id] = str(year)
        if end_year is not None:
            person.setdefault('relationshipEndYears', {})[spouse_id] = str(end_year)
        if status:
            person.setdefault('relationshipEndStatuses', {})[spouse_id] = status
            person['divorcedSpouses'] = unique([*person.get('divorcedSpouses', []), spouse_id])


# Existing anchors in the bundled tree.
GEORGE_I = find_one('George I', names=('George I, King of Great Britain',), url_parts=('George_I_of_Great_Britain',))
SOPHIA_DOROTHEA_CELLE = find_one('Sophia Dorothea of Celle', names=('Sophia Dorothea of Celle',), url_parts=('Sophia_Dorothea_of_Celle',))
GEORGE_II = find_one('George II', names=('George II, King of Great Britain',), url_parts=('George_II_of_Great_Britain',))
CAROLINE_ANSBACH = find_one('Caroline of Ansbach', names=('Caroline of Ansbach',), url_parts=('Caroline_of_Ansbach',))
FREDERICK_WALES = find_one('Frederick, Prince of Wales', ids=('profile-g6000000003891739213',), names=('Frederick, Prince of Wales',))
AUGUSTA_SAXE_GOTHA = find_one('Augusta of Saxe-Gotha', ids=('profile-g6000000003891753089',), names=('Augusta of Saxe-Gotha',))
GEORGE_III = find_one('George III', ids=('profile-g6000000003091034586',), names=('George III, King of Great Britain',))
GEORGE_IV = find_one('George IV', ids=('profile-g4137986493320052463',), names=('George IV, King of Great Britain',))
CAROLINE_BRUNSWICK = find_one('Caroline of Brunswick', ids=('profile-g4138652783200125692',), names=('Caroline of Brunswick',))
ADOLPHUS_CAMBRIDGE = find_one('Adolphus, Duke of Cambridge', ids=('profile-g6000000000307240333',), names=('Adolphus, Duke of Cambridge',))
AUGUSTA_HESSE = find_one('Augusta, Duchess of Cambridge', ids=('profile-g6000000001260403655',), names=('Augusta, Duchess of Cambridge',))
LOUISE_HESSE = find_one('Louise of Hesse-Kassel', names=('Louise of Hesse-Kassel',))
ALEXANDRA_DENMARK = find_one('Alexandra of Denmark', ids=('profile-g6000000003070981015',), names=('Alexandra of Denmark',))
ELISABETH_PRUSSIA = find_one('Princess Elisabeth of Prussia', names=('Princess Elisabeth of Prussia', 'Elisabeth of Prussia'))
LOUIS_IV_HESSE = find_one('Louis IV of Hesse', ids=('profile-g6000000000703378021',), names=('Louis IV, Grand Duke of Hesse',))
MARGARET_TUDOR = find_one('Margaret Tudor', ids=('profile-g6000000003858820967',), names=('Margaret Tudor',))
ARCHIBALD_DOUGLAS = find_one('Archibald Douglas', ids=('profile-g6000000003232538566',), names=('Archibald Douglas',))
DARNLEY = find_one('Henry Stuart, Lord Darnley', names=('Lord Darnley',), url_parts=('Henry_Stuart', 'Lord_Darnley'))

# ---------------------------------------------------------------------------
# Caroline of Brunswick: her mother Princess Augusta was George III's sister,
# making Caroline and George IV first cousins.
# ---------------------------------------------------------------------------
augusta_gb_url = wiki_url('Princess Augusta of Great Britain')
PRINCESS_AUGUSTA = ensure(profile(
    'Princess Augusta of Great Britain',
    'Augusta', 'of Great Britain', 'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Duchess of Brunswick-Wolfenbüttel', 'female', 1737, 1813,
    'Daughter of Frederick, Prince of Wales; mother of Caroline of Brunswick',
    periods=[
        period('augusta-gb-name-1737', 'Princess Augusta of Great Britain', 1737, 1764, augusta_gb_url),
        period('augusta-gb-name-1764', 'Augusta, Hereditary Princess of Brunswick-Wolfenbüttel', 1764, 1780, augusta_gb_url),
        period('augusta-gb-name-1780', 'Augusta, Duchess of Brunswick-Wolfenbüttel', 1780, 1806, augusta_gb_url),
        period('augusta-gb-name-1806', 'Augusta, Dowager Duchess of Brunswick-Wolfenbüttel', 1806, 1813, augusta_gb_url),
    ],
    default_period_id='augusta-gb-name-1780',
))
charles_brunswick_url = wiki_url('Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel')
CHARLES_BRUNSWICK = ensure(profile(
    'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel',
    'Charles William Ferdinand', 'of Brunswick-Wolfenbüttel',
    'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel',
    'Duke of Brunswick-Wolfenbüttel', 'male', 1735, 1806,
    'Husband of Princess Augusta of Great Britain; father of Caroline of Brunswick',
    periods=[
        period('charles-brunswick-name-1735', 'Prince Charles William Ferdinand of Brunswick-Wolfenbüttel', 1735, 1780, charles_brunswick_url),
        period('charles-brunswick-name-1780', 'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel', 1780, 1806, charles_brunswick_url),
    ],
    default_period_id='charles-brunswick-name-1780',
))
link_child(PRINCESS_AUGUSTA, FREDERICK_WALES, AUGUSTA_SAXE_GOTHA)
link_marriage(CHARLES_BRUNSWICK, PRINCESS_AUGUSTA, 1764)
link_child(CAROLINE_BRUNSWICK, CHARLES_BRUNSWICK, PRINCESS_AUGUSTA)

# ---------------------------------------------------------------------------
# Hesse-Kassel: Princess Mary, daughter of George II, is the common gateway
# for Augusta of Cambridge and Queen Louise of Denmark. This makes the
# Adolphus/Augusta, Edward VII/Alexandra, and Andrew/Alice marriages visibly
# marriages between Henry VII descendants.
# ---------------------------------------------------------------------------
mary_gb_url = wiki_url('Princess Mary of Great Britain')
PRINCESS_MARY = ensure(profile(
    'Princess Mary of Great Britain',
    'Mary', 'of Great Britain', 'Mary, Landgravine of Hesse-Kassel',
    'Landgravine of Hesse-Kassel', 'female', 1723, 1772,
    'Daughter of George II; ancestress of Augusta of Cambridge and Alexandra of Denmark',
    periods=[
        period('mary-gb-name-1723', 'Princess Mary of Great Britain', 1723, 1740, mary_gb_url),
        period('mary-gb-name-1740', 'Mary, Hereditary Princess of Hesse-Kassel', 1740, 1760, mary_gb_url),
        period('mary-gb-name-1760', 'Mary, Landgravine of Hesse-Kassel', 1760, 1772, mary_gb_url),
    ],
    default_period_id='mary-gb-name-1760',
))
frederick_ii_url = wiki_url('Frederick II, Landgrave of Hesse-Kassel')
FREDERICK_II_HESSE = ensure(profile(
    'Frederick II, Landgrave of Hesse-Kassel',
    'Frederick', 'II', 'Frederick II, Landgrave of Hesse-Kassel',
    'Landgrave of Hesse-Kassel', 'male', 1720, 1785,
    'Husband of Princess Mary of Great Britain',
    periods=[
        period('frederick-ii-hesse-name-1720', 'Hereditary Prince Frederick of Hesse-Kassel', 1720, 1760, frederick_ii_url),
        period('frederick-ii-hesse-name-1760', 'Frederick II, Landgrave of Hesse-Kassel', 1760, 1785, frederick_ii_url),
    ],
    default_period_id='frederick-ii-hesse-name-1760',
))
prince_frederick_url = wiki_url('Prince Frederick of Hesse-Kassel')
PRINCE_FREDERICK_HESSE = ensure(profile(
    'Prince Frederick of Hesse-Kassel',
    'Frederick', 'of Hesse-Kassel', 'Prince Frederick of Hesse-Kassel',
    'Prince of Hesse-Kassel', 'male', 1747, 1837,
    'Son of Frederick II and Princess Mary of Great Britain',
))
caroline_nassau_url = wiki_url('Princess Caroline of Nassau-Usingen')
CAROLINE_NASSAU = ensure(profile(
    'Princess Caroline of Nassau-Usingen',
    'Caroline', 'of Nassau-Usingen', 'Princess Caroline of Nassau-Usingen',
    'Princess of Nassau-Usingen', 'female', 1762, 1823,
    'Wife of Prince Frederick of Hesse-Kassel',
))
prince_william_url = wiki_url('Prince William of Hesse-Kassel')
PRINCE_WILLIAM_HESSE = ensure(profile(
    'Prince William of Hesse-Kassel',
    'William', 'of Hesse-Kassel', 'Prince William of Hesse-Kassel',
    'Prince of Hesse-Kassel', 'male', 1787, 1867,
    'Son of Prince Frederick of Hesse-Kassel; father of Queen Louise of Denmark',
))
charlotte_denmark_url = wiki_url('Princess Charlotte of Denmark')
CHARLOTTE_DENMARK = ensure(profile(
    'Princess Charlotte of Denmark',
    'Charlotte', 'of Denmark', 'Princess Charlotte of Denmark',
    'Princess of Denmark', 'female', 1789, 1864,
    'Wife of Prince William of Hesse-Kassel; mother of Queen Louise of Denmark',
))
link_child(PRINCESS_MARY, GEORGE_II, CAROLINE_ANSBACH)
link_marriage(FREDERICK_II_HESSE, PRINCESS_MARY, 1740)
link_child(PRINCE_FREDERICK_HESSE, FREDERICK_II_HESSE, PRINCESS_MARY)
link_marriage(PRINCE_FREDERICK_HESSE, CAROLINE_NASSAU, 1786)
link_child(PRINCE_WILLIAM_HESSE, PRINCE_FREDERICK_HESSE, CAROLINE_NASSAU)
link_child(AUGUSTA_HESSE, PRINCE_FREDERICK_HESSE, CAROLINE_NASSAU)
link_marriage(PRINCE_WILLIAM_HESSE, CHARLOTTE_DENMARK, 1810)
link_child(LOUISE_HESSE, PRINCE_WILLIAM_HESSE, CHARLOTTE_DENMARK)

# ---------------------------------------------------------------------------
# Prussia: Sophia Dorothea, daughter of George I, leads to Princess Elisabeth
# of Prussia and then Louis IV of Hesse, husband of Princess Alice.
# ---------------------------------------------------------------------------
sophia_hanover_url = wiki_url('Sophia Dorothea of Hanover')
SOPHIA_DOROTHEA_HANOVER = ensure(profile(
    'Sophia Dorothea of Hanover',
    'Sophia Dorothea', 'of Hanover', 'Sophia Dorothea of Hanover, Queen in Prussia',
    'Queen in Prussia', 'female', 1687, 1757,
    'Daughter of George I; ancestress of Princess Elisabeth of Prussia',
    periods=[
        period('sophia-dorothea-hanover-name-1687', 'Princess Sophia Dorothea of Hanover', 1687, 1706, sophia_hanover_url),
        period('sophia-dorothea-hanover-name-1706', 'Sophia Dorothea, Crown Princess in Prussia', 1706, 1713, sophia_hanover_url),
        period('sophia-dorothea-hanover-name-1713', 'Sophia Dorothea of Hanover, Queen in Prussia', 1713, 1740, sophia_hanover_url),
        period('sophia-dorothea-hanover-name-1740', 'Sophia Dorothea, Queen Dowager in Prussia', 1740, 1757, sophia_hanover_url),
    ],
    default_period_id='sophia-dorothea-hanover-name-1713',
))
frederick_william_i_url = wiki_url('Frederick William I of Prussia')
FREDERICK_WILLIAM_I = ensure(profile(
    'Frederick William I of Prussia',
    'Frederick William', 'I', 'Frederick William I, King in Prussia',
    'King in Prussia', 'male', 1688, 1740,
    'Husband of Sophia Dorothea of Hanover',
    periods=[
        period('frederick-william-i-name-1688', 'Frederick William, Crown Prince in Prussia', 1688, 1713, frederick_william_i_url),
        period('frederick-william-i-name-1713', 'Frederick William I, King in Prussia', 1713, 1740, frederick_william_i_url),
    ],
    default_period_id='frederick-william-i-name-1713',
    personal_events=[reign(1713, 1740)],
))
augustus_william_url = wiki_url('Prince Augustus William of Prussia')
AUGUSTUS_WILLIAM = ensure(profile(
    'Prince Augustus William of Prussia',
    'Augustus William', 'of Prussia', 'Prince Augustus William of Prussia',
    'Prince of Prussia', 'male', 1722, 1758,
    'Son of Frederick William I and Sophia Dorothea of Hanover',
))
luise_brunswick_url = wiki_url('Duchess Luise of Brunswick-Wolfenbüttel')
LUISE_BRUNSWICK = ensure(profile(
    'Duchess Luise of Brunswick-Wolfenbüttel',
    'Luise', 'of Brunswick-Wolfenbüttel', 'Duchess Luise of Brunswick-Wolfenbüttel',
    'Duchess of Brunswick-Wolfenbüttel', 'female', 1722, 1780,
    'Wife of Prince Augustus William of Prussia',
))
frederick_william_ii_url = wiki_url('Frederick William II of Prussia')
FREDERICK_WILLIAM_II = ensure(profile(
    'Frederick William II of Prussia',
    'Frederick William', 'II', 'Frederick William II, King of Prussia',
    'King of Prussia', 'male', 1744, 1797,
    'Son of Prince Augustus William of Prussia',
    periods=[
        period('frederick-william-ii-name-1744', 'Prince Frederick William of Prussia', 1744, 1786, frederick_william_ii_url),
        period('frederick-william-ii-name-1786', 'Frederick William II, King of Prussia', 1786, 1797, frederick_william_ii_url),
    ],
    default_period_id='frederick-william-ii-name-1786',
    personal_events=[reign(1786, 1797)],
))
frederica_louisa_url = wiki_url('Frederica Louisa of Hesse-Darmstadt')
FREDERICA_LOUISA = ensure(profile(
    'Frederica Louisa of Hesse-Darmstadt',
    'Frederica Louisa', 'of Hesse-Darmstadt', 'Frederica Louisa of Hesse-Darmstadt, Queen of Prussia',
    'Queen of Prussia', 'female', 1751, 1805,
    'Second wife of Frederick William II; mother of Prince William of Prussia',
    periods=[
        period('frederica-louisa-name-1751', 'Princess Frederica Louisa of Hesse-Darmstadt', 1751, 1769, frederica_louisa_url),
        period('frederica-louisa-name-1769', 'Frederica Louisa, Princess of Prussia', 1769, 1786, frederica_louisa_url),
        period('frederica-louisa-name-1786', 'Frederica Louisa of Hesse-Darmstadt, Queen of Prussia', 1786, 1797, frederica_louisa_url),
        period('frederica-louisa-name-1797', 'Frederica Louisa, Queen Dowager of Prussia', 1797, 1805, frederica_louisa_url),
    ],
    default_period_id='frederica-louisa-name-1786',
))
william_prussia_url = wiki_url('Prince William of Prussia (1783–1851)')
PRINCE_WILLIAM_PRUSSIA = ensure(profile(
    'Prince William of Prussia (1783–1851)',
    'William', 'of Prussia', 'Prince William of Prussia',
    'Prince of Prussia', 'male', 1783, 1851,
    'Son of Frederick William II; father of Princess Elisabeth of Prussia',
))
maria_anna_url = wiki_url('Princess Maria Anna of Hesse-Homburg')
MARIA_ANNA_HESSE_HOMBURG = ensure(profile(
    'Princess Maria Anna of Hesse-Homburg',
    'Maria Anna', 'of Hesse-Homburg', 'Princess Maria Anna of Hesse-Homburg',
    'Princess of Hesse-Homburg', 'female', 1785, 1846,
    'Wife of Prince William of Prussia; mother of Princess Elisabeth of Prussia',
))
link_child(SOPHIA_DOROTHEA_HANOVER, GEORGE_I, SOPHIA_DOROTHEA_CELLE)
link_marriage(FREDERICK_WILLIAM_I, SOPHIA_DOROTHEA_HANOVER, 1706)
link_child(AUGUSTUS_WILLIAM, FREDERICK_WILLIAM_I, SOPHIA_DOROTHEA_HANOVER)
link_marriage(AUGUSTUS_WILLIAM, LUISE_BRUNSWICK, 1742)
link_child(FREDERICK_WILLIAM_II, AUGUSTUS_WILLIAM, LUISE_BRUNSWICK)
link_marriage(FREDERICK_WILLIAM_II, FREDERICA_LOUISA, 1769)
link_child(PRINCE_WILLIAM_PRUSSIA, FREDERICK_WILLIAM_II, FREDERICA_LOUISA)
link_marriage(PRINCE_WILLIAM_PRUSSIA, MARIA_ANNA_HESSE_HOMBURG, 1804)
link_child(ELISABETH_PRUSSIA, PRINCE_WILLIAM_PRUSSIA, MARIA_ANNA_HESSE_HOMBURG)

# ---------------------------------------------------------------------------
# Darnley: retain or complete the already intended Margaret Tudor branch so
# both parents of James VI and I are visibly descended from Henry VII.
# ---------------------------------------------------------------------------
margaret_douglas_url = wiki_url('Margaret Douglas')
MARGARET_DOUGLAS = ensure(profile(
    'Margaret Douglas',
    'Margaret', 'Douglas', 'Margaret Douglas, Countess of Lennox',
    'Countess of Lennox', 'female', 1515, 1578,
    'Daughter of Margaret Tudor; mother of Henry Stuart, Lord Darnley',
    periods=[
        period('margaret-douglas-name-1515', 'Lady Margaret Douglas', 1515, 1544, margaret_douglas_url),
        period('margaret-douglas-name-1544', 'Margaret Douglas, Countess of Lennox', 1544, 1578, margaret_douglas_url),
    ],
    default_period_id='margaret-douglas-name-1544',
))
matthew_stewart_url = wiki_url('Matthew Stewart, 4th Earl of Lennox')
MATTHEW_STEWART = ensure(profile(
    'Matthew Stewart, 4th Earl of Lennox',
    'Matthew', 'Stewart', 'Matthew Stewart, 4th Earl of Lennox',
    '4th Earl of Lennox', 'male', 1516, 1571,
    'Husband of Margaret Douglas; father of Henry Stuart, Lord Darnley',
))
link_child(MARGARET_DOUGLAS, ARCHIBALD_DOUGLAS, MARGARET_TUDOR)
link_marriage(MATTHEW_STEWART, MARGARET_DOUGLAS, 1544)
link_child(DARNLEY, MATTHEW_STEWART, MARGARET_DOUGLAS)

# Keep stored relationship order deterministic and chronological.
def birth_key(person_id: str):
    person = people.get(person_id, {})
    try:
        birth = int(person.get('birthYear') or 99999)
    except (TypeError, ValueError):
        birth = 99999
    return birth, person.get('displayName', ''), person_id


for person in people.values():
    person['parents'] = unique(person.get('parents', []))
    person['children'] = sorted(unique(person.get('children', [])), key=birth_key)
    person['partners'] = unique(person.get('partners', []))
    person['spouses'] = sorted(
        unique(person.get('spouses', [])),
        key=lambda spouse_id: (
            int(person.get('marriageYears', {}).get(spouse_id) or 99999),
            *birth_key(spouse_id),
        ),
    )

# Every child in this curated starter should now have either zero or two known
# parents; one-parent records are data errors because the display filter hides
# them deliberately.
for person_id, person in people.items():
    known_parents = [parent_id for parent_id in person.get('parents', []) if parent_id in people]
    if len(known_parents) == 1:
        raise SystemExit(f'One-parent profile after spouse expansion: {person.get("displayName")} -> {known_parents}')
    for parent_id in known_parents:
        if person_id not in people[parent_id].get('children', []):
            raise SystemExit(f'Non-reciprocal parent edge: {parent_id} -> {person_id}')
    for child_id in person.get('children', []):
        if child_id not in people or person_id not in people[child_id].get('parents', []):
            raise SystemExit(f'Non-reciprocal child edge: {person_id} -> {child_id}')
    for spouse_id in person.get('spouses', []):
        if spouse_id not in people or person_id not in people[spouse_id].get('spouses', []):
            raise SystemExit(f'Non-reciprocal spouse edge: {person_id} <-> {spouse_id}')

DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Advance all cache/version assertions consistently.
index = INDEX.read_text(encoding='utf-8')
if index.count('./app.js?v=146') != 1:
    raise SystemExit('Expected one app.js?v=146 cache key')
INDEX.write_text(index.replace('./app.js?v=146', './app.js?v=147', 1), encoding='utf-8')

profile_count = len(people)
monarch_event_count = sum(
    1 for person in people.values() for item in person.get('personalEvents', [])
    if item.get('kind') == 'monarch-reign'
)
for test_path in Path('tests').glob('*.test.mjs'):
    text = test_path.read_text(encoding='utf-8')
    text = text.replace('starter.version, 28', 'starter.version, 29')
    text = text.replace('advances to version 28', 'advances to version 29')
    text = text.replace('./app.js?v=146', './app.js?v=147')
    text = re.sub(r'assert\.equal\(Object\.keys\(people\)\.length, 168\);', f'assert.equal(Object.keys(people).length, {profile_count});', text)
    text = re.sub(r'assert\.equal\(monarchEvents\.length, 51\);', f'assert.equal(monarchEvents.length, {monarch_event_count});', text)
    test_path.write_text(text, encoding='utf-8')

# Permanent regression and audit coverage.
Path('tests/henry-vii-descended-spouses.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope } from '../descendant-scope.js';
import { duplicateGeniIdentityGroups } from '../geni-identity.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;
const root = starter.rootId;

function idContaining(fragment) {
  const matches = Object.entries(people).filter(([, person]) => person.displayName.includes(fragment));
  assert.equal(matches.length, 1, `expected one profile containing ${fragment}`);
  return matches[0][0];
}

function descendantClosure() {
  const found = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const childId of people[current]?.children || []) {
      if (!people[childId] || found.has(childId)) continue;
      found.add(childId);
      queue.push(childId);
    }
  }
  return found;
}

function assertSpousePairDescends(firstFragment, secondFragment, descendants) {
  const firstId = idContaining(firstFragment);
  const secondId = idContaining(secondFragment);
  assert.ok(people[firstId].spouses.includes(secondId), `${firstFragment} should be married to ${secondFragment}`);
  assert.ok(people[secondId].spouses.includes(firstId), `${secondFragment} should be married to ${firstFragment}`);
  assert.ok(descendants.has(firstId), `${firstFragment} should descend from Henry VII`);
  assert.ok(descendants.has(secondId), `${secondFragment} should descend from Henry VII`);
}

test('Caroline of Brunswick and George IV are represented as first cousins', () => {
  const georgeIII = idContaining('George III, King of Great Britain');
  const princessAugusta = idContaining('Augusta, Duchess of Brunswick-Wolfenbüttel');
  const georgeIV = idContaining('George IV, King of Great Britain');
  const caroline = idContaining('Caroline of Brunswick');
  assert.deepEqual(new Set(people[princessAugusta].parents), new Set(people[georgeIII].parents));
  assert.ok(people[georgeIV].parents.includes(georgeIII));
  assert.ok(people[caroline].parents.includes(princessAugusta));
  assert.ok(people[georgeIV].spouses.includes(caroline));
});

test('the Hesse-Kassel gateway makes three additional spouse pairs Henry VII descendants', () => {
  const descendants = descendantClosure();
  assertSpousePairDescends('Adolphus, Duke of Cambridge', 'Augusta, Duchess of Cambridge', descendants);
  assertSpousePairDescends('Edward VII, King of Great Britain', 'Alexandra of Denmark', descendants);
  assertSpousePairDescends('Prince Andrew of Greece and Denmark', 'Princess Alice of Battenberg', descendants);
});

test('the Prussian gateway makes Louis IV and Princess Alice fellow Henry VII descendants', () => {
  const descendants = descendantClosure();
  assertSpousePairDescends('Alice, Grand Duchess of Hesse', 'Louis IV, Grand Duke of Hesse', descendants);
});

test('the Margaret Douglas line keeps both parents of James VI and I in Henry VII descent', () => {
  const descendants = descendantClosure();
  assertSpousePairDescends('Mary, Queen of Scots', 'Lord Darnley', descendants);
});

test('the previously connected dynastic marriages remain represented', () => {
  const descendants = descendantClosure();
  assertSpousePairDescends('William III & II', 'Mary II', descendants);
  assertSpousePairDescends('George V, King of Great Britain', 'Mary of Teck', descendants);
  assertSpousePairDescends('Elizabeth II, Queen of Great Britain', 'Philip, Duke of Edinburgh', descendants);
});

test('every new descent path survives the fragile-birth display filter', () => {
  const scope = computeDescendantScope(people, root);
  for (const fragment of [
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Caroline of Brunswick',
    'Mary, Landgravine of Hesse-Kassel',
    'Augusta, Duchess of Cambridge',
    'Alexandra of Denmark',
    'Prince Andrew of Greece and Denmark',
    'Sophia Dorothea of Hanover, Queen in Prussia',
    'Louis IV, Grand Duke of Hesse',
    'Margaret Douglas, Countess of Lennox',
    'Lord Darnley'
  ]) {
    assert.ok(scope.allowedIds.has(idContaining(fragment)), `${fragment} should remain visible`);
  }
});

test('the expanded profiles all carry unique explicit Geni identities', () => {
  assert.deepEqual(duplicateGeniIdentityGroups(people), []);
  for (const fragment of [
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel',
    'Mary, Landgravine of Hesse-Kassel',
    'Sophia Dorothea of Hanover, Queen in Prussia',
    'Frederick William II, King of Prussia',
    'Margaret Douglas, Countess of Lennox'
  ]) {
    const personId = idContaining(fragment);
    assert.equal(people[personId].sourceId, personId);
    assert.ok(people[personId].geniAliases.includes(personId));
  }
});

test('the starter retains reciprocal complete parentage throughout', () => {
  for (const [personId, person] of Object.entries(people)) {
    const parents = (person.parents || []).filter(parentId => people[parentId]);
    assert.notEqual(parents.length, 1, `${person.displayName} has one recorded parent`);
    for (const parentId of parents) assert.ok(people[parentId].children.includes(personId));
    for (const childId of person.children || []) assert.ok(people[childId].parents.includes(personId));
  }
});
''', encoding='utf-8')

print(json.dumps({
    'version': data['version'],
    'profiles': profile_count,
    'monarchEvents': monarch_event_count,
    'newProfiles': [gid(title) for title in resolved],
}, ensure_ascii=False, indent=2))
