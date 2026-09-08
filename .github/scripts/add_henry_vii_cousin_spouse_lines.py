from __future__ import annotations

import json
from pathlib import Path

DATA = Path('data/british-royal-line.json')
INDEX = Path('index.html')
data = json.loads(DATA.read_text(encoding='utf-8'))
people = data['people']

if data.get('version') != 28:
    raise SystemExit(f"Expected starter version 28, found {data.get('version')}")

data['version'] = 29


def unique(values):
    return list(dict.fromkeys(value for value in values if value))


def profile(
    person_id: str,
    first_name: str,
    last_name: str,
    display_name: str,
    title: str,
    gender: str,
    birth_year: int,
    death_year: int,
    note: str,
    wiki_url: str,
    periods: list[dict] | None = None,
    default_period_id: str = '',
) -> dict:
    if person_id in people:
        raise SystemExit(f'Profile already exists: {person_id}')
    source_url = f"https://www.geni.com/profile/index/{person_id.removeprefix('profile-g').removeprefix('profile-')}"
    periods = periods or [{
        'id': f"{person_id.replace('profile-', '')}-name-{birth_year}",
        'name': display_name,
        'startYear': birth_year,
        'endYear': death_year,
        'sourceUrl': wiki_url,
    }]
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
        'personalEvents': [],
        'sourceUrl': source_url,
        'sourceId': person_id,
        'sourceProvider': 'geni',
        'importedAt': '',
        'geniImmediateFamilyLoaded': False,
        'geniImmediateFamilyVerifiedAt': '',
        'geniImmediateFamilyIds': [],
        'starterProfile': True,
        'geniAliases': [person_id],
    }


def add(record: dict) -> None:
    people[record['id']] = record


def link_child(child_id: str, father_id: str, mother_id: str) -> None:
    if any(person_id not in people for person_id in (child_id, father_id, mother_id)):
        raise SystemExit(f'Missing profile while linking child {child_id}')
    people[child_id]['parents'] = unique([father_id, mother_id, *people[child_id].get('parents', [])])
    for parent_id in (father_id, mother_id):
        people[parent_id]['children'] = unique([*people[parent_id].get('children', []), child_id])


def link_marriage(first_id: str, second_id: str, year: int) -> None:
    for person_id, spouse_id in ((first_id, second_id), (second_id, first_id)):
        person = people[person_id]
        person['partners'] = unique([*person.get('partners', []), spouse_id])
        person['spouses'] = unique([*person.get('spouses', []), spouse_id])
        person.setdefault('marriageYears', {})[spouse_id] = str(year)


# Existing gateway profiles.
MARGARET_TUDOR = 'profile-g6000000003858820967'
ARCHIBALD_DOUGLAS = 'profile-g6000000003232538566'
MARY_SCOTS = 'profile-g6000000003234018546'
DARNLEY = 'profile-g6000000003876051113'
GEORGE_II = 'profile-4555899'
CAROLINE_ANSBACH = 'profile-4555944'
FREDERICK_WALES = 'profile-g6000000003891739213'
AUGUSTA_SAXE_GOTHA = 'profile-g6000000003891753089'
GEORGE_III = 'profile-g6000000003091034586'
GEORGE_IV = 'profile-g4137986493320052463'
CAROLINE_BRUNSWICK = 'profile-g4138652783200125692'
AUGUSTA_CAMBRIDGE = 'profile-g6000000001260403655'
LOUISE_HESSE = 'profile-g4134741994550032164'
ALEXANDRA_DENMARK = 'profile-g6000000003070981015'
GEORGE_I_GREECE = 'profile-4533621'
PRINCE_ANDREW = 'profile-g5495575341940116659'

# New Geni-indexed profiles.
PRINCESS_AUGUSTA = 'profile-g312092994390004595'
CHARLES_BRUNSWICK = 'profile-g311788525210007050'
PRINCESS_CHARLOTTE = 'profile-g5145210727590105956'
MARGARET_DOUGLAS = 'profile-g6000000002435383373'
MATTHEW_LENNOX = 'profile-g6000000003858695567'
MARY_GREAT_BRITAIN = 'profile-g6000000000048910716'
FREDERICK_II_HESSE = 'profile-g6000000001847933002'
PRINCE_FREDERICK_HESSE = 'profile-g6000000002447248679'
CAROLINE_NASSAU = 'profile-g6000000007329600601'
PRINCE_WILLIAM_HESSE = 'profile-4532996'
LOUISE_CHARLOTTE = 'profile-g6000000002737707932'

