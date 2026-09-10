from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from royal_gateway_specs import (
    CHILDREN,
    EXTERNAL_MARRIAGES,
    MARRIAGES,
    OTHER_MONARCH_COLOR,
    SPECS,
)

ROOT = Path('.')
DATA_PATH = ROOT / 'data' / 'british-royal-line.json'
USER_AGENT = 'Lineage-genealogy-timeline/1.0 (public-data audit; https://github.com/liuyao12/genealogy-timeline)'
WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
WIKIDATA_API = 'https://www.wikidata.org/w/api.php'


def fetch_json(base: str, params: dict[str, object], retries: int = 4) -> dict:
    url = f"{base}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError('unreachable')


def entity_year(entity: dict, property_id: str) -> int | None:
    claims = entity.get('claims', {}).get(property_id, [])
    for claim in claims:
        value = claim.get('mainsnak', {}).get('datavalue', {}).get('value', {})
        time_value = value.get('time') if isinstance(value, dict) else None
        if not time_value:
            continue
        match = re.match(r'^([+-])(\d{4,})-', time_value)
        if not match:
            continue
        year = int(match.group(2))
        return -year if match.group(1) == '-' else year
    return None


def qid_for_spec(spec: dict) -> str:
    page = fetch_json(WIKIPEDIA_API, {
        'action': 'query',
        'format': 'json',
        'redirects': 1,
        'prop': 'pageprops',
        'ppprop': 'wikibase_item',
        'titles': spec['wiki'],
    })
    for record in page.get('query', {}).get('pages', {}).values():
        qid = record.get('pageprops', {}).get('wikibase_item')
        if qid:
            return qid

    search_terms = [spec['wiki'], spec['name'], *spec.get('aliases', [])]
    checked: set[str] = set()
    for term in search_terms:
        search = fetch_json(WIKIDATA_API, {
            'action': 'wbsearchentities',
            'format': 'json',
            'language': 'en',
            'limit': 12,
            'search': term,
        })
        candidate_ids = [item['id'] for item in search.get('search', []) if item.get('id') and item['id'] not in checked]
        checked.update(candidate_ids)
        if not candidate_ids:
            continue
        entities = fetch_json(WIKIDATA_API, {
            'action': 'wbgetentities',
            'format': 'json',
            'ids': '|'.join(candidate_ids),
            'props': 'claims|labels',
            'languages': 'en',
        }).get('entities', {})
        exact = []
        for qid, entity in entities.items():
            if entity_year(entity, 'P569') != spec['birth']:
                continue
            death = entity_year(entity, 'P570')
            if death is not None and death != spec['death']:
                continue
            exact.append(qid)
        if len(exact) == 1:
            return exact[0]
    raise RuntimeError(f"Could not resolve a unique Wikidata item for {spec['key']}: {spec['wiki']}")


def geni_value_for_qid(qid: str) -> str:
    entity = fetch_json(WIKIDATA_API, {
        'action': 'wbgetentities',
        'format': 'json',
        'ids': qid,
        'props': 'claims',
    }).get('entities', {}).get(qid, {})
    values = []
    for claim in entity.get('claims', {}).get('P2600', []):
        value = claim.get('mainsnak', {}).get('datavalue', {}).get('value')
        if value is not None:
            values.append(str(value).strip())
    values = list(dict.fromkeys(value for value in values if re.fullmatch(r'g?\d+', value, re.I)))
    if not values:
        raise RuntimeError(f'{qid} has no usable Wikidata P2600 Geni profile ID')
    if len(values) > 1:
        raise RuntimeError(f'{qid} has multiple Geni profile IDs: {values}')
    return values[0]


def canonical_geni_id(value: str) -> str:
    raw = str(value).strip()
    match = re.fullmatch(r'(?:profile-)?(g?)(\d+)', raw, re.I)
    if not match:
        raise RuntimeError(f'Invalid Geni ID {value!r}')
    explicit_g, digits = match.groups()
    use_g = bool(explicit_g) or len(digits) >= 15
    return f"profile-{'g' if use_g else ''}{digits}"


def wiki_url(title: str) -> str:
    return 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'), safe='()_,-')


def record_text(person: dict) -> str:
    return ' | '.join([
        str(person.get('displayName') or ''),
        str(person.get('title') or ''),
        str(person.get('note') or ''),
        *[str(period.get('name') or '') for period in person.get('namePeriods') or []],
    ]).casefold()


def existing_candidates(people: dict, spec: dict, canonical_id: str | None = None) -> list[str]:
    aliases = [str(value).casefold() for value in spec.get('aliases', []) if value]
    matches = []
    for profile_id, person in people.items():
        identity_values = {profile_id, str(person.get('sourceId') or ''), *map(str, person.get('geniAliases') or [])}
        if canonical_id and canonical_id in identity_values:
            matches.append(profile_id)
            continue
        if str(person.get('birthYear') or '') != str(spec['birth']):
            continue
        death = str(person.get('deathYear') or '')
        if death and death != str(spec['death']):
            continue
        text = record_text(person)
        if any(alias and alias in text for alias in aliases):
            matches.append(profile_id)
    return list(dict.fromkeys(matches))


