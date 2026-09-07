from __future__ import annotations

import json
from pathlib import Path

DATA_PATH = Path("data/british-royal-line.json")
data = json.loads(DATA_PATH.read_text())
people = data["people"]
data["version"] = 26

REIGN_COLOR = "#c62828"


def name_period(pid: str, name: str, start: int, end: int, source_url: str) -> dict:
    return {
        "id": pid,
        "name": name,
        "startYear": start,
        "endYear": end,
        "sourceUrl": source_url,
    }


def event(name: str, start: int, end: int, source: str = "royal") -> dict:
    return {
        "name": name,
        "startYear": start,
        "endYear": end,
        "source": source,
        "color": REIGN_COLOR,
    }


def profile(
    pid: str,
    first_name: str,
    last_name: str,
    display_name: str,
    title: str,
    gender: str,
    birth_year: int,
    death_year: int,
    source_url: str,
    note: str,
    periods: list[dict] | None = None,
    default_period_id: str = "",
    personal_events: list[dict] | None = None,
) -> dict:
    periods = periods or [
        name_period(f"{pid}-name-{birth_year}", display_name, birth_year, death_year, source_url)
    ]
    return {
        "id": pid,
        "firstName": first_name,
        "lastName": last_name,
        "displayName": display_name,
        "title": title,
        "nameOrder": "western",
        "gender": gender,
        "birthYear": str(birth_year),
        "deathYear": str(death_year),
        "isLiving": False,
        "place": "",
        "note": note,
        "parents": [],
        "children": [],
        "partners": [],
        "spouses": [],
        "nonSpouses": [],
        "divorcedSpouses": [],
        "marriageYears": {},
        "relationshipEndYears": {},
        "relationshipEndStatuses": {},
        "namePeriods": periods,
        "defaultNamePeriodId": default_period_id or periods[-1]["id"],
        "personalEvents": personal_events or [],
        "sourceUrl": source_url,
        "sourceId": "",
        "sourceProvider": "web",
        "importedAt": "",
        "geniImmediateFamilyLoaded": False,
        "geniImmediateFamilyVerifiedAt": "",
        "geniImmediateFamilyIds": [],
        "starterProfile": True,
    }


def add(record: dict) -> None:
    if record["id"] in people:
        raise SystemExit(f"Foreign royal expansion ID already exists: {record['id']}")
    people[record["id"]] = record


def append_unique(record: dict, field: str, *ids: str) -> None:
    record[field] = list(dict.fromkeys([*record.get(field, []), *ids]))


def link_child(child_id: str, *parent_ids: str) -> None:
    child = people[child_id]
    append_unique(child, "parents", *parent_ids)
    for parent_id in parent_ids:
        append_unique(people[parent_id], "children", child_id)


def link_marriage(
    first_id: str,
    second_id: str,
    year: int,
    *,
    end_year: int | None = None,
    status: str = "",
) -> None:
    first = people[first_id]
    second = people[second_id]
    for record, spouse_id in ((first, second_id), (second, first_id)):
        append_unique(record, "partners", spouse_id)
        append_unique(record, "spouses", spouse_id)
        record.setdefault("marriageYears", {})[spouse_id] = str(year)
        if end_year is not None:
            record.setdefault("relationshipEndYears", {})[spouse_id] = str(end_year)
        if status:
            record.setdefault("relationshipEndStatuses", {})[spouse_id] = status
            append_unique(record, "divorcedSpouses", spouse_id)


def set_periods(pid: str, periods: list[dict], default_period_id: str, events: list[dict] | None = None) -> None:
    record = people[pid]
    record["namePeriods"] = periods
    record["defaultNamePeriodId"] = default_period_id
    if events is not None:
        existing = {
            (item.get("name"), item.get("startYear"), item.get("endYear")): item
            for item in record.get("personalEvents", [])
        }
        for item in events:
            existing[(item["name"], item["startYear"], item["endYear"])] = item
        record["personalEvents"] = list(existing.values())


# Existing gateway profiles.
LOUIS_XII = "profile-g6000000000440363134"
ANNE_BRITTANY = "profile-g6000000003219788977"
MADELEINE_VALOIS = "profile-g6000000002322323932"
FRANCIS_II = "profile-g6000000003232545902"
ELISABETH_VALOIS = "profile-g6000000001777536029"
HENRIETTA_MARIA = "profile-g6000000000851678345"
PHILIP_II = "profile-g6000000001600060051"
MARIA_MANUELA = "profile-g6000000001599879609"
ANNA_AUSTRIA = "profile-g6000000001142154909"
ANNE_DENMARK = "profile-4104662"
GEORGE_DENMARK = "profile-g4033341615700026163"
FREDERICK_V_PALATINE = "profile-g304433105310001815"
WILLIAM_II_ORANGE = "profile-g6000000001562593113"
LOUIS_IV_HESSE = "profile-g6000000000703378021"
LOUIS_MOUNTBATTEN = "profile-g6000000003221640265"
ALEXANDRA_DENMARK = "profile-g6000000003070981015"
ANDREW_GREECE = "profile-g5495575341940116659"

# ---------------------------------------------------------------------------
# France: the Valois line makes Louis XII the great-grandfather of Francis II.
# It also connects Madeleine of Valois, Elisabeth of Valois, the later Valois
# kings, and Henrietta Maria's Bourbon branch.
# ---------------------------------------------------------------------------
CLAUDE_FRANCE = "royal-france-claude-1499"
FRANCIS_I = "royal-france-francis-i-1494"
HENRY_II = "royal-france-henry-ii-1519"
CATHERINE_MEDICI = "royal-france-catherine-medici-1519"
CHARLES_IX = "royal-france-charles-ix-1550"
HENRY_III = "royal-france-henry-iii-1551"
MARGARET_VALOIS = "royal-france-margaret-valois-1553"
HENRY_IV = "royal-france-henry-iv-1553"
MARIE_MEDICI = "royal-france-marie-medici-1575"
LOUIS_XIII = "royal-france-louis-xiii-1601"

