# Lineage stitch-import schema

Use this format when adding researched profiles to an existing Lineage tree. A stitch import merges records by `id`; it does not replace the current tree. Existing non-empty local fields win, while missing fields and relationship arrays are filled from the package.

## Envelope

```json
{
  "schema": "lineage-stitch",
  "version": 1,
  "focusId": "profile-g6000000003409427757",
  "people": {}
}
```

- `schema` must be `lineage-stitch`.
- `version` must be `1`.
- `focusId` is optional. If it names an imported or existing profile, that profile is selected after import.
- `rootId` is optional and is used only when the current tree has no valid root.
- `people` is required. It may be an object keyed by profile ID or an array whose members each contain `id`.
- `globalEvents` is optional. Omit it unless the research request explicitly asks for shared historical events.

## Stable IDs

Every person needs a durable, source-derived ID. Reuse an existing anchor ID exactly when the prompt supplies one. Recommended forms include:

- `profile-g6000000003760873898` for a Geni public GUID
- `wikidata-Q9682` for a Wikidata entity

Never use a bare name as an ID. Every ID mentioned in a relationship array must have a record in `people`, unless it is one of the existing anchors supplied in the prompt.

## Person record

```json
{
  "id": "provider-stable-id",
  "displayName": "Public display name, including a useful title",
  "firstName": "Given names",
  "lastName": "Family name",
  "gender": "male",
  "birthYear": "1900",
  "deathYear": "1980",
  "isLiving": false,
  "parents": ["father-id", "mother-id"],
  "children": ["child-id"],
  "partners": ["partner-id"],
  "spouses": ["married-partner-id"],
  "nonSpouses": [],
  "divorcedSpouses": [],
  "marriageYears": { "married-partner-id": "1925" },
  "relationshipEndYears": { "married-partner-id": "1940" },
  "relationshipEndStatuses": { "married-partner-id": "divorced" },
  "namePeriods": [
    {
      "id": "name-stable-id",
      "name": "The name or title used in this period",
      "startYear": 1926,
      "endYear": 1952,
      "sourceUrl": "https://en.wikipedia.org/wiki/Public_biography"
    }
  ],
  "personalEvents": [
    { "id": "event-stable-id", "name": "Reign", "startYear": 1952, "endYear": 2022, "color": "#c62828" }
  ],
  "sourceUrl": "https://public.example/profile",
  "sourceId": "source-native-id",
  "sourceProvider": "provider-name"
}
```

Only `id` and a usable name are essential, but birth years are needed for timeline placement. Use `male`, `female`, or `unknown`. Use `null`, an empty string, or omit a field when the public evidence does not establish it.

`displayName` is the default or present-day label. `namePeriods` records the chronological names, styles, or titles by which the person was publicly known. Periods should be evidence-based, non-overlapping where possible, and ordered by `startYear`; a null boundary means the evidence does not establish that boundary. Give each period a stable ID and a direct public source URL. Wikipedia, Wikidata, official biographies, and other reliable public sources may complement genealogy profiles.

When the app is set to a historical snapshot year, it chooses the matching `namePeriods` entry and dims everything to the right of that year. If no interval exactly covers the year, it uses the latest documented name already reached; `displayName` remains the final fallback.

Formally married people belong in both `partners` and `spouses`. Non-marital relationships belong in `partners` and `nonSpouses`, not `spouses`. Allowed relationship-end statuses are `annulled`, `divorced`, and `ended`.

Parent/child and partner/spouse links should be reciprocal. The importer repairs missing reciprocal links when both profiles are present, but explicit two-way data makes the package independently understandable.

## Stitching rules

- A matching `id` updates missing facts and unions relationship arrays without erasing local edits.
- A new `id` creates a profile.
- Existing root, filtering, scale, visibility choices, and local events remain unchanged.
- Relationship references not found in either the package or current tree are omitted and reported.
- Source attribution is retained on every imported profile.
- Dated names merge by their stable period ID without replacing the profile's default display name.

See [`examples/stitch-import.example.json`](../examples/stitch-import.example.json) for a complete package.
