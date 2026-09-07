from pathlib import Path

path = Path('tests/descendant-scope.test.mjs')
text = path.read_text()


def replace_once(old, new):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one fixture match, found {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)


replace_once(
    """  const people = {
    root: { id: 'root', children: [], parents: [], spouses: [] },
    child: { id: 'child', children: ['grandchild'], parents: ['root'], spouses: [] },
    grandchild: { id: 'grandchild', children: [], parents: [], spouses: [] }
  };
""",
    """  const people = {
    root: { id: 'root', children: [], parents: [], spouses: [] },
    'child-other-parent': { id: 'child-other-parent', displayName: 'Other parent of child', children: ['child'], parents: [], spouses: [] },
    child: { id: 'child', children: ['grandchild'], parents: ['root', 'child-other-parent'], spouses: [] },
    'grandchild-other-parent': { id: 'grandchild-other-parent', displayName: 'Other parent of grandchild', children: ['grandchild'], parents: [], spouses: [] },
    grandchild: { id: 'grandchild', children: [], parents: ['child', 'grandchild-other-parent'], spouses: [] }
  };
"""
)
replace_once(
    """  assert.deepEqual([...scope.parentsByChild.get('child')], ['root']);
  assert.deepEqual([...scope.childrenByParent.get('child')], ['grandchild']);
  assert.deepEqual([...scope.parentsByChild.get('grandchild')], ['child']);
""",
    """  assert.deepEqual([...scope.parentsByChild.get('child')].sort(), ['child-other-parent', 'root']);
  assert.deepEqual([...scope.childrenByParent.get('child')], ['grandchild']);
  assert.deepEqual([...scope.parentsByChild.get('grandchild')].sort(), ['child', 'grandchild-other-parent']);
"""
)

replace_once(
    """    child: { id: 'child', parents: ['focus', 'focus-spouse'], children: ['grandchild'], spouses: [] },
    grandchild: { id: 'grandchild', parents: ['child'], children: [], spouses: [] }
""",
    """    child: { id: 'child', parents: ['focus', 'focus-spouse'], children: ['grandchild'], spouses: [] },
    'grandchild-other-parent': { id: 'grandchild-other-parent', displayName: 'Other parent of grandchild', parents: [], children: ['grandchild'], spouses: [] },
    grandchild: { id: 'grandchild', parents: ['child', 'grandchild-other-parent'], children: [], spouses: [] }
"""
)

replace_once(
    """    'new-father': { id: 'new-father', gender: 'male', parents: ['new-grandfather'], children: ['new-focus', 'new-focus-sibling'], spouses: [] },
    'new-focus-sibling': { id: 'new-focus-sibling', parents: ['new-father'], children: [], spouses: [] },
    'new-focus': { id: 'new-focus', gender: 'female', parents: ['new-father'], children: ['shared-child'], spouses: ['old-root'] },
    'shared-child': { id: 'shared-child', parents: ['old-root', 'new-focus'], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild': { id: 'shared-grandchild', parents: ['shared-child'], children: [], spouses: [] }
""",
    """    'new-father': { id: 'new-father', gender: 'male', parents: ['new-grandfather'], children: ['new-focus', 'new-focus-sibling'], spouses: [] },
    'new-mother': { id: 'new-mother', displayName: 'New mother', parents: [], children: ['new-focus', 'new-focus-sibling'], spouses: [] },
    'new-focus-sibling': { id: 'new-focus-sibling', parents: ['new-father', 'new-mother'], children: [], spouses: [] },
    'new-focus': { id: 'new-focus', gender: 'female', parents: ['new-father', 'new-mother'], children: ['shared-child'], spouses: ['old-root'] },
    'shared-child': { id: 'shared-child', parents: ['old-root', 'new-focus'], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild-other-parent': { id: 'shared-grandchild-other-parent', displayName: 'Other parent of shared grandchild', parents: [], children: ['shared-grandchild'], spouses: [] },
    'shared-grandchild': { id: 'shared-grandchild', parents: ['shared-child', 'shared-grandchild-other-parent'], children: [], spouses: [] }
"""
)

path.write_text(text)
