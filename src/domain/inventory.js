// Money: whole bututs (smallest unit of the Gambian dalasi, GMD; 100 bututs = D1).
// Field names such as priceCents mean "smallest unit" and are kept from Build 1.
import { DomainError, assertValid } from './errors.js';
import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';
import { parseIsoDate } from './dates.js';

export const EVENT_STATUS = Object.freeze({ DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' });

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;

function requireStore(store) {
  assertValid(store && store.events instanceof Map && store.bookings instanceof Map && store.bookingsByReference instanceof Map,
    'A valid store created by createStore() is required');
}

function requireEvent(store, eventId) {
  assertValid(isNonEmptyString(eventId), 'eventId must be a non-empty string');
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', `Event not found: ${eventId}`);
  return event;
}

function requireTier(event, tierId) {
  assertValid(isNonEmptyString(tierId), 'tierId must be a non-empty string');
  const tier = event.tiers.get(tierId);
  if (!tier) throw new DomainError('NOT_FOUND', `Ticket tier not found: ${tierId}`);
  return tier;
}

function uniqueReference(store) {
  // A collision is extraordinarily unlikely, but the Map is the authority.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const reference = newReference();
    if (!store.bookingsByReference.has(reference)) return reference;
  }
  throw new DomainError('ID_GENERATION_FAILED', 'Could not generate a unique booking reference');
}

/** Seats still available in a tier. */
export function tierSeatsLeft(tier) {
  return tier.capacity - tier.seatsBooked;
}

export function createStore() {
  return {
    events: new Map(),
    bookings: new Map(),
    bookingsByReference: new Map(),
    waitlists: new Map()
  };
}

/**
 * Two ways to call it:
 *  - Build 1 style: { name, capacity }  (still works, unchanged)
 *  - Build 2 style: { title, city, venue?, date, capacity? }
 * New events always start as DRAFT.
 */
export function createEvent(store, { name, title, city, venue, date, capacity, id = newId() } = {}) {
  requireStore(store);
  const eventTitle = title ?? name;
  assertValid(isNonEmptyString(eventTitle), 'Event title must be a non-empty string');

  const isBuild1Call = name !== undefined && title === undefined &&
    city === undefined && venue === undefined && date === undefined;

  if (isBuild1Call) {
    assertValid(isPositiveInteger(capacity), 'Event capacity must be a positive whole number');
  } else {
    assertValid(isNonEmptyString(city), 'Event city must be a non-empty string');
    parseIsoDate(date, 'Event date'); // throws VALIDATION if not a real date
    assertValid(venue === undefined || isNonEmptyString(venue), 'Event venue must be a non-empty string when given');
    assertValid(capacity === undefined || isPositiveInteger(capacity), 'Event capacity must be a positive whole number');
  }
  assertValid(isNonEmptyString(id), 'Event id must be a non-empty string');
  if (store.events.has(id)) throw new DomainError('DUPLICATE', `Event id already exists: ${id}`);

  const event = {
    id,
    name: eventTitle.trim(),
    title: eventTitle.trim(),
    city: isNonEmptyString(city) ? city.trim() : null,
    venue: isNonEmptyString(venue) ? venue.trim() : null,
    date: isNonEmptyString(date) ? date.trim() : null,
    capacity: capacity ?? null, // null = no event-wide limit; only the tiers limit seats
    seatsAllocated: 0,
    status: EVENT_STATUS.DRAFT,
    tiers: new Map(),
    createdAt: new Date().toISOString()
  };
  store.events.set(id, event);
  return event;
}

export function addTier(store, eventId, { name, priceCents, capacity, id = newId() } = {}) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  assertValid(isNonEmptyString(name), 'Ticket tier name must be a non-empty string');
  assertValid(isNonNegativeInteger(priceCents), 'priceCents must be a non-negative whole number of bututs (100 bututs = D1)');
  assertValid(isPositiveInteger(capacity), 'Tier capacity must be a positive whole number');
  assertValid(isNonEmptyString(id), 'Tier id must be a non-empty string');
  if (event.tiers.has(id)) throw new DomainError('DUPLICATE', `Tier id already exists: ${id}`);

  if (event.capacity !== null) {
    const totalTierCapacity = [...event.tiers.values()].reduce((sum, tier) => sum + tier.capacity, 0);
    assertValid(totalTierCapacity + capacity <= event.capacity, 'Combined ticket-tier capacity cannot exceed event capacity');
  }

  const tier = { id, eventId, name: name.trim(), priceCents, capacity, seatsBooked: 0 };
  event.tiers.set(id, tier);
  return tier;
}

/** Makes an event public. An event with no ticket tiers cannot be published. */
export function publishEvent(store, eventId) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  if (event.tiers.size === 0) {
    throw new DomainError('INVALID_STATE', 'An event with no ticket tiers cannot be published');
  }
  event.status = EVENT_STATUS.PUBLISHED;
  return event;
}

/** Hides an event from the public list again (back to DRAFT). */
export function unpublishEvent(store, eventId) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  event.status = EVENT_STATUS.DRAFT;
  return event;
}

