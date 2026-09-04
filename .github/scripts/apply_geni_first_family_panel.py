from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new)


# ---------------------------------------------------------------------------
# index.html
# ---------------------------------------------------------------------------
index_path = Path("index.html")
index = index_path.read_text(encoding="utf-8")

old_family = '''            <div class="relationship-section">
              <div class="relationship-heading">
                <span class="eyebrow">Family</span>
                <small>All known relatives · eye controls the timeline.</small>
              </div>
              <div class="relationship-households" id="relationship-households"></div>
              <button class="button secondary grow relationship-add-button" id="add-relative" type="button">Add a relative</button>
            </div>'''
new_family = '''            <div class="relationship-section">
              <div class="relationship-heading">
                <span class="eyebrow">Family</span>
                <small>Immediate family for this profile</small>
              </div>

              <div class="geni-family-card" id="geni-family-card">
                <div class="geni-family-card-heading">
                  <span class="geni-family-mark" aria-hidden="true">G</span>
                  <span class="geni-family-card-copy">
                    <strong id="geni-family-heading">Add immediate family from Geni</strong>
                    <small id="geni-family-status">Parents, siblings, spouses, and children are merged without replacing local edits.</small>
                  </span>
                  <span class="geni-family-badge" id="geni-family-badge">Not checked</span>
                </div>
                <button class="button primary grow geni-family-primary" id="geni-family-primary" type="button">Load immediate family from Geni</button>
                <div class="geni-family-link" id="geni-family-link" hidden>
                  <label for="geni-family-link-input">Geni profile URL or public ID</label>
                  <input id="geni-family-link-input" autocomplete="off" placeholder="https://www.geni.com/people/… or g600000…">
                  <button class="button primary grow" id="geni-family-link-button" type="button">Link &amp; load immediate family</button>
                </div>
              </div>

              <div class="known-family-heading">
                <strong>Known in this tree</strong>
                <small id="known-family-count">0 relatives</small>
              </div>
              <div class="relationship-households" id="relationship-households"></div>

              <details class="family-alternatives" id="family-alternatives">
                <summary>Other ways to add family</summary>
                <div class="family-alternative-actions">
                  <button class="button secondary grow" id="add-relative" type="button">Add one person manually</button>
                  <button class="button secondary grow" id="prepare-ai-person-import" type="button">Research with AI</button>
                </div>
                <p id="ai-family-status">AI research can add relatives not available through Geni.</p>
              </details>
            </div>'''
index = replace_once(index, old_family, new_family, "family panel")

old_ai = '''            <div class="ai-family-actions">
              <span class="eyebrow">Extend this branch</span>
              <p id="ai-family-status">Prepare an AI research prompt anchored to this profile, then stitch the returned JSON into the current tree.</p>
              <button class="button secondary grow" id="prepare-ai-person-import" type="button">Prepare prompt for this profile</button>
            </div>

'''
index = replace_once(index, old_ai, "", "old AI family card")
index = replace_once(index, "./styles.css?v=70", "./styles.css?v=71", "styles cache key")
index = replace_once(index, "./app.js?v=123", "./app.js?v=124", "app cache key")
index_path.write_text(index, encoding="utf-8")


