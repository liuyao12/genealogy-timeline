from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    file.write_text(text.replace(old, new), encoding='utf-8')


replace_once(
    'geni-import-core.js',
    """  async fetchFamilyGraphs(ids) {
    const requested = unique(ids.map(apiProfileIdentifier).filter(Boolean));""",
    """  familyGraphRequestId(value) {
    const stableId = this.resolveStableId(value);
    return this.stableToApi[stableId] || apiProfileIdentifier(value);
  }

  async fetchFamilyGraphs(ids) {
    // After the first graph response, use Geni's compact API node IDs for
    // every later frontier. This is the same key optimization used by
    // HistoryLink and avoids relying on public GUIDs in bulk `ids` calls.
    const requested = unique(ids.map(value => this.familyGraphRequestId(value)).filter(Boolean));""",
)

replace_once(
    'tests/geni-import.test.mjs',
    """  assert.equal(String(secondGenerationCalls.find(call => call.path === 'profile/immediate-family')?.params.ids).split(',').length, 50);
  assert.equal(secondGenerationCalls.filter(call => call.path !== 'profile/immediate-family').length, 1);""",
    """  const bulkIds = String(secondGenerationCalls.find(call => call.path === 'profile/immediate-family')?.params.ids).split(',');
  assert.equal(bulkIds.length, 50);
  assert.ok(bulkIds.every(id => /^\\d+$/.test(id)), 'bulk frontiers use compact Geni API node IDs');
  assert.equal(secondGenerationCalls.filter(call => call.path !== 'profile/immediate-family').length, 1);
  assert.match(secondGenerationCalls.find(call => call.path !== 'profile/immediate-family').path, /^profile-\\d+\\/immediate-family$/);""",
)
