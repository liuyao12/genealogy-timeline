# British royal example: genealogy audit

Reviewed 11 September 2026. Bundled data version **31** contains **568 profiles**, including **381 additions** to version 30's 187 profiles. The canonical records, relationship links, dates, and individual source URLs are in [british-royal-line.json](../data/british-royal-line.json).

The audit follows the existing British line and its foreign royal marriages. It checks the entire stored graph for missing references, reciprocal relationships, duplicate links, ancestry cycles, impossible parent ages, and marriages or reigns outside a person's lifespan. Historical research fills the principal descent paths and consort gateways below. This is a connected genealogy, not an exhaustive register of every European royal birth or every holder of every crown.

## Coverage and consort gateways

| Existing connection or family | Result in version 31 |
| --- | --- |
| Tudor, Stuart, Hanover and Windsor line | Existing identities retained. Added missing children and spouses, including all children of George II, George III, Victoria, Edward VII, George V, George VI and Elizabeth II. |
| Sophia Dorothea of Hanover → Prussia | Frederick the Great and his wife added. The Hohenzollern parentage runs through Frederick William III, Wilhelm I, Frederick III and Kaiser Wilhelm II; Frederick William IV is also included. |
| Victoria → Victoria, Princess Royal | Connects the British and Prussian sides of Wilhelm II's ancestry. His two wives are included. |
| Mary Tudor, Madeleine of Valois, Mary Stuart, Henrietta Maria and Catherine de' Medici → France | Valois children and the Bourbon/Orléans branches connect through Louis XIV, Louis XV, Louis XVI, Louis XVIII, Charles X and Louis Philippe I. |
| Mary I / Philip II; Elisabeth of Valois; Isabella of Portugal → Spain | Spanish Habsburgs connect to the Bourbons through Philip V, with the descent to Felipe VI and his daughters. |
| Catherine of Braganza; Maria of Aragon; Catherine of Austria → Portugal | Aviz and Braganza connecting generations reach Manuel II. Pedro I and Pedro II connect the Brazilian imperial branch. |
| Anne of Denmark and Prince George of Denmark → Denmark–Norway | Oldenburg ancestors and later Danish kings connect to Christian IX's family and Frederik X. Christian IX's six children are represented. |
| Alexandra of Denmark and Maud of Wales → Norway | Haakon VII → Olav V → Harald V → Haakon VIII, with spouses and the current heir's generation. |
| Prussia / Louisa Ulrika and Victoria / Margaret of Connaught → Sweden | Prussian connection to the Vasa/Holstein-Gottorp family and the Bernadotte descent through Carl XVI Gustaf, with his children. |
| Mary, Princess Royal; Anne, Princess Royal → Orange–Nassau | Orange ancestry and the Dutch monarchy connect through William I, II and III, Wilhelmina, Juliana, Beatrix and Willem-Alexander. |
| Alexandra's sister Dagmar; Victoria's daughter Alice → Russia | Romanov descent and marriage bridges through Nicholas II and Alexandra Feodorovna, including their five children. |
| Philip's Greek family; Victoria / Sophia of Prussia → Greece | George I and Constantine I's family connect to Constantine II and to Queen Sofía of Spain. |
| Victoria / Alfred / Marie of Edinburgh → Romania | Ferdinand I and Marie connect through Carol II to Michael I. |
| Elizabeth Stuart / Sophia → Palatinate and Hanover | Palatine and Hanoverian connecting generations retained and extended; Hanover's kings through George V and the later Brunswick marriage are included. |
| Alice → Hesse; Charlotte, Princess Royal → Württemberg | Alice's seven children and the Russian, Greek and Swedish marriage connections are represented. Württemberg's first two kings and the British consort connection are included. |
| Spanish and Portuguese consorts → Austrian Habsburgs | Connecting ancestors from Ferdinand I through Maria Theresa support the Spanish, French, Portuguese and Brazilian marriages. This is not a complete list of later Austrian emperors. |
| Henrietta of England → Anne Marie d'Orléans | Added the marriage to Victor Amadeus II and their daughters' French and Spanish royal connections. Later Sardinian and Italian succession is outside this expansion. |

The branches are traceable as parent/child and spouse relationships. The active root's descendant view intentionally does not display every stored ancestor and collateral branch at once. Search includes stored profiles outside the current view; open a profile and use its tree button to change the focus.

## Historical distinctions and corrected chronology

