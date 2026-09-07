import json
import re
from pathlib import Path

data = json.loads(Path('data/british-royal-line.json').read_text(encoding='utf-8'))
people = data['people']

TITLE_PATTERN = re.compile(
    r'\b(?:King|Queen|Prince|Princess|Prince consort|Duke|Duchess|Grand Duke|Grand Duchess|'
    r'Elector|Electress|Marquess|Marchioness|Earl|Countess|Lord|Lady)\b[^;,.]*',
    re.I,
)

rows = []
for pid, person in people.items():
    display = person.get('displayName', '')
    note = person.get('note', '')
    title = person.get('title', '')
    periods = [p.get('name', '') for p in person.get('namePeriods', [])]
    evidence = []
    for source, text in [('title', title), ('note', note)]:
        evidence.extend(f'{source}: {m.group(0).strip()}' for m in TITLE_PATTERN.finditer(text or ''))
    if ' of ' not in display or ',' in display:
        continue
    if not evidence and not any(',' in p and TITLE_PATTERN.search(p) for p in periods):
        continue
    rows.append({
        'id': pid,
        'displayName': display,
        'birthYear': person.get('birthYear', ''),
        'deathYear': person.get('deathYear', ''),
        'evidence': evidence,
        'namePeriods': periods,
    })

rows.sort(key=lambda row: (int(row['birthYear']) if str(row['birthYear']).lstrip('-').isdigit() else 99999, row['displayName']))
print(json.dumps({'count': len(rows), 'rows': rows}, indent=2, ensure_ascii=False))
