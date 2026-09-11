"""Collect a review snapshot; never modify the application dataset from the network."""
import json, re, time, urllib.parse, urllib.request
from pathlib import Path
import mwparserfromhell

ROOT = Path('.')
OUT = ROOT / 'royal-source-review.json'
UA = 'GenealogyTimelineSourceAudit/1.0 (https://github.com/liuyao12/genealogy-timeline; historical genealogy review)'

def request(host, params):
    url = 'https://' + host + '/w/api.php?' + urllib.parse.urlencode({'format':'json', 'formatversion':2, **params})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':UA}), timeout=60) as response:
                result = json.load(response)
            if 'error' in result: raise RuntimeError(result['error'])
            return result
        except Exception as error:
            print('RETRY', host, str(error), flush=True)
            if attempt == 3: raise
            time.sleep(2 ** attempt)

def chunks(items, size=40):
    items=list(dict.fromkeys(items))
    for i in range(0,len(items),size): yield items[i:i+size]

def pages(titles):
    result={}
    for batch in chunks(titles, 20):
        data=request('en.wikipedia.org', {'action':'query', 'titles':'|'.join(batch), 'redirects':1, 'prop':'pageprops|revisions', 'rvprop':'ids|content', 'rvslots':'main'})
        aliases={x['from']:x['to'] for key in ['normalized','redirects'] for x in data.get('query',{}).get(key,[])}
        for p in data.get('query',{}).get('pages',[]):
            if p.get('missing') or not p.get('pageprops',{}).get('wikibase_item'):
                print('MISSING',p.get('title'),flush=True); continue
            rev=p.get('revisions',[{}])[0]
            text=rev.get('slots',{}).get('main',{}).get('content','')
            boxes=[t for t in mwparserfromhell.parse(text).filter_templates() if str(t.name).strip().lower().startswith('infobox')]
            fields={str(x.name).strip():str(x.value).strip() for x in boxes[0].params} if boxes else {}
            item={'title':p['title'], 'qid':p['pageprops']['wikibase_item'], 'revision':rev.get('revid'), 'infobox':fields}
            result[p['title']]=item
        for title in batch:
            canonical=title
            for _ in range(8):
                if canonical not in aliases: break
                canonical=aliases[canonical]
            if canonical in result: result[title]=result[canonical]
        print('WIKIPEDIA',len(result),flush=True)
        time.sleep(.15)
    return result

def entities(ids):
    result={}
    for batch in chunks(ids):
        data=request('www.wikidata.org', {'action':'wbgetentities', 'ids':'|'.join(batch), 'props':'claims|labels|sitelinks', 'languages':'en', 'sitefilter':'enwiki'})
        for q,e in data.get('entities',{}).items():
            if 'missing' not in e:
                result[q]={'qid':q, 'label':e.get('labels',{}).get('en',{}).get('value',''), 'title':e.get('sitelinks',{}).get('enwiki',{}).get('title',''), 'claims':{k:v for k,v in e.get('claims',{}).items() if k in ['P2600','P569','P570','P21','P22','P25','P26','P40','P31']}}
        print('WIKIDATA',len(result),flush=True)
        time.sleep(.15)
    return result

data=json.loads((ROOT/'data/british-royal-line.json').read_text())
profile_titles={}
for id,p in data['people'].items():
    urls=[p.get('sourceUrl','')]+[n.get('sourceUrl','') for n in p.get('namePeriods',[])]
    for u in urls:
        if 'en.wikipedia.org/wiki/' in u:
            profile_titles[id]=urllib.parse.unquote(u.split('/wiki/')[1].split('#')[0]).replace('_',' '); break
seeds=[x.strip() for x in (ROOT/'.github/scripts/royal-source-titles.txt').read_text().splitlines() if x.strip() and not x.startswith('#')]
wp=pages(list(profile_titles.values())+seeds)
wd=entities([p['qid'] for p in wp.values()])
# Add one parent/spouse generation of the curated seeds, not unbounded descendants.
extra=set()
for title in seeds:
    if title not in wp: continue
    e=wd.get(wp[title]['qid'],{})
    for prop in ['P22','P25','P26']:
        for c in e.get('claims',{}).get(prop,[]):
            if c.get('rank')=='deprecated': continue
            value=c.get('mainsnak',{}).get('datavalue',{}).get('value',{})
            if isinstance(value,dict) and value.get('id'): extra.add(value['id'])
wd.update(entities(sorted(extra-set(wd))))
wp.update(pages([e['title'] for e in wd.values() if e['title'] and e['title'] not in wp]))
OUT.write_text(json.dumps({'reviewOnly':True,'retrievedAt':'2026-09-11','originalProfileTitles':profile_titles,'seedTitles':seeds,'pages':wp,'entities':wd},ensure_ascii=False,indent=2)+'\n')
print('REVIEW SNAPSHOT',len(wp),len(wd),OUT.stat().st_size,flush=True)
