function finiteYear(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function estimateEventLabelWidth(text) {
  return Array.from(String(text || '')).reduce(
    (sum, character) => sum + (/[^\x00-\x7F]/.test(character) ? 11 : 6),
    0
  );
}

export function fitEventLabelText(text, maximumWidth, estimateWidth = estimateEventLabelWidth) {
  const value = String(text || '').trim();
  if (!value || estimateWidth(value) <= maximumWidth) return value;
  const characters = Array.from(value);
  while (characters.length > 1 && estimateWidth(`${characters.join('')}…`) > maximumWidth) {
    characters.pop();
  }
  return `${characters.join('')}…`;
}

export function layoutGlobalEventLabels(events, {
  minYear,
  maxYear,
  xForYear,
  left,
  right,
  estimateWidth = estimateEventLabelWidth,
  horizontalPadding = 9,
  minimumWidth = 38,
  maximumWidth = 240,
  labelGap = 6,
  pointerInset = 7
} = {}) {
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear) || typeof xForYear !== 'function') {
    return { items: [], laneCount: 0 };
  }
  const boundsLeft = Number.isFinite(left) ? left : xForYear(minYear);
  const boundsRight = Number.isFinite(right) ? right : xForYear(maxYear);
  const availableWidth = Math.max(1, boundsRight - boundsLeft);
  const items = [];

  (Array.isArray(events) ? events : []).forEach((event, index) => {
    const name = String(event?.name || '').trim();
    const rawStartYear = finiteYear(event?.startYear);
    const rawEndYear = finiteYear(event?.endYear) ?? rawStartYear;
    if (!name || rawStartYear == null || rawEndYear < minYear || rawStartYear > maxYear) return;

    const startYear = Math.max(minYear, rawStartYear);
    const endYear = Math.min(maxYear, Math.max(rawStartYear, rawEndYear));
    const anchorX = xForYear(startYear);
    const desiredWidth = Math.max(minimumWidth, estimateWidth(name) + horizontalPadding * 2);
    const width = Math.min(desiredWidth, maximumWidth, availableWidth);
    const halfWidth = width / 2;
    const centerX = Math.max(boundsLeft + halfWidth, Math.min(boundsRight - halfWidth, anchorX));
    const pointerLimit = Math.max(0, halfWidth - pointerInset);
    const pointerOffset = Math.max(-pointerLimit, Math.min(pointerLimit, anchorX - centerX));
    const displayName = fitEventLabelText(name, Math.max(1, width - horizontalPadding * 2), estimateWidth);

    items.push({
      index,
      name,
      displayName,
      startYear,
      endYear,
      anchorX,
      centerX,
      pointerOffset,
      width,
      left: centerX - halfWidth,
      right: centerX + halfWidth,
      lane: 0
    });
  });

  items.sort((first, second) => first.left - second.left || first.anchorX - second.anchorX || first.index - second.index);
  const laneRightEdges = [];
  for (const item of items) {
    let lane = laneRightEdges.findIndex(rightEdge => item.left >= rightEdge + labelGap);
    if (lane < 0) {
      lane = laneRightEdges.length;
      laneRightEdges.push(item.right);
    } else {
      laneRightEdges[lane] = item.right;
    }
    item.lane = lane;
  }

  return { items, laneCount: laneRightEdges.length };
}
