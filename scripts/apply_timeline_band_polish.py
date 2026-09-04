from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} occurrence, found {count}")
    return text.replace(old, new, 1)


app_path = Path("app.js")
app = app_path.read_text(encoding="utf-8")
app = replace_once(
    app,
    "import { decadeBands } from './timeline-bands.js?v=1';",
    "import { asOfMaskSegments, decadeBandRects } from './timeline-bands.js?v=2';",
    "timeline-band import",
)

band_pattern = re.compile(
    r"  // Alternating calendar decades give each lifespan a quiet visual measure of\n"
    r".*?"
    r"  canvas\.append\(decadeBackground\);\n",
    re.S,
)
band_replacement = """  // Alternating calendar decades give each lifespan a quiet visual measure of
  // age without adding another grid of hard lines. Each band begins at the
  // exact x-coordinate of its zero-ending year tick, rather than half a year
  // before it. The background remains outside the historical-content mask.
  const decadeBackground = svg('g', { class: 'timeline-decade-bands', 'aria-hidden': 'true' });
  const rulerDecadeBackground = svg('g', { class: 'timeline-decade-bands ruler-decade-bands', 'aria-hidden': 'true' });
  decadeBandRects(minYear, maxYear, { yearWidth, xForYear }).forEach(({ decade, x, width: bandWidth, tone }) => {
    const bandAttributes = {
      x,
      width: bandWidth,
      class: `timeline-decade-band tone-${tone}`,
      'data-decade': decade
    };
    decadeBackground.append(svg('rect', { ...bandAttributes, y: eventTop, height: eventBottom - eventTop }));
    rulerDecadeBackground.append(svg('rect', { ...bandAttributes, y: 0, height: rulerHeight }));
  });

  // Dim future timeline content, not the calendar paper beneath it. A mask
  // reproduces the old 32% future-content visibility while leaving both
  // decade hues unchanged to the right of the As-of line.
  const timelineContent = svg('g', { class: 'timeline-content' });
  if (historicalYear != null) {
    const maskId = 'timeline-as-of-content-mask';
    const maskDefinitions = svg('defs');
    const mask = svg('mask', {
      id: maskId,
      x: -TIMELINE_PAN_MARGIN.left,
      y: eventTop,
      width,
      height: eventBottom - eventTop,
      maskUnits: 'userSpaceOnUse',
      maskContentUnits: 'userSpaceOnUse',
      style: 'mask-type: alpha'
    });
    asOfMaskSegments(-TIMELINE_PAN_MARGIN.left, width, xForYear(historicalYear)).forEach(segment => {
      mask.append(svg('rect', {
        x: segment.x,
        y: eventTop,
        width: segment.width,
        height: eventBottom - eventTop,
        fill: '#fff',
        'fill-opacity': segment.opacity
      }));
    });
    maskDefinitions.append(mask);
    canvas.append(maskDefinitions);
    timelineContent.setAttribute('mask', `url(#${maskId})`);
  }
  canvas.append(decadeBackground, timelineContent);
"""
app, substitutions = band_pattern.subn(band_replacement, app, count=1)
if substitutions != 1:
    raise RuntimeError(f"Expected one decade background block, replaced {substitutions}")

old_tick = "rulerMarks.append(svg('line', { x1: x, y1: isMajor ? 29 : isDecade ? 33 : 36, x2: x, y2: rulerBaseline, class: `year-tick ${isMajor ? 'major' : isDecade ? 'decade' : 'minor'}` }));"
new_tick = "rulerMarks.append(svg('line', { x1: x, y1: isMajor ? 29 : isDecade ? 33 : 36, x2: x, y2: rulerBaseline, class: `year-tick ${isMajor ? 'major' : isDecade ? 'decade' : 'minor'}`, 'data-year': year }));"
app = replace_once(app, old_tick, new_tick, "ruler tick")

