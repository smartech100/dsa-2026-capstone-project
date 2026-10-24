import { assertValid } from './errors.js';
import { mergeSort } from './sorting.js';
import { parseIsoDate, DAY_MS } from './dates.js';

/**
 * Pure functions: summaries in, NEW array out. Inputs are never changed.
 * A summary looks like:
 *   { id, title, city, venue, date, cheapestPriceCents|null, seatsLeft }
 */

export const SORT_OPTIONS = Object.freeze(['date', 'price', 'availability']);

const isProvided = (value) => value !== undefined && value !== null && value !== '';

function compareText(a, b) {
  const x = String(a ?? '').toLowerCase();
  const y = String(b ?? '').toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function filterEvents(summaries, criteria = {}) {
  assertValid(Array.isArray(summaries), 'summaries must be an array');
  assertValid(criteria !== null && typeof criteria === 'object', 'criteria must be an object');
  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;

  // Validate everything first, so bad input fails even for an empty list.
  if (isProvided(q)) assertValid(typeof q === 'string', 'q must be text');
  if (isProvided(city)) assertValid(typeof city === 'string', 'city must be text');
  if (isProvided(maxPriceCents)) {
    assertValid(Number.isSafeInteger(maxPriceCents) && maxPriceCents >= 0,
      'maxPriceCents must be a non-negative whole number of bututs');
  }
  if (isProvided(onlyAvailable)) assertValid(typeof onlyAvailable === 'boolean', 'onlyAvailable must be true or false');

  const fromMs = isProvided(from) ? parseIsoDate(from, 'from').ms : null;
  let toMs = null;
  if (isProvided(to)) {
    const parsed = parseIsoDate(to, 'to');
    // A date-only "to" means the whole day, so it ends at 23:59:59.999.
    toMs = parsed.dateOnly ? parsed.ms + DAY_MS - 1 : parsed.ms;
  }

  const needle = isProvided(q) ? q.trim().toLowerCase() : '';
  const wantedCity = isProvided(city) ? city.trim().toLowerCase() : '';

  return summaries.filter((event) => {
    if (needle) {
      const inTitle = String(event.title ?? '').toLowerCase().includes(needle);
      const inVenue = String(event.venue ?? '').toLowerCase().includes(needle);
      if (!inTitle && !inVenue) return false;
    }
    if (wantedCity && String(event.city ?? '').trim().toLowerCase() !== wantedCity) return false;

    if (fromMs !== null || toMs !== null) {
      if (!isProvided(event.date)) return false;
      const when = parseIsoDate(event.date, 'event date').ms;
      if (fromMs !== null && when < fromMs) return false;
      if (toMs !== null && when > toMs) return false;
    }

    if (isProvided(maxPriceCents)) {
      // No tiers means no price, so the event is left out of price filters.
      if (event.cheapestPriceCents === null || event.cheapestPriceCents === undefined) return false;
      if (event.cheapestPriceCents > maxPriceCents) return false;
    }

    if (onlyAvailable === true && !(event.seatsLeft > 0)) return false;
    return true;
  });
}

// "Missing" values (no date, no price) always sort last.
function ascendingMissingLast(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

const KEY_COMPARATORS = {
  date: ascendingMissingLast,
  price: ascendingMissingLast,
  availability: (a, b) => b - a // most seats first
};

function sortKey(event, sortBy) {
  if (sortBy === 'date') return isProvided(event.date) ? parseIsoDate(event.date, 'event date').ms : null;
  if (sortBy === 'price') return Number.isSafeInteger(event.cheapestPriceCents) ? event.cheapestPriceCents : null;
  return Number.isSafeInteger(event.seatsLeft) ? event.seatsLeft : 0;
}

export function sortEvents(summaries, sortBy = 'date') {
  assertValid(Array.isArray(summaries), 'summaries must be an array');
  assertValid(SORT_OPTIONS.includes(sortBy), `Unknown sort option: ${String(sortBy)}. Use date, price or availability`);

  const compareKeys = KEY_COMPARATORS[sortBy];
  // Work out each sort key once, sort, then unwrap.
  const wrapped = summaries.map((event) => ({ event, key: sortKey(event, sortBy) }));
  const sorted = mergeSort(wrapped, (a, b) =>
    compareKeys(a.key, b.key) ||
    compareText(a.event.title, b.event.title) ||
    compareText(a.event.id, b.event.id));
  return sorted.map((entry) => entry.event);
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  assertValid(SORT_OPTIONS.includes(sortBy), `Unknown sort option: ${String(sortBy)}. Use date, price or availability`);
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
