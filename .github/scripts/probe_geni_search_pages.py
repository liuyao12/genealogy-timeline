from __future__ import annotations

import html
import re
import urllib.parse
import urllib.request
from pathlib import Path

NAMES = [
    'Ernest Augustus Duke of Brunswick 1887 1953',
    'Marie Josephine of Savoy 1753 1810',
    'Edward Duke of Guimaraes 1515 1540',
    'Teodosio II Duke of Braganza 1568 1630',
    'John IV King of Portugal 1604 1656',
]
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Lineage genealogy audit/1.0; +https://github.com/liuyao12/genealogy-timeline)',
    'Accept-Language': 'en-US,en;q=0.9',
}

rows = []
for name in NAMES:
    encoded = urllib.parse.urlencode({'search_type': 'people', 'names': name})
    url = 'https://www.geni.com/search?' + encoded
    try:
        request = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode('utf-8', 'replace')
            status = response.status
            final_url = response.geturl()
        matches = []
        patterns = [
            r'href=["\'](?:https?://(?:www\.)?geni\.com)?(/people/[^"\']+/(\d+))',
            r'href=["\'](?:https?://(?:www\.)?geni\.com)?(/profile/index/(\d+))',
        ]
        for pattern in patterns:
            for path, profile_id in re.findall(pattern, body, flags=re.I):
                item = (html.unescape(path), profile_id)
                if item not in matches: matches.append(item)
        rows.append((name, status, final_url, '<br>'.join(f'`{pid}` {path}' for path, pid in matches[:12]), len(body)))
    except Exception as exc:
        rows.append((name, 'error', url, f'{type(exc).__name__}: {exc}', 0))

path = Path('.github/geni-search-probe.md')
lines = ['# Public Geni search probe', '', '| Query | HTTP | Final URL | Candidate profile links | Bytes |', '|---|---:|---|---|---:|']
for row in rows:
    lines.append('| ' + ' | '.join(str(x or '—').replace('|','/') for x in row) + ' |')
path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(path)