app = replace_once(app, "  canvas.append(globalEvents);", "  timelineContent.append(globalEvents);", "global-event append")
app = replace_once(
    app,
    "  canvas.append(svg('line', { class: 'timeline-current-year-line', x1: currentYearX, y1: eventTop, x2: currentYearX, y2: eventBottom, 'aria-label': `Current year ${currentYear}` }));",
    "  timelineContent.append(svg('line', { class: 'timeline-current-year-line', x1: currentYearX, y1: eventTop, x2: currentYearX, y2: eventBottom, 'aria-label': `Current year ${currentYear}` }));",
    "current-year append",
)
app = replace_once(app, "  canvas.append(connectors);", "  timelineContent.append(connectors);", "connector append")
app = replace_once(app, "    canvas.append(group);", "    timelineContent.append(group);", "timeline-node append")

dim_pattern = re.compile(
    r"\n    snapshotLayer\.append\(svg\('rect', \{ class: 'timeline-as-of-dim', x: historicalX, y: eventTop, width: Math\.max\(0, xForYear\(maxYear\) - historicalX \+ TIMELINE_PAN_MARGIN\.right\), height: eventBottom - eventTop \}\)\);"
)
app, dim_substitutions = dim_pattern.subn("", app, count=1)
if dim_substitutions != 1:
    raise RuntimeError(f"Expected one historical dim rectangle, removed {dim_substitutions}")

app_path.write_text(app, encoding="utf-8")

Path("timeline-bands.js").write_text("""function decadeTone(decadeStart) {
  const index = Math.floor(decadeStart / 10);
  return ((index % 2) + 2) % 2;
}

/**
 * Return clipped ten-year intervals covering [minYear, maxYear).
 * Tone alternates on absolute calendar-decade boundaries, so rerendering a
 * narrower or wider timeline never changes the colour assigned to a decade.
 */
export function decadeBands(minYear, maxYear) {
  const minimum = Number(minYear);
  const maximum = Number(maxYear);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return [];

  const firstDecade = Math.floor(minimum / 10) * 10;
  const lastDecade = Math.ceil(maximum / 10) * 10;
  const bands = [];
  for (let decade = firstDecade; decade < lastDecade; decade += 10) {
    const startYear = Math.max(minimum, decade);
    const endYear = Math.min(maximum, decade + 10);
    if (endYear <= startYear) continue;
    bands.push({ decade, startYear, endYear, tone: decadeTone(decade) });
  }
  return bands;
}

/**
 * Convert calendar-decade intervals into SVG rectangles. xForYear is the same
 * mapping used by ruler ticks, so a colour change at 1500 is exactly coincident
 * with the 1500 line—not at the boundary between the 1499 and 1500 cells.
 */
export function decadeBandRects(minYear, maxYear, { yearWidth, xForYear } = {}) {
  const pixelsPerYear = Number(yearWidth);
  if (!Number.isFinite(pixelsPerYear) || pixelsPerYear <= 0 || typeof xForYear !== 'function') return [];
  return decadeBands(minYear, maxYear).map(band => ({
    ...band,
    x: Number(xForYear(band.startYear)),
    width: (band.endYear - band.startYear) * pixelsPerYear
  })).filter(rect => Number.isFinite(rect.x) && rect.width > 0);
}

/**
 * Split a view box into fully visible history and faded future content. These
 * segments are used in an SVG alpha mask; the decade background is deliberately
 * outside that mask and therefore keeps its colour on both sides of the line.
 */
export function asOfMaskSegments(viewBoxX, viewBoxWidth, historicalX, futureOpacity = 0.32) {
  const start = Number(viewBoxX);
  const width = Number(viewBoxWidth);
  const marker = Number(historicalX);
  if (![start, width, marker].every(Number.isFinite) || width <= 0) return [];
  const end = start + width;
  const cut = Math.max(start, Math.min(end, marker));
  const fadedOpacity = Math.max(0, Math.min(1, Number(futureOpacity)));
  const segments = [];
  if (cut > start) segments.push({ x: start, width: cut - start, opacity: 1 });
  if (end > cut) segments.push({ x: cut, width: end - cut, opacity: Number.isFinite(fadedOpacity) ? fadedOpacity : 0.32 });
  return segments;
}
""", encoding="utf-8")

Path("tests/timeline-bands.test.mjs").write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { asOfMaskSegments, decadeBandRects, decadeBands } from '../timeline-bands.js';

