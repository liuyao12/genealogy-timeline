from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

DATA = Path('data/british-royal-line.json')
payload = json.loads(DATA.read_text(encoding='utf-8'))
people = payload['people']

geni_key = re.compile(r'^profile-g?\d+$', re.I)

def name(person: dict) -> str:
    return str(person.get('displayName') or '').strip()

print('TOTAL', len(people))

claudes = []
for key, person in people.items():
    if 'claude' in name(person).lower() or any('claude' in str(period.get('name', '')).lower() for period in person.get('namePeriods', [])):
        claudes.append({
            'key': key,
            'sourceId': person.get('sourceId'),
            'sourceProvider': person.get('sourceProvider'),
            'sourceUrl': person.get('sourceUrl'),
            'name': name(person),
            'parents': person.get('parents', []),
            'children': person.get('children', []),
            'partners': person.get('partners', []),
            'spouses': person.get('spouses', []),
        })
print('CLAUDES')
print(json.dumps(claudes, indent=2, ensure_ascii=False))

missing = []
for key, person in people.items():
    source_id = str(person.get('sourceId') or '').strip()
    source_url = str(person.get('sourceUrl') or '').strip()
    provider = str(person.get('sourceProvider') or '').strip().lower()
    if not geni_key.fullmatch(key) or not geni_key.fullmatch(source_id) or provider != 'geni' or 'geni.com/' not in source_url:
        missing.append({
            'key': key,
            'name': name(person),
            'sourceId': source_id,
            'sourceProvider': provider,
            'sourceUrl': source_url,
            'birth': person.get('birthYear'),
            'death': person.get('deathYear'),
        })
print('NON_CANONICAL_OR_NON_GENI', len(missing))
print(json.dumps(missing, indent=2, ensure_ascii=False))

by_name: dict[str, list[str]] = defaultdict(list)
for key, person in people.items():
    normalized = re.sub(r'[^a-z0-9]+', ' ', name(person).lower()).strip()
    by_name[normalized].append(key)
print('DUPLICATE_DISPLAY_NAMES')
print(json.dumps({k: v for k, v in by_name.items() if k and len(v) > 1}, indent=2, ensure_ascii=False))

monarch_pattern = re.compile(r'\b(?:king|queen regnant|emperor|empress regnant|tsar|tsarina|sultan|monarch)\b', re.I)
monarchs = []
for key, person in people.items():
    text = ' '.join([
        name(person),
        str(person.get('title') or ''),
        str(person.get('note') or ''),
        *[str(period.get('name') or '') for period in person.get('namePeriods', [])],
    ])
    reigns = [event for event in person.get('personalEvents', []) if str(event.get('name') or '').strip().lower().startswith('reign')]
    if monarch_pattern.search(text) or reigns:
        monarchs.append({
            'key': key,
            'name': name(person),
            'reigns': reigns,
        })
print('MONARCHS', len(monarchs))
print(json.dumps(monarchs, indent=2, ensure_ascii=False))

shape_counts = Counter()
for person in people.values():
    for event in person.get('personalEvents', []):
        shape = tuple(sorted(event.keys()))
        shape_counts[shape] += 1
print('PERSONAL_EVENT_SHAPES')
for shape, count in shape_counts.items():
    print(count, shape)

print('PERSONAL_EVENT_NAMES', Counter(
    str(event.get('name') or '')
    for person in people.values()
    for event in person.get('personalEvents', [])
))
print('PERSONAL_EVENT_SOURCES', Counter(
    str(event.get('source') or '')
    for person in people.values()
    for event in person.get('personalEvents', [])
))
print('PERSONAL_EVENT_COLORS', Counter(
    str(event.get('color') or '')
    for person in people.values()
    for event in person.get('personalEvents', [])
))
