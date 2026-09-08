from __future__ import annotations

import html
import re
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36'
QUERIES = [
    {'names': 'Princess Augusta of Great Britain', 'birth_year': '1737'},
    {'names': 'Augusta Frederica', 'birth_year': '1737'},
    {'names': 'Augusta Hanover', 'birth_year': '1737'},
    {'names': 'Augusta Duchess of Brunswick-Wolfenbüttel', 'birth_year': '1737'},
]

for params in QUERIES:
    query = urllib.parse.urlencode({'search_type': 'people', **params})
    urls = [
        f'https://www.geni.com/search?{query}',
        f'https://www.geni.com/search/people?{query}',
        f'https://www.geni.com/search?{query}&disable_tr8n_js=1',
    ]
    for url in urls:
        print('\n###', url)
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9'})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = html.unescape(response.read().decode('utf-8', 'replace'))
                print('status', response.status, 'final', response.url, 'length', len(body))
        except urllib.error.HTTPError as exc:
            print('HTTP', exc.code, exc.geturl(), exc.read(1000).decode('utf-8', 'replace'))
            continue
        except Exception as exc:
            print(type(exc).__name__, exc)
            continue
        links = []
        for match in re.finditer(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', body, re.I | re.S):
            href, raw_text = match.groups()
            text = re.sub(r'<[^>]+>', ' ', raw_text)
            text = re.sub(r'\s+', ' ', text).strip()
            if re.search(r'Augusta|Brunswick|Hanover|1737', text + ' ' + href, re.I):
                links.append((text, href))
        print('matching links', len(links))
        for row in links[:100]:
            print(row)
        for needle in ('Princess Augusta', 'Augusta Frederica', '1737', 'Brunswick'):
            indexes = [match.start() for match in re.finditer(re.escape(needle), body, re.I)]
            print(needle, len(indexes))
            for index in indexes[:5]:
                print(re.sub(r'\s+', ' ', body[max(0, index - 600):index + 1200]))