claude_url = "https://en.wikipedia.org/wiki/Claude_of_France"
add(profile(
    CLAUDE_FRANCE, "Claude", "of France", "Claude, Queen of France and Duchess of Brittany",
    "Queen of France and Duchess of Brittany", "female", 1499, 1524, claude_url,
    "Daughter of Louis XII and Anne of Brittany; wife of Francis I",
    periods=[
        name_period("claude-france-name-1499", "Claude of France", 1499, 1514, claude_url),
        name_period("claude-france-name-1514", "Claude, Duchess of Brittany", 1514, 1515, claude_url),
        name_period("claude-france-name-1515", "Claude, Queen of France and Duchess of Brittany", 1515, 1524, claude_url),
    ],
    default_period_id="claude-france-name-1515",
))

francis_i_url = "https://en.wikipedia.org/wiki/Francis_I_of_France"
add(profile(
    FRANCIS_I, "Francis", "I", "Francis I, King of France", "King of France", "male",
    1494, 1547, francis_i_url, "First Valois-Angoulême king of France",
    periods=[
        name_period("francis-i-name-1494", "Francis, Count of Angoulême", 1494, 1515, francis_i_url),
        name_period("francis-i-name-1515", "Francis I, King of France", 1515, 1547, francis_i_url),
    ],
    default_period_id="francis-i-name-1515",
    personal_events=[event("Reign as King of France", 1515, 1547)],
))

henry_ii_url = "https://en.wikipedia.org/wiki/Henry_II_of_France"
add(profile(
    HENRY_II, "Henry", "II", "Henry II, King of France", "King of France", "male",
    1519, 1559, henry_ii_url, "Son of Francis I and Claude of France",
    periods=[
        name_period("henry-ii-name-1519", "Prince Henry of France", 1519, 1536, henry_ii_url),
        name_period("henry-ii-name-1536", "Henry, Dauphin of France", 1536, 1547, henry_ii_url),
        name_period("henry-ii-name-1547", "Henry II, King of France", 1547, 1559, henry_ii_url),
    ],
    default_period_id="henry-ii-name-1547",
    personal_events=[event("Reign as King of France", 1547, 1559)],
))

catherine_url = "https://en.wikipedia.org/wiki/Catherine_de%27_Medici"
add(profile(
    CATHERINE_MEDICI, "Catherine", "de' Medici", "Catherine de' Medici, Queen of France",
    "Queen of France", "female", 1519, 1589, catherine_url,
    "Queen consort of Henry II and mother of three kings of France",
    periods=[
        name_period("catherine-medici-name-1519", "Catherine de' Medici", 1519, 1533, catherine_url),
        name_period("catherine-medici-name-1533", "Catherine de' Medici, Duchess of Orléans", 1533, 1547, catherine_url),
        name_period("catherine-medici-name-1547", "Catherine de' Medici, Queen of France", 1547, 1559, catherine_url),
        name_period("catherine-medici-name-1559", "Catherine de' Medici, Queen Mother of France", 1559, 1589, catherine_url),
    ],
    default_period_id="catherine-medici-name-1547",
))

charles_ix_url = "https://en.wikipedia.org/wiki/Charles_IX_of_France"
add(profile(
    CHARLES_IX, "Charles", "IX", "Charles IX, King of France", "King of France", "male",
    1550, 1574, charles_ix_url, "Younger brother and successor of Francis II",
    periods=[
        name_period("charles-ix-name-1550", "Prince Charles Maximilian of France", 1550, 1560, charles_ix_url),
        name_period("charles-ix-name-1560", "Charles IX, King of France", 1560, 1574, charles_ix_url),
    ],
    default_period_id="charles-ix-name-1560",
    personal_events=[event("Reign as King of France", 1560, 1574)],
))

henry_iii_url = "https://en.wikipedia.org/wiki/Henry_III_of_France"
add(profile(
    HENRY_III, "Henry", "III", "Henry III, King of France", "King of France", "male",
    1551, 1589, henry_iii_url, "Younger brother of Francis II and Charles IX",
    periods=[
        name_period("henry-iii-name-1551", "Prince Henry of France, Duke of Anjou", 1551, 1573, henry_iii_url),
        name_period("henry-iii-name-1573", "Henry, King of Poland and Grand Duke of Lithuania", 1573, 1574, henry_iii_url),
        name_period("henry-iii-name-1574", "Henry III, King of France", 1574, 1589, henry_iii_url),
    ],
    default_period_id="henry-iii-name-1574",
    personal_events=[event("Reign as King of France", 1574, 1589)],
))

margaret_url = "https://en.wikipedia.org/wiki/Margaret_of_Valois"
add(profile(
    MARGARET_VALOIS, "Margaret", "of Valois", "Margaret of Valois, Queen of France and Navarre",
    "Queen of France and Navarre", "female", 1553, 1615, margaret_url,
    "Daughter of Henry II and first wife of Henry IV",
    periods=[
        name_period("margaret-valois-name-1553", "Margaret of Valois", 1553, 1572, margaret_url),
        name_period("margaret-valois-name-1572", "Margaret of Valois, Queen of Navarre", 1572, 1589, margaret_url),
        name_period("margaret-valois-name-1589", "Margaret of Valois, Queen of France and Navarre", 1589, 1599, margaret_url),
        name_period("margaret-valois-name-1599", "Margaret of Valois", 1599, 1615, margaret_url),
    ],
    default_period_id="margaret-valois-name-1589",
))

henry_iv_url = "https://en.wikipedia.org/wiki/Henry_IV_of_France"
add(profile(
    HENRY_IV, "Henry", "IV", "Henry IV, King of France and Navarre", "King of France and Navarre",
    "male", 1553, 1610, henry_iv_url, "First Bourbon king of France",
    periods=[
        name_period("henry-iv-name-1553", "Henry of Bourbon, Prince of Béarn", 1553, 1572, henry_iv_url),
        name_period("henry-iv-name-1572", "Henry III, King of Navarre", 1572, 1589, henry_iv_url),
        name_period("henry-iv-name-1589", "Henry IV, King of France and Navarre", 1589, 1610, henry_iv_url),
    ],
    default_period_id="henry-iv-name-1589",
    personal_events=[event("Reign as King of France", 1589, 1610)],
))

