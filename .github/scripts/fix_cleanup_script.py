from pathlib import Path

path = Path('.github/scripts/apply_royal_name_and_search_cleanup.py')
text = path.read_text()
start = text.index('# Restore full-width search result rows now that they have no trailing action.')
end = text.index('\n# Cache bust the changed app, styles, and starter data loading path.', start)
replacement = '''# Restore full-width search result rows now that they have no trailing action.
styles_path = Path("styles.css")
styles = styles_path.read_text()
style_start = styles.index(".person-list-row {")
style_end = styles.index(".person-list-scope {", style_start)
search_styles_replacement = """.person-list-row { display: block; border-radius: 8px; }
.person-list-row:hover, .person-list-row:focus-within, .person-list-row.active { background: var(--green-pale); }
.person-list-row .person-list-item { min-width: 0; background: transparent; }
.person-list-row .person-list-item:hover, .person-list-row .person-list-item.active { background: transparent; }
"""
styles = styles[:style_start] + search_styles_replacement + styles[style_end:]
styles_path.write_text(styles)
'''
path.write_text(text[:start] + replacement + text[end:])
