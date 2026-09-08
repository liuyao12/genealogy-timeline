from __future__ import annotations

import json
import re
import urllib.error
import urllib.request

TARGETS = {
    'Caroline of Brunswick': '4138652783200125692',
    'Augusta, Duchess of Cambridge': '6000000001260403655',
    'Louise of Hesse-Kassel': '4134741994550032164',
}

USER_AGENT = 'Mozilla/5.0 genealogy-timeline profile identity audit/1.0'

for label, profile_id in TARGETS.items():
    print('\n###', label, profile_id)
    urls = [
        f'https://www.geni.com/api/profile-g{profile_id}',
        f'https://www.geni.com/api/profile-g{profile_id}/immediate-family?fields=id,name,display_name,birth,death,edges',
        f'https://www.geni.com/profile/index/{profile_id}',
    ]
    for url in urls:
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json,text/html'})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read().decode('utf-8', 'replace')
                print('URL', url, 'STATUS', response.status, 'TYPE', response.headers.get('content-type'), 'LEN', len(body))
                print('PROFILE LINKS', sorted(set(re.findall(r'(?:profile-g|/people/[^"?]+/)(g?\d{6,})', body)))[:40])
                print('NAMES', [name for name in ['Augusta', 'Charles William Ferdinand', 'Margaret Douglas', 'Matthew Stewart', 'Mary of Great Britain', 'Frederick of Hesse', 'Caroline of Nassau', 'Louise Charlotte'] if name.lower() in body.lower()])
                if 'json' in (response.headers.get('content-type') or '').lower():
                    try:
                        parsed = json.loads(body)
                        print('JSON KEYS', list(parsed)[:20])
                        print(json.dumps(parsed, ensure_ascii=False)[:3000])
                    except Exception:
                        pass
        except urllib.error.HTTPError as exc:
            body = exc.read().decode('utf-8', 'replace')
            print('URL', url, 'HTTP', exc.code, 'LEN', len(body), body[:400].replace('\n', ' '))
        except Exception as exc:
            print('URL', url, type(exc).__name__, exc)
