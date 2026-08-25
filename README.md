# Lineage

*Genealogy against the backdrop of history.*

A desktop-first, static web version of the family-tree viewer. It works on GitHub Pages without a server or build step.

The shared generational timeline is the interface. It remains a family tree: genealogical branches determine row order, while birth year and lifespan determine each profile's horizontal position and width. The interface stays monochrome, while profile lifespans use the mini-program's Geni-like blue (`#bbdefb`) and pink (`#fce4ec`). Names use a regular-weight face so more rows remain readable at once. The semitransparent five-year ruler sticks to the top while profiles pass behind it, and the canvas can be panned by dragging its empty background.

The timeline receives all space not used by the compact left search column. That column lists only profiles matching the current keyword filter and reports the number of matches. Profile details do not reserve a permanent column: selecting a node or search result slides a monochrome editor over the right edge, and closing it immediately restores the unobstructed canvas.

A fresh visit immediately shows a bundled British royal line from Henry VII, pre-filtered with `king queen`. It does not contact Geni or open authorization. The 90 historical records—including the line's confirmed spouses—and their stable Geni profile IDs ship with the static app, so the timeline is useful even when a visitor has not authorized Geni. The left-column restore button replaces the working copy with this bundled baseline.

Timeline rows use the mini-program's two-pass bottom-up compaction approach. Branches move upward in half-row steps when their lifespan-plus-label ranges fit, retain a half-row of breathing room, and stay put whenever a node or external connector would be crossed. A final stable-order pass prevents compaction from moving unrelated profiles between a spouse and that union's children, and enforces a six-pixel vertical gutter whenever two complete node ranges overlap horizontally.

Within each branch, rows are ordered by parental union rather than collecting all spouses beside the principal profile. Each spouse appears immediately before that couple's children; a later spouse begins a new group with its own marriage-aligned vertical stem.

A profile occupying a spouse position uses an italic label and the genealogical marriage symbol `⚭` in place of the branch expand/collapse square. When that same person appears in their own birth branch, the ordinary node styling and branch control are retained.

Confirmed spouses and former spouses are always included in the timeline and in filtered connecting paths. Geni unions recorded only as partners, engagements, or other non-marital relationships are retained as parentage facts but their profiles and union lines are hidden.

Selecting any bundled node opens its editable local copy. **Load complete immediate family** is the first action that requires Geni authorization; after OAuth returns, the app merges the selected profile's current public parents, spouses, children, union dates, and newly encountered profiles by Geni ID. A local relative can be attached to that Geni profile only after this immediate-family step has completed. The resulting working tree, including imported records and local edits, is saved in `localStorage`.

When two people already descended from the active root marry, the renderer keeps the spouse's natal position and marks the vertical relocation span with a distinct dotted transport line. A divorced marriage uses a dashed vertical span. Horizontal parent, spouse, and child segments always remain solid. The bundled line exercises transport with William III and Mary II, George V and Mary of Teck, and Elizabeth II and Philip, and divorce with Charles III and Diana.

## Run locally

Serve the repository root over HTTP (ES modules do not run reliably from `file://`):

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Data and Geni

- Working trees—including the bundled starter after edits or Geni expansion—are stored in the browser's `localStorage`.
- JSON import accepts this web export format and the mini-program's `{ activeRootId, people }` backup shape.
- The web app has its own profile model and does not modify or depend on the mini-program runtime.
- Profiles use the Western `First Last` display order.
- When a source supplies a display name, the app preserves and shows it in preference to reconstructing a name from separate fields. This keeps titles such as “King of England” searchable and visible on the timeline.
- Tree ordering and line weight prioritize paternal descent while retaining maternal relationships with a lighter solid line.
- Timeline labels keep the name and lifespan on one line. They do not display age.
- Personal events are edited in the selected profile drawer, where their dates remain visible. Global events are managed from the header's **Events** dialog and appear as bands behind the full timeline. Event years are not printed over the timeline itself. Both kinds retain a user-selected colour in local storage and JSON backups.
- Public-source imports use a small provider-adapter layer. Geni uses its documented `profile/immediate-family` API; WikiTree uses its public read-only `getRelatives` API. Geni now requires an OAuth access token even when the requested profiles are public.
- Geni is the primary provider. A user-selected connection depth of 1–4 recursively follows permitted public immediate-family responses. Stable Geni profile IDs deduplicate overlaps, while parent, child, spouse, and raw-partner arrays are unioned to stitch the responses into one graph. Imports stop at 160 profiles or 80 API requests.
- The importer explicitly requests Geni profile `events` and returned detail strings in batches and recognizes the `Reign` label. A single year is drawn as an unlabeled marker; a dated reign range is drawn as a monochrome band with boundary marks. Its dates remain in the selected profile drawer. Event enrichment is optional, so a restricted event request does not prevent the family graph from importing.
- Geni union marriage events are retained by spouse pair. Family stems align to the recorded marriage year; when no marriage date is available, the renderer uses a position shortly before the first child's birth.
- A Geni event or returned profile detail whose label begins with `Reign` marks the profile as a reigning monarch. Reigning kings and queens share the same monochrome event treatment; same-century end years are abbreviated (for example, `1509–47`).
- The tree-toolbar filter accepts one or more keywords with OR semantics and searches display names and explicit titles. It keeps matching profiles and the complete ancestor/spouse paths needed to understand them, while hiding branches that contain no match.
- WikiTree currently limits browser origins, so GitHub Pages shows an official API-JSON link when a direct request is blocked. Save that JSON and use **Import file**; the same adapter parses it locally.
- Other genealogy services can be brought in through JSON or a GEDCOM export without adding site-specific scraping. Additional official public APIs can be added as adapters later.
- GitHub Pages has no backend, so it cannot proxy API requests, hold an OAuth client secret, or bypass Geni authentication/CORS rules.
- Every imported profile retains a source link, and the UI includes the required non-affiliation statement.

Live Geni loading uses the public Geni application ID `2164` from the `geni-app-id` meta tag in `index.html`. In the Geni application settings, use `liuyao12.github.io` as the Site Domain and `https://liuyao12.github.io/genealogy-timeline/` as both the Site URL and Callback URL. The app uses Geni's client-side OAuth flow and authorized JSONP API calls, keeps the returned access token only in the current tab's session storage, and never needs or embeds an application secret. It accepts the callback token from either the URL fragment or query string, removes it from the visible address immediately, and stops rather than redirecting repeatedly if Geni returns without a token. The bundled royal line remains visible without authorization.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the repository root. In the repository settings, select **GitHub Actions** as the Pages source, then push to the default branch.
