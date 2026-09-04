from pathlib import Path

path = Path('app.js')
app = path.read_text(encoding='utf-8')
old = '''    const incoming = normalizePerson({
      ...raw,
      id,
      sourceId,
      sourceUrl: validGeniUrl(raw.profile_url) || `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
      sourceProvider: 'geni',
      importedAt
    }, id);
    state.people[id] = mergePersonRecords(state.people[id], incoming);'''
new = '''    const existing = state.people[id];
    const incoming = normalizePerson({
      ...raw,
      id,
      sourceId,
      sourceUrl: validGeniUrl(raw.profile_url) || `https://www.geni.com/profile/index/${geniProfileUrlId(sourceId)}`,
      sourceProvider: 'geni',
      importedAt
    }, id);
    // Linking a manually named local profile must not let the remote display
    // name replace the name the user already sees. Other missing Geni facts
    // still merge normally, and canonical Geni profiles keep Geni's name.
    if (id === profileId && existing && id !== sourceId) {
      incoming.displayName = clean(existing.displayName) || fullName(existing);
    }
    state.people[id] = mergePersonRecords(existing, incoming);'''
if app.count(old) != 1:
    raise SystemExit(f'local anchor name merge: expected one match, found {app.count(old)}')
path.write_text(app.replace(old, new), encoding='utf-8')
