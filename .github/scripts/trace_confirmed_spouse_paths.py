from __future__ import annotations

import json
import urllib.parse
import urllib.request
from collections import defaultdict, deque

STARTS = {
    'Caroline of Brunswick': 'Q167433',
    'Augusta, Duchess of Cambridge': 'Q62068',
    'Louis IV, Grand Duke of Hesse': 'Q164498',
    'Alexandra of Denmark': 'Q152260',
    'Prince Andrew of Greece and Denmark': 'Q156531',
    'Elizabeth, the Queen Mother': 'Q10633',
    'Henry Stuart, Lord Darnley': 'Q312381',
}
HENRY = 'Q675493'
values = ' '.join(f'wd:{qid}' for qid in STARTS.values())
query = f'''SELECT DISTINCT ?start ?child ?parent ?childLabel ?parentLabel ?childGeni ?parentGeni WHERE {{
  VALUES ?start {{ {values} }}
  ?start (wdt:P22|wdt:P25)* ?child .
  ?child (wdt:P22|wdt:P25) ?parent .
  ?parent (wdt:P22|wdt:P25)* wd:{HENRY} .
  OPTIONAL {{ ?child wdt:P2600 ?childGeni }}
  OPTIONAL {{ ?parent wdt:P2600 ?parentGeni }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}'''
body = urllib.parse.urlencode({'query': query, 'format': 'json'}).encode()
request = urllib.request.Request(
    'https://query.wikidata.org/sparql',
    data=body,
    headers={
        'User-Agent': 'genealogy-timeline spouse path audit/1.0 (https://github.com/liuyao12/genealogy-timeline)',
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
    },
)
with urllib.request.urlopen(request, timeout=180) as response:
    payload = json.load(response)


def qid(value: str) -> str:
    return value.rsplit('/', 1)[-1]


edges: dict[str, set[str]] = defaultdict(set)
labels: dict[str, str] = {}
geni: dict[str, set[str]] = defaultdict(set)
starts_by_qid = {value: key for key, value in STARTS.items()}
for row in payload.get('results', {}).get('bindings', []):
    child = qid(row['child']['value'])
    parent = qid(row['parent']['value'])
    edges[child].add(parent)
    labels[child] = row.get('childLabel', {}).get('value', child)
    labels[parent] = row.get('parentLabel', {}).get('value', parent)
    if row.get('childGeni', {}).get('value'):
        geni[child].add(row['childGeni']['value'])
    if row.get('parentGeni', {}).get('value'):
        geni[parent].add(row['parentGeni']['value'])

print('ROWS', len(payload.get('results', {}).get('bindings', [])), 'NODES', len(labels), 'EDGES', sum(map(len, edges.values())))
for start_qid, name in starts_by_qid.items():
    queue = deque([start_qid])
    previous: dict[str, str | None] = {start_qid: None}
    while queue and HENRY not in previous:
        current = queue.popleft()
        for parent in sorted(edges.get(current, []), key=lambda item: labels.get(item, item)):
            if parent in previous:
                continue
            previous[parent] = current
            queue.append(parent)
    print('\n###', name, start_qid)
    if HENRY not in previous:
        print('NO PATH')
        continue
    path = []
    current: str | None = HENRY
    while current is not None:
        path.append(current)
        current = previous[current]
    path.reverse()
    for depth, item in enumerate(path):
        print(depth, item, '|', labels.get(item, item), '| Geni', sorted(geni.get(item, [])))
