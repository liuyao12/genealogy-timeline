from pathlib import Path

app_path = Path('app.js')
app = app_path.read_text()
old = """  const starterRootId = britishRoyalStarterRootId();
  const isBundledLine = state.rootId === starterRootId && (
    state.title === 'The British royal line from Henry VII' ||
    Object.values(state.people).some(person => person.starterProfile)
  );
  if (!isBundledLine) return false;
"""
new = """  const starterRootId = britishRoyalStarterRootId();
  const starterProfiles = Object.values(state.people).filter(person => person.starterProfile);
  // Refocusing changes state.rootId, but it does not turn the bundled example
  // into a custom tree. Identify the starter by its retained Henry VII profile
  // and starter population so versioned additions still merge after a jump.
  const hasBundledRoot = state.people[starterRootId]?.starterProfile === true;
  const isBundledLine = hasBundledRoot && (
    state.title === 'The British royal line from Henry VII' ||
    starterProfiles.length >= 10
  );
  if (!isBundledLine) return false;
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one bundled-line eligibility block, found {app.count(old)}')
app_path.write_text(app.replace(old, new, 1))

test_path = Path('tests/foreign-royal-branches.test.mjs')
test_text = test_path.read_text()
marker = "test('a refocused bundled example remains eligible for starter upgrades'"
if marker not in test_text:
    test_text += """

test('a refocused bundled example remains eligible for starter upgrades', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function upgradeBundledBritishRoyalLine()');
  const end = app.indexOf('function migrateGeniPeople', start);
  assert.ok(start >= 0 && end > start, 'starter upgrade function should exist');
  const upgrade = app.slice(start, end);
  assert.match(upgrade, /const hasBundledRoot = state\.people\[starterRootId\]\?\.starterProfile === true/);
  assert.match(upgrade, /starterProfiles\.length >= 10/);
  assert.doesNotMatch(upgrade, /state\.rootId === starterRootId/);
});
"""
    test_path.write_text(test_text)
