from pathlib import Path

for test_path in Path('tests').glob('*.test.mjs'):
    text = test_path.read_text(encoding='utf-8').replace('v=145', 'v=146')
    text = text.replace(
        ".filter(period => period.id.startsWith('george-v-name-19'))",
        ".filter(period => ['george-v-name-1910', 'george-v-name-1927'].includes(period.id))"
    )
    test_path.write_text(text, encoding='utf-8')

browser = Path('.github/scripts/check_place_titles_george_family.mjs')
text = browser.read_text(encoding='utf-8').replace(
    ".filter(period => period.id.startsWith('george-v-name-19'))",
    ".filter(period => ['george-v-name-1910', 'george-v-name-1927'].includes(period.id))"
)
browser.write_text(text, encoding='utf-8')
