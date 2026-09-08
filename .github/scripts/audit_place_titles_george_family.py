from __future__ import annotations

import json
from pathlib import Path

path = Path('data/british-royal-line.json')
data = json.loads(path.read_text(encoding='utf-8'))
people = data['people']

print('STARTER', data.get('version'), 'profiles', len(people))
print('\nONE-PARENT PROFILES')
for person_id, person in sorted(people.items(), key=lambda item: (int(item[1].get('birthYear') or 99999), item[1].get('displayName', ''))):
    parents = [parent_id for parent_id in person.get('parents', []) if parent_id in people]
    if len(parents) != 1:
        continue
    parent = people[parents[0]]
    spouse_ids = [spouse_id for spouse_id in parent.get('spouses', []) if spouse_id in people]
    plausible = []
    birth = int(person.get('birthYear') or 0)
    for spouse_id in spouse_ids:
        spouse = people[spouse_id]
        marriage = parent.get('marriageYears', {}).get(spouse_id) or spouse.get('marriageYears', {}).get(parents[0])
        if marriage and int(marriage) <= birth:
            plausible.append(f"{spouse.get('displayName')} [{spouse_id}] married {marriage}")
    print(f"{person.get('displayName')} [{person_id}] <- {parent.get('displayName')} [{parents[0]}]")
    if plausible:
        print('  plausible co-parent:', '; '.join(plausible))
    print('  note:', person.get('note', ''))

print('\nUNITED KINGDOM STRINGS')
for person_id, person in people.items():
    values: list[tuple[str, str]] = []
    for field in ('displayName', 'title', 'note'):
        value = person.get(field)
        if isinstance(value, str) and 'United Kingdom' in value:
            values.append((field, value))
    for period in person.get('namePeriods', []):
        value = period.get('name')
        if isinstance(value, str) and 'United Kingdom' in value:
            values.append((f"namePeriod:{period.get('id')}", value))
    if values:
        print(person_id, '|', person.get('displayName'))
        for field, value in values:
            print(' ', field, '=>', value)

print('\nGEORGE III HOUSEHOLD')
george_id = 'profile-g6000000003091034586'
charlotte_id = 'profile-g6000000003891728922'
for person_id in (george_id, charlotte_id):
    person = people[person_id]
    print(person_id, person['displayName'])
    print(' parents', person.get('parents', []))
    print(' children', [(child_id, people.get(child_id, {}).get('displayName')) for child_id in person.get('children', [])])
    print(' spouses', [(spouse_id, people.get(spouse_id, {}).get('displayName')) for spouse_id in person.get('spouses', [])])
