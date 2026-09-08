from __future__ import annotations

import re
import time
import urllib.error
import urllib.request

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
}
PATTERNS = [
    re.compile(r'Augusta.{0,120}(?:Great Britain|Brunswick)', re.I | re.S),
    re.compile(r'(?:Great Britain|Brunswick).{0,120}Augusta', re.I | re.S),
    re.compile(r'Augusta Frederica', re.I),
]
LINK = re.compile(r'href=["\']([^"\']*(?:Augusta|augusta)[^"\']*)["\']', re.I)
PROFILE = re.compile(r'href=["\'](/people/[^"\']+/(?:g?\d{6,}))["\']', re.I)

found = False
for route in ('popular/all', 'popular/ancestors', 'popular/descendants'):
    for page in range(1, 61):
        url = f'https://www.geni.com/{route}?page={page}&disable_tr8n_js=1'
        request = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as exc:
            print('HTTP', exc.code, url)
            continue
        except Exception as exc:
            print(type(exc).__name__, url, exc)
            continue
        if any(pattern.search(body) for pattern in PATTERNS):
            found = True
            print('\nMATCH', url, 'length', len(body))
            for match in PATTERNS:
                for occurrence in list(match.finditer(body))[:10]:
                    start = max(0, occurrence.start() - 700)
                    end = min(len(body), occurrence.end() + 900)
                    fragment = re.sub(r'\s+', ' ', body[start:end])
                    print('CONTEXT', fragment)
            print('AUGUSTA LINKS', sorted(set(LINK.findall(body))))
            print('PROFILE LINKS', sorted(set(PROFILE.findall(body))))
        if page % 10 == 0:
            print('scanned', route, page)
        time.sleep(0.12)

print('FOUND_MATCH', found)
