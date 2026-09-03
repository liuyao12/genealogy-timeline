from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "app.js",
    "import { computeDescendantScope } from './descendant-scope.js?v=1';\n",
    "import { computeDescendantScope } from './descendant-scope.js?v=1';\n"
    "import { decadeBands } from './timeline-bands.js?v=1';\n",
)

replace_once(
    "app.js",
    """  timelineRulerGeometry = { minYear, maxYear, left, yearWidth, viewBoxX: -TIMELINE_PAN_MARGIN.left, viewBoxWidth: width };
  const positions = new Map(layoutNodes.map(node => [node.key, { x: node.x, y: top + node.y }]));

  const rulerMarks = svg('g');
  ruler.append(svg('title', {}, 'Hover to preview a year; click to place the As of line'));
  rulerMarks.append(svg('rect', { x: -TIMELINE_PAN_MARGIN.left, y: 0, width, height: rulerHeight, class: 'ruler-band' }));
""",
    """  timelineRulerGeometry = { minYear, maxYear, left, yearWidth, viewBoxX: -TIMELINE_PAN_MARGIN.left, viewBoxWidth: width };
  const positions = new Map(layoutNodes.map(node => [node.key, { x: node.x, y: top + node.y }]));

  // Alternating calendar decades give each lifespan a quiet visual measure of
  // age without adding another grid of hard lines. The fills are translucent,
  // so the canvas texture remains visible and historical event bands retain
  // visual priority. Using year boundaries rather than year-center positions
  // keeps every stripe exactly ten years wide.
  const decadeBackground = svg('g', { class: 'timeline-decade-bands', 'aria-hidden': 'true' });
  const rulerDecadeBackground = svg('g', { class: 'timeline-decade-bands ruler-decade-bands', 'aria-hidden': 'true' });
  const yearBoundaryX = year => xForYear(year) - yearWidth / 2;
  decadeBands(minYear, maxYear).forEach(({ decade, startYear, endYear, tone }) => {
    const bandAttributes = {
      x: yearBoundaryX(startYear),
      width: (endYear - startYear) * yearWidth,
      class: `timeline-decade-band tone-${tone}`,
      'data-decade': decade
    };
    decadeBackground.append(svg('rect', { ...bandAttributes, y: eventTop, height: eventBottom - eventTop }));
    rulerDecadeBackground.append(svg('rect', { ...bandAttributes, y: 0, height: rulerHeight }));
  });
  canvas.append(decadeBackground);

  const rulerMarks = svg('g');
  ruler.append(svg('title', {}, 'Hover to preview a year; click to place the As of line'));
  rulerMarks.append(svg('rect', { x: -TIMELINE_PAN_MARGIN.left, y: 0, width, height: rulerHeight, class: 'ruler-band' }));
  rulerMarks.append(rulerDecadeBackground);
""",
)

replace_once(
    "styles.css",
    ".timeline-grid .ruler-band { fill: rgba(255, 255, 255, .84); stroke: none; }\n",
    """.timeline-decade-bands { pointer-events: none; }
.timeline-decade-band { shape-rendering: crispEdges; }
.timeline-decade-band.tone-0 { fill: #d7e7f0; fill-opacity: .36; }
.timeline-decade-band.tone-1 { fill: #f2e7d7; fill-opacity: .30; }
.ruler-decade-bands .timeline-decade-band { fill-opacity: .42; }
.timeline-grid .ruler-band { fill: rgba(255, 255, 255, .84); stroke: none; }
""",
)

replace_once("index.html", "./styles.css?v=63", "./styles.css?v=64")
replace_once("index.html", "./app.js?v=116", "./app.js?v=117")