test('creates alternating bands on fixed calendar decades', () => {
  assert.deepEqual(decadeBands(1420, 1460), [
    { decade: 1420, startYear: 1420, endYear: 1430, tone: 0 },
    { decade: 1430, startYear: 1430, endYear: 1440, tone: 1 },
    { decade: 1440, startYear: 1440, endYear: 1450, tone: 0 },
    { decade: 1450, startYear: 1450, endYear: 1460, tone: 1 }
  ]);
});

test('clips partial first and last decades without shifting their tones', () => {
  assert.deepEqual(decadeBands(1457, 1472), [
    { decade: 1450, startYear: 1457, endYear: 1460, tone: 1 },
    { decade: 1460, startYear: 1460, endYear: 1470, tone: 0 },
    { decade: 1470, startYear: 1470, endYear: 1472, tone: 1 }
  ]);
});

test('handles BCE decades and empty ranges', () => {
  assert.deepEqual(decadeBands(-15, 5), [
    { decade: -20, startYear: -15, endYear: -10, tone: 0 },
    { decade: -10, startYear: -10, endYear: 0, tone: 1 },
    { decade: 0, startYear: 0, endYear: 5, tone: 0 }
  ]);
  assert.deepEqual(decadeBands(1500, 1500), []);
  assert.deepEqual(decadeBands('not-a-year', 1500), []);
});

test('places every colour transition exactly on the matching zero-year tick', () => {
  const yearWidth = 4;
  const xForYear = year => 36 + (year - 1480 + 0.5) * yearWidth;
  const rects = decadeBandRects(1480, 1520, { yearWidth, xForYear });
  const band1490 = rects.find(rect => rect.decade === 1490);
  const band1500 = rects.find(rect => rect.decade === 1500);
  assert.equal(band1500.x, xForYear(1500));
  assert.equal(band1490.x + band1490.width, xForYear(1500));
  assert.notEqual(band1500.x, xForYear(1500) - yearWidth / 2);
});

test('dims only future content with non-overlapping alpha-mask segments', () => {
  assert.deepEqual(asOfMaskSegments(-220, 1000, 350), [
    { x: -220, width: 570, opacity: 1 },
    { x: 350, width: 430, opacity: 0.32 }
  ]);
  assert.deepEqual(asOfMaskSegments(0, 100, -20), [{ x: 0, width: 100, opacity: 0.32 }]);
  assert.deepEqual(asOfMaskSegments(0, 100, 120), [{ x: 0, width: 100, opacity: 1 }]);
  assert.deepEqual(asOfMaskSegments(0, 0, 50), []);
});
""", encoding="utf-8")

styles_path = Path("styles.css")
styles = styles_path.read_text(encoding="utf-8")
styles = replace_once(
    styles,
    ".timeline-decade-band.tone-0 { fill: #d7e7f0; fill-opacity: .36; }\n.timeline-decade-band.tone-1 { fill: #f2e7d7; fill-opacity: .30; }\n.ruler-decade-bands .timeline-decade-band { fill-opacity: .42; }",
    ".timeline-decade-band.tone-0 { fill: #e3e9dc; fill-opacity: .42; }\n.timeline-decade-band.tone-1 { fill: #f2e8dc; fill-opacity: .36; }\n.ruler-decade-bands .timeline-decade-band { fill-opacity: .46; }",
    "decade palette",
)
styles = replace_once(
    styles,
    ".timeline-as-of-layer, .timeline-as-of-dim, .timeline-as-of-line { pointer-events: none; }\n.timeline-as-of-dim { fill: #fff; fill-opacity: .68; }",
    ".timeline-as-of-layer, .timeline-as-of-line { pointer-events: none; }",
    "historical dim CSS",
)
styles_path.write_text(styles, encoding="utf-8")

index_path = Path("index.html")
index = index_path.read_text(encoding="utf-8")
index = replace_once(index, "./styles.css?v=64", "./styles.css?v=65", "stylesheet cache key")
index = replace_once(index, "./app.js?v=118", "./app.js?v=119", "application cache key")
index_path.write_text(index, encoding="utf-8")
