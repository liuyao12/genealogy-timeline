from pathlib import Path

path = Path('.github/scripts/apply_birth_filter_and_geni_dedupe.py')
text = path.read_text()

old = r"""function hasPlaceholderName(person) {
  const values = profileNameValues(person);
  const nn = /(?:^|[^\p{L}\p{N}])N\.?\s*\.?\s*N\.?(?:$|[^\p{L}\p{N}])/iu;
  const generic = /^(?:unnamed|unknown|still[-\s]?born|still[-\s]?birth|infant|baby)(?:\s+(?:child|son|daughter|boy|girl))?(?:\s+of\b.*)?$/i;
  return values.some(value => nn.test(value) || generic.test(value.trim()));
}
"""
new = r"""function hasPlaceholderName(person) {
  const values = [
    person?.displayName,
    typeof person?.name === 'string' ? person.name : '',
    person?.firstName,
    person?.lastName,
    ...(Array.isArray(person?.namePeriods) ? person.namePeriods.map(period => period?.name) : [])
  ].filter(Boolean).map(String);
  const nn = /(?:^|[^\p{L}\p{N}])N\.?\s*\.?\s*N\.?(?:$|[^\p{L}\p{N}])/iu;
  const generic = /^(?:unnamed|unknown|still[-\s]?born|still[-\s]?birth|infant|baby)(?:\s+(?:child|son|daughter|boy|girl))?(?:\s+of\b.*)?$/i;
  return values.some(value => nn.test(value) || generic.test(value.trim()));
}
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one placeholder-name helper, found {text.count(old)}')
text = text.replace(old, new, 1)

old = r"""  const text = profileNameValues(person).join(' ');
  if (hasPlaceholderName(person)) return 'placeholder-name';
  if (/\bstill[-\s]?born\b|\bstill[-\s]?birth\b/i.test(text)) return 'stillbirth';
  const birthYear = numericYear(person.birthYear);
  const deathYear = person.isLiving ? null : numericYear(person.deathYear);
  if (birthYear != null && deathYear != null && deathYear <= birthYear + 1) return 'infant-death';
"""
new = r"""  const text = profileNameValues(person).join(' ');
  if (/\bstill[-\s]?born\b|\bstill[-\s]?birth\b/i.test(text)) return 'stillbirth';
  const birthYear = numericYear(person.birthYear);
  const deathYear = person.isLiving ? null : numericYear(person.deathYear);
  if (birthYear != null && deathYear != null && deathYear <= birthYear + 1) return 'infant-death';
  if (hasPlaceholderName(person)) return 'placeholder-name';
"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one suppression-order block, found {text.count(old)}')
text = text.replace(old, new, 1)

old = 'replacement = anchor.replace("  const existingIds", new + "  const existingIds", 1)'
new = 'replacement = anchor.replace("  const existingIds = new Set(Object.keys(state.people));\\n", new, 1)'
if text.count(old) != 1:
    raise SystemExit(f'Expected one immediate-family insertion bug, found {text.count(old)}')
text = text.replace(old, new, 1)

old = '''old = """    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses'].forEach(field => {
"""
new = """    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'].forEach(field => {
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one Geni migration reference list, found {app.count(old)}')
app = app.replace(old, new, 1)
'''
new = '''old = """    normalized.sourceId = remap(normalized.sourceId);
    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses'].forEach(field => {
"""
new = """    normalized.sourceId = remap(normalized.sourceId);
    ['parents', 'children', 'partners', 'spouses', 'nonSpouses', 'divorcedSpouses', 'geniImmediateFamilyIds'].forEach(field => {
"""
if app.count(old) != 1:
    raise SystemExit(f'Expected one Geni migration reference list, found {app.count(old)}')
app = app.replace(old, new, 1)
'''
if text.count(old) != 1:
    raise SystemExit(f'Expected one broad migration patch, found {text.count(old)}')
text = text.replace(old, new, 1)

path.write_text(text)
