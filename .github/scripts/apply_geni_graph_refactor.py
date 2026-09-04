from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:80]!r}')
    file.write_text(text.replace(old, new), encoding='utf-8')


replace_once(
    'geni-api.js',
    "import { DEFAULT_MAX_REQUESTS, DEFAULT_REQUEST_DELAY_MS } from './geni-config.js?v=1';\nimport { canonicalGeniProfileId, clean, refId } from './geni-model.js?v=1';",
    "import { DEFAULT_MAX_REQUESTS, DEFAULT_REQUEST_DELAY_MS } from './geni-config.js?v=2';\nimport { canonicalGeniProfileId, clean, refId } from './geni-model.js?v=2';",
)

for module in ('geni-config', 'geni-model', 'geni-api', 'geni-import-core'):
    replace_once('geni-import.js', f"./{module}.js?v=1", f"./{module}.js?v=2")

replace_once(
    'app.js',
    """  const fields = [
    'id', 'guid', 'url', 'profile_url', 'public', 'display_name',
    'first_name', 'middle_name', 'last_name', 'maiden_name', 'title',
    'gender', 'is_alive', 'birth', 'death', 'birth_date', 'birth_date_parts',
    'death_date', 'death_date_parts', 'unions', 'partners', 'children',
    'status', 'marriage', 'divorce', 'marriage_date', 'divorce_date'
  ].join(',');""",
    """  // The graph endpoint cannot project birth.date.year directly, so request
  // only the three event objects needed and discard their day/month/location.
  const fields = [
    'id', 'guid', 'name', 'display_name', 'profile_url', 'public',
    'gender', 'is_alive', 'living', 'birth', 'death', 'status', 'marriage'
  ].join(',');""",
)

replace_once(
    'app.js',
    "const fields = 'id,url,partners,children,status,marriage,divorce,marriage_date,divorce_date';",
    "const fields = 'id,partners,children,status,marriage';",
)

replace_once(
    'app.js',
    "const fields = 'id,guid,url,profile_url,public,display_name,first_name,middle_name,last_name,maiden_name,title,gender,is_alive,birth,death,birth_date,birth_date_parts,death_date,death_date_parts,unions';",
    "const fields = 'id,guid,name,display_name,profile_url,public,gender,is_alive,living,birth,death,unions';",
)

replace_once('index.html', './geni-import.js?v=1', './geni-import.js?v=2')
replace_once('index.html', './app.js?v=125', './app.js?v=126')

old_docs = """The importer traverses breadth-first, one descendant generation at a time. Within each generation it:

1. Fetches profiles in groups of at most 25.
2. Collects and fetches their union records in groups of at most 25.
3. Identifies unions in which a current-generation person is a partner.
4. Fetches all partners and children of those unions.
5. Reconstructs reciprocal partner, spouse, parent, and child links.
6. Queues the children as the next descendant generation.

All returned unions are applied to profiles already retained in the import. This also reconstructs a current person's link to their parents when an import is resumed at a later generation.

Union data, rather than gender assumptions, determines the two parents of each child. The conversion retains formal versus non-marital unions, marriage dates, divorce/end dates, and spouse status. Geni's `adopted_children` and `foster_children` subsets are included; the imported child's profile note records the parentage type.

Profiles are keyed by Geni's durable public GUID when Geni returns one, in the form `profile-g600000…`. API node IDs remain aliases used only while resolving a live response. This allows a direct import to merge with existing Lineage records that already use public Geni IDs."""

new_docs = """The descendant importer follows the generation-frontier strategy used by HistoryLinkTools' Ancestor/Descendant Graph:

1. Keep one deduplicated breadth-first frontier for the current generation.
2. Request `profile/immediate-family` graphs for up to 50 focus profiles at once.
3. Read the profile and union nodes returned in those graphs.
4. Keep only unions in which the focus profile has the `partner` edge; its parental union is not traversed downward.
5. Retain the union's other partner and children, reconstruct reciprocal family links, and deduplicate the children into the next frontier.
6. Save a checkpoint only after the complete generation is assembled.

Thus, a generation of 1–50 descendants normally costs one graph request, rather than separate profile, union, and related-profile passes. If one inaccessible profile makes a batch fail, the importer divides that batch until the accessible profiles can still be retained.

The requested graph fields are deliberately small: stable IDs, a display name, public/living/gender flags, and the `birth`, `death`, and `marriage` event objects. Geni's API does not document nested projection such as `birth.date.year`, so those event objects may transiently contain day, month, or location. Lineage immediately extracts only the year and does not store the other values. `marriage_date` and the duplicate `birth_date`/`death_date` fields are not requested.

Marriage belongs to the union, rather than either spouse's profile. Union edges determine the correct two parents and distinguish a focus person's parental union from unions that produce descendants. Adopted and foster edge modifiers are retained when Geni supplies them.

Profiles are keyed by Geni's durable public GUID when Geni returns one, in the form `profile-g600000…`. API node IDs remain aliases used only while resolving a live response. This allows a direct import to merge with existing Lineage records that already use public Geni IDs."""
replace_once('docs/geni-import.md', old_docs, new_docs)