# ---------------------------------------------------------------------------
# styles.css
# ---------------------------------------------------------------------------
styles_path = Path("styles.css")
styles = styles_path.read_text(encoding="utf-8")
anchor = '''.relationship-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.relationship-heading small { color: #777; font-size: 8px; text-align: right; }
.relationship-add-button { width: 100%; margin-top: 10px; }
'''
replacement = '''.relationship-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.relationship-heading small { color: #777; font-size: 8px; text-align: right; }
.geni-family-card { margin-top: 11px; padding: 12px; border: 1px solid #b9c0bf; border-radius: 9px; background: #f6f8f7; }
.geni-family-card.is-loading { border-color: #111; box-shadow: inset 0 0 0 1px #111; }
.geni-family-card-heading { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; align-items: start; gap: 9px; }
.geni-family-mark { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: #111; color: #fff; font: 700 13px Georgia, serif; }
.geni-family-card-copy { min-width: 0; display: grid; gap: 3px; }
.geni-family-card-copy strong { color: #111; font-size: 11px; font-weight: 700; line-height: 1.25; }
.geni-family-card-copy small { color: #626866; font-size: 8px; line-height: 1.45; }
.geni-family-badge { align-self: start; padding: 3px 6px; border: 1px solid #c4c9c7; border-radius: 999px; background: #fff; color: #5e6462; font-size: 7px; font-weight: 700; letter-spacing: .04em; line-height: 1; text-transform: uppercase; white-space: nowrap; }
.geni-family-card.is-verified .geni-family-badge { border-color: #111; color: #111; }
.geni-family-card.is-loading .geni-family-badge { border-color: #111; background: #111; color: #fff; }
.geni-family-primary { width: 100%; justify-content: center; margin-top: 11px; }
.geni-family-primary[hidden], .geni-family-link[hidden] { display: none; }
.geni-family-link { display: grid; gap: 7px; margin-top: 11px; }
.geni-family-link label { color: #555; font-size: 8px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.geni-family-link input { box-sizing: border-box; width: 100%; min-width: 0; margin: 0; padding: 8px 9px; border: 1px solid #999; border-radius: 7px; background: #fff; font-size: 10px; }
.geni-family-link .button { justify-content: center; }
.known-family-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: 14px; padding-top: 11px; border-top: 1px solid #ddd; }
.known-family-heading strong { color: #333; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.known-family-heading small { color: #777; font-size: 8px; }
.family-alternatives { margin-top: 12px; padding-top: 10px; border-top: 1px solid #ddd; }
.family-alternatives summary { color: #555; cursor: pointer; font-size: 9px; font-weight: 700; letter-spacing: .03em; list-style-position: outside; }
.family-alternatives summary:hover { color: #111; }
.family-alternatives[open] summary { margin-bottom: 9px; }
.family-alternative-actions { display: grid; gap: 6px; }
.family-alternative-actions .button { width: 100%; justify-content: flex-start; text-align: left; }
.family-alternatives p { margin: 7px 2px 0; color: #777; font-size: 8px; line-height: 1.45; }
'''
styles = replace_once(styles, anchor, replacement, "Geni-first family styles")
styles_path.write_text(styles, encoding="utf-8")


# ---------------------------------------------------------------------------
# app.js
# ---------------------------------------------------------------------------
app_path = Path("app.js")
app = app_path.read_text(encoding="utf-8")

old_ids = '''  'prepare-ai-person-import', 'ai-family-status',
  'relationship-households', 'add-relative',
'''
new_ids = '''  'prepare-ai-person-import', 'ai-family-status',
  'relationship-households', 'add-relative', 'geni-family-card', 'geni-family-heading', 'geni-family-status',
  'geni-family-badge', 'geni-family-primary', 'geni-family-link', 'geni-family-link-input', 'geni-family-link-button',
  'known-family-count', 'family-alternatives',
'''
app = replace_once(app, old_ids, new_ids, "family element IDs")

optional_link = '''function optionalGeniLink(input) {
  const sourceId = profileIdFromInput(input);
  return sourceId ? {
    sourceId,
    sourceUrl: `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
    sourceProvider: 'geni'
  } : null;
}
'''
optional_link_with_helper = optional_link + '''function geniProfileIdForPerson(person) {
  for (const candidate of [person?.id, person?.sourceId, person?.sourceUrl]) {
    const id = profileIdFromInput(candidate);
    if (id) return id;
  }
  return '';
}
'''
app = replace_once(app, optional_link, optional_link_with_helper, "Geni profile identity helper")

