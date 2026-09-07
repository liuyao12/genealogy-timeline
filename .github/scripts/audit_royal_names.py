import json
import re
from pathlib import Path

path = Path('data/british-royal-line.json')
data = json.loads(path.read_text(encoding='utf-8'))
people = data['people']

TITLE_WORDS = re.compile(r'\b(?:Duke|Duchess|Prince|Princess|Marquess|Marchioness|Earl|Countess|Count|Elector|Electress|Landgrave|Landgravine|Grand Duke|Grand Duchess|Archduke|Archduchess|King|Queen)\b', re.I)

rows = []
for pid, person in people.items():
    display = person.get('displayName', '')
    title = person.get('title', '')
    periods = [p.get('name', '') for p in person.get('namePeriods', [])]
    candidate = (
        ' of ' in display
        or TITLE_WORDS.search(title or '')
        or any(' of ' in p or TITLE_WORDS.search(p or '') for p in periods)
    )
    if not candidate:
        continue
    rows.append({
        'id': pid,
        'displayName': display,
        'firstName': person.get('firstName', ''),
        'lastName': person.get('lastName', ''),
        'title': title,
        'birthYear': person.get('birthYear', ''),
        'deathYear': person.get('deathYear', ''),
        'note': person.get('note', ''),
        'namePeriods': periods,
        'sourceUrl': person.get('sourceUrl', ''),
    })

rows.sort(key=lambda row: (int(row['birthYear']) if str(row['birthYear']).lstrip('-').isdigit() else 99999, row['displayName']))
print(json.dumps({'count': len(rows), 'rows': rows}, indent=2, ensure_ascii=False))