# Caroline of Brunswick and George IV: their parents were siblings, making the
# couple first cousins. Their only child completes the household in the tree.
augusta_wiki = 'https://en.wikipedia.org/wiki/Princess_Augusta_of_Great_Britain'
add(profile(
    PRINCESS_AUGUSTA,
    'Augusta',
    'of Great Britain',
    'Augusta, Duchess of Brunswick-Wolfenbüttel',
    'Duchess of Brunswick-Wolfenbüttel',
    'female',
    1737,
    1813,
    'Elder sister of George III and mother of Caroline of Brunswick',
    augusta_wiki,
    periods=[
        {'id': 'princess-augusta-name-1737', 'name': 'Princess Augusta of Great Britain', 'startYear': 1737, 'endYear': 1764, 'sourceUrl': augusta_wiki},
        {'id': 'princess-augusta-name-1764', 'name': 'Augusta, Hereditary Princess of Brunswick-Wolfenbüttel', 'startYear': 1764, 'endYear': 1780, 'sourceUrl': augusta_wiki},
        {'id': 'princess-augusta-name-1780', 'name': 'Augusta, Duchess of Brunswick-Wolfenbüttel', 'startYear': 1780, 'endYear': 1806, 'sourceUrl': augusta_wiki},
        {'id': 'princess-augusta-name-1806', 'name': 'Augusta, Dowager Duchess of Brunswick-Wolfenbüttel', 'startYear': 1806, 'endYear': 1813, 'sourceUrl': augusta_wiki},
    ],
    default_period_id='princess-augusta-name-1780',
))
charles_wiki = 'https://en.wikipedia.org/wiki/Charles_William_Ferdinand,_Duke_of_Brunswick'
add(profile(
    CHARLES_BRUNSWICK,
    'Charles William Ferdinand',
    'Duke of Brunswick-Wolfenbüttel',
    'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel',
    'Duke of Brunswick-Wolfenbüttel',
    'male',
    1735,
    1806,
    'Husband of Princess Augusta and father of Caroline of Brunswick',
    charles_wiki,
    periods=[
        {'id': 'charles-brunswick-name-1735', 'name': 'Charles William Ferdinand, Hereditary Prince of Brunswick-Wolfenbüttel', 'startYear': 1735, 'endYear': 1780, 'sourceUrl': charles_wiki},
        {'id': 'charles-brunswick-name-1780', 'name': 'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel', 'startYear': 1780, 'endYear': 1806, 'sourceUrl': charles_wiki},
    ],
    default_period_id='charles-brunswick-name-1780',
))
charlotte_wiki = 'https://en.wikipedia.org/wiki/Princess_Charlotte_of_Wales_(1796%E2%80%931817)'
add(profile(
    PRINCESS_CHARLOTTE,
    'Charlotte',
    'Princess of Wales',
    'Princess Charlotte of Wales',
    'Princess of Wales',
    'female',
    1796,
    1817,
    'Only child of George IV and Caroline of Brunswick',
    charlotte_wiki,
))
link_child(PRINCESS_AUGUSTA, FREDERICK_WALES, AUGUSTA_SAXE_GOTHA)
link_marriage(PRINCESS_AUGUSTA, CHARLES_BRUNSWICK, 1764)
link_child(CAROLINE_BRUNSWICK, CHARLES_BRUNSWICK, PRINCESS_AUGUSTA)
link_child(PRINCESS_CHARLOTTE, GEORGE_IV, CAROLINE_BRUNSWICK)
people[CAROLINE_BRUNSWICK]['note'] = 'Queen consort; first cousin and wife of George IV'

