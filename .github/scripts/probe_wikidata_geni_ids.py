from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

REPORT = Path('.github/wikidata-geni-probe.md')

PAGES = {
    # Prussia / Germany / Greece / Russia
    'Frederick the Great': 'Frederick the Great',
    'Elisabeth Christine of Brunswick-Wolfenbüttel-Bevern': 'Elisabeth Christine of Brunswick-Wolfenbüttel-Bevern',
    'Frederick William III of Prussia': 'Frederick William III of Prussia',
    'Louise of Mecklenburg-Strelitz': 'Louise of Mecklenburg-Strelitz',
    'Frederick William IV of Prussia': 'Frederick William IV of Prussia',
    'Elisabeth Ludovika of Bavaria': 'Elisabeth Ludovika of Bavaria',
    'William I, German Emperor': 'William I, German Emperor',
    'Augusta of Saxe-Weimar-Eisenach': 'Augusta of Saxe-Weimar-Eisenach',
    'Frederick III, German Emperor': 'Frederick III, German Emperor',
    'Victoria, Princess Royal': 'Victoria, Princess Royal',
    'Wilhelm II, German Emperor': 'Wilhelm II, German Emperor',
    'Augusta Victoria of Schleswig-Holstein': 'Augusta Victoria of Schleswig-Holstein',
    'Sophia of Prussia': 'Sophia of Prussia',
    'Constantine I of Greece': 'Constantine I of Greece',
    'Elisabeth of Romania': 'Elisabeth of Romania',
    'Alexander of Greece': 'Alexander of Greece',
    'Aspasia Manos': 'Aspasia Manos',
    'Paul of Greece': 'Paul of Greece',
    'Frederica of Hanover': 'Frederica of Hanover',
    'Alexandra Feodorovna (Charlotte of Prussia)': 'Alexandra Feodorovna (Charlotte of Prussia)',
    'Nicholas I of Russia': 'Nicholas I of Russia',
    'Grand Duke Constantine Nikolaevich of Russia': 'Grand Duke Constantine Nikolaevich of Russia',
    'Princess Alexandra of Saxe-Altenburg': 'Princess Alexandra of Saxe-Altenburg',
    # France / Spain
    'Anne of Austria': 'Anne of Austria',
    'Louis XIV': 'Louis XIV',
    'Maria Theresa of Spain': 'Maria Theresa of Spain',
    'Philip IV of Spain': 'Philip IV of Spain',
    'Elisabeth of France (1602–1644)': 'Elisabeth of France (1602–1644)',
    'Margaret of Austria, Queen of Spain': 'Margaret of Austria, Queen of Spain',
    'Charles II of Spain': 'Charles II of Spain',
    'Louis, Grand Dauphin': 'Louis, Grand Dauphin',
    'Maria Anna Victoria of Bavaria': 'Maria Anna Victoria of Bavaria',
    'Louis, Duke of Burgundy': 'Louis, Duke of Burgundy',
    'Marie Adélaïde of Savoy': 'Marie Adélaïde of Savoy',
    'Louis XV': 'Louis XV',
    'Marie Leszczyńska': 'Marie Leszczyńska',
    'Louis, Dauphin of France (1729–1765)': 'Louis, Dauphin of France (1729–1765)',
    'Maria Josepha of Saxony, Dauphine of France': 'Maria Josepha of Saxony, Dauphine of France',
    'Louis XVI': 'Louis XVI',
    'Marie Antoinette': 'Marie Antoinette',
    'Louis XVIII': 'Louis XVIII',
    'Marie Joséphine of Savoy': 'Marie Joséphine of Savoy',
    'Charles X of France': 'Charles X of France',
    'Maria Theresa of Savoy': 'Maria Theresa of Savoy',
    # Portugal / Braganza
    'Edward, Duke of Guimarães': 'Edward, Duke of Guimarães',
    'Catherine, Duchess of Braganza': 'Catherine, Duchess of Braganza',
    'Teodósio II, Duke of Braganza': 'Teodósio II, Duke of Braganza',
    'John IV of Portugal': 'John IV of Portugal',
    'Luisa de Guzmán': 'Luisa de Guzmán',
    'Afonso VI of Portugal': 'Afonso VI of Portugal',
    'Peter II of Portugal': 'Peter II of Portugal',
    # Denmark
    'Christian V of Denmark': 'Christian V of Denmark',
    'Charlotte Amalie of Hesse-Kassel': 'Charlotte Amalie of Hesse-Kassel',
    'Frederick IV of Denmark': 'Frederick IV of Denmark',
    'Louise of Mecklenburg-Güstrow': 'Louise of Mecklenburg-Güstrow',
    'Anne Sophie Reventlow': 'Anne Sophie Reventlow',
    'Christian VI of Denmark': 'Christian VI of Denmark',
    'Sophia Magdalene of Brandenburg-Kulmbach': 'Sophia Magdalene of Brandenburg-Kulmbach',
    'Frederick V of Denmark': 'Frederick V of Denmark',
    'Louise of Great Britain': 'Louise of Great Britain',
    'Christian VII of Denmark': 'Christian VII of Denmark',
    'Caroline Matilda of Great Britain': 'Caroline Matilda of Great Britain',
    'Frederick VI of Denmark': 'Frederick VI of Denmark',
    'Marie of Hesse-Kassel': 'Marie of Hesse-Kassel',
    'Christian VIII of Denmark': 'Christian VIII of Denmark',
    'Caroline Amalie of Augustenburg': 'Caroline Amalie of Augustenburg',
    'Frederick VII of Denmark': 'Frederick VII of Denmark',
    'Vilhelmine Marie of Denmark': 'Vilhelmine Marie of Denmark',
}

