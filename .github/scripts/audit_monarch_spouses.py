from __future__ import annotations

import json
import re
from pathlib import Path

DATA = Path('data/british-royal-line.json')
REPORT = Path('.github/monarch-spouse-audit.md')
raw = json.loads(DATA.read_text(encoding='utf-8'))
people = raw['people']


def name(pid):
    return people.get(pid, {}).get('displayName', pid)


def all_text(p):
    return ' | '.join([
        str(p.get('displayName') or ''),
        str(p.get('title') or ''),
        str(p.get('note') or ''),
        *[str(period.get('name') or '') for period in p.get('namePeriods') or []],
    ])


def is_sovereign(p):
    if any(str(e.get('kind') or '') == 'monarch-reign' for e in p.get('personalEvents') or []):
        return True
    return bool(re.search(r'\b(King|Queen regnant|Emperor|Empress regnant|Tsar|Sultan)\b', all_text(p), re.I))


def has_consort_style(p):
    return bool(re.search(
        r'\b(queen|king consort|empress|prince consort|electress|grand duchess|princess of wales|duchess|prince of denmark)\b',
        ' | '.join([str(p.get('title') or ''), *[str(x.get('name') or '') for x in p.get('namePeriods') or []]]),
        re.I,
    ))

rows = []
seen = set()
for sid, sovereign in people.items():
    if not is_sovereign(sovereign):
        continue
    spouse_ids = set(sovereign.get('spouses') or []) | set((sovereign.get('marriageYears') or {}).keys())
    for pid in spouse_ids:
        if pid not in people:
            continue
        pair = tuple(sorted((sid, pid)))
        if pair in seen:
            continue
        seen.add(pair)
        spouse = people[pid]
        rows.append({
            'sovereign': sid,
            'spouse': pid,
            'has_style': has_consort_style(spouse),
            'marriage': (sovereign.get('marriageYears') or {}).get(pid) or (spouse.get('marriageYears') or {}).get(sid) or '',
            'title': spouse.get('title') or '',
            'periods': '; '.join(x.get('name','') for x in spouse.get('namePeriods') or []),
        })

lines = [
    '# Monarch-spouse title audit', '',
    '| Sovereign | Spouse | Marriage | Consort style detected | Title field | Dated names |',
    '|---|---|---:|:---:|---|---|',
]
for row in sorted(rows, key=lambda r: (int(people[r['sovereign']].get('birthYear') or 99999), name(r['sovereign']), name(r['spouse']))):
    lines.append('| ' + ' | '.join([
        f'`{row["sovereign"]}` {name(row["sovereign"])}',
        f'`{row["spouse"]}` {name(row["spouse"])}',
        str(row['marriage'] or '—'),
        'yes' if row['has_style'] else '**NO**',
        str(row['title'] or '—').replace('|','/'),
        str(row['periods'] or '—').replace('|','/'),
    ]) + ' |')

REPORT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(f'Wrote {REPORT} with {len(rows)} sovereign-spouse pairs; {sum(not r["has_style"] for r in rows)} lack a detected consort style.')