marie_url = "https://en.wikipedia.org/wiki/Marie_de%27_Medici"
add(profile(
    MARIE_MEDICI, "Marie", "de' Medici", "Marie de' Medici, Queen of France", "Queen of France",
    "female", 1575, 1642, marie_url, "Second wife of Henry IV and mother of Louis XIII and Henrietta Maria",
    periods=[
        name_period("marie-medici-name-1575", "Marie de' Medici", 1575, 1600, marie_url),
        name_period("marie-medici-name-1600", "Marie de' Medici, Queen of France", 1600, 1610, marie_url),
        name_period("marie-medici-name-1610", "Marie de' Medici, Queen Mother of France", 1610, 1642, marie_url),
    ],
    default_period_id="marie-medici-name-1600",
))

louis_xiii_url = "https://en.wikipedia.org/wiki/Louis_XIII"
add(profile(
    LOUIS_XIII, "Louis", "XIII", "Louis XIII, King of France and Navarre", "King of France and Navarre",
    "male", 1601, 1643, louis_xiii_url, "Son of Henry IV and Marie de' Medici; brother of Henrietta Maria",
    periods=[
        name_period("louis-xiii-name-1601", "Louis, Dauphin of France", 1601, 1610, louis_xiii_url),
        name_period("louis-xiii-name-1610", "Louis XIII, King of France and Navarre", 1610, 1643, louis_xiii_url),
    ],
    default_period_id="louis-xiii-name-1610",
    personal_events=[event("Reign as King of France", 1610, 1643)],
))

link_child(CLAUDE_FRANCE, LOUIS_XII, ANNE_BRITTANY)
link_marriage(CLAUDE_FRANCE, FRANCIS_I, 1514)
link_child(HENRY_II, FRANCIS_I, CLAUDE_FRANCE)
link_child(MADELEINE_VALOIS, FRANCIS_I, CLAUDE_FRANCE)
link_marriage(HENRY_II, CATHERINE_MEDICI, 1533)
for child_id in (FRANCIS_II, ELISABETH_VALOIS, CHARLES_IX, HENRY_III, MARGARET_VALOIS):
    link_child(child_id, HENRY_II, CATHERINE_MEDICI)
link_marriage(MARGARET_VALOIS, HENRY_IV, 1572, end_year=1599, status="annulled")
link_marriage(HENRY_IV, MARIE_MEDICI, 1600)
for child_id in (LOUIS_XIII, HENRIETTA_MARIA):
    link_child(child_id, HENRY_IV, MARIE_MEDICI)

set_periods(
    LOUIS_XII,
    [
        name_period("louis-xii-name-1462", "Louis, Duke of Orléans", 1462, 1498, people[LOUIS_XII]["sourceUrl"]),
        name_period("louis-xii-name-1498", "Louis XII, King of France", 1498, 1515, people[LOUIS_XII]["sourceUrl"]),
    ],
    "louis-xii-name-1498",
    [event("Reign as King of France", 1498, 1515)],
)
set_periods(
    FRANCIS_II,
    [
        name_period("francis-ii-name-1544", "Francis, Dauphin of France", 1544, 1559, people[FRANCIS_II]["sourceUrl"]),
        name_period("francis-ii-name-1559", "Francis II, King of France", 1559, 1560, people[FRANCIS_II]["sourceUrl"]),
    ],
    "francis-ii-name-1559",
    [event("Reign as King of France", 1559, 1560)],
)

# ---------------------------------------------------------------------------
# Portugal and Spain: Philip II and Maria Manuela were double first cousins.
# Their parents descend from the same Portuguese and Habsburg grandparent
# couples; representative children extend Philip II's branch.
# ---------------------------------------------------------------------------
MANUEL_I = "royal-portugal-manuel-i-1469"
MARIA_ARAGON = "royal-portugal-maria-aragon-1482"
PHILIP_I_CASTILE = "royal-castile-philip-i-1478"
JOANNA_I_CASTILE = "royal-castile-joanna-i-1479"
CHARLES_V = "royal-habsburg-charles-v-1500"
JOHN_III = "royal-portugal-john-iii-1502"
ISABELLA_PORTUGAL = "royal-habsburg-isabella-portugal-1503"
CATHERINE_AUSTRIA = "royal-portugal-catherine-austria-1507"
CARLOS_ASTURIAS = "royal-spain-carlos-asturias-1545"
ISABELLA_CLARA = "royal-spain-isabella-clara-eugenia-1566"
PHILIP_III = "royal-spain-philip-iii-1578"

manuel_url = "https://en.wikipedia.org/wiki/Manuel_I_of_Portugal"
add(profile(
    MANUEL_I, "Manuel", "I", "Manuel I, King of Portugal", "King of Portugal", "male",
    1469, 1521, manuel_url, "Father of John III and Isabella of Portugal",
    periods=[
        name_period("manuel-i-name-1469", "Manuel, Duke of Beja", 1469, 1495, manuel_url),
        name_period("manuel-i-name-1495", "Manuel I, King of Portugal", 1495, 1521, manuel_url),
    ],
    default_period_id="manuel-i-name-1495",
    personal_events=[event("Reign as King of Portugal", 1495, 1521)],
))

maria_aragon_url = "https://en.wikipedia.org/wiki/Maria_of_Aragon,_Queen_of_Portugal"
add(profile(
    MARIA_ARAGON, "Maria", "of Aragon", "Maria of Aragon, Queen of Portugal", "Queen of Portugal",
    "female", 1482, 1517, maria_aragon_url, "Second wife of Manuel I of Portugal",
    periods=[
        name_period("maria-aragon-name-1482", "Maria of Aragon", 1482, 1500, maria_aragon_url),
        name_period("maria-aragon-name-1500", "Maria of Aragon, Queen of Portugal", 1500, 1517, maria_aragon_url),
    ],
    default_period_id="maria-aragon-name-1500",
))

