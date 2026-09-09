from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

TITLES = [
    'Princess Augusta of Great Britain',
    'Charles William Ferdinand, Duke of Brunswick-Wolfenbüttel',
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
    'Margaret Douglas',
    'Matthew Stewart, 4th Earl of Lennox',
]
HEADERS = {
    'User-Agent': 'Lineage-genealogy-audit/1.0 (https://github.com/liuyao12/genealogy-timeline)'
}

# Some familiar English forms are not current Wikipedia titles and an open
# search can select a similarly named parent instead. Resolve those titles
# explicitly before consulting Wikidata.
WIKIPEDIA_TITLE_OVERRIDES = {
    'Prince William of Prussia (1783–1851)': 'Prince Wilhelm of Prussia (1783–1851)',
}

# Stable identities independently checked against Geni's public profiles. The
# Augusta claim has disappeared from Wikidata; the Wilhelm entry is also kept
# here to guard against future ambiguity between father and son.
VERIFIED_GENI_FALLBACKS = {
    'Princess Augusta of Great Britain': 'profile-g312092994390004595',
    'Prince William of Prussia (1783–1851)': 'profile-g6000000003232583515',
}


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def canonical_geni(value: object) -> str:
    raw = str(value).strip().removeprefix('profile-')
    if raw.startswith('g'):
        return f'profile-{raw}'
    return f"profile-{'g' if len(raw) >= 15 else ''}{raw}"


def page_for_title(title: str) -> dict:
    params = urllib.parse.urlencode({
        'action': 'query',
        'format': 'json',
        'formatversion': 2,
        'redirects': 1,
        'prop': 'pageprops',
        'ppprop': 'wikibase_item',
        'titles': title,
    })
    page = get_json(f'https://en.wikipedia.org/w/api.php?{params}')['query']['pages'][0]
    if page.get('missing') is not None or not page.get('pageprops', {}).get('wikibase_item'):
        search_params = urllib.parse.urlencode({
            'action': 'query',
            'format': 'json',
            'formatversion': 2,
            'generator': 'search',
            'gsrsearch': title,
            'gsrlimit': 5,
            'prop': 'pageprops',
            'ppprop': 'wikibase_item',
        })
        candidates = get_json(f'https://en.wikipedia.org/w/api.php?{search_params}').get('query', {}).get('pages', [])
        page = next((candidate for candidate in candidates if candidate.get('pageprops', {}).get('wikibase_item')), page)
    return page


resolved = {}
for requested_title in TITLES:
    lookup_title = WIKIPEDIA_TITLE_OVERRIDES.get(requested_title, requested_title)
    page = page_for_title(lookup_title)
    qid = page.get('pageprops', {}).get('wikibase_item')
    if not qid:
        raise SystemExit(f'No Wikidata entity for {requested_title}: {page}')
    entity = get_json(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json')['entities'][qid]
    claims = entity.get('claims', {}).get('P2600', [])
    values = []
    for claim in claims:
        value = claim.get('mainsnak', {}).get('datavalue', {}).get('value')
        if value:
            values.append(canonical_geni(value))
    fallback = VERIFIED_GENI_FALLBACKS.get(requested_title)
    if fallback:
        values = [fallback, *[value for value in values if value != fallback]]
    if not values:
        raise SystemExit(f'No Geni.com profile ID (Wikidata P2600) or verified fallback for {requested_title} [{qid}]')
    resolved[requested_title] = {
        'qid': qid,
        'geniId': values[0],
        'allGeniIds': values,
        'wikipediaTitle': page.get('title', lookup_title),
    }

Path('.github/henry-vii-spouse-branch-ids.json').write_text(
    json.dumps(resolved, ensure_ascii=False, indent=2) + '\n',
    encoding='utf-8',
)
print(json.dumps(resolved, ensure_ascii=False, indent=2))
