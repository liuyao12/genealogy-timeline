from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections import deque
from pathlib import Path

USER_AGENT = 'genealogy-timeline spouse ancestry audit/1.0 (https://github.com/liuyao12/genealogy-timeline)'
HENRY_VII_QID = 'Q675493'
data = json.loads(Path('data/british-royal-line.json').read_text(encoding='utf-8'))
people = data['people']
root = data['rootId']


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def wikipedia_qid(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc.lower() != 'en.wikipedia.org' or not parsed.path.startswith('/wiki/'):
        return ''
    title = urllib.parse.unquote(parsed.path.removeprefix('/wiki/')).replace('_', ' ')
    query = urllib.parse.urlencode({
        'action': 'query',
        'prop': 'pageprops',
        'ppprop': 'wikibase_item',
        'redirects': '1',
        'format': 'json',
        'titles': title,
    })
    payload = get_json(f'https://en.wikipedia.org/w/api.php?{query}')
    for page in payload.get('query', {}).get('pages', {}).values():
        return page.get('pageprops', {}).get('wikibase_item', '')
    return ''


entity_cache: dict[str, dict] = {}


def entities(qids: list[str]) -> dict[str, dict]:
    missing = [qid for qid in qids if qid not in entity_cache]
    for offset in range(0, len(missing), 40):
        chunk = missing[offset:offset + 40]
        query = urllib.parse.urlencode({
            'action': 'wbgetentities',
            'ids': '|'.join(chunk),
            'props': 'labels|claims',
            'languages': 'en',
            'format': 'json',
        })
        payload = get_json(f'https://www.wikidata.org/w/api.php?{query}')
        entity_cache.update(payload.get('entities', {}))
        time.sleep(0.05)
    return {qid: entity_cache.get(qid, {}) for qid in qids}


def label(qid: str) -> str:
    entity = entities([qid]).get(qid, {})
    return entity.get('labels', {}).get('en', {}).get('value', qid)


def parents(qid: str) -> list[str]:
    entity = entities([qid]).get(qid, {})
    result = []
    for prop in ('P22', 'P25'):
        for statement in entity.get('claims', {}).get(prop, []):
            value = statement.get('mainsnak', {}).get('datavalue', {}).get('value', {})
            parent_id = value.get('id') if isinstance(value, dict) else None
            if parent_id and parent_id not in result:
                result.append(parent_id)
    return result


def path_to_henry(start_qid: str, max_depth: int = 18) -> list[str]:
    queue = deque([(start_qid, [start_qid])])
    seen = {start_qid}
    while queue:
        current, path = queue.popleft()
        if current == HENRY_VII_QID:
            return path
        if len(path) > max_depth:
            continue
        for parent in parents(current):
            if parent in seen:
                continue
            seen.add(parent)
            queue.append((parent, [*path, parent]))
    return []


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


direct = descendants(root)
outsiders: dict[str, str] = {}
for descendant_id in direct:
    for spouse_id in people[descendant_id].get('spouses', []):
        if spouse_id in people and spouse_id not in direct:
            outsiders[spouse_id] = descendant_id

print('WIKIDATA HENRY VII ANCESTRY PATHS FOR SPOUSE-ONLY GATEWAYS')
print('Henry VII:', HENRY_VII_QID, label(HENRY_VII_QID))
found = []
for spouse_id, descendant_id in sorted(outsiders.items(), key=lambda item: (int(people[item[0]].get('birthYear') or 99999), people[item[0]].get('displayName', ''))):
    person = people[spouse_id]
    wikipedia_urls = [
        period.get('sourceUrl', '')
        for period in person.get('namePeriods', [])
        if 'en.wikipedia.org/wiki/' in period.get('sourceUrl', '')
    ]
    qid = ''
    for url in wikipedia_urls:
        try:
            qid = wikipedia_qid(url)
        except Exception as exc:
            print('LOOKUP ERROR', person.get('displayName'), url, type(exc).__name__, exc)
        if qid:
            break
    if not qid:
        continue
    try:
        path = path_to_henry(qid)
    except Exception as exc:
        print('ANCESTRY ERROR', person.get('displayName'), qid, type(exc).__name__, exc)
        continue
    if not path:
        continue
    path_labels = [label(item) for item in path]
    found.append((len(path) - 1, person.get('displayName', ''), spouse_id, people[descendant_id].get('displayName', ''), qid, path_labels))

for generations, spouse_name, spouse_id, partner_name, qid, path_labels in sorted(found):
    print(f'\n{spouse_name} [{spouse_id}] / {qid} — {generations} generations to Henry VII')
    print('  spouse of:', partner_name)
    print('  ', ' <- '.join(path_labels))

print('\nFOUND', len(found), 'spouse-only gateways with a Wikidata parent path to Henry VII')