philip_i_url = "https://en.wikipedia.org/wiki/Philip_the_Handsome"
add(profile(
    PHILIP_I_CASTILE, "Philip", "I", "Philip I, King of Castile", "King of Castile", "male",
    1478, 1506, philip_i_url, "Habsburg ruler known as Philip the Handsome",
    periods=[
        name_period("philip-i-castile-name-1478", "Philip the Handsome, Duke of Burgundy", 1478, 1506, philip_i_url),
        name_period("philip-i-castile-name-1506", "Philip I, King of Castile", 1506, 1506, philip_i_url),
    ],
    default_period_id="philip-i-castile-name-1506",
    personal_events=[event("Reign as King of Castile", 1506, 1506)],
))

joanna_url = "https://en.wikipedia.org/wiki/Joanna_of_Castile"
add(profile(
    JOANNA_I_CASTILE, "Joanna", "I", "Joanna I, Queen of Castile and Aragon",
    "Queen of Castile and Aragon", "female", 1479, 1555, joanna_url,
    "Daughter of Isabella I of Castile and Ferdinand II of Aragon",
    periods=[
        name_period("joanna-i-name-1479", "Infanta Joanna of Castile and Aragon", 1479, 1504, joanna_url),
        name_period("joanna-i-name-1504", "Joanna I, Queen of Castile", 1504, 1516, joanna_url),
        name_period("joanna-i-name-1516", "Joanna I, Queen of Castile and Aragon", 1516, 1555, joanna_url),
    ],
    default_period_id="joanna-i-name-1516",
))

charles_v_url = "https://en.wikipedia.org/wiki/Charles_V,_Holy_Roman_Emperor"
add(profile(
    CHARLES_V, "Charles", "V", "Charles V, Holy Roman Emperor and King of Spain",
    "Holy Roman Emperor and King of Spain", "male", 1500, 1558, charles_v_url,
    "Father of Philip II of Spain",
    periods=[
        name_period("charles-v-name-1500", "Charles of Habsburg, Duke of Burgundy", 1500, 1516, charles_v_url),
        name_period("charles-v-name-1516", "Charles I, King of Spain", 1516, 1519, charles_v_url),
        name_period("charles-v-name-1519", "Charles V, Holy Roman Emperor and King of Spain", 1519, 1556, charles_v_url),
        name_period("charles-v-name-1556", "Charles V", 1556, 1558, charles_v_url),
    ],
    default_period_id="charles-v-name-1519",
    personal_events=[
        event("Reign as King of Spain", 1516, 1556),
        event("Reign as Holy Roman Emperor", 1519, 1556),
    ],
))

john_iii_url = "https://en.wikipedia.org/wiki/John_III_of_Portugal"
add(profile(
    JOHN_III, "John", "III", "John III, King of Portugal", "King of Portugal", "male",
    1502, 1557, john_iii_url, "Father of Maria Manuela of Portugal",
    periods=[
        name_period("john-iii-name-1502", "Infante John of Portugal", 1502, 1521, john_iii_url),
        name_period("john-iii-name-1521", "John III, King of Portugal", 1521, 1557, john_iii_url),
    ],
    default_period_id="john-iii-name-1521",
    personal_events=[event("Reign as King of Portugal", 1521, 1557)],
))

isabella_url = "https://en.wikipedia.org/wiki/Isabella_of_Portugal"
add(profile(
    ISABELLA_PORTUGAL, "Isabella", "of Portugal", "Isabella of Portugal, Holy Roman Empress and Queen of Spain",
    "Holy Roman Empress and Queen of Spain", "female", 1503, 1539, isabella_url,
    "Mother of Philip II of Spain",
    periods=[
        name_period("isabella-portugal-name-1503", "Infanta Isabella of Portugal", 1503, 1526, isabella_url),
        name_period("isabella-portugal-name-1526", "Isabella of Portugal, Holy Roman Empress and Queen of Spain", 1526, 1539, isabella_url),
    ],
    default_period_id="isabella-portugal-name-1526",
))

catherine_austria_url = "https://en.wikipedia.org/wiki/Catherine_of_Austria,_Queen_of_Portugal"
add(profile(
    CATHERINE_AUSTRIA, "Catherine", "of Austria", "Catherine of Austria, Queen of Portugal",
    "Queen of Portugal", "female", 1507, 1578, catherine_austria_url,
    "Younger sister of Charles V and mother of Maria Manuela",
    periods=[
        name_period("catherine-austria-name-1507", "Archduchess Catherine of Austria", 1507, 1525, catherine_austria_url),
        name_period("catherine-austria-name-1525", "Catherine of Austria, Queen of Portugal", 1525, 1557, catherine_austria_url),
        name_period("catherine-austria-name-1557", "Catherine of Austria, Queen Dowager of Portugal", 1557, 1578, catherine_austria_url),
    ],
    default_period_id="catherine-austria-name-1525",
))

carlos_url = "https://en.wikipedia.org/wiki/Carlos,_Prince_of_Asturias"
add(profile(
    CARLOS_ASTURIAS, "Carlos", "Prince of Asturias", "Carlos, Prince of Asturias", "Prince of Asturias",
    "male", 1545, 1568, carlos_url, "Only child of Philip II and Maria Manuela of Portugal",
))

isabella_clara_url = "https://en.wikipedia.org/wiki/Isabella_Clara_Eugenia"
add(profile(
    ISABELLA_CLARA, "Isabella Clara Eugenia", "of Spain", "Infanta Isabella Clara Eugenia of Spain",
    "Infanta of Spain", "female", 1566, 1633, isabella_clara_url,
    "Daughter of Philip II and Elisabeth of Valois",
))

