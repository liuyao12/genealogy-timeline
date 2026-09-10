from pathlib import Path
import re

ROOT = Path('.')


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one occurrence, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


# Make the Mark-column control itself the circle: filled means shown, hollow
# means hidden. The accessible name and tooltip carry the textual action.
replace_once(
    ROOT / 'app.js',
    """  toggle.className = 'person-event-branch-visibility';
  toggle.textContent = shown ? '◉' : '○';
  toggle.disabled = !canToggle;
  toggle.setAttribute('aria-pressed', String(shown));
""",
    """  toggle.className = 'person-event-branch-visibility';
  toggle.textContent = '';
  toggle.disabled = !canToggle;
  toggle.setAttribute('aria-pressed', String(shown));
  toggle.dataset.branchState = shown ? 'shown' : 'hidden';
""",
    'true circular branch control',
)

replace_once(
    ROOT / 'styles.css',
    """.person-event-branch-visibility { justify-self: center; width: 27px; height: 25px; display: grid; place-items: center; padding: 0; border: 1px solid #aaa; border-radius: 6px; background: #fff; color: #111; cursor: pointer; font-size: 12px; }
.person-event-branch-visibility:hover { border-color: #000; background: #eee; }
.person-event-branch-visibility:disabled { border-color: #ccc; background: #f4f4f4; color: #aaa; cursor: not-allowed; }
.person-event-row.is-hidden .person-event-branch-visibility { color: #777; }
""",
    """.person-event-branch-visibility { justify-self: center; width: 15px; height: 15px; padding: 0; border: 1.5px solid #222; border-radius: 50%; background: #222; cursor: pointer; }
.person-event-branch-visibility:hover { box-shadow: 0 0 0 3px #e8e8e8; }
.person-event-branch-visibility[aria-pressed=\"false\"] { background: #fff; }
.person-event-branch-visibility:disabled { border-color: #aaa; background: #ddd; cursor: not-allowed; box-shadow: none; }
.person-event-row.is-hidden .person-event-copy { opacity: .62; }
""",
    'filled and hollow branch-circle CSS',
)

# The spouse list intentionally moved into the chronology; a marriage name now
# opens the spouse profile, whose header contains the sole tree-switch action.
focus_path = ROOT / 'tests/focus-tree-ui.test.mjs'
focus = focus_path.read_text(encoding='utf-8')
focus_pattern = re.compile(
    r"test\('spouse rows offer a one-click monochrome tree action', \(\) => \{.*?\n\}\);",
    re.S,
)
focus_replacement = """test('marriage rows open the spouse profile before its tree action is used', () => {
  assert.match(app, /name\.className = 'person-event-relative'/);
  assert.match(app, /selectPerson\(relative\.id, \{ center: true \}\)/);
  assert.match(app, /selectPerson\(relative\.id, \{ allowOutsideScope: true \}\)/);
  assert.doesNotMatch(app, /className = 'relationship-focus tree-action-button'/);
});"""
focus, count = focus_pattern.subn(focus_replacement, focus, count=1)
if count != 1:
    raise SystemExit(f'obsolete spouse-row tree-action test: expected one block, found {count}')
focus_path.write_text(focus, encoding='utf-8')

# These source-shape tests are intentionally cache-key-sensitive.
for path in [ROOT / 'tests/monarch-events.test.mjs', ROOT / 'tests/royal-title-place-style.test.mjs']:
    replace_once(path, "/\\.\\/app\\.js\\?v=149/", "/\\.\\/app\\.js\\?v=150/", f'{path.name} cache key')

# Align the static chronology test with a semantic filled/hollow button rather
# than Unicode glyphs.
life_test_path = ROOT / 'tests/side-panel-life-events.test.mjs'
life_test = life_test_path.read_text(encoding='utf-8')
replace = {
    "assert.match(app, /toggle\\.textContent = shown \\? '◉' : '○'/);": "assert.match(app, /toggle\\.setAttribute\\('aria-pressed', String\\(shown\\)\\)/);",
    "assert.match(css, /\\.person-event-branch-visibility \\{/);": "assert.match(css, /\\.person-event-branch-visibility \\{[^}]*border-radius: 50%/s);\n  assert.match(css, /\\.person-event-branch-visibility\\[aria-pressed=\\\"false\\\"\\] \\{ background: #fff; \\}/);",
}
for old, new in replace.items():
    if life_test.count(old) != 1:
        raise SystemExit(f'side-panel life-event expectation {old!r}: expected one occurrence, found {life_test.count(old)}')
    life_test = life_test.replace(old, new, 1)
life_test_path.write_text(life_test, encoding='utf-8')

# Browser assertions read the semantic state, because the visual circle has no
# text. This also verifies that the control remains accessible.
browser_path = ROOT / '.github/scripts/check_chronology_branch_controls.mjs'
browser = browser_path.read_text(encoding='utf-8')
browser = browser.replace(
    "childControl: text(childRow?.querySelector('.person-event-branch-visibility')),",
    "childControl: childRow?.querySelector('.person-event-branch-visibility')?.getAttribute('aria-pressed') || '',",
    1,
)
browser = browser.replace("assert.equal(initial.childControl, '◉');", "assert.equal(initial.childControl, 'true');", 1)
browser = browser.replace(
    "control: row?.querySelector('.person-event-branch-visibility')?.textContent?.trim() || '',",
    "control: row?.querySelector('.person-event-branch-visibility')?.getAttribute('aria-pressed') || '',",
    2,
)
browser = browser.replace("assert.equal(hidden.control, '○');", "assert.equal(hidden.control, 'false');", 1)
browser = browser.replace("assert.equal(restored.control, '◉');", "assert.equal(restored.control, 'true');", 1)
browser_path.write_text(browser, encoding='utf-8')

print('Refined chronology branch circles and updated stale expectations.')
