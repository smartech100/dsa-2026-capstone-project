import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore, createEvent, addTier, publishEvent, unpublishEvent, listEventSummaries,
  bookTickets, cancelBooking, findBookingByReference, joinWaitlist, peekWaitlist,
  dequeueWaitlist, tierSeatsLeft
} from '../src/domain/inventory.js';
import { searchEvents } from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';

const code = (expected) => (error) => error instanceof DomainError && error.code === expected;

const goodEvent = (overrides = {}) => ({
  title: 'Banjul Tech Meet', city: 'Banjul', venue: 'Kairaba Hotel', date: '2026-12-05T17:00:00Z', ...overrides
});

function eventWithTier({ capacity = 100, priceCents = 50000, publish = false } = {}) {
  const store = createStore();
  const event = createEvent(store, goodEvent());
  const tier = addTier(store, event.id, { name: 'General', priceCents, capacity });
  if (publish) publishEvent(store, event.id);
  return { store, event, tier };
}

// ---------- S02: create an event ----------

test('S02: a valid event is saved as a draft with a new id and is not on the public list', () => {
  const store = createStore();
  const event = createEvent(store, goodEvent());
  assert.equal(event.status, 'DRAFT');
  assert.ok(event.id.length > 0);
  assert.equal(store.events.get(event.id), event);
  assert.deepEqual(listEventSummaries(store), []);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
});

test('S02: two events get different ids', () => {
  const store = createStore();
  assert.notEqual(createEvent(store, goodEvent()).id, createEvent(store, goodEvent()).id);
});

test('S02: missing title, missing city or an unreal date is VALIDATION and nothing is saved', () => {
  const store = createStore();
  const bad = [
    goodEvent({ title: undefined }),
    goodEvent({ title: '   ' }),
    goodEvent({ city: undefined }),
    goodEvent({ city: '' }),
    goodEvent({ date: undefined }),
    goodEvent({ date: 'next friday' }),
    goodEvent({ date: '2026-02-30' }),
    goodEvent({ date: '2026-13-01' }),
    goodEvent({ date: '2026-12-05T25:00:00Z' })
  ];
  for (const input of bad) {
    assert.throws(() => createEvent(store, input), code('VALIDATION'), JSON.stringify(input));
  }
  assert.equal(store.events.size, 0);
});

test('S02: a duplicate event id is DUPLICATE', () => {
  const store = createStore();
  createEvent(store, goodEvent({ id: 'e1' }));
  assert.throws(() => createEvent(store, goodEvent({ id: 'e1' })), code('DUPLICATE'));
});

test('Build 1 style createEvent({ name, capacity }) still works', () => {
  const store = createStore();
  const event = createEvent(store, { name: 'Old style', capacity: 10 });
  assert.equal(event.name, 'Old style');
  assert.equal(event.capacity, 10);
  assert.throws(() => createEvent(store, { name: 'No capacity' }), code('VALIDATION'));
});

// ---------- S03: ticket tiers ----------

test('S03: a General tier at 50000 bututs (D500) with capacity 100 starts with 0 sold and 100 left', () => {
  const { tier } = eventWithTier();
  assert.equal(tier.name, 'General');
  assert.equal(tier.priceCents, 50000);
  assert.equal(tier.seatsBooked, 0);
  assert.equal(tierSeatsLeft(tier), 100);
});

test('S03: a price that is not a whole number, or capacity below 1, is VALIDATION', () => {
  const store = createStore();
  const event = createEvent(store, goodEvent());
  const bad = [
    { name: 'General', priceCents: 10.5, capacity: 5 },
    { name: 'General', priceCents: '500', capacity: 5 },
    { name: 'General', priceCents: -1, capacity: 5 },
    { name: 'General', priceCents: 500, capacity: 0 },
    { name: 'General', priceCents: 500, capacity: -4 },
    { name: 'General', priceCents: 500, capacity: 2.5 }
  ];
  for (const tier of bad) assert.throws(() => addTier(store, event.id, tier), code('VALIDATION'), JSON.stringify(tier));
  assert.equal(event.tiers.size, 0);
});

test('S03: adding a tier to an event that does not exist is NOT_FOUND', () => {
  const store = createStore();
  assert.throws(() => addTier(store, 'missing', { name: 'General', priceCents: 500, capacity: 5 }), code('NOT_FOUND'));
});

test('S03: tiers cannot add up to more than a set event capacity (Build 1 rule)', () => {
  const store = createStore();
  const event = createEvent(store, goodEvent({ capacity: 10 }));
  addTier(store, event.id, { name: 'General', priceCents: 500, capacity: 8 });
  assert.throws(() => addTier(store, event.id, { name: 'VIP', priceCents: 900, capacity: 3 }), code('VALIDATION'));
});

// ---------- S04: publish and unpublish ----------

test('S04: publishing an event with a tier makes it PUBLISHED and publicly listed', () => {
  const { store, event } = eventWithTier();
  publishEvent(store, event.id);
  assert.equal(event.status, 'PUBLISHED');
  assert.deepEqual(listEventSummaries(store).map((s) => s.id), [event.id]);
});

test('S04: unpublishing a published event makes it a draft and removes it from the public list', () => {
  const { store, event } = eventWithTier({ publish: true });
  unpublishEvent(store, event.id);
  assert.equal(event.status, 'DRAFT');
  assert.deepEqual(listEventSummaries(store), []);
});

test('S04: an unpublished event is not in the public list or in public search', () => {
  const { store, event } = eventWithTier();
  assert.equal(listEventSummaries(store).some((s) => s.id === event.id), false);
  assert.deepEqual(searchEvents(listEventSummaries(store), { q: 'banjul' }, 'date'), []);
});

