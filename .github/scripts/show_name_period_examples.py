import json
from pathlib import Path

data = json.loads(Path('data/british-royal-line.json').read_text(encoding='utf-8'))
ids = [
    'profile-4475169',
    'profile-g6000000001651648070',
    'profile-g6000000003081589893',
    'profile-g6000000008852088113',
]
for pid in ids:
    print(json.dumps({pid: data['people'].get(pid)}, indent=2, ensure_ascii=False))
