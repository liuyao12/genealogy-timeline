from pathlib import Path
# The earlier generic Marie title resolves to the 1824 Russian empress, not
# Alice's daughter. Use the date-qualified child and resolve current names.
p=Path('.github/scripts/royal-source-titles.txt')
p.write_text(p.read_text()+'''\nPrincess Marie of Hesse and by Rhine (1874–1878)\nAnne, Princess Royal\nAndrew Mountbatten-Windsor\nPrince Edward, Duke of Edinburgh\n''')
exec(compile(Path('.github/scripts/collect_more_royal_sources.py').read_text(), '.github/scripts/collect_more_royal_sources.py', 'exec'))
