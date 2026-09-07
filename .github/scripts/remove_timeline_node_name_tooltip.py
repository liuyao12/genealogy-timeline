from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old!r}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    "app.js",
    "    group.append(svg('title', {}, `${historicalDisplayName} · ${historicalLifeLabel}`));\n",
    "",
)
replace_once(
    "index.html",
    '<script type="module" src="./app.js?v=136"></script>',
    '<script type="module" src="./app.js?v=137"></script>',
)
