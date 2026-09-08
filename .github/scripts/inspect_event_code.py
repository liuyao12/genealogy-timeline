from pathlib import Path

for path_name in ['app.js', 'index.html', 'styles.css']:
    path = Path(path_name)
    lines = path.read_text(encoding='utf-8').splitlines()
    terms = [
        'personalEvents', 'personal-events', 'personal-event', 'reignEvents',
        'isReignLabel', 'reignColor', 'timeline-as-of-toggle',
        'timeline-background-toggle', 'event-editor', 'personal-event-range',
        'personal-event-marker', 'timeline-event'
    ]
    hits = sorted({index for index, line in enumerate(lines) if any(term in line for term in terms)})
    ranges = []
    for hit in hits:
        start = max(0, hit - 8)
        end = min(len(lines), hit + 18)
        if ranges and start <= ranges[-1][1] + 2:
            ranges[-1] = (ranges[-1][0], max(ranges[-1][1], end))
        else:
            ranges.append((start, end))
    print(f'===== {path_name} ({len(lines)} lines) =====')
    for start, end in ranges:
        print(f'--- lines {start + 1}-{end} ---')
        for index in range(start, end):
            print(f'{index + 1:5d}: {lines[index]}')
