from pathlib import Path

for test_path in Path('tests').glob('*.test.mjs'):
    text = test_path.read_text(encoding='utf-8')
    revised = text.replace(r'app\.js\?v=146', r'app\.js\?v=147')
    if revised != text:
        test_path.write_text(revised, encoding='utf-8')
