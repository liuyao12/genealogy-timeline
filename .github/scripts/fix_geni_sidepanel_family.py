from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new), encoding='utf-8')


replace_once(
    'app.js',
    "import { computeDescendantScope } from './descendant-scope.js?v=1';\nimport { asOfMaskSegments, decadeBandRects } from './timeline-bands.js?v=2';",
    "import { computeDescendantScope } from './descendant-scope.js?v=1';\nimport { asOfMaskSegments, decadeBandRects } from './timeline-bands.js?v=2';\nimport { graphUnionRecords } from './geni-import-core.js?v=2';",
)

replace_once(
    'app.js',
    "  nodeRecords.filter(node => clean(node.id).startsWith('union-')).forEach(union => {\n    const partners = uniqueRefs(union.partners || union.partner_ids || union.profiles).map(id => aliases[id] || canonicalGeniProfileId(id)).filter(id => profileMap[id]);\n    const children = uniqueRefs(union.children || union.child_ids).map(id => aliases[id] || canonicalGeniProfileId(id)).filter(id => profileMap[id]);",
    "  // Geni's real immediate-family graph represents union membership in\n  // union.edges. Reuse the same edge-aware parser as the full descendant\n  // importer so newly fetched spouses and children are linked immediately.\n  graphUnionRecords({ nodes }).forEach(union => {\n    const partners = uniqueRefs(union.partners || union.partner_ids || union.profiles).map(id => aliases[id] || canonicalGeniProfileId(id)).filter(id => profileMap[id]);\n    const children = uniqueRefs(union.children || union.child_ids).map(id => aliases[id] || canonicalGeniProfileId(id)).filter(id => profileMap[id]);",
)

replace_once(
    'app.js',
    "  graphNodes[rawFocusId] = { ...focusRaw, id: rawFocusId };",
    "  graphNodes[rawFocusId] = {\n    ...(graphNodes[rawFocusId] || {}),\n    ...focusRaw,\n    id: rawFocusId,\n    edges: graphNodes[rawFocusId]?.edges || focusRaw?.edges || {}\n  };",
)

replace_once('index.html', './app.js?v=126', './app.js?v=127')
