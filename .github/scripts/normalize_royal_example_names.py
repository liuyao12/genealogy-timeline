import json
from pathlib import Path

DATA_PATH = Path('data/british-royal-line.json')
data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
people = data['people']

updates = {
    'profile-g6000000000307240333': {
        'firstName': 'Adolphus',
        'lastName': '',
        'displayName': 'Adolphus, Duke of Cambridge',
        'title': 'Duke of Cambridge',
        'namePeriods': [
            {
                'id': 'adolphus-cambridge-name-1774',
                'name': 'Prince Adolphus',
                'startYear': 1774,
                'endYear': 1801,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp10922/prince-adolphus-frederick-duke-of-cambridge'
            },
            {
                'id': 'adolphus-cambridge-name-1801',
                'name': 'Adolphus, Duke of Cambridge',
                'startYear': 1801,
                'endYear': 1850,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp10922/prince-adolphus-frederick-duke-of-cambridge'
            }
        ],
        'defaultNamePeriodId': 'adolphus-cambridge-name-1801'
    },
    'profile-g6000000001260403655': {
        'displayName': 'Augusta, Duchess of Cambridge',
        'title': 'Duchess of Cambridge',
        'namePeriods': [
            {
                'id': 'augusta-cambridge-name-1797',
                'name': 'Princess Augusta of Hesse-Kassel',
                'startYear': 1797,
                'endYear': 1818,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Princess_Augusta_of_Hesse-Kassel'
            },
            {
                'id': 'augusta-cambridge-name-1818',
                'name': 'Augusta, Duchess of Cambridge',
                'startYear': 1818,
                'endYear': 1889,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Princess_Augusta_of_Hesse-Kassel'
            }
        ],
        'defaultNamePeriodId': 'augusta-cambridge-name-1818'
    },
    'profile-g6000000003245250586': {
        'displayName': 'Mary Adelaide, Duchess of Teck',
        'title': 'Duchess of Teck',
        'namePeriods': [
            {
                'id': 'mary-adelaide-name-1833',
                'name': 'Princess Mary Adelaide of Cambridge',
                'startYear': 1833,
                'endYear': 1866,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp04441/princess-mary-adelaide-duchess-of-teck'
            },
            {
                'id': 'mary-adelaide-name-1866',
                'name': 'Mary Adelaide, Princess of Teck',
                'startYear': 1866,
                'endYear': 1871,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp04441/princess-mary-adelaide-duchess-of-teck'
            },
            {
                'id': 'mary-adelaide-name-1871',
                'name': 'Mary Adelaide, Duchess of Teck',
                'startYear': 1871,
                'endYear': 1897,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp04441/princess-mary-adelaide-duchess-of-teck'
            }
        ],
        'defaultNamePeriodId': 'mary-adelaide-name-1871'
    },
    'profile-g6000000000703284437': {
        'displayName': 'Alice, Grand Duchess of Hesse and by Rhine',
        'title': 'Grand Duchess of Hesse and by Rhine',
        'namePeriods': [
            {
                'id': 'alice-hesse-name-1843',
                'name': 'Princess Alice of the United Kingdom',
                'startYear': 1843,
                'endYear': 1877,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/portrait/mw191550/princess-alice-grand-duchess-of-hesse'
            },
            {
                'id': 'alice-hesse-name-1877',
                'name': 'Alice, Grand Duchess of Hesse and by Rhine',
                'startYear': 1877,
                'endYear': 1878,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/portrait/mw191550/princess-alice-grand-duchess-of-hesse'
            }
        ],
        'defaultNamePeriodId': 'alice-hesse-name-1877'
    },
    'profile-g6000000003221640265': {
        'firstName': 'Louis',
        'lastName': 'Mountbatten',
        'displayName': 'Louis Mountbatten, 1st Marquess of Milford Haven',
        'title': '1st Marquess of Milford Haven',
        'namePeriods': [
            {
                'id': 'louis-milford-name-1854',
                'name': 'Prince Louis of Battenberg',
                'startYear': 1854,
                'endYear': 1917,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Louis_Mountbatten,_1st_Marquess_of_Milford_Haven'
            },
            {
                'id': 'louis-milford-name-1917',
                'name': 'Louis Mountbatten, 1st Marquess of Milford Haven',
                'startYear': 1917,
                'endYear': 1921,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Louis_Mountbatten,_1st_Marquess_of_Milford_Haven'
            }
        ],
        'defaultNamePeriodId': 'louis-milford-name-1917'
    },
    'profile-g6000000003221554850': {
        'firstName': 'Victoria',
        'lastName': 'Mountbatten',
        'displayName': 'Victoria Mountbatten, Marchioness of Milford Haven',
        'title': 'Marchioness of Milford Haven',
        'namePeriods': [
            {
                'id': 'victoria-milford-name-1863',
                'name': 'Princess Victoria of Hesse and by Rhine',
                'startYear': 1863,
                'endYear': 1884,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Princess_Victoria_of_Hesse_and_by_Rhine'
            },
            {
                'id': 'victoria-milford-name-1884',
                'name': 'Victoria, Princess Louis of Battenberg',
                'startYear': 1884,
                'endYear': 1917,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Princess_Victoria_of_Hesse_and_by_Rhine'
            },
            {
                'id': 'victoria-milford-name-1917',
                'name': 'Victoria Mountbatten, Marchioness of Milford Haven',
                'startYear': 1917,
                'endYear': 1950,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Princess_Victoria_of_Hesse_and_by_Rhine'
            }
        ],
        'defaultNamePeriodId': 'victoria-milford-name-1917'
    },
    'profile-g5495575341940116659': {
        'displayName': 'Prince Andrew of Greece and Denmark',
        'title': 'Prince of Greece and Denmark',
        'namePeriods': [
            {
                'id': 'andrew-greece-name-1882',
                'name': 'Prince Andrew of Greece and Denmark',
                'startYear': 1882,
                'endYear': 1944,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Prince_Andrew_of_Greece_and_Denmark'
            }
        ],
        'defaultNamePeriodId': 'andrew-greece-name-1882'
    },
    'profile-g6000000003075330310': {
        'displayName': 'Princess Alice of Battenberg',
        'title': 'Princess Andrew of Greece and Denmark',
        'namePeriods': [
            {
                'id': 'alice-battenberg-name-1885',
                'name': 'Princess Alice of Battenberg',
                'startYear': 1885,
                'endYear': 1903,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Princess_Alice_of_Battenberg'
            },
            {
                'id': 'alice-battenberg-name-1903',
                'name': 'Princess Andrew of Greece and Denmark',
                'startYear': 1903,
                'endYear': 1969,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Princess_Alice_of_Battenberg'
            }
        ],
        'defaultNamePeriodId': 'alice-battenberg-name-1885'
    },
    'profile-g6000000003890906681': {
        'firstName': 'Ernest Augustus',
        'lastName': '',
        'displayName': 'Ernest Augustus, Elector of Hanover',
        'title': 'Elector of Hanover',
        'namePeriods': [
            {
                'id': 'ernest-augustus-name-1629',
                'name': 'Prince Ernest Augustus of Brunswick-Lüneburg',
                'startYear': 1629,
                'endYear': 1679,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Ernest_Augustus,_Elector_of_Hanover'
            },
            {
                'id': 'ernest-augustus-name-1679',
                'name': 'Ernest Augustus, Duke of Brunswick-Lüneburg',
                'startYear': 1679,
                'endYear': 1692,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Ernest_Augustus,_Elector_of_Hanover'
            },
            {
                'id': 'ernest-augustus-name-1692',
                'name': 'Ernest Augustus, Elector of Hanover',
                'startYear': 1692,
                'endYear': 1698,
                'sourceUrl': 'https://en.wikipedia.org/wiki/Ernest_Augustus,_Elector_of_Hanover'
            }
        ],
        'defaultNamePeriodId': 'ernest-augustus-name-1692'
    },
    'profile-g6000000003879438150': {
        'firstName': 'Sophia',
        'lastName': 'of the Palatinate',
        'displayName': 'Sophia, Electress of Hanover',
        'title': 'Electress of Hanover',
        'namePeriods': [
            {
                'id': 'sophia-hanover-name-1630',
                'name': 'Princess Sophia of the Palatinate',
                'startYear': 1630,
                'endYear': 1692,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp04196/princess-sophia-electress-of-hanover'
            },
            {
                'id': 'sophia-hanover-name-1692',
                'name': 'Sophia, Electress of Hanover',
                'startYear': 1692,
                'endYear': 1698,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp04196/princess-sophia-electress-of-hanover'
            },
            {
                'id': 'sophia-hanover-name-1698',
                'name': 'Sophia, Dowager Electress of Hanover',
                'startYear': 1698,
                'endYear': 1714,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp04196/princess-sophia-electress-of-hanover'
            }
        ],
        'defaultNamePeriodId': 'sophia-hanover-name-1692'
    },
    'profile-g304430340510004215': {
        'displayName': 'Elizabeth Stuart, Queen of Bohemia',
        'title': 'Queen of Bohemia',
        'namePeriods': [
            {
                'id': 'elizabeth-bohemia-name-1596',
                'name': 'Princess Elizabeth Stuart',
                'startYear': 1596,
                'endYear': 1613,
                'sourceUrl': 'https://www.westminster-abbey.org/abbey-commemorations/royals/elizabeth-queen-of-bohemia'
            },
            {
                'id': 'elizabeth-bohemia-name-1613',
                'name': 'Elizabeth Stuart, Electress Palatine',
                'startYear': 1613,
                'endYear': 1619,
                'sourceUrl': 'https://www.westminster-abbey.org/abbey-commemorations/royals/elizabeth-queen-of-bohemia'
            },
            {
                'id': 'elizabeth-bohemia-name-1619',
                'name': 'Elizabeth Stuart, Queen of Bohemia',
                'startYear': 1619,
                'endYear': 1662,
                'sourceUrl': 'https://www.westminster-abbey.org/abbey-commemorations/royals/elizabeth-queen-of-bohemia'
            }
        ],
        'defaultNamePeriodId': 'elizabeth-bohemia-name-1619'
    },
    'profile-g6000000003885198846': {
        'firstName': 'Mary',
        'lastName': 'Stuart',
        'displayName': 'Mary, Princess Royal and Princess of Orange',
        'title': 'Princess Royal and Princess of Orange',
        'namePeriods': [
            {
                'id': 'mary-orange-name-1631',
                'name': 'Princess Mary Stuart',
                'startYear': 1631,
                'endYear': 1642,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp03000/mary-princess-royal-and-princess-of-orange'
            },
            {
                'id': 'mary-orange-name-1642',
                'name': 'Mary, Princess Royal',
                'startYear': 1642,
                'endYear': 1647,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp03000/mary-princess-royal-and-princess-of-orange'
            },
            {
                'id': 'mary-orange-name-1647',
                'name': 'Mary, Princess Royal and Princess of Orange',
                'startYear': 1647,
                'endYear': 1660,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp03000/mary-princess-royal-and-princess-of-orange'
            }
        ],
        'defaultNamePeriodId': 'mary-orange-name-1647'
    },
    'profile-g4033453667340030515': {
        'displayName': 'Anne Hyde, Duchess of York',
        'title': 'Duchess of York',
        'namePeriods': [
            {
                'id': 'anne-hyde-name-1637',
                'name': 'Anne Hyde',
                'startYear': 1637,
                'endYear': 1660,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp00148/anne-hyde-duchess-of-york'
            },
            {
                'id': 'anne-hyde-name-1660',
                'name': 'Anne Hyde, Duchess of York',
                'startYear': 1660,
                'endYear': 1671,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp00148/anne-hyde-duchess-of-york'
            }
        ],
        'defaultNamePeriodId': 'anne-hyde-name-1660'
    },
    'profile-g4033341615700026163': {
        'displayName': 'Prince George of Denmark, Duke of Cumberland',
        'title': 'Duke of Cumberland',
        'namePeriods': [
            {
                'id': 'george-denmark-name-1653',
                'name': 'Prince George of Denmark',
                'startYear': 1653,
                'endYear': 1689,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp01754/prince-george-of-denmark-duke-of-cumberland'
            },
            {
                'id': 'george-denmark-name-1689',
                'name': 'Prince George of Denmark, Duke of Cumberland',
                'startYear': 1689,
                'endYear': 1708,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp01754/prince-george-of-denmark-duke-of-cumberland'
            }
        ],
        'defaultNamePeriodId': 'george-denmark-name-1689'
    },
    'profile-g6000000003891753089': {
        'displayName': 'Augusta of Saxe-Gotha, Princess of Wales',
        'title': 'Princess of Wales',
        'namePeriods': [
            {
                'id': 'augusta-wales-name-1719',
                'name': 'Princess Augusta of Saxe-Gotha',
                'startYear': 1719,
                'endYear': 1736,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp00180/augusta-of-saxe-gotha-princess-of-wales'
            },
            {
                'id': 'augusta-wales-name-1736',
                'name': 'Augusta of Saxe-Gotha, Princess of Wales',
                'startYear': 1736,
                'endYear': 1751,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp00180/augusta-of-saxe-gotha-princess-of-wales'
            },
            {
                'id': 'augusta-wales-name-1751',
                'name': 'Augusta of Saxe-Gotha, Dowager Princess of Wales',
                'startYear': 1751,
                'endYear': 1772,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp00180/augusta-of-saxe-gotha-princess-of-wales'
            }
        ],
        'defaultNamePeriodId': 'augusta-wales-name-1736'
    },
    'profile-g6000000003760910764': {
        'displayName': 'Frances Brandon, Duchess of Suffolk',
        'title': 'Duchess of Suffolk',
        'namePeriods': [
            {
                'id': 'frances-suffolk-name-1517',
                'name': 'Lady Frances Brandon',
                'startYear': 1517,
                'endYear': 1551,
                'sourceUrl': 'https://www.westminster-abbey.org/abbey-commemorations/commemorations/frances-brandon-duchess-of-suffolk'
            },
            {
                'id': 'frances-suffolk-name-1551',
                'name': 'Frances Brandon, Duchess of Suffolk',
                'startYear': 1551,
                'endYear': 1559,
                'sourceUrl': 'https://www.westminster-abbey.org/abbey-commemorations/commemorations/frances-brandon-duchess-of-suffolk'
            }
        ],
        'defaultNamePeriodId': 'frances-suffolk-name-1551'
    },
    'profile-g5466010055340136751': {
        'displayName': 'Katherine Willoughby, Duchess of Suffolk',
        'title': 'Duchess of Suffolk',
        'namePeriods': [
            {
                'id': 'katherine-suffolk-name-1519',
                'name': 'Katherine Willoughby',
                'startYear': 1519,
                'endYear': 1526,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp69732/katherine-bertie-nee-willoughby-duchess-of-suffolk'
            },
            {
                'id': 'katherine-suffolk-name-1526',
                'name': 'Katherine Willoughby, Baroness Willoughby de Eresby',
                'startYear': 1526,
                'endYear': 1533,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp69732/katherine-bertie-nee-willoughby-duchess-of-suffolk'
            },
            {
                'id': 'katherine-suffolk-name-1533',
                'name': 'Katherine Willoughby, Duchess of Suffolk',
                'startYear': 1533,
                'endYear': 1580,
                'sourceUrl': 'https://www.npg.org.uk/collections/search/person/mp69732/katherine-bertie-nee-willoughby-duchess-of-suffolk'
            }
        ],
        'defaultNamePeriodId': 'katherine-suffolk-name-1533'
    }
}