def period_records(spec: dict) -> list[dict]:
    rows = spec.get('periods') or [(spec['name'], spec['birth'], spec['death'])]
    result = []
    for index, (name, start, end) in enumerate(rows):
        result.append({
            'id': f"{spec['key']}-name-{start}-{index}",
            'name': name,
            'startYear': start,
            'endYear': end,
            'sourceUrl': wiki_url(spec['wiki']),
        })
    return result


def reign_events(spec: dict) -> list[dict]:
    return [{
        'name': 'Reign',
        'startYear': start,
        'endYear': end,
        'source': 'royal',
        'color': OTHER_MONARCH_COLOR,
        'kind': 'monarch-reign',
        'monarchGroup': 'other',
    } for start, end in spec.get('reigns', [])]


def new_person(spec: dict, profile_id: str) -> dict:
    periods = period_records(spec)
    default_period = next((period for period in periods if period['name'] == spec['name']), periods[-1])
    return {
        'id': profile_id,
        'firstName': spec['name'].split(',')[0],
        'lastName': '',
        'displayName': spec['name'],
        'title': spec['title'],
        'nameOrder': 'western',
        'gender': spec['gender'],
        'birthYear': str(spec['birth']),
        'deathYear': str(spec['death']),
        'isLiving': False,
        'place': '',
        'note': '',
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
        'defaultNamePeriodId': default_period['id'],
        'personalEvents': reign_events(spec),
        'eventVisibility': {},
        'sourceUrl': wiki_url(spec['wiki']),
        'sourceId': profile_id,
        'sourceProvider': 'web',
        'importedAt': '',
        'geniImmediateFamilyLoaded': False,
        'geniImmediateFamilyVerifiedAt': '',
        'geniImmediateFamilyIds': [],
        'starterProfile': True,
        'geniAliases': [profile_id],
    }


def append_unique(person: dict, field: str, *values: str) -> None:
    person[field] = list(dict.fromkeys([*(person.get(field) or []), *[value for value in values if value]]))


def ensure_person(people: dict, id_aliases: dict, spec: dict) -> tuple[str, bool]:
    # Existing starter profiles already carry a verified Geni identity. Resolve
    # those first so a missing P2600 statement cannot create a duplicate.
    provisional = existing_candidates(people, spec)
    canonical_id = None
    qid = None
    if len(provisional) == 1:
        profile_id = provisional[0]
        person = people[profile_id]
        canonical_id = canonical_geni_id(person.get('sourceId') or profile_id)
    else:
        qid = qid_for_spec(spec)
        canonical_id = canonical_geni_id(geni_value_for_qid(qid))
        candidates = existing_candidates(people, spec, canonical_id)
        if len(candidates) > 1:
            raise RuntimeError(f"Ambiguous existing matches for {spec['key']}: {[(value, people[value].get('displayName')) for value in candidates]}")
        if candidates:
            profile_id = candidates[0]
            person = people[profile_id]
        else:
            profile_id = canonical_id
            if profile_id in people:
                raise RuntimeError(f"Geni ID collision for {spec['key']}: {profile_id} is {people[profile_id].get('displayName')}")
            people[profile_id] = new_person(spec, profile_id)
            return profile_id, True

    person = people[profile_id]
    person['starterProfile'] = True
    person['title'] = person.get('title') or spec['title']
    person['sourceId'] = canonical_geni_id(person.get('sourceId') or profile_id)
    append_unique(person, 'geniAliases', profile_id, person['sourceId'], canonical_id)
    if canonical_id != profile_id:
        id_aliases[canonical_id] = profile_id
    if not person.get('namePeriods'):
        person['namePeriods'] = period_records(spec)
        person['defaultNamePeriodId'] = next((period['id'] for period in person['namePeriods'] if period['name'] == person.get('displayName')), person['namePeriods'][-1]['id'])
    existing_reigns = {(event.get('startYear'), event.get('endYear')) for event in person.get('personalEvents') or [] if event.get('kind') == 'monarch-reign' or str(event.get('name')).casefold() == 'reign'}
    for event in reign_events(spec):
        if (event['startYear'], event['endYear']) not in existing_reigns:
            person.setdefault('personalEvents', []).append(event)
    return profile_id, False


def exact_parents(people: dict, child_id: str, parent_ids: list[str]) -> None:
    child = people[child_id]
    previous = [value for value in child.get('parents') or [] if value in people]
    for old_parent_id in previous:
        if old_parent_id not in parent_ids:
            people[old_parent_id]['children'] = [value for value in people[old_parent_id].get('children') or [] if value != child_id]
    child['parents'] = list(dict.fromkeys(parent_ids))
    for parent_id in parent_ids:
        append_unique(people[parent_id], 'children', child_id)


