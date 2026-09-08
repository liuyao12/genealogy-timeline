from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


# Do not infer that a status-less union is non-marital. Geni explicitly marks
# partner/mistress-style unions; unknown should remain unknown.
replace_once(
    'geni-model.js',
    """    const relationField = formal ? 'spouses' : 'nonSpouses';
    partner[relationField] = unique([...(partner[relationField] || []), ...others]);
""",
    """    if (formal) partner.spouses = unique([...(partner.spouses || []), ...others]);
    else if (nonMaritalUnion) partner.nonSpouses = unique([...(partner.nonSpouses || []), ...others]);
"""
)
replace_once(
    'app.js',
    """      const relationKey = isSpouseUnion ? 'spouses' : 'nonSpouses';
      profileMap[id][relationKey] = unique([...(profileMap[id][relationKey] || []), ...partners.filter(other => other !== id)]);
""",
    """      const otherPartners = partners.filter(other => other !== id);
      if (isSpouseUnion) profileMap[id].spouses = unique([...(profileMap[id].spouses || []), ...otherPartners]);
      else if (nonMaritalUnion) profileMap[id].nonSpouses = unique([...(profileMap[id].nonSpouses || []), ...otherPartners]);
"""
)

# Keep self-description heuristics from firing on notes about somebody else's
# birth. A note beginning with a self-description remains useful when dates or
# structured union provenance are absent.
scope_path = Path('descendant-scope.js')
scope = scope_path.read_text()
old = """function profileNameValues(person) {
  return [
    person?.displayName,
    typeof person?.name === 'string' ? person.name : '',
    person?.firstName,
    person?.lastName,
    person?.title,
    person?.note,
    ...(Array.isArray(person?.namePeriods) ? person.namePeriods.map(period => period?.name) : [])
  ].filter(Boolean).map(String);
}
"""
new = """function profileNameValues(person) {
  return [
    person?.displayName,
    typeof person?.name === 'string' ? person.name : '',
    person?.firstName,
    person?.lastName,
    person?.title,
    ...(Array.isArray(person?.namePeriods) ? person.namePeriods.map(period => period?.name) : [])
  ].filter(Boolean).map(String);
}

function selfDescriptionNote(person) {
  return String(person?.note || '').trim();
}
"""
if scope.count(old) != 1:
    raise SystemExit(f'Expected one profileNameValues helper, found {scope.count(old)}')
scope = scope.replace(old, new, 1)

old = """  const text = profileNameValues(person).join(' ');
  if (/\\bstill[-\\s]?born\\b|\\bstill[-\\s]?birth\\b/i.test(text)) return 'stillbirth';
  const birthYear = numericYear(person.birthYear);
  const deathYear = person.isLiving ? null : numericYear(person.deathYear);
  if (birthYear != null && deathYear != null && deathYear <= birthYear + 1) return 'infant-death';
  if (hasPlaceholderName(person)) return 'placeholder-name';

  const parentIds = orderedParentIds(records, parentsByChild, childId);
  if (parentIds.length < 2) return 'missing-parent';

  const unionStatus = String(person.geniParentUnionStatus || '').toLowerCase().replace(/[\\s-]+/g, '_');
  const explicitlyNonMarital = person.geniNonMaritalBirth === true
    || ['partner', 'ex_partner', 'unmarried', 'mistress', 'lover', 'concubine'].includes(unionStatus)
    || /\\billegitimate\\b|\\bnatural\\s+(?:son|daughter|child)\\b|\\bbastard\\b/i.test(text);
"""
new = """  const text = profileNameValues(person).join(' ');
  const note = selfDescriptionNote(person);
  const noteMarksStillbirth = /^(?:still[-\\s]?born|still[-\\s]?birth)\\b/i.test(note);
  if (/\\bstill[-\\s]?born\\b|\\bstill[-\\s]?birth\\b/i.test(text) || noteMarksStillbirth) return 'stillbirth';
  const birthYear = numericYear(person.birthYear);
  const deathYear = person.isLiving ? null : numericYear(person.deathYear);
  const noteMarksInfantDeath = /^(?:died\\s+(?:in infancy|as an? infant)|infant death)\\b/i.test(note);
  if ((birthYear != null && deathYear != null && deathYear <= birthYear + 1) || noteMarksInfantDeath) return 'infant-death';
  if (hasPlaceholderName(person)) return 'placeholder-name';

  const parentIds = orderedParentIds(records, parentsByChild, childId);
  if (parentIds.length < 2) return 'missing-parent';

  const unionStatus = String(person.geniParentUnionStatus || '').toLowerCase().replace(/[\\s-]+/g, '_');
  const noteMarksNonMaritalBirth = /^(?:illegitimate|natural\\s+(?:son|daughter|child)|bastard)\\b/i.test(note);
  const explicitlyNonMarital = person.geniNonMaritalBirth === true
    || ['partner', 'ex_partner', 'unmarried', 'mistress', 'lover', 'concubine'].includes(unionStatus)
    || /\\billegitimate\\b|\\bnatural\\s+(?:son|daughter|child)\\b|\\bbastard\\b/i.test(text)
    || noteMarksNonMaritalBirth;
"""
if scope.count(old) != 1:
    raise SystemExit(f'Expected one suppression text block, found {scope.count(old)}')
scope_path.write_text(scope.replace(old, new, 1))