HEADERS = {'User-Agent': 'Lineage genealogy audit/1.0 (https://github.com/liuyao12/genealogy-timeline)'}


def get_json(url: str):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def qid_for_title(title: str):
    query = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'redirects': 1,
        'prop': 'pageprops', 'ppprop': 'wikibase_item', 'titles': title,
    })
    data = get_json('https://en.wikipedia.org/w/api.php?' + query)
    pages = data.get('query', {}).get('pages', {})
    page = next(iter(pages.values()), {})
    return page.get('pageprops', {}).get('wikibase_item'), page.get('title')


def claim_values(entity, prop):
    values = []
    for claim in entity.get('claims', {}).get(prop, []):
        value = claim.get('mainsnak', {}).get('datavalue', {}).get('value')
        if isinstance(value, str):
            values.append(value)
    return values


def time_value(entity, prop):
    claims = entity.get('claims', {}).get(prop, [])
    if not claims:
        return ''
    value = claims[0].get('mainsnak', {}).get('datavalue', {}).get('value', {})
    time = value.get('time', '') if isinstance(value, dict) else ''
    return time[1:11] if time.startswith('+') else time[:10]

rows = []
for label, title in PAGES.items():
    try:
        qid, resolved = qid_for_title(title)
        if not qid:
            rows.append((label, title, '', '', '', '', 'No Wikidata item'))
            continue
        entity = get_json(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json')['entities'][qid]
        geni = claim_values(entity, 'P2600')
        rows.append((
            label, resolved or title, qid, '<br>'.join(geni),
            time_value(entity, 'P569'), time_value(entity, 'P570'),
            '' if geni else 'No P2600 Geni ID',
        ))
    except Exception as exc:
        rows.append((label, title, '', '', '', '', f'{type(exc).__name__}: {exc}'))

lines = [
    '# Wikidata → Geni identity probe', '',
    '| Candidate | Resolved article | Wikidata | Geni P2600 | Birth | Death | Note |',
    '|---|---|---|---|---:|---:|---|',
]
for row in rows:
    lines.append('| ' + ' | '.join(str(value or '—').replace('|', '/') for value in row) + ' |')
lines += ['', f'Candidates: {len(rows)}; with Geni P2600: {sum(bool(row[3]) for row in rows)}.']
REPORT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(lines[-1])
