from pathlib import Path

scope_path = Path('tests/descendant-scope.test.mjs')
text = scope_path.read_text()

old = """test('repairs sparse parent-child links in both directions for one connected layout', () => {
  const people = {
    root: { id: 'root', children: [], parents: [], spouses: [] },
    child: { id: 'child', children: ['grandchild'], parents: ['root'], spouses: [] },
    grandchild: { id: 'grandchild', children: [], parents: [], spouses: [] }
  };
  const scope = computeDescendantScope(people, 'root');
  assert.deepEqual([...scope.descendantIds], ['root', 'child', 'grandchild']);
  assert.deepEqual([...scope.childrenByParent.get('root')], ['child']);
  assert.deepEqual([...scope.parentsByChild.get('child')], ['root']);
  assert.deepEqual([...scope.childrenByParent.get('child')], ['grandchild']);
  assert.deepEqual([...scope.parentsByChild.get('grandchild')], ['child']);
});
"""
new = """test('repairs sparse parent-child links in both directions for one connected layout', () => {
  const people = {
    root: { id: 'root', children: [], parents: [], spouses: ['root-spouse'] },
    'root-spouse': { id: 'root-spouse', children: [], parents: [], spouses: ['root'] },
    child: { id: 'child', children: ['grandchild'], parents: ['root', 'root-spouse'], spouses: [] },
    'grandchild-other-parent': { id: 'grandchild-other-parent', children: ['grandchild'], parents: [], spouses: [] },
    grandchild: { id: 'grandchild', children: [], parents: [], spouses: [] }
  };
  const scope = computeDescendantScope(people, 'root');
  assert.deepEqual([...scope.descendantIds], ['root', 'child', 'grandchild']);
  assert.deepEqual([...scope.childrenByParent.get('root')], ['child']);
  assert.deepEqual([...scope.parentsByChild.get('child')].sort(), ['root', 'root-spouse']);
  assert.deepEqual([...scope.childrenByParent.get('child')], ['grandchild']);
  assert.deepEqual([...scope.parentsByChild.get('grandchild')], ['child']);
  assert.deepEqual([...scope.allParentsByChild.get('grandchild')].sort(), ['child', 'grandchild-other-parent']);
});
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one sparse-link fixture, found {text.count(old)}')
text = text.replace(old, new, 1)

old = """    child: { id: 'child', parents: ['focus', 'focus-spouse'], children: ['grandchild'], spouses: [] },
    grandchild: { id: 'grandchild', parents: ['child'], children: [], spouses: [] }
"""
new = """    child: { id: 'child', parents: ['focus', 'focus-spouse'], children: ['grandchild'], spouses: [] },
    'grandchild-other-parent': { id: 'grandchild-other-parent', parents: [], children: ['grandchild'], spouses: [] },
    grandchild: { id: 'grandchild', parents: ['child', 'grandchild-other-parent'], children: [], spouses: [] }
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one paternal-household grandchild fixture, found {text.count(old)}')
text = text.replace(old, new, 1)

old = """    'new-grandfather': { id: 'new-grandfather', gender: 'male', parents: [], children: ['new-father'], spouses: [] },
    'new-father': { id: 'new-father', gender: 'male', parents: ['new-grandfather'], children: ['new-focus', 'new-focus-sibling'], spouses: [] },
    'new-focus-sibling': { id: 'new-focus-sibling', parents: ['new-father'], children: [], spouses: [] },
    'new-focus': { id: 'new-focus', gender: 'female', parents: ['new-father'], children: ['shared-child'], spouses: ['old-root'] },
    'shared-child': { id: 'shared-child', parents: ['old-root', 'new-focus'], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild': { id: 'shared-grandchild', parents: ['shared-child'], children: [], spouses: [] }
"""
new = """    'new-grandfather': { id: 'new-grandfather', gender: 'male', parents: [], children: ['new-father'], spouses: [] },
    'new-father': { id: 'new-father', gender: 'male', parents: ['new-grandfather'], children: ['new-focus', 'new-focus-sibling'], spouses: ['new-mother'] },
    'new-mother': { id: 'new-mother', gender: 'female', parents: [], children: ['new-focus', 'new-focus-sibling'], spouses: ['new-father'] },
    'new-focus-sibling': { id: 'new-focus-sibling', parents: ['new-father', 'new-mother'], children: [], spouses: [] },
    'new-focus': { id: 'new-focus', gender: 'female', parents: ['new-father', 'new-mother'], children: ['shared-child'], spouses: ['old-root'] },
    'shared-child': { id: 'shared-child', parents: ['old-root', 'new-focus'], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild-other-parent': { id: 'shared-grandchild-other-parent', parents: [], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild': { id: 'shared-grandchild', parents: ['shared-child', 'shared-grandchild-other-parent'], children: [], spouses: [] }
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one spouse-refocus fixture, found {text.count(old)}')
text = text.replace(old, new, 1)
scope_path.write_text(text)

identity_path = Path('tests/geni-identity.test.mjs')
identity = identity_path.read_text()
old = """    ids: ['local', 'profile-g6000000000000000042']
"""
new = """    ids: ['local', 'canonical']
"""
if identity.count(old) != 1:
    raise SystemExit(f'Expected one duplicate-ID expectation, found {identity.count(old)}')
identity_path.write_text(identity.replace(old, new, 1))