philip_iii_url = "https://en.wikipedia.org/wiki/Philip_III_of_Spain"
add(profile(
    PHILIP_III, "Philip", "III", "Philip III, King of Spain and Portugal", "King of Spain and Portugal",
    "male", 1578, 1621, philip_iii_url, "Son and successor of Philip II",
    periods=[
        name_period("philip-iii-name-1578", "Prince Philip of Spain", 1578, 1598, philip_iii_url),
        name_period("philip-iii-name-1598", "Philip III, King of Spain and Portugal", 1598, 1621, philip_iii_url),
    ],
    default_period_id="philip-iii-name-1598",
    personal_events=[event("Reign as King of Spain and Portugal", 1598, 1621)],
))

link_marriage(MANUEL_I, MARIA_ARAGON, 1500)
for child_id in (JOHN_III, ISABELLA_PORTUGAL):
    link_child(child_id, MANUEL_I, MARIA_ARAGON)
link_marriage(PHILIP_I_CASTILE, JOANNA_I_CASTILE, 1496)
for child_id in (CHARLES_V, CATHERINE_AUSTRIA):
    link_child(child_id, PHILIP_I_CASTILE, JOANNA_I_CASTILE)
link_marriage(CHARLES_V, ISABELLA_PORTUGAL, 1526)
link_child(PHILIP_II, CHARLES_V, ISABELLA_PORTUGAL)
link_marriage(JOHN_III, CATHERINE_AUSTRIA, 1525)
link_child(MARIA_MANUELA, JOHN_III, CATHERINE_AUSTRIA)
link_child(CARLOS_ASTURIAS, PHILIP_II, MARIA_MANUELA)
link_child(ISABELLA_CLARA, PHILIP_II, ELISABETH_VALOIS)
link_child(PHILIP_III, PHILIP_II, ANNA_AUSTRIA)

# ---------------------------------------------------------------------------
# Denmark: one early Oldenburg branch relates Anne of Denmark to Prince George
# of Denmark; the later Glücksburg branch relates Queen Alexandra to George I
# of Greece, Prince Andrew, and Prince Philip.
# ---------------------------------------------------------------------------
FREDERICK_II_DENMARK = "royal-denmark-frederick-ii-1534"
SOPHIE_MECKLENBURG = "royal-denmark-sophie-mecklenburg-1557"
CHRISTIAN_IV_DENMARK = "royal-denmark-christian-iv-1577"
ANNE_CATHERINE_BRANDENBURG = "royal-denmark-anne-catherine-brandenburg-1575"
FREDERICK_III_DENMARK = "royal-denmark-frederick-iii-1609"
SOPHIE_AMALIE = "royal-denmark-sophie-amalie-1628"
CHRISTIAN_IX_DENMARK = "royal-denmark-christian-ix-1818"
LOUISE_HESSE_KASSEL = "royal-denmark-louise-hesse-kassel-1817"
GEORGE_I_GREECE = "royal-greece-george-i-1845"
OLGA_CONSTANTINOVNA = "royal-greece-olga-constantinovna-1851"

frederick_ii_url = "https://en.wikipedia.org/wiki/Frederick_II_of_Denmark"
add(profile(
    FREDERICK_II_DENMARK, "Frederick", "II", "Frederick II, King of Denmark and Norway",
    "King of Denmark and Norway", "male", 1534, 1588, frederick_ii_url,
    "Father of Anne of Denmark and Christian IV",
    periods=[
        name_period("frederick-ii-denmark-name-1534", "Prince Frederick of Denmark", 1534, 1559, frederick_ii_url),
        name_period("frederick-ii-denmark-name-1559", "Frederick II, King of Denmark and Norway", 1559, 1588, frederick_ii_url),
    ],
    default_period_id="frederick-ii-denmark-name-1559",
    personal_events=[event("Reign as King of Denmark and Norway", 1559, 1588)],
))

sophie_mecklenburg_url = "https://en.wikipedia.org/wiki/Sophie_of_Mecklenburg-G%C3%BCstrow"
add(profile(
    SOPHIE_MECKLENBURG, "Sophie", "of Mecklenburg-Güstrow",
    "Sophie of Mecklenburg-Güstrow, Queen of Denmark and Norway", "Queen of Denmark and Norway",
    "female", 1557, 1631, sophie_mecklenburg_url, "Wife of Frederick II of Denmark",
    periods=[
        name_period("sophie-mecklenburg-name-1557", "Sophie of Mecklenburg-Güstrow", 1557, 1572, sophie_mecklenburg_url),
        name_period("sophie-mecklenburg-name-1572", "Sophie of Mecklenburg-Güstrow, Queen of Denmark and Norway", 1572, 1588, sophie_mecklenburg_url),
        name_period("sophie-mecklenburg-name-1588", "Sophie of Mecklenburg-Güstrow, Queen Dowager of Denmark and Norway", 1588, 1631, sophie_mecklenburg_url),
    ],
    default_period_id="sophie-mecklenburg-name-1572",
))

christian_iv_url = "https://en.wikipedia.org/wiki/Christian_IV_of_Denmark"
add(profile(
    CHRISTIAN_IV_DENMARK, "Christian", "IV", "Christian IV, King of Denmark and Norway",
    "King of Denmark and Norway", "male", 1577, 1648, christian_iv_url,
    "Brother of Anne of Denmark and grandfather of Prince George of Denmark",
    periods=[
        name_period("christian-iv-name-1577", "Prince Christian of Denmark", 1577, 1588, christian_iv_url),
        name_period("christian-iv-name-1588", "Christian IV, King of Denmark and Norway", 1588, 1648, christian_iv_url),
    ],
    default_period_id="christian-iv-name-1588",
    personal_events=[event("Reign as King of Denmark and Norway", 1588, 1648)],
))

anne_catherine_url = "https://en.wikipedia.org/wiki/Anne_Catherine_of_Brandenburg"
add(profile(
    ANNE_CATHERINE_BRANDENBURG, "Anne Catherine", "of Brandenburg",
    "Anne Catherine of Brandenburg, Queen of Denmark and Norway", "Queen of Denmark and Norway",
    "female", 1575, 1612, anne_catherine_url, "First wife of Christian IV of Denmark",
    periods=[
        name_period("anne-catherine-name-1575", "Anne Catherine of Brandenburg", 1575, 1597, anne_catherine_url),
        name_period("anne-catherine-name-1597", "Anne Catherine of Brandenburg, Queen of Denmark and Norway", 1597, 1612, anne_catherine_url),
    ],
    default_period_id="anne-catherine-name-1597",
))