# Mary, Queen of Scots and Lord Darnley were half-first cousins through their
# shared grandmother Margaret Tudor. This adds Darnley's maternal Tudor line.
margaret_douglas_wiki = 'https://en.wikipedia.org/wiki/Margaret_Douglas'
add(profile(
    MARGARET_DOUGLAS,
    'Margaret',
    'Douglas',
    'Margaret Douglas, Countess of Lennox',
    'Countess of Lennox',
    'female',
    1515,
    1578,
    'Daughter of Margaret Tudor and mother of Henry Stuart, Lord Darnley',
    margaret_douglas_wiki,
    periods=[
        {'id': 'margaret-douglas-name-1515', 'name': 'Lady Margaret Douglas', 'startYear': 1515, 'endYear': 1544, 'sourceUrl': margaret_douglas_wiki},
        {'id': 'margaret-douglas-name-1544', 'name': 'Margaret Douglas, Countess of Lennox', 'startYear': 1544, 'endYear': 1578, 'sourceUrl': margaret_douglas_wiki},
    ],
    default_period_id='margaret-douglas-name-1544',
))
matthew_wiki = 'https://en.wikipedia.org/wiki/Matthew_Stewart,_4th_Earl_of_Lennox'
add(profile(
    MATTHEW_LENNOX,
    'Matthew Stewart',
    '4th Earl of Lennox',
    'Matthew Stewart, 4th Earl of Lennox',
    '4th Earl of Lennox',
    'male',
    1516,
    1571,
    'Husband of Margaret Douglas and father of Henry Stuart, Lord Darnley',
    matthew_wiki,
))
link_child(MARGARET_DOUGLAS, ARCHIBALD_DOUGLAS, MARGARET_TUDOR)
link_marriage(MARGARET_DOUGLAS, MATTHEW_LENNOX, 1544)
link_child(DARNLEY, MATTHEW_LENNOX, MARGARET_DOUGLAS)
people[DARNLEY]['note'] = 'King consort of Scots; half-first cousin and second husband of Mary, Queen of Scots'

