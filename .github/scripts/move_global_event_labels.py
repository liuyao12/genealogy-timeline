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
    "import { graphUnionRecords } from './geni-import-core.js?v=2';",
    "import { graphUnionRecords } from './geni-import-core.js?v=2';\nimport { layoutGlobalEventLabels } from './timeline-event-labels.js?v=1';",
)

replace_once(
    'app.js',
    """  const yearWidth = state.timelineYearWidth;
  const rowHeight = state.timelineNodeHeight;
  const rowStep = rowHeight + 6;
  const top = 58;
  const left = 36;""",
    """  const yearWidth = state.timelineYearWidth;
  const rowHeight = state.timelineNodeHeight;
  const rowStep = rowHeight + 6;
  const left = 36;""",
)

replace_once(
    'app.js',
    """  const contentWidth = Math.max(
    900,
    xForYear(maxYear) + 42,
    ...layoutNodes.map(node => node.x + node.occupancyWidth + 48)
  );
  const contentHeight = Math.max(560, top + Math.max(...layoutNodes.map(node => node.y)) + rowHeight + 38);
  const width = contentWidth + TIMELINE_PAN_MARGIN.left + TIMELINE_PAN_MARGIN.right;
  const height = contentHeight + TIMELINE_PAN_MARGIN.top + TIMELINE_PAN_MARGIN.bottom;
  const rulerBaseline = 43;
  const rulerHeight = 60;""",
    """  const contentWidth = Math.max(
    900,
    xForYear(maxYear) + 42,
    ...layoutNodes.map(node => node.x + node.occupancyWidth + 48)
  );
  const globalEventLabelLayout = layoutGlobalEventLabels(state.globalEvents, {
    minYear,
    maxYear,
    xForYear,
    left,
    right: xForYear(maxYear),
    estimateWidth: estimateTextWidth
  });
  const globalEventLabelLaneStep = 22;
  const globalEventLabelAreaHeight = globalEventLabelLayout.laneCount
    ? globalEventLabelLayout.laneCount * globalEventLabelLaneStep + 8
    : 0;
  const rulerCoreOffset = globalEventLabelAreaHeight;
  const rulerBaseline = rulerCoreOffset + 43;
  const rulerHeight = rulerBaseline + 1;
  const top = rulerHeight;
  const contentHeight = Math.max(560, top + Math.max(...layoutNodes.map(node => node.y)) + rowHeight + 38);
  const width = contentWidth + TIMELINE_PAN_MARGIN.left + TIMELINE_PAN_MARGIN.right;
  const height = contentHeight + TIMELINE_PAN_MARGIN.top + TIMELINE_PAN_MARGIN.bottom;""",
)

replace_once(
    'app.js',
    """  ruler.setAttribute('width', width); ruler.setAttribute('height', rulerHeight); ruler.setAttribute('viewBox', `${-TIMELINE_PAN_MARGIN.left} 0 ${width} ${rulerHeight}`);
  ruler.style.transform = `scaleX(${state.zoom})`;
  timelineRulerGeometry = { minYear, maxYear, left, yearWidth, viewBoxX: -TIMELINE_PAN_MARGIN.left, viewBoxWidth: width };""",
    """  ruler.setAttribute('width', width); ruler.setAttribute('height', rulerHeight); ruler.setAttribute('viewBox', `${-TIMELINE_PAN_MARGIN.left} 0 ${width} ${rulerHeight}`);
  ruler.style.height = `${rulerHeight}px`;
  ruler.style.marginBottom = `-${rulerHeight}px`;
  ruler.style.transform = `scaleX(${state.zoom})`;
  timelineRulerGeometry = {
    minYear,
    maxYear,
    left,
    yearWidth,
    viewBoxX: -TIMELINE_PAN_MARGIN.left,
    viewBoxWidth: width,
    contentTop: top,
    rulerBaseline,
    rulerHeight
  };""",
)

