from pathlib import Path

path = Path('app.js')
app = path.read_text(encoding='utf-8')

old = '''function oauthCallbackParams() {
  const query = new URLSearchParams(location.search);
  const rawHash = location.hash.replace(/^#/, '').replace(/^\\/?\\?/, '');
  const hash = new URLSearchParams(rawHash);
  return {
    accessToken: clean(hash.get('access_token') || query.get('access_token')),
    status: clean(hash.get('status') || query.get('status')),
    message: clean(hash.get('message') || query.get('message'))
  };
}

const state = {'''
new = '''function oauthCallbackParams() {
  const query = new URLSearchParams(location.search);
  const rawHash = location.hash.replace(/^#/, '').replace(/^\\/?\\?/, '');
  const hash = new URLSearchParams(rawHash);
  return {
    accessToken: clean(hash.get('access_token') || query.get('access_token')),
    status: clean(hash.get('status') || query.get('status')),
    message: clean(hash.get('message') || query.get('message'))
  };
}

const initialGeniOauth = oauthCallbackParams();
if (initialGeniOauth.accessToken) sessionValue(GENI_TOKEN_SESSION_KEY, initialGeniOauth.accessToken);

const state = {'''
if app.count(old) != 1:
    raise SystemExit(f'OAuth initialization anchor: expected one match, found {app.count(old)}')
app = app.replace(old, new)

old = "  geniAccessToken: '',"
new = "  geniAccessToken: initialGeniOauth.accessToken || sessionValue(GENI_TOKEN_SESSION_KEY),"
if app.count(old) != 1:
    raise SystemExit(f'Geni token state: expected one match, found {app.count(old)}')
app = app.replace(old, new)

old = '''els['tree-filter'].value = state.treeFilter;
render();
if (britishRoyalStarterLoadError) {'''
new = '''els['tree-filter'].value = state.treeFilter;
render();

// Resume an immediate-family action after Geni redirects back. The separate
// descendant-import module also records OAuth tokens in sessionStorage; this
// module reads the same token so both Geni entry points stay authorized.
const pendingFamilyIntent = geniFamilyImportIntent(sessionValue(GENI_IMPORT_INTENT_KEY));
if (pendingFamilyIntent) {
  sessionValue(GENI_IMPORT_INTENT_KEY, null);
  sessionValue(GENI_OAUTH_PENDING_KEY, null);
  if (initialGeniOauth.accessToken || initialGeniOauth.status || initialGeniOauth.message || location.hash) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }
  if (state.geniAccessToken && state.people[pendingFamilyIntent.profileId]) {
    state.selectedId = pendingFamilyIntent.profileId;
    render();
    requestAnimationFrame(() => runGeniFamilyImport(pendingFamilyIntent.profileId, pendingFamilyIntent.scope)
      .catch(error => toast(error?.message || 'Could not load immediate family from Geni.', true)));
  } else if (initialGeniOauth.status === 'unauthorized') {
    toast(initialGeniOauth.message || 'Geni authorization was not granted.', true);
  }
}

if (britishRoyalStarterLoadError) {'''
if app.count(old) != 1:
    raise SystemExit(f'OAuth resume anchor: expected one match, found {app.count(old)}')
app = app.replace(old, new)

path.write_text(app, encoding='utf-8')
