from pathlib import Path
import re

app_path = Path('app.js')
app = app_path.read_text(encoding='utf-8')

old_error = """      if (/invalid.*access.*token|access.*token.*invalid|expired.*access.*token/i.test(apiMessage)) {
        const error = new Error('Geni authorization has expired.');
        error.code = 'GENI_INVALID_ACCESS_TOKEN';
        finish(error);
        return;
      }
      finish(null, payload);
"""
new_error = """      if (/invalid.*access.*token|access.*token.*invalid|expired.*access.*token/i.test(apiMessage)) {
        const error = new Error('Geni authorization has expired.');
        error.code = 'GENI_INVALID_ACCESS_TOKEN';
        finish(error);
        return;
      }
      if (/rate.?limit|too many requests|request limit|throttl/i.test(apiMessage)) {
        const error = new Error('Geni has rate-limited this application. The application may still need Geni approval for a usable API quota.');
        error.code = 'GENI_RATE_LIMIT';
        finish(error);
        return;
      }
      finish(null, payload);
"""
if app.count(old_error) != 1:
    raise SystemExit(f'Expected one JSONP error block, found {app.count(old_error)}')
app = app.replace(old_error, new_error)

neighborhood_pattern = re.compile(
    r"async function fetchGeniNeighborhood\(id\) \{.*?\n\}\n\nfunction geniProfilePayloadRecords",
    re.S,
)
new_neighborhood = """async function fetchGeniNeighborhood(id) {
  const requestedFocusId = canonicalGeniProfileId(id);
  const fields = [
    'id', 'guid', 'url', 'profile_url', 'public', 'display_name',
    'first_name', 'middle_name', 'last_name', 'maiden_name', 'title',
    'gender', 'is_alive', 'birth', 'death', 'birth_date', 'birth_date_parts',
    'death_date', 'death_date_parts', 'unions', 'partners', 'children',
    'status', 'marriage', 'divorce', 'marriage_date', 'divorce_date'
  ].join(',');
  const payload = await fetchGeniJsonp(`${encodeURIComponent(requestedFocusId)}/immediate-family`, {
    fields,
    only_ids: 'true'
  });
  if (payload?.error) throw new Error(payload.error.message || 'Geni did not return immediate family.');

  const focusRaw = payload?.focus;
  if (!focusRaw) throw new Error('Geni did not return the selected public profile.');
  const rawFocusId = refId(focusRaw.id || focusRaw.url) || requestedFocusId;
  const focusId = geniProfileIdForApiProfile(focusRaw, requestedFocusId);
  const graphNodes = payload?.nodes && typeof payload.nodes === 'object'
    ? { ...payload.nodes }
    : {};
  graphNodes[rawFocusId] = { ...focusRaw, id: rawFocusId };

  // Geni provides the focus profile, immediate-family profile nodes, and
  // union nodes together. One request is sufficient to reconstruct parents,
  // siblings, spouses or partners, children, and union dates.
  const mapped = inferRelationsFromUnions(graphNodes, { [rawFocusId]: focusId });
  const canonicalFocus = { ...focusRaw, id: focusId };
  if (!mapped[focusId]) mapped[focusId] = canonicalFocus;
  if (!Object.keys(mapped).length) throw new Error('Geni returned no verifiable immediate-family profiles.');
  return { mapped, focusRaw: canonicalFocus };
}

function geniProfilePayloadRecords"""
app, replacement_count = neighborhood_pattern.subn(new_neighborhood, app, count=1)
if replacement_count != 1:
    raise SystemExit(f'Expected one fetchGeniNeighborhood function, replaced {replacement_count}')

optional_events_pattern = re.compile(
    r"  try \{\n    const remoteProfileIds = unique\(Object\.values\(records\).*?\n  \} catch \{ /\* Optional event enrichment must not block family import\. \*/ \}\n",
    re.S,
)
replacement = """  // Keep the primary sidebar action to one Geni request. Reign and other
  // optional event enrichment is intentionally left to separate research so
  // an immediate-family refresh cannot consume several rate-limit slots.
"""
app, event_count = optional_events_pattern.subn(replacement, app, count=1)
if event_count != 1:
    raise SystemExit(f'Expected one optional immediate-family event block, replaced {event_count}')

app_path.write_text(app, encoding='utf-8')

index_path = Path('index.html')
index = index_path.read_text(encoding='utf-8')
if index.count('./app.js?v=124') != 1:
    raise SystemExit('Expected app.js cache version 124 exactly once')
index_path.write_text(index.replace('./app.js?v=124', './app.js?v=125'), encoding='utf-8')

doc_path = Path('docs/geni-import.md')
doc = doc_path.read_text(encoding='utf-8')
needle = """A completed import can become a new tree tab or be stitched into the active tree. The new-tab option is the safer default because it leaves the current tree unchanged.\n\n## Traversal and family reconstruction\n"""
insert = """A completed import can become a new tree tab or be stitched into the active tree. The new-tab option is the safer default because it leaves the current tree unchanged.\n\nThe selected-profile sidebar uses Geni's `profile/immediate-family` endpoint. Its primary **Load/Refresh immediate family** action is deliberately one API request: Geni returns the focus profile, related profile nodes, and union nodes together. Optional reign-event enrichment is not bundled into that action.\n\nNew applications may have an extremely small quota until Geni approves them. Geni's current Help Center says approval is required for higher rate limits and may be required for particular endpoints. Request approval through the [Geni API Project discussions](https://www.geni.com/discussions?discussion_type=project-1124), identifying application 2164 and the public Lineage deployment.\n\n## Traversal and family reconstruction\n"""
if doc.count(needle) != 1:
    raise SystemExit(f'Expected documentation insertion point once, found {doc.count(needle)}')
doc_path.write_text(doc.replace(needle, insert), encoding='utf-8')

test_path = Path('tests/geni-request-shape.test.mjs')
test_path.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function functionBody(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test('selected-profile immediate-family loading uses one graph endpoint', () => {
  const body = functionBody(
    'async function fetchGeniNeighborhood(id)',
    'function geniProfilePayloadRecords'
  );
  assert.match(body, /\/immediate-family/);
  assert.doesNotMatch(body, /fetchGeniProfileDetails/);
  assert.doesNotMatch(body, /fetchGeniUnionDetails/);
  assert.equal((body.match(/fetchGeniJsonp\(/g) || []).length, 1);
});

test('immediate-family merge does not make a second optional event request', () => {
  const body = functionBody(
    'async function loadGeniImmediateFamily(profileId)',
    'async function fetchGeniReignEvents'
  );
  assert.doesNotMatch(body, /fetchGeniReignEvents\(/);
});

test('JSONP transport classifies Geni rate-limit responses', () => {
  const body = functionBody('function fetchGeniJsonp(path, params = {})', 'function geniUnionPayloadRecords');
  assert.match(body, /GENI_RATE_LIMIT/);
  assert.match(body, /rate\.\?limit/);
});
""", encoding='utf-8')
