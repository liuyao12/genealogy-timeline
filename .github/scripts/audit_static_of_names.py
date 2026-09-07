import json
from pathlib import Path

data = json.loads(Path('data/british-royal-line.json').read_text(encoding='utf-8'))
rows = []
for pid, person in data['people'].items():
    display = person.get('displayName', '')
    periods = person.get('namePeriods') or []
    if ' of ' in display and not periods:
        rows.append({
            'id': pid,
            'displayName': display,
            'birthYear': person.get('birthYear', ''),
            'deathYear': person.get('deathYear', ''),
            'note': person.get('note', ''),
            'firstName': person.get('firstName', ''),
            'lastName': person.get('lastName', ''),
            'title': person.get('title', ''),
        })
rows.sort(key=lambda r: (int(r['birthYear']) if str(r['birthYear']).isdigit() else 99999, r['displayName']))
print(json.dumps({'count': len(rows), 'rows': rows}, indent=2, ensure_ascii=False))