frederick_iii_url = "https://en.wikipedia.org/wiki/Frederick_III_of_Denmark"
add(profile(
    FREDERICK_III_DENMARK, "Frederick", "III", "Frederick III, King of Denmark and Norway",
    "King of Denmark and Norway", "male", 1609, 1670, frederick_iii_url,
    "Father of Prince George of Denmark",
    periods=[
        name_period("frederick-iii-name-1609", "Prince Frederick of Denmark", 1609, 1648, frederick_iii_url),
        name_period("frederick-iii-name-1648", "Frederick III, King of Denmark and Norway", 1648, 1670, frederick_iii_url),
    ],
    default_period_id="frederick-iii-name-1648",
    personal_events=[event("Reign as King of Denmark and Norway", 1648, 1670)],
))

sophie_amalie_url = "https://en.wikipedia.org/wiki/Sophie_Amalie_of_Brunswick-L%C3%BCneburg"
add(profile(
    SOPHIE_AMALIE, "Sophie Amalie", "of Brunswick-Lüneburg",
    "Sophie Amalie of Brunswick-Lüneburg, Queen of Denmark and Norway", "Queen of Denmark and Norway",
    "female", 1628, 1685, sophie_amalie_url, "Wife of Frederick III and mother of Prince George of Denmark",
    periods=[
        name_period("sophie-amalie-name-1628", "Sophie Amalie of Brunswick-Lüneburg", 1628, 1648, sophie_amalie_url),
        name_period("sophie-amalie-name-1648", "Sophie Amalie of Brunswick-Lüneburg, Queen of Denmark and Norway", 1648, 1670, sophie_amalie_url),
        name_period("sophie-amalie-name-1670", "Sophie Amalie of Brunswick-Lüneburg, Queen Dowager of Denmark and Norway", 1670, 1685, sophie_amalie_url),
    ],
    default_period_id="sophie-amalie-name-1648",
))

christian_ix_url = "https://denkongeligesamling.dk/en/the-collection/persons/christian-ix-1818-1906/"
add(profile(
    CHRISTIAN_IX_DENMARK, "Christian", "IX", "Christian IX, King of Denmark", "King of Denmark",
    "male", 1818, 1906, christian_ix_url, "Founder of the Glücksburg line on the Danish throne",
    periods=[
        name_period("christian-ix-name-1818", "Prince Christian of Schleswig-Holstein-Sonderburg-Glücksburg", 1818, 1863, christian_ix_url),
        name_period("christian-ix-name-1863", "Christian IX, King of Denmark", 1863, 1906, christian_ix_url),
    ],
    default_period_id="christian-ix-name-1863",
    personal_events=[event("Reign as King of Denmark", 1863, 1906)],
))

louise_url = "https://denkongeligesamling.dk/en/the-collection/persons/queen-louise-1817-1898/"
add(profile(
    LOUISE_HESSE_KASSEL, "Louise", "of Hesse-Kassel", "Louise of Hesse-Kassel, Queen of Denmark",
    "Queen of Denmark", "female", 1817, 1898, louise_url,
    "Wife of Christian IX and mother of Alexandra and George I of Greece",
    periods=[
        name_period("louise-hesse-kassel-name-1817", "Princess Louise of Hesse-Kassel", 1817, 1842, louise_url),
        name_period("louise-hesse-kassel-name-1842", "Princess Christian of Glücksburg", 1842, 1863, louise_url),
        name_period("louise-hesse-kassel-name-1863", "Louise of Hesse-Kassel, Queen of Denmark", 1863, 1898, louise_url),
    ],
    default_period_id="louise-hesse-kassel-name-1863",
))

george_i_url = "https://en.wikipedia.org/wiki/George_I_of_Greece"
add(profile(
    GEORGE_I_GREECE, "George", "I", "George I, King of the Hellenes", "King of the Hellenes",
    "male", 1845, 1913, george_i_url, "Born Prince William of Denmark; father of Prince Andrew of Greece",
    periods=[
        name_period("george-i-greece-name-1845", "Prince William of Denmark", 1845, 1863, george_i_url),
        name_period("george-i-greece-name-1863", "George I, King of the Hellenes", 1863, 1913, george_i_url),
    ],
    default_period_id="george-i-greece-name-1863",
    personal_events=[event("Reign as King of the Hellenes", 1863, 1913)],
))

olga_url = "https://en.wikipedia.org/wiki/Olga_Constantinovna_of_Russia"
add(profile(
    OLGA_CONSTANTINOVNA, "Olga Constantinovna", "of Russia",
    "Olga Constantinovna of Russia, Queen of the Hellenes", "Queen of the Hellenes",
    "female", 1851, 1926, olga_url, "Wife of George I of Greece and mother of Prince Andrew",
    periods=[
        name_period("olga-constantinovna-name-1851", "Grand Duchess Olga Constantinovna of Russia", 1851, 1867, olga_url),
        name_period("olga-constantinovna-name-1867", "Olga Constantinovna of Russia, Queen of the Hellenes", 1867, 1913, olga_url),
        name_period("olga-constantinovna-name-1913", "Olga Constantinovna of Russia, Queen Dowager of the Hellenes", 1913, 1926, olga_url),
    ],
    default_period_id="olga-constantinovna-name-1867",
))

link_marriage(FREDERICK_II_DENMARK, SOPHIE_MECKLENBURG, 1572)
for child_id in (ANNE_DENMARK, CHRISTIAN_IV_DENMARK):
    link_child(child_id, FREDERICK_II_DENMARK, SOPHIE_MECKLENBURG)
