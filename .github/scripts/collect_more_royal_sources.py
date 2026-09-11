from pathlib import Path
# Extend the reviewed selection, and include the immediate families of the
# original example as well as the added monarchs. No recursive descendant crawl.
p=Path('.github/scripts/royal-source-titles.txt')
extra='''Catherine, Duchess of Braganza
Duarte, Duke of Guimarães (1515–1540)
John I, Duke of Braganza
Princess Elisabeth of Prussia
Louis Mountbatten, 1st Earl Mountbatten of Burma
Princess Charlotte of Wales (born 2015)
Louise of Lorraine
Elisabeth of Austria, Queen of France
Christina of France
Anne Marie d'Orléans
Victor Amadeus I, Duke of Savoy
Charles Emmanuel II, Duke of Savoy
Victor Amadeus II of Sardinia
Charles Emmanuel III of Sardinia
Victor Amadeus III of Sardinia
Charles Emmanuel IV of Sardinia
Victor Emmanuel I of Sardinia
Charles Felix of Sardinia
Charles Albert of Sardinia
Charles Emmanuel, Prince of Carignano
Victor Amadeus II, Prince of Carignano
Louis Victor, Prince of Carignano
Victor Amadeus I, Prince of Carignano
Emmanuel Philibert, Prince of Carignano
Thomas Francis, Prince of Carignano
Charles Emmanuel I, Duke of Savoy
Victor Emmanuel II
Umberto I of Italy
Victor Emmanuel III
Umberto II of Italy
Leopold I, Holy Roman Emperor
Joseph I, Holy Roman Emperor
Charles VI, Holy Roman Emperor
Maria Theresa
Joseph II, Holy Roman Emperor
Leopold II, Holy Roman Emperor
Francis II, Holy Roman Emperor
Ferdinand I of Austria
Archduke Franz Karl of Austria
Franz Joseph I of Austria
Archduke Karl Ludwig of Austria
Archduke Otto of Austria (1865–1906)
Charles I of Austria
'''
p.write_text(p.read_text()+'\n'+extra)
source=Path('.github/scripts/collect_royal_sources.py').read_text().replace('for title in seeds:\n','for title in list(wp):\n')
exec(compile(source, '.github/scripts/collect_royal_sources.py', 'exec'))
