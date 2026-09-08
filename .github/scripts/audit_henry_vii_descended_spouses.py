from __future__ import annotations

import json
from collections import deque
from pathlib import Path

DATA = Path('data/british-royal-line.json')
data = json.loads(DATA.read_text(encoding='utf-8'))
people = data['people']
root = data['rootId']


def descendants(start: str) -> set[str]:
    found = {start}
    queue = deque([start])
    while queue:
        person_id = queue.popleft()
        for child_id in people.get(person_id, {}).get('children', []):
            if child_id in people and child_id not in found:
                found.add(child_id)
                queue.append(child_id)
    return found


def path_from_root(target: str) -> list[str]:
    previous: dict[str, str | None] = {root: None}
    queue = deque([root])
    while queue:
        current = queue.popleft()
        if current == target:
            break
        for child_id in people.get(current, {}).get('children', []):
            if child_id in people and child_id not in previous:
                previous[child_id] = current
                queue.append(child_id)
    if target not in previous:
        return []
    result: list[str] = []
    current: str | None = target
    while current is not None:
        result.append(current)
        current = previous[current]
    return result[::-1]


def label(person_id: str) -> str:
    person = people[person_id]
    return f"{person.get('displayName')} [{person_id}]"

lineal = descendants(root)
print('STARTER', data.get('version'), 'profiles', len(people), 'Henry VII descendants', len(lineal))
print('\nSPOUSE PAIRS WITH BOTH PARTNERS DESCENDED FROM HENRY VII')
seen: set[tuple[str, str]] = set()
for person_id in sorted(lineal, key=lambda pid: (int(people[pid].get('birthYear') or 99999), people[pid].get('displayName', ''))):
    for spouse_id in people[person_id].get('spouses', []):
        if spouse_id not in people:
            continue
        pair = tuple(sorted((person_id, spouse_id)))
        if pair in seen:
            continue
        seen.add(pair)
        if spouse_id not in lineal:
            continue
        print('\n', label(person_id), '<->', label(spouse_id))
        for endpoint in pair:
            print(' ', ' -> '.join(people[pid]['displayName'] for pid in path_from_root(endpoint)))

print('\nSPOUSES OF HENRY VII DESCENDANTS NOT CURRENTLY IN THE DESCENDANT CLOSURE')
seen.clear()
for person_id in sorted(lineal, key=lambda pid: (int(people[pid].get('birthYear') or 99999), people[pid].get('displayName', ''))):
    for spouse_id in people[person_id].get('spouses', []):
        if spouse_id not in people or spouse_id in lineal:
            continue
        pair = tuple(sorted((person_id, spouse_id)))
        if pair in seen:
            continue
        seen.add(pair)
        spouse = people[spouse_id]
        print('\nDESCENDANT:', label(person_id))
        print('SPOUSE    :', label(spouse_id))
        print(' birth/death:', spouse.get('birthYear'), spouse.get('deathYear'))
        print(' parents:', [label(pid) for pid in spouse.get('parents', []) if pid in people])
        print(' note:', spouse.get('note', ''))
        print(' source:', spouse.get('sourceUrl', ''))

print('\nCAROLINE OF BRUNSWICK')
for person_id, person in people.items():
    if 'Caroline of Brunswick' not in person.get('displayName', ''):
        continue
    print(label(person_id))
    print(' parents:', [label(pid) for pid in person.get('parents', []) if pid in people])
    print(' children:', [label(pid) for pid in person.get('children', []) if pid in people])
    print(' spouses:', [label(pid) for pid in person.get('spouses', []) if pid in people])
    print(' source:', person.get('sourceUrl', ''))
