from __future__ import annotations

import html
import re
import urllib.error
import urllib.request

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
}
URLS = [
    'https://www.geni.com/popular?%3Bclient_action=update_pluginforce_reload%253d1page%253d19update_file%253d%3Bpage%3D50%3Bpage%3D3%3Bpage%3D5&%3Bpage=2&page=47',
    'https://www.geni.com/popular?client_action=update_plugin&force_reload=1&page=47',
    'https://www.geni.com/popular?page=47',
    'https://www.geni.com/popular/all?page=47',
]

for url in URLS:
    request = urllib.request.Request(url, headers=HEADERS)
    print('\n###', url)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read().decode('utf-8', 'replace')
            print('status', response.status, 'final', response.url, 'length', len(body))
    except urllib.error.HTTPError as exc:
        print('HTTP', exc.code, exc.geturl(), exc.read(500).decode('utf-8', 'replace'))
        continue
    except Exception as exc:
        print(type(exc).__name__, exc)
        continue
    decoded = html.unescape(body)
    for needle in ('Duchess Augusta of Brunswick-Wolfenbüttel', 'Augusta of Brunswick', 'Augusta', '1764 - 1788'):
        indexes = [match.start() for match in re.finditer(re.escape(needle), decoded, re.I)]
        print(needle, 'matches', len(indexes))
        for index in indexes[:10]:
            fragment = re.sub(r'\s+', ' ', decoded[max(0, index - 1200):index + 1800])
            print('CONTEXT', fragment)
    links = sorted(set(re.findall(r'href=["\']([^"\']+)["\']', decoded, re.I)))
    print('AUGUSTA LINKS')
    for link in links:
        if re.search(r'augusta|brunswick', link, re.I):
            print(link)
    print('PROFILE IDS NEAR PAGE', sorted(set(re.findall(r'/people/[^"\']+/(g?\d{6,})', decoded, re.I))))
