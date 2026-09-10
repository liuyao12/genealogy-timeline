from pathlib import Path

for path in [
    Path('tests/monarch-events.test.mjs'),
    Path('tests/royal-title-place-style.test.mjs'),
]:
    text = path.read_text(encoding='utf-8')
    old = r'/\.\/app\.js\?v=150/'
    new = r'/\.\/app\.js\?v=151/'
    if text.count(old) != 1:
        raise SystemExit(f'{path}: expected one v150 cache assertion, found {text.count(old)}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

print('Remaining cache assertions updated.')