replace_once(
    'app.js',
    "y1: isMajor ? 29 : isDecade ? 33 : 36",
    "y1: rulerCoreOffset + (isMajor ? 29 : isDecade ? 33 : 36)",
)
replace_once(
    'app.js',
    "rulerMarks.append(svg('text', { x, y: 22, 'text-anchor': 'middle', class: isMajor ? 'major-label' : 'decade-label' }, String(year)))",
    "rulerMarks.append(svg('text', { x, y: rulerCoreOffset + 22, 'text-anchor': 'middle', class: isMajor ? 'major-label' : 'decade-label' }, String(year)))",
)
replace_once(
    'app.js',
    "rulerMarks.append(svg('line', { x1: currentYearX, y1: 25, x2: currentYearX, y2: rulerBaseline, class: 'year-tick current-year' }));",
    "rulerMarks.append(svg('line', { x1: currentYearX, y1: rulerCoreOffset + 25, x2: currentYearX, y2: rulerBaseline, class: 'year-tick current-year' }));",
)
replace_once(
    'app.js',
    "rulerMarks.append(svg('text', { x: currentYearX, y: 22, 'text-anchor': 'middle', class: 'current-year-label' }, String(currentYear)));",
    "rulerMarks.append(svg('text', { x: currentYearX, y: rulerCoreOffset + 22, 'text-anchor': 'middle', class: 'current-year-label' }, String(currentYear)));",
)
replace_once(
    'app.js',
    "rulerMarks.append(svg('line', { class: 'year-tick as-of-year', x1: historicalX, y1: 7, x2: historicalX, y2: rulerBaseline }));",
    "rulerMarks.append(svg('line', { class: 'year-tick as-of-year', x1: historicalX, y1: rulerCoreOffset + 7, x2: historicalX, y2: rulerBaseline }));",
)
replace_once(
    'app.js',
    "class: 'timeline-as-of-handle', transform: `translate(${historicalX} 0)`, role: 'slider', tabindex: '0',",
    "class: 'timeline-as-of-handle', transform: `translate(${historicalX} ${rulerCoreOffset})`, role: 'slider', tabindex: '0',",
)
replace_once(
    'app.js',
    "rulerPreview.append(svg('line', { class: 'year-tick as-of-year-preview', x1: 0, y1: 7, x2: 0, y2: rulerBaseline }));",
    "rulerPreview.append(svg('line', { class: 'year-tick as-of-year-preview', x1: 0, y1: rulerCoreOffset + 7, x2: 0, y2: rulerBaseline }));",
)
replace_once(
    'app.js',
    "rulerPreview.append(svg('rect', { class: 'as-of-preview-box', x: -42, y: 2, width: 84, height: 18, rx: 4 }));",
    "rulerPreview.append(svg('rect', { class: 'as-of-preview-box', x: -42, y: rulerCoreOffset + 2, width: 84, height: 18, rx: 4 }));",
)
replace_once(
    'app.js',
    "rulerPreview.append(svg('text', { class: 'as-of-preview-label', x: 0, y: 14, 'text-anchor': 'middle' }, 'Set As of'));",
    "rulerPreview.append(svg('text', { class: 'as-of-preview-label', x: 0, y: rulerCoreOffset + 14, 'text-anchor': 'middle' }, 'Set As of'));",
)
replace_once(
    'app.js',
    "rulerPreview.append(svg('path', { class: 'as-of-preview-pointer', d: 'M -5 20 L 5 20 L 0 27 Z' }));",
    "rulerPreview.append(svg('path', { class: 'as-of-preview-pointer', d: `M -5 ${rulerCoreOffset + 20} L 5 ${rulerCoreOffset + 20} L 0 ${rulerCoreOffset + 27} Z` }));",
)

replace_once(
    'app.js',
    """  const globalEvents = svg('g', { class: 'global-events' });
  const stickyGlobalEventLabels = svg('g', { class: 'sticky-global-event-labels' });
  state.globalEvents.forEach(event => {""",
    """  const globalEvents = svg('g', { class: 'global-events' });
  const stickyGlobalEventGuides = svg('g', { class: 'sticky-global-event-guides' });
  const stickyGlobalEventLabels = svg('g', { class: 'sticky-global-event-labels' });
  const globalEventLabelsByIndex = new Map(globalEventLabelLayout.items.map(item => [item.index, item]));
  state.globalEvents.forEach((event, index) => {""",
)

