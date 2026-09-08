import json
from pathlib import Path

path = Path('data/british-royal-line.json')
data = json.loads(path.read_text(encoding='utf-8'))
people = data['people']

touched_parents = [
    'profile-g6000000003891739213',
    'profile-g6000000003891753089',
    'profile-g311788525210007050',
    'profile-g312092994390004595',
    'profile-g4137986493320052463',
    'profile-g4138652783200125692',
    'profile-g6000000003232538566',
    'profile-g6000000003858820967',
    'profile-g6000000003858695567',
    'profile-g6000000002435383373',
    'profile-4555899',
    'profile-4555944',
    'profile-g6000000001847933002',
    'profile-g6000000000048910716',
    'profile-g6000000002447248679',
    'profile-g6000000007329600601',
    'profile-4532996',
    'profile-g6000000002737707932',
]

for parent_id in touched_parents:
    parent = people[parent_id]
    source_order = {child_id: index for index, child_id in enumerate(parent.get('children', []))}
    parent['children'] = sorted(
        dict.fromkeys(parent.get('children', [])),
        key=lambda child_id: (
            int(people.get(child_id, {}).get('birthYear') or 99999),
            source_order[child_id],
        ),
    )

path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
