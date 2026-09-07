from pathlib import Path

patch = Path('.github/scripts/normalize_royal_example_names.py')
text = patch.read_text(encoding='utf-8')
text = text.replace(
    'https://www.npg.org.uk/collections/search/person/mp00148/anne-hyde-duchess-of-york',
    'https://en.wikipedia.org/wiki/Anne_Hyde'
)
text = text.replace(
    'https://www.npg.org.uk/collections/search/person/mp00180/augusta-of-saxe-gotha-princess-of-wales',
    'https://en.wikipedia.org/wiki/Princess_Augusta_of_Saxe-Gotha'
)
old_frances = """            {
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
"""
new_frances = """            {
                'id': 'frances-suffolk-name-1517',
                'name': 'Lady Frances Brandon',
                'startYear': 1517,
                'endYear': 1533,
                'sourceUrl': 'https://www.westminster-abbey.org/abbey-commemorations/commemorations/frances-brandon-duchess-of-suffolk'
            },
            {
                'id': 'frances-suffolk-name-1533',
                'name': 'Frances Brandon, Marchioness of Dorset',
                'startYear': 1533,
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
"""
if text.count(old_frances) != 1:
    raise SystemExit(f'Expected one Frances period block, found {text.count(old_frances)}')
text = text.replace(old_frances, new_frances)
old_test = """test('genuine conventional bynames remain unchanged', () => {
  assert.equal(people['profile-4475169'].displayName, 'Catherine of Aragon');
  assert.equal(people['profile-g6000000002270077138'].displayName, 'Anne of Cleves');
  assert.equal(people['profile-g6000000006120090309'].displayName, 'Mary of Guise');
});
"""
new_test = """test('genuine conventional bynames remain unchanged', () => {
  const names = new Set(Object.values(people).map(person => person.displayName));
  assert.ok(names.has('Catherine of Aragon'));
  assert.ok(names.has('Anne of Cleves'));
  assert.ok(names.has('Mary of Guise'));
});
"""
if text.count(old_test) != 1:
    raise SystemExit(f'Expected one conventional-bynames test block, found {text.count(old_test)}')
patch.write_text(text.replace(old_test, new_test), encoding='utf-8')