replace_once(
    'app.js',
    "    stickyGlobalEventLabels.append(svg('text', { class: 'global-event-label', x: x + 4, y: 56, fill: color }, event.name));",
    """    const labelGeometry = globalEventLabelsByIndex.get(index);
    if (labelGeometry) {
      const labelY = 2 + labelGeometry.lane * globalEventLabelLaneStep;
      const pointerX = labelGeometry.pointerOffset;
      stickyGlobalEventGuides.append(svg('line', {
        class: 'global-event-label-guide',
        x1: labelGeometry.anchorX,
        y1: labelY + 25,
        x2: labelGeometry.anchorX,
        y2: rulerBaseline,
        stroke: color
      }));
      const label = svg('g', {
        class: 'global-event-label',
        transform: `translate(${labelGeometry.centerX} ${labelY})`
      });
      label.append(svg('title', {}, `${event.name} · ${formatEventYearRange(event.startYear, event.endYear)}`));
      label.append(svg('rect', {
        class: 'global-event-label-box',
        x: -labelGeometry.width / 2,
        y: 0,
        width: labelGeometry.width,
        height: 18,
        rx: 4,
        fill: color
      }));
      label.append(svg('text', {
        class: 'global-event-label-text',
        x: 0,
        y: 12,
        'text-anchor': 'middle'
      }, labelGeometry.displayName));
      label.append(svg('path', {
        class: 'global-event-label-pointer',
        d: `M ${pointerX - 5} 18 L ${pointerX + 5} 18 L ${pointerX} 25 Z`,
        fill: color
      }));
      stickyGlobalEventLabels.append(label);
    }""",
)

replace_once(
    'app.js',
    """  ruler.append(stickyGlobalEventLabels);
  timelineContent.append(globalEvents);""",
    """  rulerMarks.insertBefore(stickyGlobalEventGuides, rulerMarks.querySelector('.year-tick'));
  ruler.append(stickyGlobalEventLabels);
  timelineContent.append(globalEvents);""",
)

replace_once(
    'app.js',
    """    const exportBox = {
      x: timelineBox.x + TIMELINE_PAN_MARGIN.left,
      y: timelineBox.y + TIMELINE_PAN_MARGIN.top,
      width: timelineBox.width - TIMELINE_PAN_MARGIN.left - TIMELINE_PAN_MARGIN.right,
      height: timelineBox.height - TIMELINE_PAN_MARGIN.top - TIMELINE_PAN_MARGIN.bottom
    };""",
    """    const contentTop = Math.max(0, Number(timelineRulerGeometry?.contentTop) || 0);
    const exportBox = {
      x: timelineBox.x + TIMELINE_PAN_MARGIN.left,
      y: timelineBox.y + TIMELINE_PAN_MARGIN.top + contentTop,
      width: timelineBox.width - TIMELINE_PAN_MARGIN.left - TIMELINE_PAN_MARGIN.right,
      height: timelineBox.height - TIMELINE_PAN_MARGIN.top - TIMELINE_PAN_MARGIN.bottom - contentTop
    };""",
)

replace_once(
    'styles.css',
    ".timeline-ruler { position: sticky; top: 0; z-index: 31; display: block; height: 60px; min-width: 100%; margin-bottom: -60px; overflow: visible; cursor: crosshair; pointer-events: auto; transform-origin: 0 0; }",
    ".timeline-ruler { position: sticky; top: 0; z-index: 31; display: block; height: 44px; min-width: 100%; margin-bottom: -44px; overflow: visible; cursor: crosshair; pointer-events: auto; transform-origin: 0 0; }",
)
replace_once(
    'styles.css',
    ".global-event-label { stroke: rgba(255,255,255,.92); stroke-width: 3px; paint-order: stroke fill; font: 8px Georgia, serif; pointer-events: none; }",
    """.sticky-global-event-guides, .sticky-global-event-labels, .global-event-label { pointer-events: none; }
.global-event-label-guide { stroke-width: 1.2; opacity: .32; vector-effect: non-scaling-stroke; }
.global-event-label-box { stroke: rgba(0,0,0,.30); stroke-width: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,.18)); vector-effect: non-scaling-stroke; }
.timeline-grid .global-event-label-text { fill: #fff; stroke: none; font: 700 8px Inter, sans-serif; letter-spacing: .01em; }
.global-event-label-pointer { stroke: none; }""",
)

replace_once('index.html', './styles.css?v=71', './styles.css?v=72')
replace_once('index.html', './app.js?v=128', './app.js?v=129')
