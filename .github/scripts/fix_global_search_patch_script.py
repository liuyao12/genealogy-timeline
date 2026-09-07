from pathlib import Path

path = Path('.github/scripts/implement_global_search_focus.py')
text = path.read_text()
old = 'app, count = pattern.subn(replacement, app, count=1)'
new = 'app, count = pattern.subn(lambda _: replacement, app, count=1)'
if text.count(old) != 1:
    raise SystemExit(f'Expected one regex substitution call, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
