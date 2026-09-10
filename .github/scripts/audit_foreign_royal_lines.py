from __future__ import annotations

import json
import re
from collections import deque
from pathlib import Path

DATA_PATH = Path('data/british-royal-line.json')
REPORT_PATH = Path('audit/foreign-royal-lines.md')
JSON_PATH = Path('audit/foreign-royal-lines.json')

payload = json.loads(DATA_PATH.read_text(encoding='utf-8'))
people = payload['people']
root_id = payload['rootId']

BRITISH_TERMS = re.compile(
    r'\b(England|English|Scotland|Scots|Wales|Welsh|Great Britain|Northern Ireland|United Kingdom|Britain|British)\b',
    re.I,
)
ROYAL_TERMS = re.compile(
    r'\b(King|Queen|Emperor|Empress|Elector|Electress|Grand Duke|Grand Duchess|Duke|Duchess|Prince|Princess|Tsar|Czar|Sultan)\b',
    re.I,
)
CONSORT_TERMS = re.compile(r'\b(Queen consort|Queen of|Empress|Electress|Grand Duchess|Princess of Wales)\b', re.I)
SOVEREIGN_TERMS = re.compile(r'\b(King of|Queen of|Emperor|Empress|Elector|Electress|Grand Duke|Grand Duchess)\b', re.I)


def name_text(person: dict) -> str:
    return ' | '.join(
        str(value or '')
        for value in [
            person.get('displayName'),
            person.get('title'),
            person.get('note'),
            *[period.get('name') for period in person.get('namePeriods') or []],
        ]
    )


def existing(ids):
    return [item for item in (ids or []) if item in people]


def names(ids):
    return [people[item].get('displayName', item) for item in existing(ids)]


def neighbours(person_id):
    person = people[person_id]
    return list(dict.fromkeys(existing([
        *person.get('parents', []),
        *person.get('children', []),
        *person.get('spouses', []),
        *person.get('partners', []),
    ])))


def descendants(start):
    out = {start}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        for child in existing(people[current].get('children')):
            if child in out:
                continue
            out.add(child)
            queue.append(child)
    return out


henry_descendants = descendants(root_id)
royals = []
foreign_consorts = []
foreign_sovereigns = []
for person_id, person in people.items():
    text = name_text(person)
    if ROYAL_TERMS.search(text):
        royals.append(person_id)
    if CONSORT_TERMS.search(text) and not BRITISH_TERMS.search(text):
        foreign_consorts.append(person_id)
    if SOVEREIGN_TERMS.search(text) and not BRITISH_TERMS.search(text):
        foreign_sovereigns.append(person_id)

rows = []
for person_id in sorted(foreign_consorts, key=lambda item: (int(people[item].get('birthYear') or 99999), people[item].get('displayName', ''))):
    person = people[person_id]
    rows.append({
        'id': person_id,
        'name': person.get('displayName'),
        'title': person.get('title'),
        'birth': person.get('birthYear'),
        'death': person.get('deathYear'),
        'parents': names(person.get('parents')),
        'children': names(person.get('children')),
        'spouses': names(person.get('spouses')),
        'in_henry_descendants': person_id in henry_descendants,
        'parent_count': len(existing(person.get('parents'))),
        'child_count': len(existing(person.get('children'))),
        'source_id': person.get('sourceId'),
    })

fredericks = []
for person_id, person in people.items():
    if re.search(r'\bFrederick\b', name_text(person), re.I):
        fredericks.append({
            'id': person_id,
            'name': person.get('displayName'),
            'title': person.get('title'),
            'birth': person.get('birthYear'),
            'death': person.get('deathYear'),
            'parents': names(person.get('parents')),
            'children': names(person.get('children')),
            'spouses': names(person.get('spouses')),
        })

royal_neighbourhood = set(foreign_sovereigns) | set(foreign_consorts)
for person_id in list(royal_neighbourhood):
    royal_neighbourhood.update(neighbours(person_id))
components = []
unseen = set(royal_neighbourhood)
while unseen:
    start = unseen.pop()
    component = {start}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        for other in neighbours(current):
            if other in royal_neighbourhood and other not in component:
                component.add(other)
                unseen.discard(other)
                queue.append(other)
    components.append(sorted(component, key=lambda item: (int(people[item].get('birthYear') or 99999), people[item].get('displayName', ''))))
components.sort(key=lambda component: (-len(component), int(people[component[0]].get('birthYear') or 99999)))

summary = {
    'starter_version': payload.get('version'),
    'profile_count': len(people),
    'foreign_consorts': rows,
    'foreign_sovereign_ids': foreign_sovereigns,
    'fredericks': fredericks,
    'components': [[people[item].get('displayName') for item in component] for component in components],
}
JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
JSON_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lines = [
    '# Foreign royal-line audit',
    '',
    f"Starter version: **{payload.get('version')}**; profiles: **{len(people)}**.",
    '',
    '## Frederick profiles already stored',
    '',
]
for row in sorted(fredericks, key=lambda item: (int(item['birth'] or 99999), item['name'])):
    lines.append(f"- **{row['name']}** ({row['birth']}–{row['death']}); parents: {', '.join(row['parents']) or 'none'}; children: {', '.join(row['children']) or 'none'}; spouses: {', '.join(row['spouses']) or 'none'}")
lines += ['', '## Foreign queen-consort / empress / electress gateways', '']
for row in rows:
    lines.append(
        f"- **{row['name']}** ({row['birth']}–{row['death']}) — title: {row['title'] or '—'}; "
        f"parents {row['parent_count']}: {', '.join(row['parents']) or 'none'}; "
        f"children {row['child_count']}: {', '.join(row['children']) or 'none'}; "
        f"spouses: {', '.join(row['spouses']) or 'none'}; "
        f"Henry VII descendant: {'yes' if row['in_henry_descendants'] else 'no'}"
    )
lines += ['', '## Foreign royal neighbourhood components', '']
for index, component in enumerate(components, 1):
    lines.append(f"### Component {index} ({len(component)} profiles)")
    lines.append('')
    for person_id in component:
        person = people[person_id]
        lines.append(
            f"- {person.get('displayName')} ({person.get('birthYear')}–{person.get('deathYear')}); "
            f"parents: {', '.join(names(person.get('parents'))) or 'none'}; "
            f"children: {', '.join(names(person.get('children'))) or 'none'}"
        )
    lines.append('')
REPORT_PATH.write_text('\n'.join(lines), encoding='utf-8')
print(f'Wrote {REPORT_PATH} and {JSON_PATH}')
