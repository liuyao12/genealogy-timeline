# Lineage

*Genealogy against the backdrop of history.*

A desktop-first, static web version of the family-tree viewer. It works on GitHub Pages without a server or build step.

The shared generational timeline is the interface. It remains a family tree: genealogical branches determine row order, while birth year and lifespan determine each profile's horizontal position and width. The interface stays monochrome, while profile lifespans use the mini-program's Geni-like blue (`#bbdefb`) and pink (`#fce4ec`) with rounded, darker borders in the corresponding colour. Event bands are painted beneath a final outline so they cannot cover the node border. Names use a regular-weight face so more rows remain readable at once. The semitransparent five-year ruler sticks to the top while profiles pass behind it, and the canvas can be panned by dragging its empty background.

The timeline receives all space not used by the compact left search column. That column lists only profiles matching the current keyword fragments, highlights every matching name fragment in yellow, and reports the number of matches. Profile details do not reserve a permanent column: selecting a node or search result slides a monochrome editor over the right edge, and closing it immediately restores the unobstructed canvas.

The header can export the editable tree as JSON or save the complete rendered timeline as a high-resolution PNG. Image export includes the full off-screen tree, year ruler, event bands, connectors, and every profile currently present under the active filter—not merely the visible viewport—while cropping away the canvas's four navigation margins.

The **As of** snapshot can be placed directly from the sticky year ruler: hovering previews the exact year, clicking drops the line there, and its handle can then be dragged in one-year steps (or adjusted with the arrow keys). The full vertical As of line is also a drag handle—hover it anywhere in the tree and drag left or right without panning the canvas. Everything beyond the line is veiled, including the future portion of a lifespan, while labels remain fully legible and change to the name, style, or title documented for that year. Profiles born after the selected year retain their default display name—the lasting title by which they are generally known—rather than borrowing their earliest lifetime title. Profiles normally show `(BIRTH–DEATH)`; only a lifespan intersecting the active historical line shows `(b. YEAR, age N)` at that year. In the present-day view, the current-year line applies the same treatment to living profiles. Each profile retains a default display name plus a sourced chronological `namePeriods` list; dated names can be maintained in the profile drawer or supplied by an AI-assisted stitch import.

The bundled British royal line includes dated names across the dynastic spine and present family. For example, William changes from Prince William of Wales to William, Duke of Cambridge in 2011 and William, Prince of Wales in 2022. These records follow published “Titles and styles” chronologies while omitting ceremonial prefixes such as HM and HRH.

A fresh visit immediately shows a bundled British royal line from Henry VII, pre-filtered with `king queen`. It does not contact Geni or open authorization. The historical records—including the line's confirmed spouses and Charles III's living descendant families through William and Harry—and their stable public profile IDs live in the single canonical [`data/british-royal-line.json`](data/british-royal-line.json) file. The left-column restore button replaces the working copy with this bundled baseline.

Timeline rows use the mini-program's two-pass bottom-up compaction approach. Branches move upward in half-row steps when their lifespan-plus-label ranges fit, retain a half-row of breathing room, and stay put whenever a node or external connector would be crossed. The final packing pass treats consecutive spouses, parents and children, and siblings as rigid direct-family runs at the closest row distance. Unrelated rows keep an additional six-pixel minimum gutter wherever their complete node ranges overlap horizontally, while obstacles may leave a larger gap.

Within each branch, rows are ordered by parental union rather than collecting all spouses beside the principal profile. Spouse households are ordered by recorded marriage year, including marriages without children; undated marriages follow dated ones. Each spouse appears immediately before that couple's children, and a later spouse begins a new group with its own marriage-aligned vertical stem.

Child visibility is household-wide: hiding a child from either parent's profile hides both parental edges, and showing the child restores the complete parental union. A child therefore cannot reappear on a stray one-parent stem after being hidden.

A profile occupying a spouse position uses an italic label and the genealogical marriage symbol `⚭` in place of the branch expand/collapse square. When that same person appears in their own birth branch, the ordinary node styling and branch control are retained.

In the Western male-line layout, a woman already occupying a spouse position in more than one visible male-line household receives a separate occurrence in each household. Those boxes share one dotted transport spine: it follows the biological parents' marriage line when the natal family is visible, or a synthetic anchor just left of the occurrences when it is not. A visible natal occurrence remains a third box alongside two marriage occurrences. A woman who owns her branch—such as Mary, Queen of Scots—stays single, with successive husbands grouped beneath her in marriage order just as successive wives are grouped beneath a man.

