from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

TITLES = [
    'Princess Augusta of Great Britain',
    'Charles William Ferdinand, Duke of Brunswick',
    'Princess Mary of Great Britain',
    'Frederick II, Landgrave of Hesse-Kassel',
    'Prince Frederick of Hesse-Kassel',
    'Princess Caroline of Nassau-Usingen',
    'Prince William of Hesse-Kassel',
    'Princess Charlotte of Denmark',
    'Sophia Dorothea of Hanover',
    'Frederick William I of Prussia',
    'Prince Augustus William of Prussia',
    'Duchess Luise of Brunswick-Wolfenbüttel',
    'Frederick William II of Prussia',
    'Frederica Louisa of Hesse-Darmstadt',
    'Prince William of Prussia (1783–1851)',
    'Princess Maria Anna of Hesse-Homburg',
]
HEADERS = {'User-Agent': 'Lineage-genealogy-audit/1.0 (https://github.com/liuyao12/genealogy-timeline)'}


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def canonical_geni(value: str) -> str:
    raw = str(value).strip().removeprefix('profile-')
    if raw.startswith('g'):
        return f'profile-{raw}'
    return f"profile-{'g' if len(raw) >= 15 else ''}{raw}"


resolved = {}
for title in TITLES:
    params = urllib.parse.urlencode({
        'action': 'query',
        'format': 'json',
        'formatversion': 2,
        'redirects': 1,
        'prop': 'pageprops',
        'ppprop': 'wikibase_item',
        'titles': title,
    })
    page_data = get_json(f'https://en.wikipedia.org/w/api.php?{params}')
    page = page_data['query']['pages'][0]
    qid = page.get('pageprops', {}).get('wikibase_item')
    if not qid:
        raise SystemExit(f'No Wikidata entity for {title}: {page}')
    entity = get_json(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json')['entities'][qid]
    claims = entity.get('claims', {}).get('P2600', [])
    values = []
    for claim in claims:
        value = claim.get('mainsnak', {}).get('datavalue', {}).get('value')
        if value:
            values.append(canonical_geni(value))
    if not values:
        raise SystemExit(f'No Geni.com profile ID (P2600) for {title} [{qid}]')
    resolved[title] = {
        'qid': qid,
        'geniId': values[0],
        'allGeniIds': values,
        'wikipediaTitle': page.get('title', title),
    }

Path('.github/spouse-ancestor-geni-ids.json').write_text(
    json.dumps(resolved, ensure_ascii=False, indent=2) + '\n',
    encoding='utf-8',
)
print(json.dumps(resolved, ensure_ascii=False, indent=2))
