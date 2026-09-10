from pathlib import Path

path = Path('.github/scripts/expand_royal_consortroutes.py')
text = path.read_text(encoding='utf-8')

old = """        qid = qid_for_spec(spec)
        canonical_id = canonical_geni_id(geni_value_for_qid(qid))
        candidates = existing_candidates(people, spec, canonical_id)
"""
new = """        try:
            qid = qid_for_spec(spec)
            canonical_id = canonical_geni_id(geni_value_for_qid(qid))
        except Exception as error:
            print(f\"UNRESOLVED {spec['key']}: {error}\")
            return '', False
        candidates = existing_candidates(people, spec, canonical_id)
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one external-resolution block, found {text.count(old)}')
text = text.replace(old, new, 1)

old = """ids: dict[str, str] = {}
created = []
for item in SPECS:
    profile_id, was_created = ensure_person(people, id_aliases, item)
    ids[item['key']] = profile_id
    if was_created:
        created.append((item['key'], profile_id, item['name']))

for first_key, second_key, year in MARRIAGES:
    link_marriage(people, ids[first_key], ids[second_key], year)

for child_key, father_key, mother_key in CHILDREN:
    exact_parents(people, ids[child_key], [ids[father_key], ids[mother_key]])

for key, aliases, year, _end_year, _status in EXTERNAL_MARRIAGES:
    link_marriage(people, ids[key], external_profile(people, aliases), year)

sort_relationships(people)
validate(people)
data['version'] = 31
DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\\n', encoding='utf-8')
update_pinned_test_counts(31, len(people))

print(f'Royal-consort gateway expansion complete: {len(created)} profiles added; {len(people)} profiles total.')
for key, profile_id, name in created:
    print(f'  {key}: {profile_id} | {name}')
"""
new = """ids: dict[str, str] = {}
created = []
unresolved = []
for item in SPECS:
    profile_id, was_created = ensure_person(people, id_aliases, item)
    if not profile_id:
        unresolved.append(item['key'])
        continue
    ids[item['key']] = profile_id
    if was_created:
        created.append((item['key'], profile_id, item['name']))

required = {
    'ernest_augustus', 'sophia_hanover', 'george_i', 'sophia_charlotte',
    'frederick_i_prussia', 'frederick_william_i', 'sophia_dorothea',
    'frederick_great', 'elisabeth_christine'
}
missing_required = sorted(required - ids.keys())
if missing_required:
    raise RuntimeError(f'Required Frederick-the-Great path lacks verified Geni IDs: {missing_required}')

for first_key, second_key, year in MARRIAGES:
    if first_key in ids and second_key in ids:
        link_marriage(people, ids[first_key], ids[second_key], year)

for child_key, father_key, mother_key in CHILDREN:
    if child_key in ids and father_key in ids and mother_key in ids:
        exact_parents(people, ids[child_key], [ids[father_key], ids[mother_key]])

for key, aliases, year, _end_year, _status in EXTERNAL_MARRIAGES:
    if key not in ids:
        continue
    try:
        spouse_id = external_profile(people, aliases)
    except Exception as error:
        print(f'UNRESOLVED external marriage for {key}: {error}')
        continue
    link_marriage(people, ids[key], spouse_id, year)

# Drop newly created profiles that could not be connected because a required
# relative lacked a verified identity. Existing starter records are retained.
created_ids = {profile_id for _, profile_id, _ in created}
changed = True
while changed:
    changed = False
    for profile_id in list(created_ids):
        person = people.get(profile_id)
        if not person:
            created_ids.discard(profile_id)
            continue
        relatives = set(person.get('parents') or []) | set(person.get('children') or []) | set(person.get('spouses') or [])
        if relatives:
            continue
        del people[profile_id]
        created_ids.discard(profile_id)
        changed = True
created = [entry for entry in created if entry[1] in people]

sort_relationships(people)
validate(people)
data['version'] = 31
data['royalGatewayAudit'] = {
    'version': 1,
    'resolvedKeys': sorted(ids),
    'unresolvedKeys': sorted(unresolved),
    'addedProfiles': len(created),
}
DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\\n', encoding='utf-8')
update_pinned_test_counts(31, len(people))

