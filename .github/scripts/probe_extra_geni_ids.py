from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

PAGES = [
    'George II of Greece',
    'Mariana of Austria',
    'Princess Victoria Louise of Prussia',
    'Ernest Augustus, Duke of Brunswick',
]
HEADERS = {'User-Agent': 'Lineage genealogy audit/1.0 (https://github.com/liuyao12/genealogy-timeline)'}


def get_json(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

rows = []
for title in PAGES:
    query = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'redirects': 1,
        'prop': 'pageprops', 'ppprop': 'wikibase_item', 'titles': title,
    })
    page_data = get_json('https://en.wikipedia.org/w/api.php?' + query)
    page = next(iter(page_data.get('query', {}).get('pages', {}).values()), {})
    qid = page.get('pageprops', {}).get('wikibase_item', '')
    entity = get_json(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json')['entities'][qid] if qid else {}
    geni = []
    for claim in entity.get('claims', {}).get('P2600', []):
        value = claim.get('mainsnak', {}).get('datavalue', {}).get('value')
        if isinstance(value, str): geni.append(value)
    rows.append((title, page.get('title') or title, qid, '<br>'.join(geni)))

path = Path('.github/wikidata-geni-extra-probe.md')
lines = ['# Additional Wikidata → Geni identity probe', '', '| Candidate | Resolved | Wikidata | Geni P2600 |', '|---|---|---|---|']
lines += ['| ' + ' | '.join(value or '—' for value in row) + ' |' for row in rows]
path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(path)