test('S04: publishing an event with no ticket tiers is INVALID_STATE', () => {
  const store = createStore();
  const event = createEvent(store, goodEvent());
  assert.throws(() => publishEvent(store, event.id), code('INVALID_STATE'));
  assert.equal(event.status, 'DRAFT');
});

test('S04: publishing or unpublishing an unknown event is NOT_FOUND', () => {
  const store = createStore();
  assert.throws(() => publishEvent(store, 'nope'), code('NOT_FOUND'));
  assert.throws(() => unpublishEvent(store, 'nope'), code('NOT_FOUND'));
});

test('summaries show cheapest price and seats left', () => {
  const store = createStore();
  const event = createEvent(store, goodEvent());
  addTier(store, event.id, { name: 'VIP', priceCents: 90000, capacity: 5 });
  const general = addTier(store, event.id, { name: 'General', priceCents: 50000, capacity: 10 });
  publishEvent(store, event.id);
  bookTickets(store, { eventId: event.id, tierId: general.id, attendeeName: 'Ada', quantity: 4 });
  const [summary] = listEventSummaries(store);
  assert.equal(summary.cheapestPriceCents, 50000);
  assert.equal(summary.seatsLeft, 11);
});

// ---------- S06: booking ----------

test('S06: booking 2 of 3 seats prices in whole bututs and leaves 1 seat', () => {
  const { store, event, tier } = eventWithTier({ capacity: 3, priceCents: 50000, publish: true });
  const booking = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 2 });
  assert.equal(booking.quantity, 2);
  assert.equal(booking.totalPriceCents, 100000);
  assert.ok(Number.isSafeInteger(booking.totalPriceCents));
  assert.equal(tierSeatsLeft(tier), 1);
  // Build 1 creates bookings as CONFIRMED; the story says "pending". See notes.
  assert.equal(findBookingByReference(store, booking.reference), booking);
});

test('S06: asking for 2 when 1 is left is SOLD_OUT and nothing changes', () => {
  const { store, event, tier } = eventWithTier({ capacity: 3, publish: true });
  bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 2 });
  assert.throws(
    () => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Bayo', quantity: 2 }),
    code('SOLD_OUT'));
  assert.equal(tierSeatsLeft(tier), 1);
  assert.equal(store.bookings.size, 1);
  assert.equal(event.seatsAllocated, 2);
});

test('S06: quantity 0, negative, fractional or above 10 is VALIDATION', () => {
  const { store, event, tier } = eventWithTier({ publish: true });
  for (const quantity of [0, -1, 1.5, 11, '2', undefined]) {
    assert.throws(
      () => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity }),
      code('VALIDATION'), String(quantity));
  }
  assert.equal(store.bookings.size, 0);
});

test('booking with an unknown event or tier is NOT_FOUND; duplicate booking id is DUPLICATE', () => {
  const { store, event, tier } = eventWithTier({ publish: true });
  assert.throws(() => bookTickets(store, { eventId: 'x', tierId: tier.id, attendeeName: 'A', quantity: 1 }), code('NOT_FOUND'));
  assert.throws(() => bookTickets(store, { eventId: event.id, tierId: 'x', attendeeName: 'A', quantity: 1 }), code('NOT_FOUND'));
  bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'A', quantity: 1, id: 'b1' });
  assert.throws(() => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'A', quantity: 1, id: 'b1' }), code('DUPLICATE'));
});

// ---------- Build 1 behaviour must still work ----------

test('cancelling frees seats once; a second cancel is ALREADY_CANCELLED; other states are INVALID_STATE', () => {
  const { store, event, tier } = eventWithTier({ capacity: 3, publish: true });
  const booking = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 2 });
  cancelBooking(store, booking.id);
  assert.equal(tierSeatsLeft(tier), 3);
  assert.throws(() => cancelBooking(store, booking.id), code('ALREADY_CANCELLED'));
  assert.throws(() => cancelBooking(store, 'nope'), code('NOT_FOUND'));
  const other = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Bayo', quantity: 1 });
  other.status = 'REFUNDED';
  assert.throws(() => cancelBooking(store, other.id), code('INVALID_STATE'));
});

test('finding a booking by reference ignores case; an unknown reference is NOT_FOUND', () => {
  const { store, event, tier } = eventWithTier({ publish: true });
  const booking = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 1 });
  assert.equal(findBookingByReference(store, booking.reference.toLowerCase()), booking);
  assert.throws(() => findBookingByReference(store, 'ZZZZ-ZZZZ'), code('NOT_FOUND'));
});

test('the waitlist is first in, first out', () => {
  const { store, event, tier } = eventWithTier({ publish: true });
  joinWaitlist(store, { eventId: event.id, tierId: tier.id, attendeeName: 'First' });
  joinWaitlist(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Second' });
  assert.equal(peekWaitlist(store, event.id, tier.id).attendeeName, 'First');
  assert.equal(dequeueWaitlist(store, event.id, tier.id).attendeeName, 'First');
  assert.equal(dequeueWaitlist(store, event.id, tier.id).attendeeName, 'Second');
  assert.equal(dequeueWaitlist(store, event.id, tier.id), undefined);
});

test('ID_GENERATION_FAILED when every booking reference is already taken', () => {
  const { store, event, tier } = eventWithTier({ publish: true });
  class AlwaysTaken extends Map { has() { return true; } }
  store.bookingsByReference = new AlwaysTaken();
  assert.throws(
    () => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 1 }),
    code('ID_GENERATION_FAILED'));
});

test('functions reject a missing store with VALIDATION', () => {
  assert.throws(() => createEvent({}, goodEvent()), code('VALIDATION'));
  assert.throws(() => listEventSummaries(null), code('VALIDATION'));
});
