from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DATA = Path('data/british-royal-line.json')
payload = json.loads(DATA.read_text(encoding='utf-8'))
people = payload['people']
USER_AGENT = 'Lineage-Genealogy-Timeline/1.0 (https://github.com/liuyao12/genealogy-timeline)'


def get_json(base: str, params: dict[str, Any]) -> dict[str, Any]:
    url = base + '?' + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt == 4:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise AssertionError('unreachable')


def year_from_claim(entity: dict[str, Any], prop: str) -> int | None:
    for claim in entity.get('claims', {}).get(prop, []):
        value = claim.get('mainsnak', {}).get('datavalue', {}).get('value')
        if isinstance(value, dict):
            match = re.match(r'^[+-](\d{4,})-', str(value.get('time', '')))
            if match:
                return int(match.group(1))
    return None


def geni_ids(entity: dict[str, Any]) -> list[str]:
    found: list[str] = []
    for claim in entity.get('claims', {}).get('P2600', []):
        value = claim.get('mainsnak', {}).get('datavalue', {}).get('value')
        if value is not None:
            digits = re.sub(r'^(?:profile-)?g?', '', str(value), flags=re.I)
            if digits.isdigit():
                found.append(digits)
    return list(dict.fromkeys(found))


def wikipedia_item(url: str) -> tuple[str, str] | None:
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return None
    match = re.fullmatch(r'([a-z-]+)\.wikipedia\.org', parsed.hostname or '', flags=re.I)
    if not match or not parsed.path.startswith('/wiki/'):
        return None
    language = match.group(1)
    title = urllib.parse.unquote(parsed.path.removeprefix('/wiki/'))
    api = f'https://{language}.wikipedia.org/w/api.php'
    result = get_json(api, {
        'action': 'query',
        'format': 'json',
        'redirects': 1,
        'prop': 'pageprops',
        'ppprop': 'wikibase_item',
        'titles': title,
    })
    pages = result.get('query', {}).get('pages', {})
    for page in pages.values():
        item = page.get('pageprops', {}).get('wikibase_item')
        if item:
            return item, str(page.get('title') or title)
    return None


def entity_for_qid(qid: str) -> dict[str, Any]:
    result = get_json('https://www.wikidata.org/w/api.php', {
        'action': 'wbgetentities',
        'format': 'json',
        'ids': qid,
        'props': 'claims|labels|sitelinks',
        'languages': 'en',
    })
    return result.get('entities', {}).get(qid, {})


def search_candidates(name: str, birth: int | None, death: int | None) -> list[dict[str, Any]]:
    simplified = re.sub(r'\s*,.*$', '', name).strip()
    queries = list(dict.fromkeys([name, simplified]))
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for query in queries:
        result = get_json('https://www.wikidata.org/w/api.php', {
            'action': 'wbsearchentities',
            'format': 'json',
            'language': 'en',
            'uselang': 'en',
            'type': 'item',
            'limit': 20,
            'search': query,
        })
        for hit in result.get('search', []):
            qid = hit.get('id')
            if not qid or qid in seen:
                continue
            seen.add(qid)
            entity = entity_for_qid(qid)
            ids = geni_ids(entity)
            if not ids:
                continue
            candidate_birth = year_from_claim(entity, 'P569')
            candidate_death = year_from_claim(entity, 'P570')
            score = 0
            if birth is not None and candidate_birth == birth:
                score += 5
            if death is not None and candidate_death == death:
                score += 5
            if birth is not None and candidate_birth is not None and abs(candidate_birth - birth) <= 1:
                score += 1
            if death is not None and candidate_death is not None and abs(candidate_death - death) <= 1:
                score += 1
            label = entity.get('labels', {}).get('en', {}).get('value', '')
            if simplified.lower() in label.lower() or label.lower() in simplified.lower():
                score += 2
            candidates.append({
                'qid': qid,
                'label': label,
                'description': hit.get('description', ''),
                'birth': candidate_birth,
                'death': candidate_death,
                'geni': ids,
                'score': score,
            })
        if candidates:
            break
    return sorted(candidates, key=lambda item: (-item['score'], item['qid']))


results: dict[str, Any] = {}
missing: list[str] = []
ambiguous: list[str] = []
for key, person in people.items():
    if re.fullmatch(r'profile-g?\d+', key, flags=re.I) and re.fullmatch(r'profile-g?\d+', str(person.get('sourceId') or ''), flags=re.I):
        continue
    name = str(person.get('displayName') or '').strip()
    birth = int(person['birthYear']) if str(person.get('birthYear') or '').isdigit() else None
    death = int(person['deathYear']) if str(person.get('deathYear') or '').isdigit() else None
    source_url = str(person.get('sourceUrl') or '')
    wiki = wikipedia_item(source_url)
    record: dict[str, Any] = {
        'name': name,
        'birth': birth,
        'death': death,
        'sourceUrl': source_url,
    }
    if wiki:
        qid, page_title = wiki
        entity = entity_for_qid(qid)
        ids = geni_ids(entity)
        record.update({
            'method': 'wikipedia-sitelink',
            'qid': qid,
            'pageTitle': page_title,
            'wikidataBirth': year_from_claim(entity, 'P569'),
            'wikidataDeath': year_from_claim(entity, 'P570'),
            'geni': ids,
        })
        if len(ids) == 1:
            results[key] = record
            continue
    candidates = search_candidates(name, birth, death)
    record.update({'method': 'wikidata-search', 'candidates': candidates[:8]})
    if candidates and candidates[0]['score'] >= 10:
        if len(candidates) == 1 or candidates[0]['score'] > candidates[1]['score']:
            record['geni'] = candidates[0]['geni']
            record['qid'] = candidates[0]['qid']
            results[key] = record
            continue
    results[key] = record
    if not candidates:
        missing.append(key)
    else:
        ambiguous.append(key)

print(json.dumps(results, indent=2, ensure_ascii=False, sort_keys=True))
print('SUMMARY', json.dumps({
    'resolved_single': sum(1 for item in results.values() if len(item.get('geni', [])) == 1),
    'missing': missing,
    'ambiguous': ambiguous,
}, ensure_ascii=False))