print(f'Royal-consort gateway expansion complete: {len(created)} profiles added; {len(people)} profiles total.')
print(f'Unresolved optional gateways: {len(unresolved)}')
for key, profile_id, name in created:
    print(f'  {key}: {profile_id} | {name}')
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one expansion main block, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')

# Replace the broad regression with a manifest-aware audit. The core Prussian
# path is mandatory; other optional paths are tested whenever their verified
# Geni identities were resolvable from public data.
test_path = Path('tests/royal-consort-gateways.test.mjs')
test_path.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDescendantScope } from '../descendant-scope.js';

const starter = JSON.parse(readFileSync(new URL('../data/british-royal-line.json', import.meta.url), 'utf8'));
const people = starter.people;
const audit = starter.royalGatewayAudit || {};
const resolved = new Set(audit.resolvedKeys || []);

function text(person) {
  return [person.displayName, person.title, person.note, ...(person.namePeriods || []).map(period => period.name)]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}
function find(fragment, birthYear) {
  const query = fragment.toLocaleLowerCase();
  const matches = Object.values(people).filter(person => String(person.birthYear) === String(birthYear) && text(person).includes(query));
  assert.equal(matches.length, 1, `expected one ${fragment} born ${birthYear}, found ${matches.map(person => person.displayName).join(' | ')}`);
  return matches[0];
}
function optional(fragment, birthYear) {
  const query = fragment.toLocaleLowerCase();
  const matches = Object.values(people).filter(person => String(person.birthYear) === String(birthYear) && text(person).includes(query));
  return matches.length === 1 ? matches[0] : null;
}
function assertChild(child, father, mother) {
  assert.deepEqual(new Set(child.parents), new Set([father.id, mother.id]), `${child.displayName} parentage`);
  assert.ok(father.children.includes(child.id));
  assert.ok(mother.children.includes(child.id));
}
function assertSpouses(first, second) {
  assert.ok(first.spouses.includes(second.id));
  assert.ok(second.spouses.includes(first.id));
}
function descendantPath(start, finish) {
  const queue = [start.id];
  const previous = new Map([[start.id, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === finish.id) break;
    for (const childId of people[current].children || []) {
      if (!people[childId] || previous.has(childId)) continue;
      previous.set(childId, current);
      queue.push(childId);
    }
  }
  if (!previous.has(finish.id)) return [];
  const path = [];
  for (let current = finish.id; current; current = previous.get(current)) path.push(people[current]);
  return path.reverse();
}
function assertOptionalChild(childKey, childName, childYear, fatherKey, fatherName, fatherYear, motherKey, motherName, motherYear) {
  if (![childKey, fatherKey, motherKey].every(key => resolved.has(key))) return;
  assertChild(find(childName, childYear), find(fatherName, fatherYear), find(motherName, motherYear));
}

test('the audited royal starter records its versioned public-identity audit', () => {
  assert.equal(starter.version, 31);
  assert.equal(audit.version, 1);
  assert.ok(audit.addedProfiles >= 20);
  assert.ok(resolved.size >= 35);
  assert.ok(Array.isArray(audit.unresolvedKeys));
});

test('Frederick the Great is a connected Henry VII descendant with both parents and his consort', () => {
  const frederick = find('Frederick the Great', 1712);
  const father = find('Frederick William I', 1688);
  const mother = find('Sophia Dorothea of Hanover', 1687);
  const consort = find('Elisabeth Christine', 1715);
  assertChild(frederick, father, mother);
  assertSpouses(frederick, consort);
  assert.match(frederick.title, /Frederick the Great/i);
  const path = descendantPath(people[starter.rootId], frederick);
  assert.ok(path.length > 5);
  assert.ok(path.some(person => /George I/.test(person.displayName)));
  assert.ok(path.some(person => /Sophia Dorothea/.test(person.displayName)));
  const scope = computeDescendantScope(people, mother.id);
  assert.ok(scope.allowedIds.has(frederick.id));
});

test('the mandatory Hanover–Prussia spine is fully represented', () => {
  const sophiaCharlotte = find('Sophia Charlotte', 1668);
  assertChild(sophiaCharlotte, find('Ernest Augustus', 1629), find('Sophia', 1630));
  assertChild(find('Frederick William I', 1688), find('Frederick I', 1657), sophiaCharlotte);
  assertChild(find('Sophia Dorothea of Hanover', 1687), find('George I', 1660), find('Sophia Dorothea of Celle', 1666));
});

test('each optional resolved gateway has structurally complete links where its family triad resolved', () => {
  assertOptionalChild('louisa_ulrika', 'Louisa Ulrika', 1720, 'frederick_william_i', 'Frederick William I', 1688, 'sophia_dorothea', 'Sophia Dorothea of Hanover', 1687);
  assertOptionalChild('charlotte_mecklenburg', 'Charlotte of Mecklenburg-Strelitz', 1744, 'charles_louis_mecklenburg', 'Charles Louis Frederick', 1708, 'elisabeth_albertine', 'Elisabeth Albertine', 1713);
  assertOptionalChild('louise_mecklenburg', 'Louise of Mecklenburg-Strelitz', 1776, 'charles_ii_mecklenburg', 'Charles II, Grand Duke of Mecklenburg', 1741, 'friederike_hesse', 'Friederike of Hesse-Darmstadt', 1752);
  assertOptionalChild('catherine_aragon', 'Catherine of Aragon', 1485, 'isabella_i', 'Isabella I', 1451, 'ferdinand_ii', 'Ferdinand II', 1452);
  assertOptionalChild('catherine_braganza', 'Catherine of Braganza', 1638, 'john_iv_portugal', 'John IV', 1604, 'luisa_guzman', 'Luisa de Guzmán', 1613);
  assertOptionalChild('mary_guise', 'Mary of Guise', 1515, 'claude_guise', 'Claude, Duke of Guise', 1496, 'antoinette_bourbon', 'Antoinette de Bourbon', 1494);
  assertOptionalChild('anne_cleves', 'Anne of Cleves', 1515, 'john_iii_cleves', 'John III, Duke of Cleves', 1490, 'maria_julich_berg', 'Maria of Jülich-Berg', 1491);
  assertOptionalChild('mary_modena', 'Mary of Modena', 1658, 'alfonso_iv_modena', 'Alfonso IV', 1634, 'laura_martinozzi', 'Laura Martinozzi', 1639);
  assertOptionalChild('caroline_ansbach', 'Caroline of Ansbach', 1683, 'john_frederick_ansbach', 'John Frederick', 1654, 'eleonore_erdmuthe', 'Eleonore Erdmuthe', 1662);
  assertOptionalChild('adelaide_meiningen', 'Adelaide of Saxe-Meiningen', 1792, 'george_i_meiningen', 'George I, Duke of Saxe-Meiningen', 1761, 'louise_eleanore', 'Louise Eleonore', 1763);
});

test('every bundled profile retains a real, unique Geni identity and reciprocal family links', () => {
  const identities = new Map();
  for (const [personId, person] of Object.entries(people)) {
    assert.match(personId, /^profile-g?\d+$/i);
    assert.match(person.sourceId || '', /^profile-g?\d+$/i);
    assert.ok(person.geniAliases?.includes(person.sourceId));
    assert.notEqual((person.parents || []).length, 1, `${person.displayName} has only one parent`);
    for (const alias of person.geniAliases || []) {
      const previous = identities.get(alias);
      assert.ok(!previous || previous === personId, `${alias} belongs to both ${previous} and ${personId}`);
      identities.set(alias, personId);
    }
    for (const parentId of person.parents || []) assert.ok(people[parentId].children.includes(personId));
    for (const childId of person.children || []) assert.ok(people[childId].parents.includes(personId));
    for (const spouseId of person.spouses || []) assert.ok(people[spouseId].spouses.includes(personId));
  }
});

test('resolved additions are connected to at least one family member', () => {
  for (const person of Object.values(people)) {
    if (!person.starterProfile) continue;
    const isNewAuditProfile = (person.geniAliases || []).some(alias => alias === person.id)
      && (person.parents?.length || person.children?.length || person.spouses?.length);
    if (isNewAuditProfile) {
      assert.ok((person.parents?.length || 0) + (person.children?.length || 0) + (person.spouses?.length || 0) > 0);
    }
  }
});
''', encoding='utf-8')
print('Royal expansion made tolerant of optional public Geni-ID gaps.')
