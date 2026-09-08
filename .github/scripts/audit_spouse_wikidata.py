from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections import deque
from pathlib import Path

USER_AGENT = 'genealogy-timeline spouse ancestry audit/1.1 (https://github.com/liuyao12/genealogy-timeline)'
HENRY_VII_QID = 'Q675493'
data = json.loads(Path('data/british-royal-line.json').read_text(encoding='utf-8'))
people = data['people']
root = data['rootId']


def get_json(url: str, *, data: bytes | None = None, accept: str = 'application/json') -> dict:
    request = urllib.request.Request(
        url,
        data=data,
        headers={'User-Agent': USER_AGENT, 'Accept': accept},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def descendants(start: str) -> set[str]:
    seen = {start}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        for child in people.get(current, {}).get('children', []):
            if child in people and child not in seen:
                seen.add(child)
                queue.append(child)
    return seen


def wikipedia_title(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc.lower() != 'en.wikipedia.org' or not parsed.path.startswith('/wiki/'):
        return ''
    return urllib.parse.unquote(parsed.path.removeprefix('/wiki/')).replace('_', ' ')


def batch_wikipedia_qids(titles: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    unique_titles = list(dict.fromkeys(title for title in titles if title))
    for offset in range(0, len(unique_titles), 40):
        chunk = unique_titles[offset:offset + 40]
        query = urllib.parse.urlencode({
            'action': 'query',
            'prop': 'pageprops',
            'ppprop': 'wikibase_item',
            'redirects': '1',
            'format': 'json',
            'titles': '|'.join(chunk),
        })
        payload = get_json(f'https://en.wikipedia.org/w/api.php?{query}')
        aliases = {title: title for title in chunk}
        for row in payload.get('query', {}).get('normalized', []):
            aliases[row.get('from', '')] = row.get('to', '')
        for row in payload.get('query', {}).get('redirects', []):
            aliases[row.get('from', '')] = row.get('to', '')
        by_page_title = {
            page.get('title', ''): page.get('pageprops', {}).get('wikibase_item', '')
            for page in payload.get('query', {}).get('pages', {}).values()
        }
        for original in chunk:
            current = original
            for _ in range(5):
                revised = aliases.get(current, current)
                if revised == current:
                    break
                current = revised
            qid = by_page_title.get(current, '') or by_page_title.get(original, '')
            if qid:
                result[original] = qid
        time.sleep(1.0)
    return result


def qids_descended_from_henry(qids: list[str]) -> set[str]:
    qids = list(dict.fromkeys(qid for qid in qids if qid))
    if not qids:
        return set()
    values = ' '.join(f'wd:{qid}' for qid in qids)
    query = f'''SELECT DISTINCT ?person WHERE {{
      VALUES ?person {{ {values} }}
      ?person (wdt:P22|wdt:P25)+ wd:{HENRY_VII_QID} .
    }}'''
    body = urllib.parse.urlencode({'query': query, 'format': 'json'}).encode()
    payload = get_json('https://query.wikidata.org/sparql', data=body)
    return {
        row.get('person', {}).get('value', '').rsplit('/', 1)[-1]
        for row in payload.get('results', {}).get('bindings', [])
    }


direct = descendants(root)
outsiders: dict[str, str] = {}
for descendant_id in direct:
    for spouse_id in people[descendant_id].get('spouses', []):
        if spouse_id in people and spouse_id not in direct:
            outsiders[spouse_id] = descendant_id

spouse_titles: dict[str, str] = {}
for spouse_id in outsiders:
    person = people[spouse_id]
    for period in person.get('namePeriods', []):
        title = wikipedia_title(period.get('sourceUrl', ''))
        if title:
            spouse_titles[spouse_id] = title
            break

print('BATCH WIKIDATA AUDIT OF SPOUSE-ONLY GATEWAYS')
print('Henry VII:', HENRY_VII_QID)
print('spouse gateways:', len(outsiders), 'with Wikipedia title:', len(spouse_titles))
qid_by_title = batch_wikipedia_qids(list(spouse_titles.values()))
qid_by_spouse = {
    spouse_id: qid_by_title.get(title, '')
    for spouse_id, title in spouse_titles.items()
}
try:
    descended = qids_descended_from_henry(list(qid_by_spouse.values()))
except Exception as exc:
    print('SPARQL ERROR', type(exc).__name__, exc)
    raise

found = []
for spouse_id, qid in qid_by_spouse.items():
    if qid not in descended:
        continue
    partner_id = outsiders[spouse_id]
    found.append((
        int(people[spouse_id].get('birthYear') or 99999),
        people[spouse_id].get('displayName', ''),
        spouse_id,
        qid,
        people[partner_id].get('displayName', ''),
    ))

for _, spouse_name, spouse_id, qid, partner_name in sorted(found):
    print(f'{spouse_name} [{spouse_id}] / {qid} — spouse of {partner_name}')
print('FOUND', len(found), 'spouse-only gateways with a Wikidata parent path to Henry VII')
