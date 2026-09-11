from pathlib import Path

# Resolve the date-qualified Hesse child and explicitly selected British
# profiles. Collection produces review evidence only; it is not verification
# of every assertion in a source and must not infer a recent royal succession.
p = Path('.github/scripts/royal-source-titles.txt')
p.write_text(p.read_text() + '''\nPrincess Marie of Hesse and by Rhine (1874–1878)\nAnne, Princess Royal\nAndrew Mountbatten-Windsor\nPrince Edward, Duke of Edinburgh\n''')
exec(compile(
    Path('.github/scripts/collect_more_royal_sources.py').read_text(),
    '.github/scripts/collect_more_royal_sources.py',
    'exec',
))

# Current titles, deaths, and accessions require separate official-source
# verification before they may be used in the application dataset.