function summarise(event) {
  const tiers = [...event.tiers.values()];
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    date: event.date,
    status: event.status,
    cheapestPriceCents: tiers.length === 0 ? null : Math.min(...tiers.map((tier) => tier.priceCents)),
    seatsLeft: tiers.reduce((sum, tier) => sum + tierSeatsLeft(tier), 0)
  };
}

/**
 * Plain, copy-safe summaries for searching. By default only PUBLISHED events
 * are returned, so drafts stay hidden from the public list.
 */
export function listEventSummaries(store, { publishedOnly = true } = {}) {
  requireStore(store);
  const summaries = [];
  for (const event of store.events.values()) {
    if (publishedOnly && event.status !== EVENT_STATUS.PUBLISHED) continue;
    summaries.push(summarise(event));
  }
  return summaries;
}

export function bookTickets(store, { eventId, tierId, attendeeName, quantity, id = newId() } = {}) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  const tier = requireTier(event, tierId);
  assertValid(isNonEmptyString(attendeeName), 'Attendee name must be a non-empty string');
  assertValid(Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10, 'Booking quantity must be an integer from 1 to 10');
  assertValid(isNonEmptyString(id), 'Booking id must be a non-empty string');
  if (store.bookings.has(id)) throw new DomainError('DUPLICATE', `Booking id already exists: ${id}`);

  // Check all conditions before changing any state: a failed booking is atomic.
  if (tier.capacity - tier.seatsBooked < quantity) {
    throw new DomainError('SOLD_OUT', `Only ${tier.capacity - tier.seatsBooked} ticket(s) remain in tier ${tier.name}`);
  }
  if (event.capacity !== null && event.capacity - event.seatsAllocated < quantity) {
    throw new DomainError('SOLD_OUT', `Only ${event.capacity - event.seatsAllocated} event seat(s) remain`);
  }

  const reference = uniqueReference(store);
  const booking = {
    id,
    reference,
    eventId,
    tierId,
    attendeeName: attendeeName.trim(),
    quantity,
    unitPriceCents: tier.priceCents,
    totalPriceCents: tier.priceCents * quantity,
    status: 'CONFIRMED',
    createdAt: new Date().toISOString()
  };

  tier.seatsBooked += quantity;
  event.seatsAllocated += quantity;
  store.bookings.set(id, booking);
  store.bookingsByReference.set(reference, booking);
  return booking;
}

export function cancelBooking(store, bookingId) {
  requireStore(store);
  assertValid(isNonEmptyString(bookingId), 'bookingId must be a non-empty string');
  const booking = store.bookings.get(bookingId);
  if (!booking) throw new DomainError('NOT_FOUND', `Booking not found: ${bookingId}`);
  if (booking.status === 'CANCELLED') throw new DomainError('ALREADY_CANCELLED', 'Booking has already been cancelled');
  if (booking.status !== 'CONFIRMED') throw new DomainError('INVALID_STATE', `Cannot cancel a booking in state ${booking.status}`);

  const event = requireEvent(store, booking.eventId);
  const tier = requireTier(event, booking.tierId);
  // Validate invariants before mutation so cancellation cannot partially apply.
  assertValid(tier.seatsBooked >= booking.quantity, 'Tier seat count is inconsistent with this booking');
  assertValid(event.seatsAllocated >= booking.quantity, 'Event seat count is inconsistent with this booking');

  tier.seatsBooked -= booking.quantity;
  event.seatsAllocated -= booking.quantity;
  booking.status = 'CANCELLED';
  booking.cancelledAt = new Date().toISOString();
  return booking;
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  assertValid(isNonEmptyString(reference), 'Booking reference must be a non-empty string');
  const booking = store.bookingsByReference.get(reference.trim().toUpperCase());
  if (!booking) throw new DomainError('NOT_FOUND', `Booking not found for reference: ${reference}`);
  return booking;
}

export function joinWaitlist(store, { eventId, tierId, attendeeName, quantity = 1, id = newId() } = {}) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  const tier = requireTier(event, tierId);
  assertValid(isNonEmptyString(attendeeName), 'Attendee name must be a non-empty string');
  assertValid(Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10, 'Waitlist quantity must be an integer from 1 to 10');
  assertValid(isNonEmptyString(id), 'Waitlist entry id must be a non-empty string');
  if (store.waitlists.has(id)) throw new DomainError('DUPLICATE', `Waitlist entry id already exists: ${id}`);

  const key = `${event.id}:${tier.id}`;
  let queue = store.waitlists.get(key);
  if (!queue) {
    queue = new Queue();
    store.waitlists.set(key, queue);
  }
  const entry = { id, eventId: event.id, tierId: tier.id, attendeeName: attendeeName.trim(), quantity, joinedAt: new Date().toISOString() };
  queue.enqueue(entry);
  return entry;
}

/** Returns the next person in line without removing them from the waitlist. */
export function peekWaitlist(store, eventId, tierId) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  const tier = requireTier(event, tierId);
  return store.waitlists.get(`${event.id}:${tier.id}`)?.peek();
}

/** Removes and returns the next waitlist entry; returns undefined if empty. */
export function dequeueWaitlist(store, eventId, tierId) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  const tier = requireTier(event, tierId);
  return store.waitlists.get(`${event.id}:${tier.id}`)?.dequeue();
}