# A compact Hesse-Kassel descent from George II. It makes Augusta of Cambridge
# a second cousin of Adolphus, and gives Alexandra of Denmark, George I of
# Greece, Prince Andrew, and Prince Philip an independent Henry VII descent.
mary_wiki = 'https://en.wikipedia.org/wiki/Princess_Mary_of_Great_Britain'
add(profile(
    MARY_GREAT_BRITAIN,
    'Mary',
    'of Great Britain',
    'Mary, Landgravine of Hesse-Kassel',
    'Landgravine of Hesse-Kassel',
    'female',
    1723,
    1772,
    'Daughter of George II and ancestress of the Hesse-Kassel and Danish branches',
    mary_wiki,
    periods=[
        {'id': 'mary-great-britain-name-1723', 'name': 'Princess Mary of Great Britain', 'startYear': 1723, 'endYear': 1740, 'sourceUrl': mary_wiki},
        {'id': 'mary-great-britain-name-1740', 'name': 'Mary, Landgravine of Hesse-Kassel', 'startYear': 1740, 'endYear': 1772, 'sourceUrl': mary_wiki},
    ],
    default_period_id='mary-great-britain-name-1740',
))
frederick_ii_wiki = 'https://en.wikipedia.org/wiki/Frederick_II,_Landgrave_of_Hesse-Kassel'
add(profile(
    FREDERICK_II_HESSE,
    'Frederick',
    'II',
    'Frederick II, Landgrave of Hesse-Kassel',
    'Landgrave of Hesse-Kassel',
    'male',
    1720,
    1785,
    'Husband of Princess Mary of Great Britain',
    frederick_ii_wiki,
))
prince_frederick_wiki = 'https://en.wikipedia.org/wiki/Prince_Frederick_of_Hesse-Kassel'
add(profile(
    PRINCE_FREDERICK_HESSE,
    'Frederick',
    'of Hesse-Kassel',
    'Prince Frederick of Hesse-Kassel',
    'Prince of Hesse-Kassel',
    'male',
    1747,
    1837,
    'Son of Princess Mary of Great Britain',
    prince_frederick_wiki,
))
caroline_nassau_wiki = 'https://en.wikipedia.org/wiki/Princess_Caroline_of_Nassau-Usingen'
add(profile(
    CAROLINE_NASSAU,
    'Caroline',
    'of Nassau-Usingen',
    'Princess Caroline of Nassau-Usingen',
    'Princess of Nassau-Usingen',
    'female',
    1762,
    1823,
    'Wife of Prince Frederick of Hesse-Kassel',
    caroline_nassau_wiki,
))
william_hesse_wiki = 'https://en.wikipedia.org/wiki/Prince_William_of_Hesse-Kassel'
add(profile(
    PRINCE_WILLIAM_HESSE,
    'William',
    'of Hesse-Kassel',
    'Prince William of Hesse-Kassel',
    'Prince of Hesse-Kassel',
    'male',
    1787,
    1867,
    'Father of Louise of Hesse-Kassel, Queen of Denmark',
    william_hesse_wiki,
))
louise_charlotte_wiki = 'https://en.wikipedia.org/wiki/Princess_Louise_Charlotte_of_Denmark'
add(profile(
    LOUISE_CHARLOTTE,
    'Louise Charlotte',
    'of Denmark',
    'Princess Louise Charlotte of Denmark',
    'Princess of Denmark',
    'female',
    1789,
    1864,
    'Mother of Louise of Hesse-Kassel, Queen of Denmark',
    louise_charlotte_wiki,
))
link_child(MARY_GREAT_BRITAIN, GEORGE_II, CAROLINE_ANSBACH)
link_marriage(MARY_GREAT_BRITAIN, FREDERICK_II_HESSE, 1740)
link_child(PRINCE_FREDERICK_HESSE, FREDERICK_II_HESSE, MARY_GREAT_BRITAIN)
link_marriage(PRINCE_FREDERICK_HESSE, CAROLINE_NASSAU, 1786)
link_child(AUGUSTA_CAMBRIDGE, PRINCE_FREDERICK_HESSE, CAROLINE_NASSAU)
link_child(PRINCE_WILLIAM_HESSE, PRINCE_FREDERICK_HESSE, CAROLINE_NASSAU)
link_marriage(PRINCE_WILLIAM_HESSE, LOUISE_CHARLOTTE, 1810)
link_child(LOUISE_HESSE, PRINCE_WILLIAM_HESSE, LOUISE_CHARLOTTE)
people[AUGUSTA_CAMBRIDGE]['note'] = 'Duchess of Cambridge; second cousin and wife of Adolphus'
people[ALEXANDRA_DENMARK]['note'] = 'Queen consort; wife of Edward VII; descendant of George II through Princess Mary'
people[PRINCE_ANDREW]['note'] = 'Prince; husband of Alice of Battenberg; descendant of George II through Princess Mary'

# Validate every relationship introduced or touched here. The strict
# incomplete-parent display filter remains unchanged: data must be complete.
for person_id, person in people.items():
    for parent_id in person.get('parents', []):
        if parent_id not in people or person_id not in people[parent_id].get('children', []):
            raise SystemExit(f'Broken parent-child link: {parent_id} -> {person_id}')
    for child_id in person.get('children', []):
        if child_id not in people or person_id not in people[child_id].get('parents', []):
            raise SystemExit(f'Broken child-parent link: {person_id} -> {child_id}')
    for spouse_id in person.get('spouses', []):
        if spouse_id not in people or person_id not in people[spouse_id].get('spouses', []):
            raise SystemExit(f'Broken spouse link: {person_id} <-> {spouse_id}')

DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

index = INDEX.read_text(encoding='utf-8')
old_cache = '<script type="module" src="./app.js?v=146"></script>'
new_cache = '<script type="module" src="./app.js?v=147"></script>'
if index.count(old_cache) != 1:
    raise SystemExit(f'Expected one v146 cache key, found {index.count(old_cache)}')
INDEX.write_text(index.replace(old_cache, new_cache, 1), encoding='utf-8')

for test_path in Path('tests').glob('*.test.mjs'):
    text = test_path.read_text(encoding='utf-8')
    text = text.replace('starter.version, 28', 'starter.version, 29')
    text = text.replace('version 28', 'version 29')
    text = text.replace('Object.keys(people).length, 168', 'Object.keys(people).length, 179')
    text = text.replace('./app.js?v=146', './app.js?v=147')
    test_path.write_text(text, encoding='utf-8')

print(f"Expanded starter to version {data['version']} with {len(people)} profiles")