load_start = app.index("async function loadGeniImmediateFamily(")
load_end = app.index("\nasync function fetchGeniReignEvents", load_start)
new_load = r'''function normalizedGeniReference(value) {
  const raw = refId(value) || clean(value);
  return /^profile-/i.test(raw) ? canonicalGeniProfileId(raw) : raw;
}

function remapGeniImmediateFamily(mapped, focusAliases, localFocusId, remoteFocusId) {
  const aliases = new Set(focusAliases.map(normalizedGeniReference).filter(Boolean));
  const remapId = value => {
    const id = normalizedGeniReference(value);
    return aliases.has(id) ? localFocusId : id;
  };
  const remapMap = value => Object.fromEntries(
    Object.entries(value || {}).map(([id, detail]) => [remapId(id), detail])
  );
  const records = {};
  Object.entries(mapped || {}).forEach(([key, raw]) => {
    const originalId = normalizedGeniReference(key || raw?.id);
    const targetId = remapId(originalId);
    if (!targetId || !raw) return;
    const record = {
      ...raw,
      id: targetId,
      parents: unique(uniqueRefs(raw.parents).map(remapId)),
      children: unique(uniqueRefs(raw.children).map(remapId)),
      partners: unique(uniqueRefs(raw.partners).map(remapId)),
      spouses: unique(uniqueRefs(raw.spouses).map(remapId)),
      nonSpouses: unique(uniqueRefs(raw.nonSpouses).map(remapId)),
      divorcedSpouses: unique(uniqueRefs(raw.divorcedSpouses).map(remapId)),
      marriageYears: remapMap(raw.marriageYears),
      relationshipEndYears: remapMap(raw.relationshipEndYears),
      relationshipEndStatuses: remapMap(raw.relationshipEndStatuses),
      sourceId: aliases.has(originalId) ? remoteFocusId : originalId
    };
    const previous = records[targetId];
    if (previous) {
      ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses'].forEach(field => {
        record[field] = unique([...(previous[field] || []), ...(record[field] || [])]);
      });
      record.marriageYears = { ...(previous.marriageYears || {}), ...(record.marriageYears || {}) };
      record.relationshipEndYears = { ...(previous.relationshipEndYears || {}), ...(record.relationshipEndYears || {}) };
      record.relationshipEndStatuses = { ...(previous.relationshipEndStatuses || {}), ...(record.relationshipEndStatuses || {}) };
    }
    records[targetId] = record;
  });
  return { records, remapId };
}

async function loadGeniImmediateFamily(profileId) {
  const person = state.people[profileId];
  const requestedFocusId = geniProfileIdForPerson(person);
  if (!person || !requestedFocusId) {
    throw new Error('Link this local profile to a public Geni profile first.');
  }
  if (!state.geniAccessToken) {
    beginGeniAuthorization(`family-import:immediate:${profileId}`);
    return;
  }
  const existingFamilyIds = new Set([...person.parents, ...person.children, ...allPartnerIds(person)]);
  const importedAt = new Date().toISOString();
  const { mapped, focusRaw } = await fetchGeniNeighborhood(requestedFocusId);
  const remoteFocusId = geniProfileIdForPerson(focusRaw) || requestedFocusId;
  const { records, remapId } = remapGeniImmediateFamily(mapped, [
    requestedFocusId,
    remoteFocusId,
    focusRaw?.id,
    focusRaw?.profile_url
  ], profileId, remoteFocusId);
  if (!records[profileId]) {
    records[profileId] = {
      ...focusRaw,
      id: profileId,
      sourceId: remoteFocusId,
      parents: uniqueRefs(focusRaw?.parents).map(remapId),
      children: uniqueRefs(focusRaw?.children).map(remapId),
      partners: uniqueRefs(focusRaw?.partners).map(remapId),
      spouses: uniqueRefs(focusRaw?.spouses).map(remapId),
      nonSpouses: uniqueRefs(focusRaw?.nonSpouses).map(remapId),
      divorcedSpouses: uniqueRefs(focusRaw?.divorcedSpouses).map(remapId)
    };
  }

  const existingIds = new Set(Object.keys(state.people));
  const existingDateState = new Map(Object.keys(records).filter(id => existingIds.has(id)).map(id => [id, {
    birth: numericYear(state.people[id]?.birthYear),
    death: numericYear(state.people[id]?.deathYear)
  }]));
  Object.entries(records).forEach(([id, raw]) => {
    if (raw.public === false) return;
    const sourceId = clean(raw.sourceId) || (id === profileId ? remoteFocusId : id);
    const incoming = normalizePerson({
      ...raw,
      id,
      sourceId,
      sourceUrl: validGeniUrl(raw.profile_url) || `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
      sourceProvider: 'geni',
      importedAt
    }, id);
    state.people[id] = mergePersonRecords(state.people[id], incoming);
  });
  const receivedIds = Object.keys(records).filter(id => state.people[id]);
  const newIds = receivedIds.filter(id => !existingIds.has(id));
  const completedExistingProfiles = [...existingDateState].filter(([id, before]) => (
    (before.birth == null && numericYear(state.people[id]?.birthYear) != null)
    || (before.death == null && numericYear(state.people[id]?.deathYear) != null)
  )).length;
  if (!state.people[profileId]) throw new Error('Geni did not return the selected public profile.');
  const refreshedFamilyIds = new Set([
    ...state.people[profileId].parents,
    ...state.people[profileId].children,
    ...allPartnerIds(state.people[profileId])
  ]);
  const restoredRelations = [...refreshedFamilyIds].filter(id => !existingFamilyIds.has(id)).length;
  state.people[profileId].geniImmediateFamilyLoaded = true;
  state.people[profileId].geniImmediateFamilyVerifiedAt = importedAt;
  state.people[profileId].geniImmediateFamilyIds = unique([
    ...state.people[profileId].geniImmediateFamilyIds,
    ...receivedIds.filter(id => id !== profileId)
  ]);
  if (state.geniImport?.profileId === profileId) {
    state.geniImport.loaded = Object.keys(records).length;
    state.geniImport.requests = 1;
  }
  try {
    const remoteProfileIds = unique(Object.values(records).map(raw => clean(raw.sourceId)).filter(id => /^profile-/i.test(id)));
    const eventsByProfile = await fetchGeniReignEvents(remoteProfileIds);
    Object.entries(eventsByProfile).forEach(([remoteId, events]) => {
      const id = remapId(remoteId);
      if (state.people[id] && events.length) {
        state.people[id].personalEvents = normalizePersonalEvents([...state.people[id].personalEvents, ...events]);
      }
    });
  } catch { /* Optional event enrichment must not block family import. */ }
  persist('Immediate family imported from Geni');
  render();
  const countSummary = newIds.length
    ? `${newIds.length} new profile${newIds.length === 1 ? '' : 's'} added`
    : restoredRelations
      ? `no new profiles, but ${restoredRelations} missing family link${restoredRelations === 1 ? '' : 's'} restored`
      : 'no new public profiles or family links';
  const undatedCount = receivedIds.filter(id => numericYear(state.people[id]?.birthYear) == null).length;
  const dateSummary = undatedCount
    ? `${undatedCount} still ${undatedCount === 1 ? 'has' : 'have'} no public birth year.`
    : 'All returned profiles now have birth years.';
  const updateSummary = completedExistingProfiles
    ? ` ${completedExistingProfiles} existing profile${completedExistingProfiles === 1 ? '' : 's'} received missing date data.`
    : '';
  const refreshedScope = activeDescendantScope();
  const outsideCount = receivedIds.filter(id => id !== profileId && !refreshedScope.allowedIds.has(id)).length;
  const outsideSummary = outsideCount
    ? ` ${outsideCount} returned profile${outsideCount === 1 ? ' is' : 's are'} saved outside the current descendant view.`
    : '';
  toast(`Geni checked ${receivedIds.length} union-linked family profiles; ${countSummary}.${updateSummary} ${dateSummary}${outsideSummary}`, true);
}
'''
app = app[:load_start] + new_load + app[load_end:]