def link_marriage(people: dict, first_id: str, second_id: str, year: int) -> None:
    if year <= 0:
        return
    for person_id, spouse_id in ((first_id, second_id), (second_id, first_id)):
        person = people[person_id]
        append_unique(person, 'partners', spouse_id)
        append_unique(person, 'spouses', spouse_id)
        person.setdefault('marriageYears', {})[spouse_id] = str(year)
        if spouse_id in person.get('nonSpouses') or []:
            person['nonSpouses'] = [value for value in person['nonSpouses'] if value != spouse_id]


def external_profile(people: dict, aliases: list[str]) -> str:
    folded = [value.casefold() for value in aliases]
    matches = [profile_id for profile_id, person in people.items() if any(alias in record_text(person) for alias in folded)]
    matches = list(dict.fromkeys(matches))
    if len(matches) != 1:
        raise RuntimeError(f'Expected one existing profile for {aliases}, found {[(value, people[value].get("displayName")) for value in matches]}')
    return matches[0]


def sort_relationships(people: dict) -> None:
    def born(profile_id: str) -> tuple[int, str]:
        person = people.get(profile_id, {})
        try:
            year = int(person.get('birthYear'))
        except Exception:
            year = 999999
        return year, str(person.get('displayName') or '')

    for person in people.values():
        person['parents'] = list(dict.fromkeys(value for value in person.get('parents') or [] if value in people))
        person['children'] = sorted(dict.fromkeys(value for value in person.get('children') or [] if value in people), key=born)
        for field in ('partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'):
            values = list(dict.fromkeys(value for value in person.get(field) or [] if value in people))
            if field in ('partners', 'spouses'):
                values.sort(key=lambda profile_id: (int(person.get('marriageYears', {}).get(profile_id) or 999999), born(profile_id)))
            person[field] = values


def validate(people: dict) -> None:
    for profile_id, person in people.items():
        if not re.fullmatch(r'profile-g?\d+', profile_id, re.I):
            raise RuntimeError(f'Non-Geni starter key {profile_id}: {person.get("displayName")}')
        if not re.fullmatch(r'profile-g?\d+', str(person.get('sourceId') or ''), re.I):
            raise RuntimeError(f'Missing Geni source ID for {profile_id}: {person.get("displayName")}')
        if person['sourceId'] not in person.get('geniAliases', []):
            raise RuntimeError(f'Source ID not indexed for {profile_id}')
        if len(person.get('parents') or []) == 1:
            raise RuntimeError(f'One-parent profile after expansion: {person.get("displayName")}')
        for parent_id in person.get('parents') or []:
            if profile_id not in people[parent_id].get('children', []):
                raise RuntimeError(f'Non-reciprocal parent edge {parent_id} -> {profile_id}')
        for child_id in person.get('children') or []:
            if profile_id not in people[child_id].get('parents', []):
                raise RuntimeError(f'Non-reciprocal child edge {profile_id} -> {child_id}')
        for spouse_id in person.get('spouses') or []:
            if profile_id not in people[spouse_id].get('spouses', []):
                raise RuntimeError(f'Non-reciprocal spouse edge {profile_id} <-> {spouse_id}')


def update_pinned_test_counts(version: int, count: int) -> None:
    for path in (ROOT / 'tests').glob('*.test.mjs'):
        text = path.read_text(encoding='utf-8')
        updated = re.sub(r'(starter|data)\.version,\s*30\b', rf'\1.version, {version}', text)
        updated = updated.replace('version 30', f'version {version}')
        updated = re.sub(r'Object\.keys\(people\)\.length,\s*187\b', f'Object.keys(people).length, {count}', updated)
        if updated != text:
            path.write_text(updated, encoding='utf-8')


data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
people = data['people']
id_aliases = data.setdefault('idAliases', {})
ids: dict[str, str] = {}
created = []
for item in SPECS:
    profile_id, was_created = ensure_person(people, id_aliases, item)
    ids[item['key']] = profile_id
    if was_created:
        created.append((item['key'], profile_id, item['name']))

for first_key, second_key, year in MARRIAGES:
    link_marriage(people, ids[first_key], ids[second_key], year)

for child_key, father_key, mother_key in CHILDREN:
    exact_parents(people, ids[child_key], [ids[father_key], ids[mother_key]])

for key, aliases, year, _end_year, _status in EXTERNAL_MARRIAGES:
    link_marriage(people, ids[key], external_profile(people, aliases), year)

sort_relationships(people)
validate(people)
data['version'] = 31
DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
update_pinned_test_counts(31, len(people))

print(f'Royal-consort gateway expansion complete: {len(created)} profiles added; {len(people)} profiles total.')
for key, profile_id, name in created:
    print(f'  {key}: {profile_id} | {name}')
