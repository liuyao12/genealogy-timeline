from __future__ import annotations

import html
import json
import re
import urllib.parse
import urllib.request

USER_AGENT = 'Mozilla/5.0 Lineage-Genealogy-Timeline/1.0'
QUERIES = {
    'royal-france-francis-i-1494': 'Francis I King of France 1494 1547',
    'royal-denmark-anne-catherine-brandenburg-1575': 'Anne Catherine of Brandenburg 1575 1612',
    'royal-denmark-christian-iv-1577': 'Christian IV King of Denmark 1577 1648',
    'royal-denmark-frederick-ii-1534': 'Frederick II King of Denmark 1534 1588',
    'royal-denmark-sophie-amalie-1628': 'Sophie Amalie of Brunswick-Luneburg 1628 1685',
    'royal-denmark-sophie-mecklenburg-1557': 'Sophie of Mecklenburg-Gustrow 1557 1631',
    'royal-greece-george-i-1845': 'George I King of the Hellenes 1845 1913',
}


def fetch(query: str) -> str:
    url = 'https://www.geni.com/search?' + urllib.parse.urlencode({
        'search_type': 'people',
        'names': query,
    })
    request = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode('utf-8', errors='replace')


def strip_tags(value: str) -> str:
    value = re.sub(r'<[^>]+>', ' ', value)
    return re.sub(r'\s+', ' ', html.unescape(value)).strip()


def results(body: str) -> list[dict[str, str]]:
    anchors = list(re.finditer(
        r'<a\b[^>]*href=["\'](?P<url>/people/[^"\']+/(?P<id>\d{12,}))["\'][^>]*>(?P<label>.*?)</a>',
        body,
        flags=re.I | re.S,
    ))
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, match in enumerate(anchors):
        profile_id = match.group('id')
        if profile_id in seen:
            continue
        seen.add(profile_id)
        end = anchors[index + 1].start() if index + 1 < len(anchors) else min(len(body), match.end() + 5000)
        context = strip_tags(body[match.end():end])[:1200]
        found.append({
            'id': profile_id,
            'label': strip_tags(match.group('label')),
            'url': 'https://www.geni.com' + html.unescape(match.group('url')),
            'context': context,
        })
    return found


output = {}
for local_id, query in QUERIES.items():
    body = fetch(query)
    output[local_id] = {
        'query': query,
        'results': results(body)[:20],
    }

print(json.dumps(output, indent=2, ensure_ascii=False, sort_keys=True))
