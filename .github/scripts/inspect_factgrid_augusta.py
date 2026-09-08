from __future__ import annotations

import json
import urllib.parse
import urllib.request

API = 'https://database.factgrid.de/w/api.php'
HEADERS = {'User-Agent': 'genealogy-timeline identity audit/1.0 (https://github.com/liuyao12/genealogy-timeline)'}


def get(params: dict[str, str]) -> dict:
    url = f"{API}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as response:
        return json.load(response)


entity = get({
    'action': 'wbgetentities',
    'ids': 'Q146570',
    'props': 'labels|claims|sitelinks',
    'languages': 'en',
    'format': 'json',
})['entities']['Q146570']
property_ids = sorted(entity.get('claims', {}))
properties = get({
    'action': 'wbgetentities',
    'ids': '|'.join(property_ids),
    'props': 'labels',
    'languages': 'en',
    'format': 'json',
})['entities']

print('Princess Augusta FactGrid claims')
for property_id, statements in entity.get('claims', {}).items():
    property_label = properties.get(property_id, {}).get('labels', {}).get('en', {}).get('value', property_id)
    values = []
    for statement in statements:
        datavalue = statement.get('mainsnak', {}).get('datavalue', {})
        value = datavalue.get('value')
        if isinstance(value, dict):
            value = value.get('id') or value.get('text') or value.get('time') or value
        values.append(value)
    print(property_id, '|', property_label, '|', json.dumps(values, ensure_ascii=False))
