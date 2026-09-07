from pathlib import Path

path = Path('tests/descendant-scope.test.mjs')
text = path.read_text()
old = "assert.deepEqual([...newScope.childrenByParent.get('new-father')], ['new-focus']);"
new = "assert.deepEqual([...newScope.childrenByParent.get('new-father')].sort(), ['new-focus', 'new-focus-sibling']);"
if text.count(old) != 1:
    raise SystemExit(f'Expected one old assertion, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
