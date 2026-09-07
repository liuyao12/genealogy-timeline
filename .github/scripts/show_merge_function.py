from pathlib import Path

lines = Path('app.js').read_text(encoding='utf-8').splitlines()
for index, line in enumerate(lines):
    if line.startswith('function mergePersonRecords'):
        end = min(len(lines), index + 90)
        for number in range(index, end):
            print(f'{number + 1}: {lines[number]}')
        break
else:
    raise SystemExit('mergePersonRecords not found')
