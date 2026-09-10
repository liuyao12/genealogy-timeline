from pathlib import Path

path = Path('.github/scripts/expand_royal_consortroutes.py')
text = path.read_text(encoding='utf-8')
old = '''def external_profile(people: dict, aliases: list[str]) -> str:
    folded = [value.casefold() for value in aliases]
    matches = [profile_id for profile_id, person in people.items() if any(alias in record_text(person) for alias in folded)]
    matches = list(dict.fromkeys(matches))
    if len(matches) != 1:
        raise RuntimeError(f'Expected one existing profile for {aliases}, found {[(value, people[value].get("displayName")) for value in matches]}')
    return matches[0]
'''
new = '''def external_profile(people: dict, aliases: list[str]) -> str:
    folded = [value.casefold() for value in aliases]
    matches = []
    for profile_id, person in people.items():
        names = [
            str(person.get('displayName') or ''),
            str(person.get('title') or ''),
            *[str(period.get('name') or '') for period in person.get('namePeriods') or []],
        ]
        normalized = [name.casefold() for name in names if name]
        if any(any(name == alias or name.startswith(alias + ',') for name in normalized) for alias in folded):
            matches.append(profile_id)
    matches = list(dict.fromkeys(matches))
    if len(matches) != 1:
        raise RuntimeError(f'Expected one existing profile for {aliases}, found {[(value, people[value].get("displayName")) for value in matches]}')
    return matches[0]
'''
if text.count(old) != 1:
    raise SystemExit(f'Expected one external_profile function, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
