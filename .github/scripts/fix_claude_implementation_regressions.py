from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one match in {path}, found {count}: {old[:120]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


# The side-panel parser is deliberately unit-tested in isolation. Keep its
# alias construction dependent only on helpers already in that test harness;
# these values are graph profile IDs, not arbitrary URLs.
replace_once(
    'app.js',
    """      geniAliases: unique([...(profile.geniAliases || []), rawId, id].map(profileIdFromInput).filter(Boolean))
""",
    """      geniAliases: unique([...(profile.geniAliases || []), rawId, id]
        .map(value => canonicalGeniProfileId(refId(value)))
        .filter(value => /^profile-/i.test(value)))
""",
)

# Version 27 is asserted in both royal-data test suites.
path = Path('tests/royal-name-style.test.mjs')
text = path.read_text(encoding='utf-8')
text = text.replace("test('the bundled royal example advances its migration version'", "test('the bundled royal example advances its migration version'", 1)
count = text.count('assert.equal(starter.version, 26);')
if count != 1:
    raise SystemExit(f'Expected one version-26 assertion, found {count}')
path.write_text(text.replace('assert.equal(starter.version, 26);', 'assert.equal(starter.version, 27);', 1), encoding='utf-8')