link_marriage(CHRISTIAN_IV_DENMARK, ANNE_CATHERINE_BRANDENBURG, 1597)
link_child(FREDERICK_III_DENMARK, CHRISTIAN_IV_DENMARK, ANNE_CATHERINE_BRANDENBURG)
link_marriage(FREDERICK_III_DENMARK, SOPHIE_AMALIE, 1643)
link_child(GEORGE_DENMARK, FREDERICK_III_DENMARK, SOPHIE_AMALIE)

link_marriage(CHRISTIAN_IX_DENMARK, LOUISE_HESSE_KASSEL, 1842)
for child_id in (ALEXANDRA_DENMARK, GEORGE_I_GREECE):
    link_child(child_id, CHRISTIAN_IX_DENMARK, LOUISE_HESSE_KASSEL)
link_marriage(GEORGE_I_GREECE, OLGA_CONSTANTINOVNA, 1867)
link_child(ANDREW_GREECE, GEORGE_I_GREECE, OLGA_CONSTANTINOVNA)

# ---------------------------------------------------------------------------
# Palatinate and Orange: extend two seventeenth-century gateway lines already
# central to the British succession.
# ---------------------------------------------------------------------------
FREDERICK_IV_PALATINE = "royal-palatinate-frederick-iv-1574"
LOUISE_JULIANA_NASSAU = "royal-palatinate-louise-juliana-1576"
FREDERICK_HENRY_ORANGE = "royal-orange-frederick-henry-1584"
AMALIA_SOLMS = "royal-orange-amalia-solms-1602"

frederick_iv_url = "https://en.wikipedia.org/wiki/Frederick_IV,_Elector_Palatine"
add(profile(
    FREDERICK_IV_PALATINE, "Frederick", "IV", "Frederick IV, Elector Palatine", "Elector Palatine",
    "male", 1574, 1610, frederick_iv_url, "Father of Frederick V, the Winter King",
    periods=[
        name_period("frederick-iv-palatine-name-1574", "Prince Frederick of the Palatinate", 1574, 1583, frederick_iv_url),
        name_period("frederick-iv-palatine-name-1583", "Frederick IV, Elector Palatine", 1583, 1610, frederick_iv_url),
    ],
    default_period_id="frederick-iv-palatine-name-1583",
    personal_events=[event("Tenure as Elector Palatine", 1583, 1610)],
))

louise_juliana_url = "https://en.wikipedia.org/wiki/Louise_Juliana_of_Nassau"
add(profile(
    LOUISE_JULIANA_NASSAU, "Louise Juliana", "of Nassau", "Louise Juliana of Nassau, Electress Palatine",
    "Electress Palatine", "female", 1576, 1644, louise_juliana_url,
    "Wife of Frederick IV and mother of Frederick V",
    periods=[
        name_period("louise-juliana-name-1576", "Louise Juliana of Nassau", 1576, 1593, louise_juliana_url),
        name_period("louise-juliana-name-1593", "Louise Juliana of Nassau, Electress Palatine", 1593, 1610, louise_juliana_url),
        name_period("louise-juliana-name-1610", "Louise Juliana of Nassau, Dowager Electress Palatine", 1610, 1644, louise_juliana_url),
    ],
    default_period_id="louise-juliana-name-1593",
))

frederick_henry_url = "https://en.wikipedia.org/wiki/Frederick_Henry,_Prince_of_Orange"
add(profile(
    FREDERICK_HENRY_ORANGE, "Frederick Henry", "Prince of Orange", "Frederick Henry, Prince of Orange",
    "Prince of Orange", "male", 1584, 1647, frederick_henry_url,
    "Father of William II, Prince of Orange",
    periods=[
        name_period("frederick-henry-name-1584", "Frederick Henry of Nassau", 1584, 1625, frederick_henry_url),
        name_period("frederick-henry-name-1625", "Frederick Henry, Prince of Orange", 1625, 1647, frederick_henry_url),
    ],
    default_period_id="frederick-henry-name-1625",
    personal_events=[event("Tenure as Prince of Orange", 1625, 1647)],
))

amalia_url = "https://en.wikipedia.org/wiki/Amalia_of_Solms-Braunfels"
add(profile(
    AMALIA_SOLMS, "Amalia", "of Solms-Braunfels", "Amalia of Solms-Braunfels, Princess of Orange",
    "Princess of Orange", "female", 1602, 1675, amalia_url,
    "Wife of Frederick Henry and mother of William II",
    periods=[
        name_period("amalia-solms-name-1602", "Amalia of Solms-Braunfels", 1602, 1625, amalia_url),
        name_period("amalia-solms-name-1625", "Amalia of Solms-Braunfels, Princess of Orange", 1625, 1647, amalia_url),
        name_period("amalia-solms-name-1647", "Amalia of Solms-Braunfels, Dowager Princess of Orange", 1647, 1675, amalia_url),
    ],
    default_period_id="amalia-solms-name-1625",
))

link_marriage(FREDERICK_IV_PALATINE, LOUISE_JULIANA_NASSAU, 1593)
link_child(FREDERICK_V_PALATINE, FREDERICK_IV_PALATINE, LOUISE_JULIANA_NASSAU)
link_marriage(FREDERICK_HENRY_ORANGE, AMALIA_SOLMS, 1625)
link_child(WILLIAM_II_ORANGE, FREDERICK_HENRY_ORANGE, AMALIA_SOLMS)

# ---------------------------------------------------------------------------
# Hesse and Battenberg: Louis IV of Hesse and Prince Louis of Battenberg now
# meet in a common Hessian grandparent generation, explaining the close family
# relationship of Princess Alice of Battenberg's parents.
# ---------------------------------------------------------------------------
LOUIS_II_HESSE = "royal-hesse-louis-ii-1777"
WILHELMINE_BADEN = "royal-hesse-wilhelmine-baden-1788"
CHARLES_HESSE = "royal-hesse-charles-1809"
ELISABETH_PRUSSIA = "royal-hesse-elisabeth-prussia-1815"
ALEXANDER_HESSE = "royal-hesse-alexander-1823"
JULIA_BATTENBERG = "royal-battenberg-julia-1825"

