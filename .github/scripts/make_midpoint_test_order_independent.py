from pathlib import Path

path = Path("tests/timeline-event-labels.test.mjs")
text = path.read_text()
old = """  assert.deepEqual(layout.items.map(item => item.lane), [0, 1, 2]);
  assert.deepEqual(layout.items.map(item => item.anchorX), [56, 60, 64]);
"""
new = """  assert.deepEqual(layout.items.map(item => item.lane), [0, 1, 2]);
  const byName = Object.fromEntries(layout.items.map(item => [item.name, item]));
  assert.equal(byName['Long event one'].anchorX, 56);
  assert.equal(byName['Long event two'].anchorX, 60);
  assert.equal(byName['Long event three'].anchorX, 64);
"""
if text.count(old) != 1:
    raise SystemExit("Could not update the order-independent midpoint assertion")
path.write_text(text.replace(old, new, 1))