Confirmed spouses and former spouses are always included in the timeline and in filtered connecting paths. Geni unions recorded only as partners, engagements, or other non-marital relationships are retained as parentage facts but their profiles and union lines are hidden.

Selecting any bundled node opens its editable local copy. **Prepare prompt for this profile** generates an AI-research prompt containing that profile and the current root as stable anchors. The user gives it to a preferred AI chatbot, then pastes or uploads the returned `lineage-stitch` JSON. Matching IDs are merged, new profiles are added, relationship arrays are unioned, and reciprocal links are repaired without replacing the current tree. The resulting working tree and local edits are saved in `localStorage`.

When two people already descended from the active root marry, the renderer keeps the spouse's natal position and marks the vertical relocation span with a distinct dotted transport line. A divorced marriage uses a dashed vertical span. Horizontal parent, spouse, and child segments always remain solid. The bundled line exercises transport with William III and Mary II, George V and Mary of Teck, and Elizabeth II and Philip, and divorce with Charles III and Diana.

## Run locally

Serve the repository root over HTTP (ES modules do not run reliably from `file://`):

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Data and AI-assisted imports

- The repository's canonical bundled tree is [`data/british-royal-line.json`](data/british-royal-line.json). A first visit loads a normalized working copy into the browser; editing that copy never changes the repository file.
- Working trees—including the bundled starter after edits or stitched expansion—are stored in the browser's `localStorage`. A version number in the canonical file lets published corrections and additions merge into previously saved bundled trees while preserving local edits; manual trees remain independent.
- JSON import accepts this web export format and the mini-program's `{ activeRootId, people }` backup shape.
- AI research packages use the provider-neutral [`lineage-stitch` schema](docs/import-schema.md). A [complete example](examples/stitch-import.example.json) and [generic prompt](docs/ai-import-prompt.md) are stored in the repository. The app generates a more useful prompt containing current-tree anchor IDs.
- Research prompts ask the user's preferred AI chatbot to complement genealogy profiles with Wikipedia, Wikidata, official biographies, and other reliable public sources, producing cited chronological names rather than one timeless label.
- Stitch imports merge by stable public ID. Existing local values win; missing facts, new profiles, and relationship arrays are added. The current root, timeline settings, filters, and visibility choices remain intact.
- The web app has its own profile model and does not modify or depend on the mini-program runtime.
- Profiles use the Western `First Last` display order.
- When a source supplies a display name, the app preserves and shows it in preference to reconstructing a name from separate fields. This keeps titles such as “King of England” searchable and visible on the timeline.
- `namePeriods` entries contain a stable period ID, dated name, optional open date boundaries, and direct source URL. One period is explicitly marked as the default lasting identity; it is used outside the person's lifespan and need not be their final chronological title.
- Tree ordering and line weight prioritize paternal descent while retaining maternal relationships with a lighter solid line.
- Timeline labels keep the name and lifespan on one line. They do not display age.
- Personal events are edited in the selected profile drawer, where their dates remain visible. Global events are managed from the header's **Events** dialog and appear as bands behind the full timeline. Event years are not printed over the timeline itself. Both kinds use the same twelve-colour palette and retain their selection in local storage and JSON backups. All `Reign` events share one colour across the tree, red by default; changing any reign selector changes them together.
- Imported marriage events are retained by spouse pair. Family stems align to the recorded marriage year; when no marriage date is available, the renderer uses a position shortly before the first child's birth.
- A personal event whose label begins with `Reign` marks the profile as a reigning monarch. Reigning kings and queens share one event colour; same-century end years are abbreviated (for example, `1509–47`).
- The tree-toolbar filter accepts one or more partial words or arbitrary substrings with OR semantics and searches display names and explicit titles. The current tree root always remains visible, and each result retains its complete line of descent from that root plus any spouse/union needed to explain the relationship. Branches unrelated to a match remain hidden.
- Genealogy services can be represented in provider-neutral stitch JSON or brought in through a GEDCOM export without site-specific browser scraping.
- GitHub Pages has no backend, access token, or client secret. Research happens outside the app, and only the returned JSON is imported.
- Every imported profile retains a source link, and the UI includes the required non-affiliation statement.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the repository root. In the repository settings, select **GitHub Actions** as the Pages source, then push to the default branch.