app = replace_once(
    app,
    '''  const config = GENI_FAMILY_IMPORT_SCOPES[scope];
  const person = state.people[profileId];
  if (!config || !person || !/^profile-/i.test(profileId)) {
    throw new Error('This local profile is not linked to a Geni profile ID.');
  }''',
    '''  const config = GENI_FAMILY_IMPORT_SCOPES[scope];
  const person = state.people[profileId];
  const geniId = geniProfileIdForPerson(person);
  if (!config || !person || !geniId) {
    throw new Error('Link this local profile to a public Geni profile first.');
  }''',
    "Geni family import validation"
)
app = replace_once(
    app,
    '''    if (scope === 'immediate') await loadGeniImmediateFamily(profileId);
    else await importFromGeni(profileId, config.depth, { mode: 'descendants', allDescendants: config.allDescendants === true });''',
    '''    if (scope === 'immediate') await loadGeniImmediateFamily(profileId);
    else await importFromGeni(geniId, config.depth, { mode: 'descendants', allDescendants: config.allDescendants === true });''',
    "Geni descendant import identity"
)
app = replace_once(
    app,
    "  const match = intent.match(/^family-import:(immediate|descendants-2|descendants-all):(profile-.+)$/i);",
    "  const match = intent.match(/^family-import:(immediate|descendants-2|descendants-all):(.+)$/i);",
    "Geni OAuth intent parser"
)

