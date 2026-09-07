from pathlib import Path

path = Path('.github/scripts/implement_source_first_compaction.py')
text = path.read_text()
old = "compaction_path.write_text(compaction.rstrip() + source_first_packer + '\\n')"
new = "compaction_path.write_text((compaction.rstrip() + source_first_packer).rstrip() + '\\n')"
if text.count(old) != 1:
    raise SystemExit(f'Expected one compaction write, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
