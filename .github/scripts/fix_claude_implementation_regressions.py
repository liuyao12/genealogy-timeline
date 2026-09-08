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
count = text.count('assert.equal(starter.version, 26);')
if count != 1:
    raise SystemExit(f'Expected one version-26 assertion, found {count}')
path.write_text(text.replace('assert.equal(starter.version, 26);', 'assert.equal(starter.version, 27);', 1), encoding='utf-8')

# Recent Chrome versions require PUT when creating a new CDP target.
replace_once(
    '.github/scripts/check_claude_monarch_events.mjs',
    """async function json(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
""",
    """async function json(url, options = {}) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url, options);
""",
)
replace_once(
    '.github/scripts/check_claude_monarch_events.mjs',
    """const target = (await json(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`)).webSocketDebuggerUrl;
""",
    """const target = (await json(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, { method: 'PUT' })).webSocketDebuggerUrl;
""",
)

# Charles IX is stored but is outside Henry VII's default focus projection.
# Exercise whichever non-British monarch is actually visible in the rendered
# focus tree (normally a foreign royal spouse), rather than hard-coding a
# profile that the projection intentionally omits.
replace_once(
    '.github/scripts/check_claude_monarch_events.mjs',
    """  const nodeStrokes = name => {
    const id = idByName(name);
    const node = document.querySelector('.timeline-node[data-person-id=\"' + CSS.escape(id) + '\"]');
    return node ? [...node.querySelectorAll('.personal-event-edge,.personal-event-point')].map(mark => mark.getAttribute('stroke')) : [];
  };
  return {
""",
    """  const nodeStrokesById = id => {
    const node = document.querySelector('.timeline-node[data-person-id=\"' + CSS.escape(id) + '\"]');
    return node ? [...node.querySelectorAll('.personal-event-edge,.personal-event-point')].map(mark => mark.getAttribute('stroke')) : [];
  };
  const nodeStrokes = name => nodeStrokesById(idByName(name));
  const visibleOtherMonarch = entries.find(([id, person]) =>
    person.personalEvents?.some(event => event.kind === 'monarch-reign' && event.monarchGroup === 'other')
    && document.querySelector('.timeline-node[data-person-id=\"' + CSS.escape(id) + '\"]')
  );
  return {
""",
)
replace_once(
    '.github/scripts/check_claude_monarch_events.mjs',
    """    britishStrokes: nodeStrokes('Henry VIII, King of England'),
    otherStrokes: nodeStrokes('Charles IX, King of France'),
""",
    """    britishStrokes: nodeStrokes('Henry VIII, King of England'),
    otherMonarch: visibleOtherMonarch?.[1]?.displayName || '',
    otherStrokes: visibleOtherMonarch ? nodeStrokesById(visibleOtherMonarch[0]) : [],
""",
)
replace_once(
    '.github/scripts/check_claude_monarch_events.mjs',
    """assert.ok(initial.otherStrokes.length > 0);
""",
    """assert.ok(initial.otherMonarch, 'the default focus should contain a visible non-British monarch');
assert.ok(initial.otherStrokes.length > 0);
""",
)
