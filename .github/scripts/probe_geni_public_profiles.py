from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request

USER_AGENT = 'Mozilla/5.0 Lineage-Genealogy-Timeline/1.0'
COMPACT_IDS = ['4695498', '4104768', '4104731', '4104556', '4104869', '4104601', '4533621']
KNOWN_GUIDS = {
    'John III of Portugal': '6000000002756902145',
    'Philip I of Castile': '376298089210013354',
    'Joanna I of Castile': '6000000018001664573',
    'Charles V': '6000000001095643277',
    'Isabella of Portugal': '5405903272180113463',
}


def fetch(url: str) -> tuple[str, str, int]:
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/html,application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode('utf-8', errors='replace')
        return response.geturl(), body, response.status


def profile_links(body: str) -> list[dict[str, str]]:
    pattern = re.compile(r'href=["\'](?P<url>https?://(?:www\.)?geni\.com/people/[^"\']+/(?P<id>\d{6,}))["\'][^>]*>(?P<label>.*?)</a>', re.I | re.S)
    found = []
    seen = set()
    for match in pattern.finditer(body):
        key = match.group('id')
        if key in seen:
            continue
        seen.add(key)
        label = re.sub(r'<[^>]+>', ' ', match.group('label'))
        label = re.sub(r'\s+', ' ', label).strip()
        found.append({'id': key, 'url': match.group('url'), 'label': label})
    return found


results: dict[str, object] = {}
for profile_id in COMPACT_IDS:
    record: dict[str, object] = {}
    for label, url in [
        ('profile-index', f'https://www.geni.com/profile/index/{profile_id}'),
        ('people-id', f'https://www.geni.com/people/{profile_id}'),
        ('api', f'https://www.geni.com/api/profile-{profile_id}'),
    ]:
        try:
            final_url, body, status = fetch(url)
            ids = list(dict.fromkeys(re.findall(r'(?:/people/[^?"\']*/|profile-g?)(\d{6,})', final_url + '\n' + body, flags=re.I)))
            record[label] = {
                'status': status,
                'finalUrl': final_url,
                'ids': ids[:20],
                'bodyStart': re.sub(r'\s+', ' ', body[:500]),
            }
        except Exception as exc:
            record[label] = {'error': repr(exc)}
    results[profile_id] = record

for name, profile_id in KNOWN_GUIDS.items():
    try:
        final_url, body, status = fetch(f'https://www.geni.com/profile/index/{profile_id}')
        links = profile_links(body)
        results[name] = {
            'status': status,
            'finalUrl': final_url,
            'catherineLinks': [link for link in links if re.search(r'cath|catar|kath', link['label'], re.I)],
            'allRelevantLinks': [link for link in links if re.search(r'portugal|austria|castile|joanna|philip|john|cath|catar|kath', link['label'], re.I)][:100],
        }
    except Exception as exc:
        results[name] = {'error': repr(exc)}

for query in [
    'Catherine of Austria Queen of Portugal',
    'Catarina de Austria Rainha de Portugal',
    'Catherine Habsburg John III Portugal',
]:
    encoded = urllib.parse.urlencode({'search_type': 'people', 'names': query})
    try:
        final_url, body, status = fetch(f'https://www.geni.com/search?{encoded}')
        results[f'search:{query}'] = {
            'status': status,
            'finalUrl': final_url,
            'links': profile_links(body)[:100],
            'bodyMentions': [line.strip() for line in re.sub(r'><', '>\n<', body).splitlines() if re.search(r'Catherine|Catarina|Austria|Portugal', line, re.I)][:50],
        }
    except Exception as exc:
        results[f'search:{query}'] = {'error': repr(exc)}

print(json.dumps(results, indent=2, ensure_ascii=False, sort_keys=True))
