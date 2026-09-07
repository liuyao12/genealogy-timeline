import json
import re
from pathlib import Path

data = json.loads(Path('data/british-royal-line.json').read_text(encoding='utf-8'))
people = data['people']
pattern = re.compile(r'\b(?:king|queen|emperor|empress|prince|princess|duke|duchess|marquess|marchioness|earl|countess|elector|electress|landgrave|landgravine|baron|baroness)\b', re.I)
rows = []
for pid, person in people.items():
    evidence = ' · '.join(filter(None, [person.get('title', ''), person.get('note', '')]))
    if not pattern.search(evidence):
        continue
    periods = person.get('namePeriods') or []
    default_id = person.get('defaultNamePeriodId', '')
    default = next((item.get('name', '') for item in periods if item.get('id') == default_id), person.get('displayName', ''))
    title = person.get('title', '')
    title_words = [match.group(0).lower() for match in pattern.finditer(evidence)]
    default_has_title_word = bool(pattern.search(default))
    rows.append({
        'id': pid,
        'displayName': person.get('displayName', ''),
        'defaultName': default,
        'title': title,
        'birthYear': person.get('birthYear', ''),
        'note': person.get('note', ''),
        'periodCount': len(periods),
        'defaultHasTitleWord': default_has_title_word,
        'evidenceTitleWords': sorted(set(title_words)),
    })
rows.sort(key=lambda row: (not row['defaultHasTitleWord'], row['periodCount'] > 0, int(row['birthYear']) if str(row['birthYear']).isdigit() else 99999, row['displayName']))
print(json.dumps({'count': len(rows), 'rows': rows}, indent=2, ensure_ascii=False))
