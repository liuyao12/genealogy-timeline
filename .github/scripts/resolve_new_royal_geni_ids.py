from __future__ import annotations

import json
import urllib.parse
import urllib.request

TITLES = [
    'Princess Augusta of Great Britain',
    'Charles William Ferdinand, Duke of Brunswick',
    'Princess Charlotte of Wales (1796–1817)',
    'Margaret Douglas, Countess of Lennox',
    'Matthew Stewart, 4th Earl of Lennox',
    'Mary of Great Britain',
    'Frederick II, Landgrave of Hesse-Kassel',
    'Prince Frederick of Hesse-Kassel',
    'Princess Caroline of Nassau-Usingen',
    'Prince William of Hesse-Kassel',
    'Princess Charlotte of Denmark',
]

query = urllib.parse.urlencode({
    'action': 'wbgetentities',
    'sites': 'enwiki',
    'titles': '|'.join(TITLES),
    'props': 'labels|claims|sitelinks',
    'languages': 'en',
    'format': 'json',
})
request = urllib.request.Request(
    f'https://www.wikidata.org/w/api.php?{query}',
    headers={
        'User-Agent': 'genealogy-timeline Geni-ID resolver/1.0 (https://github.com/liuyao12/genealogy-timeline)',
        'Accept': 'application/json',
    },
)
with urllib.request.urlopen(request, timeout=60) as response:
    payload = json.load(response)


def item_value(statement: dict) -> str:
    value = statement.get('mainsnak', {}).get('datavalue', {}).get('value')
    if isinstance(value, dict):
        return value.get('id', '') or value.get('text', '')
    return str(value or '')


for entity in payload.get('entities', {}).values():
    title = entity.get('sitelinks', {}).get('enwiki', {}).get('title', '')
    label = entity.get('labels', {}).get('en', {}).get('value', '')
    geni = [item_value(statement) for statement in entity.get('claims', {}).get('P2600', [])]
    father = [item_value(statement) for statement in entity.get('claims', {}).get('P22', [])]
    mother = [item_value(statement) for statement in entity.get('claims', {}).get('P25', [])]
    print(json.dumps({
        'title': title,
        'label': label,
        'qid': entity.get('id', ''),
        'geni': geni,
        'father': father,
        'mother': mother,
    }, ensure_ascii=False))
