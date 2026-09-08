from __future__ import annotations

import json
from collections import deque
from pathlib import Path

DATA = Path('data/british-royal-line.json')
data = json.loads(DATA.read_text(encoding='utf-8'))
people = data['people']
root = data['rootId']


def descendants(start: str) -> set[str]:
    seen = {start}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        for child in people.get(current, {}).get('children', []):
            if child in people and child not in seen:
                seen.add(child)
                queue.append(child)
    return seen


direct = descendants(root)
print('STARTER', data.get('version'), 'PROFILES', len(people), 'HENRY VII DESCENDANTS', len(direct))
print('\nFORMAL SPOUSES NOT CURRENTLY CONNECTED AS DESCENDANTS')
rows = []
for descendant_id in direct:
    descendant = people[descendant_id]
    for spouse_id in descendant.get('spouses', []):
        if spouse_id not in people or spouse_id in direct:
            continue
        spouse = people[spouse_id]
        rows.append((
            int(spouse.get('birthYear') or 99999),
            spouse.get('displayName', ''),
            spouse_id,
            descendant.get('displayName', ''),
            descendant_id,
        ))

for _, spouse_name, spouse_id, descendant_name, descendant_id in sorted(set(rows)):
    spouse = people[spouse_id]
    print(f'\n{spouse_name} [{spouse_id}] spouse of {descendant_name} [{descendant_id}]')
    print('  born/dead:', spouse.get('birthYear'), spouse.get('deathYear'))
    print('  parents:', [(pid, people.get(pid, {}).get('displayName')) for pid in spouse.get('parents', [])])
    print('  children:', [(cid, people.get(cid, {}).get('displayName')) for cid in spouse.get('children', [])])
    print('  note:', spouse.get('note', ''))
    print('  default:', next((p.get('name') for p in spouse.get('namePeriods', []) if p.get('id') == spouse.get('defaultNamePeriodId')), ''))
    print('  period sources:', sorted({p.get('sourceUrl') for p in spouse.get('namePeriods', []) if p.get('sourceUrl')}))

print('\nCURRENT DESCENDANT SPOUSES ALREADY CONNECTED THROUGH BOTH SIDES')
seen_pairs = set()
for person_id in direct:
    for spouse_id in people[person_id].get('spouses', []):
        if spouse_id not in direct:
            continue
        pair = tuple(sorted((person_id, spouse_id)))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        print(' ', people[pair[0]]['displayName'], '<->', people[pair[1]]['displayName'])
