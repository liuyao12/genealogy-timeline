const SOVEREIGN_UNITED_KINGDOM_PATTERN = /\b((?:King|Queen)(?:\s+consort)?)\s+of\s+(?:the\s+)?United Kingdom(?:\s+of\s+Great Britain\s+and\s+(?:Ireland|Northern Ireland))?/gi;

function numericYear(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Use a compact geographical display style for British sovereign and consort
 * titles. This deliberately changes only "King/Queen [consort] of the United
 * Kingdom" phrases; conventional styles such as "Princess Alice of the United
 * Kingdom" remain untouched.
 *
 * The bundled timeline uses Great Britain and Ireland through 1926, and Great
 * Britain and Northern Ireland from 1927 onward. This is a concise display
 * convention rather than a verbatim reproduction of every statutory royal
 * style, which can also enumerate dominions, realms, and imperial titles.
 */
export function normalizeBritishRoyalPlaceName(value, referenceYear = null) {
  const text = value == null ? '' : String(value);
  const year = numericYear(referenceYear);
  if (!text || year == null || !SOVEREIGN_UNITED_KINGDOM_PATTERN.test(text)) {
    SOVEREIGN_UNITED_KINGDOM_PATTERN.lastIndex = 0;
    return text;
  }
  SOVEREIGN_UNITED_KINGDOM_PATTERN.lastIndex = 0;
  const places = year >= 1927
    ? 'Great Britain and Northern Ireland'
    : 'Great Britain and Ireland';
  return text.replace(SOVEREIGN_UNITED_KINGDOM_PATTERN, (_match, rank) => `${rank} of ${places}`);
}
