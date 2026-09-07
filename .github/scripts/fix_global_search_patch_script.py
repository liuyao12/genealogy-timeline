from pathlib import Path

path = Path('.github/scripts/implement_global_search_focus.py')
text = path.read_text()

old_signature_patch = '''app = app.replace(
    "async function focusTreeOn(personId) {",
    "async function focusTreeOn(personId, { clearSearch = false, centerIfHidden = false } = {}) {",
    1,
)'''
new_signature_patch = '''app = app.replace(
    "async function focusTreeOn(personId) {",
    "async function focusTreeOn(personId) {\\n  const { clearSearch = false, centerIfHidden = false } = arguments[1] || {};",
    1,
)'''
if text.count(old_signature_patch) != 1:
    raise SystemExit(f'Expected one focus signature patch, found {text.count(old_signature_patch)}')
text = text.replace(old_signature_patch, new_signature_patch, 1)

old_test = r'''  assert.match(app, /async function focusTreeOn\(personId, \{ clearSearch = false, centerIfHidden = false \} = \{\}\)/);'''
new_test = r'''  assert.match(app, /async function focusTreeOn\(personId\) \{\s*const \{ clearSearch = false, centerIfHidden = false \} = arguments\[1\] \|\| \{\};/);'''
if text.count(old_test) != 1:
    raise SystemExit(f'Expected one focus signature test, found {text.count(old_test)}')
text = text.replace(old_test, new_test, 1)

old_substitution = 'app, count = pattern.subn(replacement, app, count=1)'
new_substitution = 'app, count = pattern.subn(lambda _: replacement, app, count=1)'
if text.count(old_substitution) != 1:
    raise SystemExit(f'Expected one regex substitution call, found {text.count(old_substitution)}')
text = text.replace(old_substitution, new_substitution, 1)

path.write_text(text)
