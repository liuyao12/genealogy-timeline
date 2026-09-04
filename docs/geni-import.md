# Direct Geni descendant import

Lineage can load a descendant branch directly from Geni while remaining a static GitHub Pages application. The integration is read-only: it requests profile and union records, converts them to Lineage's local data model, and never writes to Geni.

## Geni application settings

The public application key is declared in `index.html`:

```html
<meta name="geni-app-id" content="zgW8WYPaAaGlYDbHFDhXfJosKALeFPUPczL7Q4bK">
```

This value is an application identifier, not the application secret. Never add the secret or a user access token to this repository.

In the Geni application dashboard, configure:

- **Site Domain:** `liuyao12.github.io`
- **Callback URL:** `https://liuyao12.github.io/genealogy-timeline/`

Geni requires the OAuth `redirect_uri` to be inside the registered Site Domain. The importer uses Geni's browser-side token flow and returns to the current Lineage path.

Official documentation:

- [Client-side OAuth and JSONP](https://www.geni.com/platform/developer/help/oauth_client_side?version=1)
- [Profile API](https://www.geni.com/platform/developer/help/api?path=profile&version=1)
- [Union API](https://www.geni.com/platform/developer/help/api?path=union&version=1)
- [Rate limits](https://www.geni.com/platform/developer/help/rate_limits?version=1)

## User flow

1. Open **Load descendants from Geni** in the left source panel.
2. Enter a public Geni profile URL, public GUID, or API profile ID.
3. Choose a descendant depth, destination, profile pause target, and hard request limit.
4. Authorize the Lineage Geni application when redirected to Geni.
5. The import resumes automatically after Geni redirects back.

A completed import can become a new tree tab or be stitched into the active tree. The new-tab option is the safer default because it leaves the current tree unchanged.

The selected-profile sidebar uses Geni's `profile/immediate-family` endpoint. Its primary **Load/Refresh immediate family** action is deliberately one API request: Geni returns the focus profile, related profile nodes, and union nodes together. Optional reign-event enrichment is not bundled into that action.

New applications may have an extremely small quota until Geni approves them. Geni's current Help Center says approval is required for higher rate limits and may be required for particular endpoints. Request approval through the [Geni API Project discussions](https://www.geni.com/discussions?discussion_type=project-1124), identifying application 2164 and the public Lineage deployment.

## Traversal and family reconstruction

The importer traverses breadth-first, one descendant generation at a time. Within each generation it:

1. Fetches profiles in groups of at most 25.
2. Collects and fetches their union records in groups of at most 25.
3. Identifies unions in which a current-generation person is a partner.
4. Fetches all partners and children of those unions.
5. Reconstructs reciprocal partner, spouse, parent, and child links.
6. Queues the children as the next descendant generation.

All returned unions are applied to profiles already retained in the import. This also reconstructs a current person's link to their parents when an import is resumed from a later generation.

Union data, rather than gender assumptions, determines the two parents of each child. The conversion retains formal versus non-marital unions, marriage dates, divorce/end dates, and spouse status. Geni's `adopted_children` and `foster_children` subsets are included; the imported child's profile note records the parentage type.

Profiles are keyed by Geni's durable public GUID when Geni returns one, in the form `profile-g600000…`. API node IDs remain aliases used only while resolving a live response. This allows a direct import to merge with existing Lineage records that already use public Geni IDs.

## Request pacing and limits

Every actual HTTP/JSONP request passes through one serialized request queue. The default minimum spacing is 450 milliseconds and can be changed in `index.html`:

```html
<meta name="geni-request-delay-ms" content="450">
```

Transient network failures, timeouts, and recognizable rate-limit responses are retried with exponential backoff. Requests are deduplicated in memory during the active run. When a batched request fails because one member is inaccessible, the batch is divided recursively so accessible records can still be retained.

The **request safety limit** is hard and counts actual API requests, including retries. The **profile pause target** is checked only after a complete generation has been retained; a generation is never cut in half merely to hit the target exactly, so the final count can be higher than the selected target.

Geni documents `X-API-Rate-Limit`, `X-API-Rate-Remaining`, and `X-API-Rate-Window` response headers. Browser JSONP does not expose HTTP response headers to JavaScript, so this static implementation cannot schedule directly from them. Conservative pacing, retry/backoff, and a hard request limit are therefore required even after the application receives a larger quota.

For a higher quota, request approval for the application through the [Geni API project](https://www.geni.com/projects/The-Geni-API/1124). Describe Lineage as a read-only, user-directed viewer, and mention generation batching, local caching, pause/resume, and the public deployment URL.

## Saved progress and privacy

The access token is stored only in `sessionStorage`, so it is scoped to the current browser tab/session. It is not written into tree JSON, `localStorage`, GitHub, or the imported profiles. After this importer receives an OAuth result, it removes the token-bearing fragment from the address bar.

At each completed generation, a checkpoint is written to `sessionStorage`. Closing the dialog, stopping, reaching a limit, losing network access, or refreshing the page does not discard that checkpoint. The user can resume, use the partial tree, or explicitly discard saved progress.

A new tree tab is stored in Lineage's existing local workspace. “Merge into current tree” uses the existing `lineage-stitch` importer, so local nonempty fields win while missing facts and relationship arrays are added.

The API can return information according to the authorizing user's access. Do not treat an authorized response as permission to republish private or restricted family information. Lineage remains independent software and is not endorsed, operated, or sponsored by Geni.

## Tests

The data conversion and traversal core is testable without a browser or Geni credentials:

```bash
node --test tests/geni-import.test.mjs
```

The test suite covers ID normalization, profile conversion, union reconstruction, adopted/foster relationships, a mocked generation-batched import, and Lineage tree-tab serialization.