render_details_marker = "function renderDetails() {"
render_details_index = app.index(render_details_marker)
render_geni_actions = r'''function formatGeniFamilyCheckedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'previously';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function renderGeniFamilyActions(person, scope) {
  const geniId = geniProfileIdForPerson(person);
  const linked = Boolean(geniId);
  const verifiedAt = clean(person.geniImmediateFamilyVerifiedAt);
  const activeImport = state.geniImport;
  const importingThisProfile = activeImport?.profileId === person.id && activeImport?.scope === 'immediate';
  const anotherImportRunning = Boolean(activeImport) && !importingThisProfile;
  const previousPersonId = els['geni-family-card'].dataset.personId;
  if (previousPersonId !== person.id) {
    els['family-alternatives'].open = false;
    els['geni-family-link-input'].value = '';
  }
  els['geni-family-card'].dataset.personId = person.id;
  els['family-alternatives'].dataset.personId = person.id;
  els['geni-family-card'].classList.toggle('is-loading', importingThisProfile);
  els['geni-family-card'].classList.toggle('is-verified', Boolean(verifiedAt));
  els['geni-family-card'].setAttribute('aria-busy', String(importingThisProfile));

  const returnedIds = unique(person.geniImmediateFamilyIds).filter(id => state.people[id]);
  const outsideCount = returnedIds.filter(id => !scope.allowedIds.has(id)).length;
  const outsideNote = outsideCount
    ? ` ${outsideCount} returned relative${outsideCount === 1 ? ' is' : 's are'} saved outside this descendant view.`
    : '';
  if (importingThisProfile) {
    els['geni-family-heading'].textContent = 'Reading immediate family from Geni';
    els['geni-family-status'].textContent = activeImport.loaded
      ? `${activeImport.loaded} profiles received. Merging family links and dates…`
      : 'Reading family unions, profiles, and dates…';
    els['geni-family-badge'].textContent = 'Loading';
  } else if (linked && verifiedAt) {
    els['geni-family-heading'].textContent = 'Keep immediate family current';
    els['geni-family-status'].textContent = `Last checked ${formatGeniFamilyCheckedAt(verifiedAt)}. Refresh to merge changes without replacing local edits.${outsideNote}`;
    els['geni-family-badge'].textContent = 'Checked';
  } else if (linked) {
    els['geni-family-heading'].textContent = 'Add immediate family from Geni';
    els['geni-family-status'].textContent = `Import parents, siblings, spouses, and children. Relatives outside this descendant tree remain saved but hidden.`;
    els['geni-family-badge'].textContent = 'Ready';
  } else {
    els['geni-family-heading'].textContent = 'Connect this profile to Geni';
    els['geni-family-status'].textContent = 'Paste a public Geni profile URL or ID, then load its immediate family into this local tree.';
    els['geni-family-badge'].textContent = 'Not linked';
  }

  els['geni-family-primary'].hidden = !linked;
  els['geni-family-link'].hidden = linked;
  els['geni-family-primary'].disabled = importingThisProfile || anotherImportRunning;
  els['geni-family-primary'].textContent = importingThisProfile
    ? 'Loading immediate family…'
    : verifiedAt
      ? (state.geniAccessToken ? 'Refresh immediate family from Geni' : 'Authorize Geni & refresh family')
      : (state.geniAccessToken ? 'Load immediate family from Geni' : 'Authorize Geni & load family');
  els['geni-family-link-input'].disabled = Boolean(activeImport);
  els['geni-family-link-button'].disabled = Boolean(activeImport);
  els['geni-family-link-button'].textContent = state.geniAccessToken
    ? 'Link & load immediate family'
    : 'Link, authorize & load family';

  const knownIds = unique([
    ...scopedParentIds(person.id, scope),
    ...scopedSpouseIds(person, scope),
    ...scopedChildIds(person.id, scope)
  ]);
  els['known-family-count'].textContent = `${knownIds.length} relative${knownIds.length === 1 ? '' : 's'}`;

  const manualNeedsGeniCheck = linked && !verifiedAt;
  els['add-relative'].disabled = importingThisProfile || anotherImportRunning || manualNeedsGeniCheck;
  els['add-relative'].title = manualNeedsGeniCheck
    ? 'Load this profile’s immediate family from Geni first to avoid duplicate relatives.'
    : '';
  els['prepare-ai-person-import'].disabled = Boolean(activeImport);
  els['ai-family-status'].textContent = manualNeedsGeniCheck
    ? 'Geni is the primary source for this linked profile. Manual additions become available after the first family check; AI research remains available for records Geni does not contain.'
    : `Manual and AI additions remain available for relatives or evidence not present on Geni. AI will preserve “${fullName(person)}” as anchor ID ${person.id}.`;
}

'''
app = app[:render_details_index] + render_geni_actions + app[render_details_index:]

