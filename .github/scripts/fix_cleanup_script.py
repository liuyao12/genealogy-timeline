from pathlib import Path

path = Path('.github/scripts/apply_royal_name_and_search_cleanup.py')
text = path.read_text()
start = text.index('# Restore full-width search result rows now that they have no trailing action.')
end = text.index('\n# Cache bust the changed app, styles, and starter data loading path.', start)
replacement = '''# Restore full-width search result rows now that they have no trailing action.
styles_path = Path("styles.css")
styles = styles_path.read_text()
old_row = ".person-list-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; border-radius: 8px; }"
new_row = ".person-list-row { display: block; border-radius: 8px; }"
if styles.count(old_row) != 1:
    raise SystemExit(f"Expected one two-column search row, found {styles.count(old_row)}")
styles = styles.replace(old_row, new_row, 1)
styles = styles.replace(".person-list-row.search-result .person-list-item { border-radius: 8px 0 0 8px; }\\n", "", 1)
focus_style_start = styles.index(".person-list-focus {")
focus_style_end = styles.index(".person-list-scope {", focus_style_start)
styles = styles[:focus_style_start] + styles[focus_style_end:]
styles_path.write_text(styles)
'''
path.write_text(text[:start] + replacement + text[end:])
