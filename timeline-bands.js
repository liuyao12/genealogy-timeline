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
