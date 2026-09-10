from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

TARGET_PATH = Path('research/royal-expansion-targets.json')
OUTPUT_JSON = Path('research/royal-expansion-identities.json')
OUTPUT_MD = Path('research/royal-expansion-identities.md')
USER_AGENT = 'genealogy-timeline-audit/1.0 (https://github.com/liuyao12/genealogy-timeline)'


def get_json(base: str, params: dict) -> dict:
    url = base + '?' + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)


def chunks(values, size):
    values = list(values)
    for index in range(0, len(values), size):
        yield values[index:index + size]


def claim_values(entity: dict, property_id: str):
    out = []
    for statement in entity.get('claims', {}).get(property_id, []):
        snak = statement.get('mainsnak', {})
        if snak.get('snaktype') != 'value':
            continue
        value = snak.get('datavalue', {}).get('value')
        if isinstance(value, dict) and 'id' in value:
            out.append(value['id'])
        elif isinstance(value, dict) and 'time' in value:
            out.append(value['time'])
        elif value is not None:
            out.append(str(value))
    return out


def normalize_geni(value: str) -> str:
    value = str(value or '').strip().rstrip('/')
    if '/' in value:
        value = value.rsplit('/', 1)[-1]
    return value


targets = json.loads(TARGET_PATH.read_text(encoding='utf-8'))['targets']
qid_by_target = {}
page_title_by_target = {}
for group in chunks(targets, 40):
    data = get_json(
        'https://en.wikipedia.org/w/api.php',
        {
            'action': 'query',
            'format': 'json',
            'formatversion': 2,
            'redirects': 1,
            'prop': 'pageprops',
            'ppprop': 'wikibase_item',
            'titles': '|'.join(group),
        },
    )
    normalized = {item['from']: item['to'] for item in data.get('query', {}).get('normalized', [])}
    redirects = {item['from']: item['to'] for item in data.get('query', {}).get('redirects', [])}
    pages = {page.get('title'): page for page in data.get('query', {}).get('pages', [])}
    for target in group:
        title = normalized.get(target, target)
        seen = set()
        while title in redirects and title not in seen:
            seen.add(title)
            title = redirects[title]
        page = pages.get(title, {})
        qid_by_target[target] = page.get('pageprops', {}).get('wikibase_item')
        page_title_by_target[target] = page.get('title') or title
    time.sleep(0.1)

qids = sorted({qid for qid in qid_by_target.values() if qid})
entities = {}
for group in chunks(qids, 45):
    data = get_json(
        'https://www.wikidata.org/w/api.php',
        {
            'action': 'wbgetentities',
            'format': 'json',
            'ids': '|'.join(group),
            'props': 'labels|descriptions|claims|sitelinks',
            'languages': 'en',
            'sitefilter': 'enwiki',
        },
    )
    entities.update(data.get('entities', {}))
    time.sleep(0.1)

related_qids = set()
for entity in entities.values():
    for property_id in ('P22', 'P25', 'P26', 'P40'):
        related_qids.update(claim_values(entity, property_id))
related_labels = {}
for group in chunks(sorted(related_qids), 50):
    data = get_json(
        'https://www.wikidata.org/w/api.php',
        {
            'action': 'wbgetentities',
            'format': 'json',
            'ids': '|'.join(group),
            'props': 'labels',
            'languages': 'en',
        },
    )
    for qid, entity in data.get('entities', {}).items():
        related_labels[qid] = entity.get('labels', {}).get('en', {}).get('value', qid)
    time.sleep(0.1)

records = []
for target in targets:
    qid = qid_by_target.get(target)
    entity = entities.get(qid, {}) if qid else {}
    geni_ids = [normalize_geni(value) for value in claim_values(entity, 'P2600')]
    record = {
        'target': target,
        'page_title': page_title_by_target.get(target),
        'qid': qid,
        'label': entity.get('labels', {}).get('en', {}).get('value'),
        'description': entity.get('descriptions', {}).get('en', {}).get('value'),
        'geni_ids': list(dict.fromkeys(value for value in geni_ids if value)),
        'birth_times': claim_values(entity, 'P569'),
        'death_times': claim_values(entity, 'P570'),
        'father': [{'qid': item, 'label': related_labels.get(item, item)} for item in claim_values(entity, 'P22')],
        'mother': [{'qid': item, 'label': related_labels.get(item, item)} for item in claim_values(entity, 'P25')],
        'spouses': [{'qid': item, 'label': related_labels.get(item, item)} for item in claim_values(entity, 'P26')],
        'children': [{'qid': item, 'label': related_labels.get(item, item)} for item in claim_values(entity, 'P40')],
    }
    records.append(record)

OUTPUT_JSON.write_text(json.dumps({'records': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
lines = ['# Royal expansion identity lookup', '']
for record in records:
    lines.append(f"## {record['target']}")
    lines.append('')
    lines.append(f"- Wikipedia: {record['page_title'] or 'not found'}")
    lines.append(f"- Wikidata: {record['qid'] or 'not found'}")
    lines.append(f"- Label: {record['label'] or 'not found'}")
    lines.append(f"- Description: {record['description'] or '—'}")
    lines.append(f"- Geni IDs: {', '.join(record['geni_ids']) or 'none'}")
    lines.append(f"- Birth: {', '.join(record['birth_times']) or '—'}")
    lines.append(f"- Death: {', '.join(record['death_times']) or '—'}")
    lines.append(f"- Father: {', '.join(item['label'] for item in record['father']) or '—'}")
    lines.append(f"- Mother: {', '.join(item['label'] for item in record['mother']) or '—'}")
    lines.append(f"- Spouses: {', '.join(item['label'] for item in record['spouses']) or '—'}")
    lines.append(f"- Children: {', '.join(item['label'] for item in record['children']) or '—'}")
    lines.append('')
OUTPUT_MD.write_text('\n'.join(lines), encoding='utf-8')
missing = [record['target'] for record in records if not record['qid'] or not record['geni_ids']]
print(f'Looked up {len(records)} targets; {len(missing)} lack a Wikidata item or Geni ID.')
if missing:
    print('Missing:', '; '.join(missing))