louis_ii_hesse_url = "https://en.wikipedia.org/wiki/Louis_II,_Grand_Duke_of_Hesse"
add(profile(
    LOUIS_II_HESSE, "Louis", "II", "Louis II, Grand Duke of Hesse and by Rhine",
    "Grand Duke of Hesse and by Rhine", "male", 1777, 1848, louis_ii_hesse_url,
    "Dynastic father of Princes Charles and Alexander of Hesse",
    periods=[
        name_period("louis-ii-hesse-name-1777", "Hereditary Prince Louis of Hesse-Darmstadt", 1777, 1830, louis_ii_hesse_url),
        name_period("louis-ii-hesse-name-1830", "Louis II, Grand Duke of Hesse and by Rhine", 1830, 1848, louis_ii_hesse_url),
    ],
    default_period_id="louis-ii-hesse-name-1830",
    personal_events=[event("Reign as Grand Duke of Hesse and by Rhine", 1830, 1848)],
))

wilhelmine_url = "https://en.wikipedia.org/wiki/Princess_Wilhelmine_of_Baden"
add(profile(
    WILHELMINE_BADEN, "Wilhelmine", "of Baden", "Wilhelmine of Baden, Grand Duchess of Hesse and by Rhine",
    "Grand Duchess of Hesse and by Rhine", "female", 1788, 1836, wilhelmine_url,
    "Wife of Louis II and mother of Princes Charles and Alexander",
    periods=[
        name_period("wilhelmine-baden-name-1788", "Princess Wilhelmine of Baden", 1788, 1804, wilhelmine_url),
        name_period("wilhelmine-baden-name-1804", "Hereditary Grand Duchess Wilhelmine of Hesse", 1804, 1830, wilhelmine_url),
        name_period("wilhelmine-baden-name-1830", "Wilhelmine of Baden, Grand Duchess of Hesse and by Rhine", 1830, 1836, wilhelmine_url),
    ],
    default_period_id="wilhelmine-baden-name-1830",
))

charles_hesse_url = "https://en.wikipedia.org/wiki/Prince_Charles_of_Hesse_and_by_Rhine"
add(profile(
    CHARLES_HESSE, "Charles", "of Hesse and by Rhine", "Prince Charles of Hesse and by Rhine",
    "Prince of Hesse and by Rhine", "male", 1809, 1877, charles_hesse_url,
    "Father of Louis IV, Grand Duke of Hesse and by Rhine",
))

elisabeth_prussia_url = "https://en.wikipedia.org/wiki/Princess_Elisabeth_of_Prussia_(1815%E2%80%931885)"
add(profile(
    ELISABETH_PRUSSIA, "Elisabeth", "of Prussia", "Princess Elisabeth of Prussia",
    "Princess of Prussia", "female", 1815, 1885, elisabeth_prussia_url,
    "Wife of Prince Charles of Hesse and mother of Louis IV",
))

alexander_hesse_url = "https://en.wikipedia.org/wiki/Prince_Alexander_of_Hesse_and_by_Rhine"
add(profile(
    ALEXANDER_HESSE, "Alexander", "of Hesse and by Rhine", "Prince Alexander of Hesse and by Rhine",
    "Prince of Hesse and by Rhine", "male", 1823, 1888, alexander_hesse_url,
    "Father of Prince Louis of Battenberg",
))

julia_url = "https://en.wikipedia.org/wiki/Julia,_Princess_of_Battenberg"
add(profile(
    JULIA_BATTENBERG, "Julia", "Princess of Battenberg", "Julia, Princess of Battenberg",
    "Princess of Battenberg", "female", 1825, 1895, julia_url,
    "Wife of Prince Alexander of Hesse and mother of Prince Louis of Battenberg",
    periods=[
        name_period("julia-battenberg-name-1825", "Julia Hauke", 1825, 1851, julia_url),
        name_period("julia-battenberg-name-1851", "Julia, Countess of Battenberg", 1851, 1858, julia_url),
        name_period("julia-battenberg-name-1858", "Julia, Princess of Battenberg", 1858, 1895, julia_url),
    ],
    default_period_id="julia-battenberg-name-1858",
))

link_marriage(LOUIS_II_HESSE, WILHELMINE_BADEN, 1804)
for child_id in (CHARLES_HESSE, ALEXANDER_HESSE):
    link_child(child_id, LOUIS_II_HESSE, WILHELMINE_BADEN)
link_marriage(CHARLES_HESSE, ELISABETH_PRUSSIA, 1836)
link_child(LOUIS_IV_HESSE, CHARLES_HESSE, ELISABETH_PRUSSIA)
link_marriage(ALEXANDER_HESSE, JULIA_BATTENBERG, 1851)
link_child(LOUIS_MOUNTBATTEN, ALEXANDER_HESSE, JULIA_BATTENBERG)

# Structural validation before writing. Every new parent-child and marriage
# edge must be reciprocal; no relationship may point to a missing profile.
for pid, person_record in people.items():
    for parent_id in person_record.get("parents", []):
        if parent_id not in people:
            raise SystemExit(f"{pid} has missing parent {parent_id}")
        if pid not in people[parent_id].get("children", []):
            raise SystemExit(f"Non-reciprocal parent-child edge: {parent_id} -> {pid}")
    for child_id in person_record.get("children", []):
        if child_id not in people:
            raise SystemExit(f"{pid} has missing child {child_id}")
        if pid not in people[child_id].get("parents", []):
            raise SystemExit(f"Non-reciprocal child-parent edge: {pid} -> {child_id}")
    for spouse_id in person_record.get("spouses", []):
        if spouse_id not in people:
            raise SystemExit(f"{pid} has missing spouse {spouse_id}")
        if pid not in people[spouse_id].get("spouses", []):
            raise SystemExit(f"Non-reciprocal marriage edge: {pid} <-> {spouse_id}")

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print(f"Expanded bundled example to {len(people)} profiles at version {data['version']}")
