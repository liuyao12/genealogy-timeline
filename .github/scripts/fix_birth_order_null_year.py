from pathlib import Path

path = Path("timeline-compaction.js")
text = path.read_text()
old = """  const yearFor = index => {
    const value = Number(birthYearFor(index));
    return Number.isFinite(value) ? value : null;
  };
"""
new = """  const yearFor = index => {
    const rawValue = birthYearFor(index);
    if (rawValue == null || rawValue === '') return null;
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : null;
  };
"""
if text.count(old) != 1:
    raise SystemExit(f"Expected one birth-year converter, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
