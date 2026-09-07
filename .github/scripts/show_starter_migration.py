from pathlib import Path

lines = Path('app.js').read_text(encoding='utf-8').splitlines()
for index, line in enumerate(lines):
    if 'starterDataVersion' not in line and 'starter data' not in line.lower():
        continue
    start = max(0, index - 12)
    end = min(len(lines), index + 25)
    print(f'--- app.js:{start + 1}-{end} ---')
    for number in range(start, end):
        print(f'{number + 1}: {lines[number]}')
