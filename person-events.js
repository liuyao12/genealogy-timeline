function clean(value) {
  return value == null ? '' : String(value).trim();
}

function numericYear(value) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function values(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function stableToken(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function personalEventId(event) {
  const explicit = clean(event?.id);
  if (explicit) return explicit;
  const name = clean(event?.name || event?.title || event?.label).toLocaleLowerCase();
  const startYear = numericYear(event?.startYear ?? event?.start_year ?? event?.year);
  const endYear = numericYear(event?.endYear ?? event?.end_year ?? event?.year) ?? startYear;
  return `event-${stableToken(`${name}|${startYear ?? 'unknown'}|${endYear ?? 'unknown'}`)}`;
}

export function personalEventKey(event) {
  return `personal:${personalEventId(event)}`;
}

export function marriageEventKey(partnerId) {
  return `marriage:${clean(partnerId)}`;
}

export function relationshipEventKey(partnerId) {
  return `relationship:${clean(partnerId)}`;
}

export function childBirthEventKey(childId) {
  return `child-birth:${clean(childId)}`;
}

export function relationshipEndEventKey(partnerId) {
  return `relationship-end:${clean(partnerId)}`;
}

export function normalizePersonEventVisibility(rawVisibility) {
  if (!rawVisibility || typeof rawVisibility !== 'object' || Array.isArray(rawVisibility)) return {};
  return Object.fromEntries(
    Object.entries(rawVisibility)
      .map(([key, shown]) => [clean(key), shown])
      .filter(([key, shown]) => key && typeof shown === 'boolean')
  );
}

export function personEventIsVisible(person, key) {
  return person?.eventVisibility?.[clean(key)] !== false;
}

export function setPersonEventVisibility(person, key, shown) {
  if (!person || !clean(key)) return {};
  person.eventVisibility = normalizePersonEventVisibility(person.eventVisibility);
  if (shown) delete person.eventVisibility[clean(key)];
  else person.eventVisibility[clean(key)] = false;
  return person.eventVisibility;
}

const PROFILE_EVENT_KINDS = new Set([
  'marriage', 'relationship', 'child-birth', 'relationship-end'
]);

export function remapPersonEventKey(key, resolveProfileId) {
  const normalized = clean(key);
  const separator = normalized.indexOf(':');
  if (separator < 0) return normalized;
  const kind = normalized.slice(0, separator);
  const profileId = normalized.slice(separator + 1);
  if (!PROFILE_EVENT_KINDS.has(kind) || !profileId) return normalized;
  const resolved = clean(resolveProfileId?.(profileId)) || profileId;
  return `${kind}:${resolved}`;
}

export function remapPersonEventVisibility(rawVisibility, resolveProfileId) {
  const remapped = {};
  Object.entries(normalizePersonEventVisibility(rawVisibility)).forEach(([key, shown]) => {
    const nextKey = remapPersonEventKey(key, resolveProfileId);
    remapped[nextKey] = Object.hasOwn(remapped, nextKey) ? remapped[nextKey] && shown : shown;
  });
  return remapped;
}

export function personEventReferencesProfile(key, profileId) {
  const normalized = clean(key);
  const target = clean(profileId);
  const separator = normalized.indexOf(':');
  return separator >= 0
    && PROFILE_EVENT_KINDS.has(normalized.slice(0, separator))
    && normalized.slice(separator + 1) === target;
}

export function personEventAgeLabel(person, event) {
  const birthYear = numericYear(person?.birthYear);
  const startYear = numericYear(event?.startYear);
  const endYear = numericYear(event?.endYear) ?? startYear;
  if (birthYear == null || startYear == null || startYear < birthYear) return '—';
  const startAge = startYear - birthYear;
  const endAge = Math.max(startAge, (endYear ?? startYear) - birthYear);
  return endAge === startAge ? String(startAge) : `${startAge}–${endAge}`;
}

function relativeName(relative, year, nameAtYear) {
  if (!relative) return 'Unknown profile';
  const historical = typeof nameAtYear === 'function' ? clean(nameAtYear(relative, year)) : '';
  return historical || clean(relative.displayName) || [relative.firstName, relative.lastName].filter(Boolean).join(' ') || 'Unnamed profile';
}

function relationshipStatus(person, partner) {
  const partnerId = clean(partner?.id);
  const personId = clean(person?.id);
  const explicit = clean(
    person?.relationshipEndStatuses?.[partnerId]
      || partner?.relationshipEndStatuses?.[personId]
  ).toLowerCase();
  if (['annulled', 'divorced', 'ended'].includes(explicit)) return explicit;
  const markedEnded = values(person?.divorcedSpouses).includes(partnerId)
    || values(partner?.divorcedSpouses).includes(personId);
  return markedEnded ? 'divorced' : '';
}

function relationshipEndLabel(status, partnerName, formal) {
  if (status === 'annulled') return `Marriage to ${partnerName} annulled`;
  if (status === 'divorced') return `Divorced from ${partnerName}`;
  return `${formal ? 'Marriage to' : 'Relationship with'} ${partnerName} ended`;
}

export function buildPersonTimelineEvents(person, people = {}, options = {}) {
  if (!person) return [];
  const nameAtYear = options.nameAtYear;
  const events = [];
  const personId = clean(person.id);
  const partnerIds = unique([
    ...values(person.spouses),
    ...values(person.partners),
    ...Object.keys(person.marriageYears || {}),
    ...Object.keys(person.relationshipEndYears || {}),
    ...Object.keys(person.relationshipEndStatuses || {})
  ]);

  partnerIds.forEach(partnerId => {
    const partner = people[partnerId];
    if (!partner) return;
    const formal = values(person.spouses).includes(partnerId)
      || values(partner.spouses).includes(personId)
      || Object.hasOwn(person.marriageYears || {}, partnerId)
      || Object.hasOwn(partner.marriageYears || {}, personId);
    const marriageYear = numericYear(
      person.marriageYears?.[partnerId] ?? partner.marriageYears?.[personId]
    );
    if (marriageYear != null) {
      const partnerName = relativeName(partner, marriageYear, nameAtYear);
      events.push({
        key: formal ? marriageEventKey(partnerId) : relationshipEventKey(partnerId),
        kind: formal ? 'marriage' : 'relationship',
        label: formal ? `Married ${partnerName}` : `Relationship with ${partnerName}`,
        startYear: marriageYear,
        endYear: marriageYear,
        relativeId: partnerId,
        source: 'family',
        editable: false
      });
    }

    const endYear = numericYear(
      person.relationshipEndYears?.[partnerId] ?? partner.relationshipEndYears?.[personId]
    );
    const status = relationshipStatus(person, partner);
    if (endYear != null && status) {
      const partnerName = relativeName(partner, endYear, nameAtYear);
      events.push({
        key: relationshipEndEventKey(partnerId),
        kind: 'relationship-end',
        status,
        label: relationshipEndLabel(status, partnerName, formal),
        startYear: endYear,
        endYear,
        relativeId: partnerId,
        source: 'family',
        editable: false
      });
    }
  });

  // Family normalization keeps this relationship reciprocal. Reading the
  // selected person's child list avoids scanning the entire tree once per
  // visible timeline occurrence.
  const childIds = unique(values(person.children));
  childIds.forEach(childId => {
    const child = people[childId];
    const birthYear = numericYear(child?.birthYear);
    if (!child || birthYear == null) return;
    events.push({
      key: childBirthEventKey(childId),
      kind: 'child-birth',
      label: `Birth of ${relativeName(child, birthYear, nameAtYear)}`,
      startYear: birthYear,
      endYear: birthYear,
      relativeId: childId,
      source: 'family',
      editable: false
    });
  });

  (Array.isArray(person.personalEvents) ? person.personalEvents : []).forEach((event, personalIndex) => {
    const startYear = numericYear(event?.startYear);
    if (!clean(event?.name) || startYear == null) return;
    const endYear = numericYear(event?.endYear) ?? startYear;
    const eventId = personalEventId(event);
    events.push({
      key: personalEventKey({ ...event, id: eventId }),
      kind: 'personal',
      label: clean(event.name),
      startYear,
      endYear,
      source: clean(event.source) || 'personal',
      color: clean(event.color),
      eventId,
      personalIndex,
      editable: true,
      sourceEvent: event
    });
  });

  const kindOrder = new Map([
    ['marriage', 0], ['relationship', 0], ['child-birth', 1],
    ['personal', 2], ['relationship-end', 3]
  ]);
  return [...new Map(events.map(event => [event.key, event])).values()]
    .sort((first, second) =>
      first.startYear - second.startYear
      || (kindOrder.get(first.kind) ?? 9) - (kindOrder.get(second.kind) ?? 9)
      || first.label.localeCompare(second.label)
    );
}