- **Frederick the Great had no children.** The later Prussian line descends through his brother Augustus William and his nephew Frederick William II. A succession is never converted into a fictitious father–son relationship. [Frederick the Great](https://en.wikipedia.org/wiki/Frederick_the_Great), [Augustus William](https://en.wikipedia.org/wiki/Prince_Augustus_William_of_Prussia).
- **Wilhelm II's parents are Frederick III and Victoria, Princess Royal.** His reign ends in 1918; his life ends in 1941. His second marriage took place after abdication, so Hermine is not presented as a reigning empress consort. [German Historical Museum: Wilhelm II](https://www.dhm.de/lemo/biografie/wilhelm-ii), [Frederick III](https://www.dhm.de/lemo/biografie/friedrich-iii).
- Margaret Tudor's marriage to Angus now ends with its **1527 annulment**, and Louis XII's marriage to Jeanne ends in **1498**, instead of being allowed to continue until a death. [Margaret Tudor](https://en.wikipedia.org/wiki/Margaret_Tudor), [Swiss National Museum: Joan of France](https://blog.nationalmuseum.ch/en/2024/05/the-lady-behind-the-mask-joan-of-france/).
- George IV and Maria Fitzherbert's final separation is recorded as **1811**. The note distinguishes their religious ceremony from a marriage valid under English civil law. [Maria Fitzherbert](https://en.wikipedia.org/wiki/Maria_Fitzherbert).
- Charles Brandon and Margaret Neville's union is marked **annulled, year unknown**. Accounts differ on the initial declaration; the later papal confirmation was in 1528. A single precise ending year would conceal that uncertainty. [Charles Brandon](https://en.wikipedia.org/wiki/Charles_Brandon,_1st_Duke_of_Suffolk).
- Divorces and annulments are explicit for the added Prussian, Danish, Greek, Romanian, Hessian and Portuguese couples. A same-year marriage and annulment remains visible on the second line; neither an unknown ending nor a divorce is silently replaced with a death date.
- Louis XVII and the Jacobite claimants have explanatory notes and no reigning-monarch events. Charles XIV John's adoption by Charles XIII is explained without asserting biological parentage. Disputed paternity for Alfonso XII, Maria Alexandrovna of Hesse and Paul I is identified in notes; the records use acknowledged/legal parentage.
- The Norwegian branch reflects the official announcements available at the review date: Harald V's death in August 2026 and Haakon VIII's accession. [Royal House announcement](https://www.kongehuset.no/nyheter/kong-harald-v-er-dod), [constitutional oath](https://www.kongehuset.no/for-pressen/information-in-english/oath-of-allegiance-to-the-constitution-en).

## Sources and limits

Every added profile has a direct biographical source link. Existing public Geni IDs and aliases remain intact. New encyclopedia-backed profiles have stable local IDs and explicit Wikipedia provenance; no Geni identity has been guessed. Dated names were added to the requested Prussian spine where transitions were researched. Other new profiles keep their sourced lasting names without invented title-change dates.

Cross-checks for the main family bridges also used the [Royal Family's Victoria biography](https://www.royal.uk/encyclopedia/victoria-r-1837-1901), the [Danish royal lineage](https://www.kongehuset.dk/en/the-monarchy-in-denmark/the-royal-lineage), [Versailles' royal genealogy](https://www.chateauversailles.fr/ressources-pedagogiques/rois-reines-versailles/genealogie), and [Maria Theresa's children](https://www.habsburger.net/en/chapter/maria-theresas-children).

Coverage is strongest on the British households, the Prussian imperial line, and the connecting descents listed above. Some collateral siblings, spouses' ancestors, early childhood deaths, and later descendants remain unexpanded. An empty child list means **no children recorded**, unless a source-backed note explicitly establishes childlessness. The graph checks establish internal consistency; they do not independently prove every inherited historical assertion. Year-only records cannot express month/day precedence or uncertain date ranges.

## Application and regression checks

The small second chronology line contains marriage/end facts, `born YEAR`, or the personal event's year/range and duration. The age column and the person's name remain separate. The drawer also sits above the tree tabs so its close button stays accessible.

Automated tests cover graph reciprocity and date plausibility, complete principal child lists, the Frederick/William imperial connection, foreign descent paths, and chronology endings. Headless Chrome checks cover row layout and controls, the rendered same-year annulment, the requested Prussian profiles, and upgrading a saved version-30 example while preserving its selected root, edited name, research note and hidden child branch. The bundled version number enables the existing additive upgrade; resetting a user's tree is unnecessary.