missing = sorted(set(updates) - set(people))
if missing:
    raise SystemExit(f'Missing expected starter profiles: {missing}')

for profile_id, fields in updates.items():
    people[profile_id].update(fields)

old_version = int(data.get('version', 0))
if old_version != 23:
    raise SystemExit(f'Expected starter version 23, found {old_version}')
data['version'] = 24

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

TEST_PATH = Path('tests/royal-name-style.test.mjs')
TEST_PATH.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;

const expectedDefaults = {
  'profile-g6000000000307240333': 'Adolphus, Duke of Cambridge',
  'profile-g6000000001260403655': 'Augusta, Duchess of Cambridge',
  'profile-g6000000003245250586': 'Mary Adelaide, Duchess of Teck',
  'profile-g6000000000703284437': 'Alice, Grand Duchess of Hesse and by Rhine',
  'profile-g6000000003221640265': 'Louis Mountbatten, 1st Marquess of Milford Haven',
  'profile-g6000000003221554850': 'Victoria Mountbatten, Marchioness of Milford Haven',
  'profile-g5495575341940116659': 'Prince Andrew of Greece and Denmark',
  'profile-g6000000003075330310': 'Princess Alice of Battenberg',
  'profile-g6000000003890906681': 'Ernest Augustus, Elector of Hanover',
  'profile-g6000000003879438150': 'Sophia, Electress of Hanover',
  'profile-g304430340510004215': 'Elizabeth Stuart, Queen of Bohemia',
  'profile-g6000000003885198846': 'Mary, Princess Royal and Princess of Orange',
  'profile-g4033453667340030515': 'Anne Hyde, Duchess of York',
  'profile-g4033341615700026163': 'Prince George of Denmark, Duke of Cumberland',
  'profile-g6000000003891753089': 'Augusta of Saxe-Gotha, Princess of Wales',
  'profile-g6000000003760910764': 'Frances Brandon, Duchess of Suffolk',
  'profile-g5466010055340136751': 'Katherine Willoughby, Duchess of Suffolk'
};

