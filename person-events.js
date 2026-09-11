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
  if (birthYear == null || startYear == null || startYear < birthYear) return '—';
  // A ranged event belongs in the chronology at its beginning. The duration
  // remains in the event column rather than turning the age cell into a range.
  return String(startYear - birthYear);
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

function relationshipEndState(person, partner, startYear, currentYear) {
  const partnerId = clean(partner?.id);
  const personId = clean(person?.id);
  const explicitEndYear = numericYear(
    person?.relationshipEndYears?.[partnerId]
      ?? partner?.relationshipEndYears?.[personId]
  );
  const status = relationshipStatus(person, partner);
  if (explicitEndYear != null && explicitEndYear >= startYear) {
    return { endYear: explicitEndYear, reason: status || 'ended', ongoing: false, currentYear };
  }
  // A known divorce or annulment without a year must not be silently replaced
  // by a later death date. Keep the reason and say that the end year is unknown.
  if (status) return { endYear: null, reason: status, ongoing: false, currentYear };

  const personDeathYear = numericYear(person?.deathYear);
  const partnerDeathYear = numericYear(partner?.deathYear);
  if (partnerDeathYear != null
    && partnerDeathYear >= startYear
    && (personDeathYear == null || partnerDeathYear < personDeathYear)) {
    return { endYear: partnerDeathYear, reason: 'partner-died', ongoing: false, currentYear };
  }
  if (personDeathYear != null && personDeathYear >= startYear) {
    return { endYear: personDeathYear, reason: 'person-died', ongoing: false, currentYear };
  }
  const ongoing = person?.isLiving === true && partner?.isLiving === true;
  return { endYear: null, reason: ongoing ? 'ongoing' : '', ongoing, currentYear };
}

function relationshipEndNote(reason, formal) {
  if (reason === 'annulled') return 'annulled';
  if (reason === 'divorced') return 'divorced';
  if (reason === 'ended') return formal ? 'marriage ended' : 'relationship ended';
  if (reason === 'partner-died') return formal ? 'spouse died' : 'partner died';
  if (reason === 'ongoing') return 'ongoing';
  // When the selected person dies first, the lifespan already supplies that
  // endpoint; no redundant “person died” note is needed in the marriage row.
  return '';
}

function relationshipDurationDetail(startYear, endState, formal) {
  const note = relationshipEndNote(endState.reason, formal);
  const effectiveEndYear = endState.endYear
    ?? (endState.ongoing ? numericYear(endState.currentYear) : null);
  if (effectiveEndYear == null) return note ? `${note} · end year unknown` : '';
  const elapsedYears = Math.max(0, effectiveEndYear - startYear);
  const duration = elapsedYears === 0
    ? 'under 1 year'
    : `${elapsedYears} year${elapsedYears === 1 ? '' : 's'}`;
  return [duration, note].filter(Boolean).join(' · ');
}

export function buildPersonTimelineEvents(person, people = {}, options = {}) {
  if (!person) return [];
  const nameAtYear = options.nameAtYear;
  const currentYear = numericYear(options.currentYear) ?? new Date().getFullYear();
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
    const relationshipYear = numericYear(
      person.marriageYears?.[partnerId] ?? partner.marriageYears?.[personId]
    );
    // A divorce whose marriage year is unknown cannot be placed honestly in a
    // beginning-year chronology, so it is not promoted to a standalone row.
    if (relationshipYear == null) return;

    const partnerName = relativeName(partner, relationshipYear, nameAtYear);
    const endState = relationshipEndState(person, partner, relationshipYear, currentYear);
    events.push({
      key: formal ? marriageEventKey(partnerId) : relationshipEventKey(partnerId),
      kind: formal ? 'marriage' : 'relationship',
      label: partnerName,
      startYear: relationshipYear,
      endYear: endState.endYear ?? relationshipYear,
      ongoing: endState.ongoing,
      endReason: endState.reason,
      relationshipEndYear: endState.endYear,
      detail: relationshipDurationDetail(relationshipYear, endState, formal),
      relativeId: partnerId,
      source: 'family',
      editable: false
    });
  });

  // Keep every dated child as its own chronological row. The bullet and
  // circular branch control already identify this as the child’s birth year.
  // normalization makes this list reciprocal, so no whole-tree scan is needed.
  const childIds = unique(values(person.children));
  childIds.forEach(childId => {
    const child = people[childId];
    const birthYear = numericYear(child?.birthYear);
    if (!child || birthYear == null) return;
    events.push({
      key: childBirthEventKey(childId),
      kind: 'child-birth',
      label: relativeName(child, birthYear, nameAtYear),
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
    ['marriage', 0], ['relationship', 0], ['child-birth', 1], ['personal', 2]
  ]);
  return [...new Map(events.map(event => [event.key, event])).values()]
    .sort((first, second) =>
      first.startYear - second.startYear
      || (kindOrder.get(first.kind) ?? 9) - (kindOrder.get(second.kind) ?? 9)
      || first.label.localeCompare(second.label)
    );
}

// Calendar facts belong below the name. Do not confuse a same-year ending
// with the fallback endYear used to position an undated relationship endpoint.
export function personEventSecondLine(event) {
  const startYear = numericYear(event?.startYear);
  if (startYear == null) return '';
  if (event.kind === 'child-birth') return `born ${startYear}`;
  if (event.kind === 'marriage' || event.kind === 'relationship') {
    const begins = `${event.kind === 'marriage' ? 'married' : 'partnered'} ${startYear}`;
    if (event.ongoing) return `${begins}; ongoing`;
    const endYear = numericYear(event.relationshipEndYear);
    const ending = {
      divorced: 'divorced', annulled: 'annulled', ended: 'ended',
      'partner-died': event.kind === 'marriage' ? 'spouse died' : 'partner died',
      'person-died': 'died'
    }[event.endReason];
    if (!ending) return begins;
    return `${begins}; ${ending} ${endYear ?? '(year unknown)'}`;
  }
  const endYear = numericYear(event.endYear);
  if (event.ongoing) return `${startYear}–present`;
  if (endYear == null || endYear === startYear) return String(startYear);
  const years = endYear - startYear;
  return `${startYear}–${endYear} · ${years} year${years === 1 ? '' : 's'}`;
}
