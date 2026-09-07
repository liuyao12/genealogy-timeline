import json
from pathlib import Path

data = json.loads(Path('data/british-royal-line.json').read_text(encoding='utf-8'))
rows = []
for pid, person in data['people'].items():
    if person.get('namePeriods'):
        continue
    rows.append({
        'id': pid,
        'displayName': person.get('displayName', ''),
        'birthYear': person.get('birthYear', ''),
        'deathYear': person.get('deathYear', ''),
        'note': person.get('note', ''),
        'title': person.get('title', ''),
        'firstName': person.get('firstName', ''),
        'lastName': person.get('lastName', ''),
    })
rows.sort(key=lambda r: (int(r['birthYear']) if str(r['birthYear']).lstrip('-').isdigit() else 99999, r['displayName']))
print(json.dumps({'count': len(rows), 'rows': rows}, indent=2, ensure_ascii=False))