function defaultName(person) {
  return person.namePeriods.find(period => period.id === person.defaultNamePeriodId)?.name;
}

test('the bundled royal example advances its migration version', () => {
  assert.equal(starter.version, 24);
});

test('substantive titles are displayed as titles rather than territorial surnames', () => {
  for (const [id, expectedName] of Object.entries(expectedDefaults)) {
    const person = people[id];
    assert.ok(person, `missing profile ${id}`);
    assert.equal(person.displayName, expectedName, id);
    assert.equal(defaultName(person), expectedName, `${id} default dated name`);
    assert.ok(person.title, `${id} should have a structured title`);
  }
});

test('dated title changes cover each corrected profile lifespan', () => {
  for (const id of Object.keys(expectedDefaults)) {
    const person = people[id];
    const periods = [...person.namePeriods].sort((a, b) => a.startYear - b.startYear);
    assert.ok(periods.length, `${id} should have dated names`);
    assert.equal(periods[0].startYear, Number(person.birthYear), `${id} first dated name`);
    assert.equal(periods.at(-1).endYear, Number(person.deathYear), `${id} last dated name`);
    for (let index = 1; index < periods.length; index += 1) {
      assert.ok(periods[index].startYear <= periods[index - 1].endYear + 1, `${id} has a gap in its dated names`);
    }
  }
});

test('genuine conventional bynames remain unchanged', () => {
  assert.equal(people['profile-4475169'].displayName, 'Catherine of Aragon');
  assert.equal(people['profile-g6000000002270077138'].displayName, 'Anne of Cleves');
  assert.equal(people['profile-g6000000006120090309'].displayName, 'Mary of Guise');
});

test('the known malformed territorial-title forms have been removed', () => {
  const oldNames = new Set([
    'Adolphus of Cambridge',
    'Mary Adelaide of Cambridge',
    'Alice of the United Kingdom',
    'Louis of Battenberg',
    'Victoria of Hesse',
    'Andrew of Greece and Denmark',
    'Alice of Battenberg',
    'Ernest Augustus of Hanover',
    'Sophia of Hanover',
    'Mary Stuart',
    'George of Denmark'
  ]);
  Object.values(people).forEach(person => assert.ok(!oldNames.has(person.displayName), person.displayName));
});
''', encoding='utf-8')