old_render_tail = '''  renderRelationshipHouseholds(person);
  renderNamePeriods(person);
  renderPersonalEvents(person);
  els['add-relative'].disabled = false;
  els['add-relative'].removeAttribute('title');
  els['ai-family-status'].textContent = `The generated prompt will preserve “${fullName(person)}” as anchor ID ${person.id}.`;
}'''
new_render_tail = '''  renderRelationshipHouseholds(person);
  renderGeniFamilyActions(person, scope);
  renderNamePeriods(person);
  renderPersonalEvents(person);
}'''
app = replace_once(app, old_render_tail, new_render_tail, "detail family actions")

listener_anchor = "els['add-relative'].addEventListener('click', () => openAddPersonDialog(state.selectedId));"
new_listeners = r'''async function loadSelectedImmediateFamilyFromGeni() {
  const profileId = state.selectedId;
  if (!profileId || !state.people[profileId]) return;
  try {
    await runGeniFamilyImport(profileId, 'immediate');
  } catch (error) {
    toast(error?.message || 'Could not load immediate family from Geni.', true);
  }
}

async function linkSelectedProfileAndLoadFromGeni() {
  const person = state.people[state.selectedId];
  if (!person) return;
  const link = optionalGeniLink(els['geni-family-link-input'].value);
  if (!link) {
    toast('Enter a public Geni profile URL or ID such as g600000…', true);
    els['geni-family-link-input'].focus();
    return;
  }
  Object.assign(person, link);
  persist('Geni profile linked');
  render();
  await loadSelectedImmediateFamilyFromGeni();
}

els['geni-family-primary'].addEventListener('click', loadSelectedImmediateFamilyFromGeni);
els['geni-family-link-button'].addEventListener('click', linkSelectedProfileAndLoadFromGeni);
els['geni-family-link-input'].addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  linkSelectedProfileAndLoadFromGeni();
});
''' + listener_anchor
app = replace_once(app, listener_anchor, new_listeners, "Geni family action listeners")

app = replace_once(
    app,
    "  if (/^profile-/i.test(parent?.id) && !parent.geniImmediateFamilyVerifiedAt) {",
    "  if (geniProfileIdForPerson(parent) && !parent.geniImmediateFamilyVerifiedAt) {",
    "manual-family Geni verification guard"
)

# The primary action must be present exactly once and the old standalone cards
# must be gone before the workflow runs browser tests.
for required in [
    "geni-family-primary",
    "linkSelectedProfileAndLoadFromGeni",
    "renderGeniFamilyActions",
    "geniProfileIdForPerson"
]:
    if required not in app:
        raise SystemExit(f"missing generated app feature: {required}")
for obsolete in ["relationship-add-button", "ai-family-actions"]:
    if obsolete in index:
        raise SystemExit(f"obsolete selected-profile UI remains: {obsolete}")

app_path.write_text(app, encoding="utf-8")