# Only provider-qualified bare IDs count as Geni identities. Explicit
# `profile-...` IDs and geni.com URLs remain sufficient without metadata.
identity_path = Path('geni-identity.js')
identity = identity_path.read_text()
old = """export function geniIdentityCandidates(person = {}, fallbackId = '') {
  const candidates = [
    person?.sourceId,
    person?.source_id,
    person?.profile_url,
    person?.profileUrl,
    person?.sourceUrl,
    person?.url,
    person?.id,
    fallbackId
  ].map(canonicalGeniIdentity).filter(Boolean);
  const guid = clean(person?.guid);
  if (/^\\d{15,}$/.test(guid)) candidates.unshift(`profile-g${guid}`);
  return unique(candidates);
}
"""
new = """export function geniIdentityCandidates(person = {}, fallbackId = '') {
  const guid = clean(person?.guid);
  const provider = clean(person?.sourceProvider || person?.source_provider || person?.provenance?.provider).toLowerCase();
  const urls = [person?.profile_url, person?.profileUrl, person?.sourceUrl, person?.url]
    .map(canonicalGeniIdentity).filter(Boolean);
  const allowBareId = provider === 'geni' || urls.length > 0 || /^\\d{15,}$/.test(guid);
  const idCandidate = value => {
    const raw = clean(value);
    if (/^profile-g?\\d+$/i.test(raw)) return canonicalGeniIdentity(raw);
    return allowBareId && /^g?\\d+$/i.test(raw) ? canonicalGeniIdentity(raw) : '';
  };
  const candidates = [
    idCandidate(person?.sourceId),
    idCandidate(person?.source_id),
    ...urls,
    idCandidate(person?.id),
    idCandidate(fallbackId)
  ].filter(Boolean);
  if (/^\\d{15,}$/.test(guid)) candidates.unshift(`profile-g${guid}`);
  return unique(candidates);
}
"""
if identity.count(old) != 1:
    raise SystemExit(f'Expected one Geni identity candidate function, found {identity.count(old)}')
identity_path.write_text(identity.replace(old, new, 1))

# Regressions for unknown union status, self-description text, and non-Geni
# numeric source identifiers.
geni_test_path = Path('tests/geni-import.test.mjs')
geni_test = geni_test_path.read_text()
anchor = """test('marks children of an explicit Geni partner union as non-marital', () => {
"""
unknown_test = """test('leaves a status-less undated union unclassified rather than assuming non-marital', () => {
  const people = Object.fromEntries(['parent-a', 'parent-b', 'child'].map(id => [
    `profile-${id}`,
    profileToLineagePerson({ id: `profile-${id}`, name: id }, `profile-${id}`)
  ]));
  applyUnionToPeople(people, {
    id: 'union-unknown',
    partners: ['profile-parent-a', 'profile-parent-b'],
    children: ['profile-child']
  }, value => value);
  assert.deepEqual(people['profile-parent-a'].partners, ['profile-parent-b']);
  assert.deepEqual(people['profile-parent-a'].spouses, []);
  assert.deepEqual(people['profile-parent-a'].nonSpouses, []);
  assert.equal(people['profile-child'].geniParentUnionStatus, '');
  assert.equal(people['profile-child'].geniNonMaritalBirth, false);
});

"""
if unknown_test not in geni_test:
    if geni_test.count(anchor) != 1:
        raise SystemExit(f'Expected one explicit-partner test anchor, found {geni_test.count(anchor)}')
    geni_test = geni_test.replace(anchor, unknown_test + anchor, 1)
    geni_test_path.write_text(geni_test)

scope_test_path = Path('tests/descendant-scope.test.mjs')
scope_test = scope_test_path.read_text()
anchor = """test('keeps a suppressed profile visible when it is explicitly chosen as the focus', () => {
"""
text_test = """test('does not hide a person merely because their note mentions somebody else’s fragile birth', () => {
  const people = {
    root: { id: 'root', parents: [], children: ['child'], spouses: ['spouse'] },
    spouse: { id: 'spouse', parents: [], children: ['child'], spouses: ['root'] },
    child: {
      id: 'child', displayName: 'Ordinary Child', birthYear: '1900', deathYear: '1980',
      note: 'Father of an illegitimate son and a stillborn daughter.',
      parents: ['root', 'spouse'], children: [], spouses: []
    }
  };
  const scope = computeDescendantScope(people, 'root');
  assert.equal(scope.allowedIds.has('child'), true);
  assert.equal(scope.suppressionReasons.has('child'), false);
});

"""
if text_test not in scope_test:
    if scope_test.count(anchor) != 1:
        raise SystemExit(f'Expected one focus-override test anchor, found {scope_test.count(anchor)}')
    scope_test = scope_test.replace(anchor, text_test + anchor, 1)
    scope_test_path.write_text(scope_test)

identity_test_path = Path('tests/geni-identity.test.mjs')
identity_test = identity_test_path.read_text()
anchor = """test('indexes a locally named profile by its linked Geni source ID', () => {
"""
provider_test = """test('does not treat another provider’s bare numeric source ID as a Geni identity', () => {
  const people = {
    local: { id: 'local', sourceId: '42', sourceProvider: 'other-service', sourceUrl: 'https://example.com/42' }
  };
  const index = indexPeopleByGeniIdentity(people);
  assert.equal(index.has('profile-42'), false);
});

"""
if provider_test not in identity_test:
    if identity_test.count(anchor) != 1:
        raise SystemExit(f'Expected one Geni index test anchor, found {identity_test.count(anchor)}')
    identity_test = identity_test.replace(anchor, provider_test + anchor, 1)
    identity_test_path.write_text(identity_test)
