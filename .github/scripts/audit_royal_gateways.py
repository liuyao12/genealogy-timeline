from __future__ import annotations

import json
import re
from collections import Counter, deque
from pathlib import Path

DATA = Path('data/british-royal-line.json')
REPORT = Path('.github/royal-gateway-audit.md')
raw = json.loads(DATA.read_text(encoding='utf-8'))
people = raw['people']

ROYAL_RE = re.compile(r'\b(king|queen|emperor|empress|elector|electress|grand duke|grand duchess|prince|princess|duke|duchess|margrave|margravine|tsar|tsarina|sultan)\b', re.I)
CONSORT_RE = re.compile(r'\b(queen|empress|electress|grand duchess|princess)\b', re.I)
BRITISH_RE = re.compile(r'\b(England|English|Scotland|Scots|Great Britain|Northern Ireland|United Kingdom|Wales|British|Ireland)\b', re.I)
POLITY_RE = re.compile(r'\b(?:of|in)\s+([A-Z][A-Za-zÀ-ž\-]+(?:\s+(?:and|of|the|by|[A-Z][A-Za-zÀ-ž\-]+)){0,4})')


def text(person):
    return ' | '.join([
        str(person.get('displayName') or ''),
        str(person.get('title') or ''),
        str(person.get('note') or ''),
        *[str(period.get('name') or '') for period in person.get('namePeriods') or []],
    ])


def name(pid):
    return people.get(pid, {}).get('displayName', pid)


def royal(pid):
    return bool(ROYAL_RE.search(text(people[pid])))


def reciprocal_issues(pid):
    p = people[pid]
    issues = []
    for parent in p.get('parents', []):
        if parent not in people:
            issues.append(f'missing parent {parent}')
        elif pid not in people[parent].get('children', []):
            issues.append(f'parent {name(parent)} lacks child back-link')
    for child in p.get('children', []):
        if child not in people:
            issues.append(f'missing child {child}')
        elif pid not in people[child].get('parents', []):
            issues.append(f'child {name(child)} lacks parent back-link')
    for spouse in p.get('spouses', []):
        if spouse not in people:
            issues.append(f'missing spouse {spouse}')
        elif pid not in people[spouse].get('spouses', []):
            issues.append(f'spouse {name(spouse)} lacks spouse back-link')
    return issues


def connected_component(start):
    seen = {start}
    q = deque([start])
    while q:
        pid = q.popleft()
        p = people[pid]
        for field in ('parents', 'children', 'spouses', 'partners'):
            for nxt in p.get(field, []):
                if nxt in people and nxt not in seen:
                    seen.add(nxt)
                    q.append(nxt)
    return seen

root = raw.get('rootId')
root_component = connected_component(root) if root in people else set()

foreign_queens = []
all_royal = []
prussian = []
for pid, p in people.items():
    t = text(p)
    if ROYAL_RE.search(t):
        all_royal.append(pid)
    if CONSORT_RE.search(t) and re.search(r'\bqueen\b|\bempress\b|\belectress\b|\bgrand duchess\b', t, re.I):
        if not BRITISH_RE.search(t):
            foreign_queens.append(pid)
    if re.search(r'Prussia|Prussian|Brandenburg', t, re.I):
        prussian.append(pid)

# Extract rough polity mentions for a useful inventory.
polities = Counter()
for pid in all_royal:
    for match in POLITY_RE.finditer(text(people[pid])):
        phrase = match.group(1).strip(' ,.;')
        if len(phrase) <= 60:
            polities[phrase] += 1

lines = [
    '# Royal gateway audit',
    '',
    f'- Starter version: **{raw.get("version")}**',
    f'- Profiles: **{len(people)}**',
    f'- Profiles connected to the current root by stored family links: **{len(root_component)}**',
    f'- Royal/titled profiles detected: **{len(all_royal)}**',
    '',
    '## Prussian / Brandenburg records',
    '',
    '| Profile | Lifespan | Parents | Spouses | Children |',
    '|---|---:|---|---|---|',
]
for pid in sorted(prussian, key=lambda x: (int(people[x].get('birthYear') or 99999), name(x))):
    p = people[pid]
    lines.append('| ' + ' | '.join([
        f'`{pid}` {name(pid)}',
        f'{p.get("birthYear", "?")}–{p.get("deathYear", "?")}',
        '<br>'.join(name(x) for x in p.get('parents', [])) or '—',
        '<br>'.join(name(x) for x in p.get('spouses', [])) or '—',
        '<br>'.join(name(x) for x in p.get('children', [])) or '—',
    ]) + ' |')

lines += [
    '',
    '## Non-British queen / empress / electress gateways',
    '',
    '| Profile | Title field | Parents | Spouses | Children | In root component | Gaps |',
    '|---|---|---|---|---|:---:|---|',
]
for pid in sorted(foreign_queens, key=lambda x: (int(people[x].get('birthYear') or 99999), name(x))):
    p = people[pid]
    gaps = []
    if len([x for x in p.get('parents', []) if x in people]) < 2:
        gaps.append('parentage')
    if not [x for x in p.get('spouses', []) if x in people]:
        gaps.append('spouse')
    if not [x for x in p.get('children', []) if x in people]:
        gaps.append('children')
    issues = reciprocal_issues(pid)
    gaps += issues
    lines.append('| ' + ' | '.join([
        f'`{pid}` {name(pid)}',
        str(p.get('title') or '—').replace('|', '/'),
        '<br>'.join(name(x) for x in p.get('parents', []) if x in people) or '—',
        '<br>'.join(name(x) for x in p.get('spouses', []) if x in people) or '—',
        '<br>'.join(name(x) for x in p.get('children', []) if x in people) or '—',
        'yes' if pid in root_component else 'no',
        '<br>'.join(gaps) or 'complete links',
    ]) + ' |')

lines += [
    '',
    '## Royal profiles with incomplete immediate-family context',
    '',
    '| Profile | Parents | Spouses | Children | Detected concern |',
    '|---|---:|---:|---:|---|',
]
for pid in sorted(all_royal, key=lambda x: (int(people[x].get('birthYear') or 99999), name(x))):
    p = people[pid]
    parents = len([x for x in p.get('parents', []) if x in people])
    spouses = len([x for x in p.get('spouses', []) if x in people])
    children = len([x for x in p.get('children', []) if x in people])
    concern = []
    if parents < 2:
        concern.append('fewer than two stored parents')
    if spouses == 0 and re.search(r'\bqueen\b|\bempress\b|\belectress\b|\bking\b|\bemperor\b', text(p), re.I):
        concern.append('no stored spouse')
    if children == 0 and re.search(r'\bking\b|\bqueen\b|\bemperor\b|\bempress\b|\belector\b|\belectress\b', text(p), re.I):
        concern.append('no stored child')
    concern += reciprocal_issues(pid)
    if concern:
        lines.append(f'| `{pid}` {name(pid)} | {parents} | {spouses} | {children} | {"; ".join(concern)} |')

lines += [
    '',
    '## Most frequent polity phrases (rough extraction)',
    '',
]
for polity, count in polities.most_common(40):
    lines.append(f'- {polity}: {count}')

REPORT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(f'Wrote {REPORT} with {len(foreign_queens)} foreign queen/empress/electress gateways and {len(prussian)} Prussian records.')
