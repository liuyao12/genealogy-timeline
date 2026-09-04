from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new), encoding='utf-8')


replace_once(
    'app.js',
    """function normalizedGeniReference(value) {
  const raw = refId(value) || clean(value);
  return /^profile-/i.test(raw) ? canonicalGeniProfileId(raw) : raw;
}

function remapGeniImmediateFamily""",
    """function normalizedGeniReference(value) {
  const raw = refId(value) || clean(value);
  return /^profile-/i.test(raw) ? canonicalGeniProfileId(raw) : raw;
}

function geniYearOnlyEvent(value) {
  const year = numericYear(value?.date?.year ?? value?.year ?? value);
  return year == null ? {} : { date: { year } };
}

function remapGeniImmediateFamily""",
)

replace_once(
    'app.js',
    """    const incoming = normalizePerson({
      ...raw,
      id,
      sourceId,
      sourceUrl: validGeniUrl(raw.profile_url) || `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
      sourceProvider: 'geni',
      importedAt
    }, id);""",
    """    const incoming = normalizePerson({
      ...raw,
      id,
      // Geni returns whole event objects even when we only need the year.
      // Strip month, day, and location before the general normalizer sees it.
      birth: geniYearOnlyEvent(raw.birth),
      death: geniYearOnlyEvent(raw.death),
      place: '',
      sourceId,
      sourceUrl: validGeniUrl(raw.profile_url) || `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
      sourceProvider: 'geni',
      importedAt
    }, id);""",
)

path = Path('tests/geni-request-shape.test.mjs')
text = path.read_text(encoding='utf-8')
marker = """test('immediate-family merge does not make a second optional event request', () => {"""
addition = """test('selected-profile merge strips event detail before normalizing', () => {
  const body = functionBody(
    'async function loadGeniImmediateFamily(profileId)',
    'async function fetchGeniReignEvents'
  );
  assert.match(body, /birth: geniYearOnlyEvent\(raw\.birth\)/);
  assert.match(body, /death: geniYearOnlyEvent\(raw\.death\)/);
  assert.match(body, /place: ''/);
});

"""
if text.count(marker) != 1:
    raise SystemExit('tests/geni-request-shape.test.mjs: insertion marker not unique')
path.write_text(text.replace(marker, addition + marker), encoding='utf-8')
