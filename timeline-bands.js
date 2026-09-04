function decadeTone(decadeStart) {
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
