function clean(value) {
  return value == null ? '' : String(value).trim();
}

const BRITISH_REALM_PATTERN = /\b(?:England|English|Scotland|Scottish|Scots|Great Britain|United Kingdom|British|Ireland|Irish)\b/i;
const MONARCH_TITLE_PATTERN = /\b(?:king|queen|monarch|emperor|empress|reign|sovereign)\b/i;

function textValues(value, seen = new Set()) {
  if (value == null) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap(item => textValues(item, seen));
  return Object.entries(value).flatMap(([key, item]) => [key, ...textValues(item, seen)]);
}

/**
 * Classify a profile that is already known to carry a reign event.
 *
 * Geni frequently labels the event itself only as "Reign", so the realm must
 * be inferred from the profile title/name rather than from the event text.
 * Unrecognized profiles default to `other`; that is safer than painting an
 * unidentified foreign monarch with the British red palette.
 */
export function monarchGroupFromProfile(profile = {}) {
  const primaryText = [
    profile.display_name,
    profile.displayName,
    typeof profile.name === 'string' ? profile.name : '',
    profile.title,
    profile.display_title,
    profile.occupation,
    ...(Array.isArray(profile.namePeriods) ? profile.namePeriods.map(period => period?.name) : [])
  ].map(clean).filter(Boolean).join(' ');

  if (BRITISH_REALM_PATTERN.test(primaryText)) return 'british';

  const supportingText = textValues([
    profile.detail_strings,
    profile.details,
    profile.custom_fields,
    profile.custom_facts
  ]).join(' ');
  if (BRITISH_REALM_PATTERN.test(supportingText) && MONARCH_TITLE_PATTERN.test(supportingText)) {
    return 'british';
  }
  return 'other';
}
