from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request

CLIENT_ID = 'zgW8WYPaAaGlYDbHFDhXfJosKALeFPUPczL7Q4bK'
TARGETS = {
    'Duchess Augusta of Brunswick-Wolfenbüttel': '6000000000702651495',
    'Caroline of Brunswick': '4138652783200125692',
    'Frederick, Prince of Wales': '6000000003891739213',
}
USER_AGENT = 'Mozilla/5.0 genealogy-timeline public family identity audit/1.1'

for label, profile_id in TARGETS.items():
    print('\n###', label, profile_id)
    query = urllib.parse.urlencode({
        'fields': 'id,name,display_name,birth,death,edges,unions,parents,children,partners,spouses',
        'client_id': CLIENT_ID,
    })
    urls = [
        f'https://www.geni.com/api/profile-g{profile_id}?{query}',
        f'https://www.geni.com/api/profile-g{profile_id}/immediate-family?{query}',
        f'https://www.geni.com/api/profile-g{profile_id}/immediate-family?{query}&callback=probe',
    ]
    for url in urls:
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json,text/javascript'})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read().decode('utf-8', 'replace')
                print('URL', url, 'STATUS', response.status, 'TYPE', response.headers.get('content-type'), 'LEN', len(body))
                print('PROFILE LINKS', sorted(set(re.findall(r'profile-g?\d+', body, re.I)))[:100])
                for name in ['Princess Augusta', 'Augusta of Great Britain', 'Charles William Ferdinand', 'Caroline of Brunswick']:
                    if name.lower() in body.lower():
                        print('FOUND NAME', name)
                print(body[:12000])
        except urllib.error.HTTPError as exc:
            body = exc.read().decode('utf-8', 'replace')
            print('URL', url, 'HTTP', exc.code, 'LEN', len(body), body[:2000].replace('\n', ' '))
        except Exception as exc:
            print('URL', url, type(exc).__name__, exc)
