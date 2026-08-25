# Lineage

*Genealogy against the backdrop of history.*

A desktop-first, static web version of the family-tree viewer. It works on GitHub Pages without a server or build step.

The shared generational timeline is the interface. It remains a family tree: genealogical branches determine row order, while birth year and lifespan determine each profile's horizontal position and width. The interface and profile bars use a restrained monochrome palette, with line weight, dashes, and lightness carrying the visual distinctions. Names use a regular-weight face so more rows remain readable at once. The semitransparent five-year ruler sticks to the top while profiles pass behind it, and the canvas can be panned by dragging its empty background.

The timeline receives all space not used by the compact left search column. That column lists only profiles matching the current keyword filter and reports the number of matches. Profile details do not reserve a permanent column: selecting a node or search result slides a monochrome editor over the right edge, and closing it immediately restores the unobstructed canvas.

A fresh visit starts locally and does not contact Geni or open authorization. The empty state invites the user to add the first profile, and subsequent profiles can be added one at a time with a selected parent. The explicit **Import Henry VII descendants from Geni** button in the left column records that import intent, starts OAuth, and resumes the live import only after Geni returns an access token.

Timeline rows use the mini-program's two-pass bottom-up compaction approach. Branches move upward in half-row steps when their lifespan-plus-label ranges fit, retain a half-row of breathing room, and stay put whenever a node or external connector would be crossed. A final stable-order pass prevents compaction from moving unrelated profiles between a spouse and that union's children.

Within each branch, rows are ordered by parental union rather than collecting all spouses beside the principal profile. Each spouse appears immediately before that couple's children; a later spouse begins a new group with its own marriage-aligned vertical stem.

Partners are always included in the timeline and in filtered connecting paths; there is no partner-visibility mode.

The Henry VII example is a live-only Geni import pre-filtered with `king queen`. Its profiles are not restored from `localStorage`: reloading requests the current public graph again. Each successful immediate-family response is merged into application state and rendered before the next request, so the timeline visibly grows during the import. Descendant mode queues children while retaining the parents and spouses returned with their public neighborhoods.

When two people already descended from the active root marry, the renderer keeps the spouse's natal position and marks the connection into the later marriage with a distinct dotted transport line. The example exercises this with William III and Mary II, George V and Mary of Teck, and Elizabeth II and Philip.

## Run locally

Serve the repository root over HTTP (ES modules do not run reliably from `file://`):

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Data and Geni

- Ordinary working trees are stored in the browser's `localStorage`. The Henry VII live example is explicitly ephemeral and is never written there.
- JSON import accepts this web export format and the mini-program's `{ activeRootId, people }` backup shape.
- The web app has its own profile model and does not modify or depend on the mini-program runtime.
- Profiles use the Western `First Last` display order.
- When a source supplies a display name, the app preserves and shows it in preference to reconstructing a name from separate fields. This keeps titles such as “King of England” searchable and visible on the timeline.
- Tree ordering and line weight prioritize paternal descent while retaining maternal relationships as secondary dotted links.
- Timeline labels keep the name and lifespan on one line. They do not display age.
- Public-source imports use a small provider-adapter layer. Geni uses its documented `profile/immediate-family` API; WikiTree uses its public read-only `getRelatives` API. Geni now requires an OAuth access token even when the requested profiles are public.
- Geni is the primary provider. A user-selected connection depth of 1–4 recursively follows permitted public immediate-family responses. Stable Geni profile IDs deduplicate overlaps, while parent, child, and partner arrays are unioned to stitch the responses into one graph. Imports stop at 160 profiles or 80 API requests.
- The importer explicitly requests Geni profile `events` and returned detail strings in batches and recognizes the exact label `Reign`. A single year is drawn as a gold marker; a dated reign range is drawn as a gold band with boundary marks. Event enrichment is optional, so a restricted event request does not prevent the family graph from importing.
- Geni union marriage events are retained by partner pair. Family stems align to the recorded marriage year; when no marriage date is available, the renderer uses a position shortly before the first child's birth.
- A Geni event or returned profile detail whose label is exactly `Reign` marks the profile as a reigning monarch. Kings and queens share one royal-violet lifespan color, while the Geni date range is overlaid in gold; same-century end years are abbreviated (for example, `1509–47`).
- The tree-toolbar filter accepts one or more keywords with OR semantics and searches display names and explicit titles. It keeps matching profiles and the complete ancestor/partner paths needed to understand them, while hiding branches that contain no match.
- WikiTree currently limits browser origins, so GitHub Pages shows an official API-JSON link when a direct request is blocked. Save that JSON and use **Import file**; the same adapter parses it locally.
- Other genealogy services can be brought in through JSON or a GEDCOM export without adding site-specific scraping. Additional official public APIs can be added as adapters later.
- GitHub Pages has no backend, so it cannot proxy API requests, hold an OAuth client secret, or bypass Geni authentication/CORS rules.
- Every imported profile retains a source link, and the UI includes the required non-affiliation statement.

Live Geni loading uses the public Geni application ID `2164` from the `geni-app-id` meta tag in `index.html`. In the Geni application settings, use `liuyao12.github.io` as the Site Domain and `https://liuyao12.github.io/genealogy-timeline/` as both the Site URL and Callback URL. The app uses Geni's client-side OAuth flow and authorized JSONP API calls, keeps the returned access token only in the current tab's session storage, and never needs or embeds an application secret. It accepts the callback token from either the URL fragment or query string, removes it from the visible address immediately, and stops rather than redirecting repeatedly if Geni returns without a token. Until the user authorizes it, the app deliberately shows the authorization error instead of falling back to stale royal data.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the repository root. In the repository settings, select **GitHub Actions** as the Pages source, then push to the default branch.
