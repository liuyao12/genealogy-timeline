from pathlib import Path
# Resolve the date-qualified Hesse child and current British profile names.
p=Path('.github/scripts/royal-source-titles.txt')
p.write_text(p.read_text()+'''\nPrincess Marie of Hesse and by Rhine (1874–1878)\nAnne, Princess Royal\nAndrew Mountbatten-Windsor\nPrince Edward, Duke of Edinburgh\n''')
exec(compile(Path('.github/scripts/collect_more_royal_sources.py').read_text(), '.github/scripts/collect_more_royal_sources.py', 'exec'))
# The Norwegian royal court confirms Harald V's death and Haakon VIII's
# accession in August 2026. Add exactly this household, not another crawl.
norway=pages(['Haakon VIII', 'Queen Mette-Marit of Norway', 'Crown Princess Ingrid Alexandra', 'Prince Sverre Magnus'])
wp.update(norway)
wd.update(entities([p['qid'] for p in norway.values()]))
OUT.write_text(json.dumps({'reviewOnly':True,'retrievedAt':'2026-09-11','originalProfileTitles':profile_titles,'seedTitles':seeds,'pages':wp,'entities':wd},ensure_ascii=False,indent=2)+'\n')
print('Final Norwegian household snapshot',len(wd),flush=True)
