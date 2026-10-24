import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents, sortEvents, searchEvents } from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';

const code = (expected) => (error) => error instanceof DomainError && error.code === expected;

const summary = (overrides) => ({
  id: 'id', title: 'Title', city: 'Banjul', venue: 'Hall', date: '2026-12-01T18:00:00Z',
  cheapestPriceCents: 50000, seatsLeft: 10, ...overrides
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

const titles = (list) => list.map((e) => e.title);

const techMeet = summary({ id: 'a', title: 'Banjul Tech Meet', city: 'Banjul', venue: 'Kairaba Hotel' });
const jazzNight = summary({ id: 'b', title: 'Serekunda Jazz Night', city: 'Serekunda', venue: 'Bakau Beach Club' });

// ---------- S05 acceptance criteria ----------

test('S05: searching "JAZZ" returns only Serekunda Jazz Night', () => {
  assert.deepEqual(titles(filterEvents([techMeet, jazzNight], { q: 'JAZZ' })), ['Serekunda Jazz Night']);
});

test('S05: search also matches the venue, ignoring case', () => {
  assert.deepEqual(titles(filterEvents([techMeet, jazzNight], { q: 'kairaba' })), ['Banjul Tech Meet']);
});

test('S05: city "banjul" returns only the Banjul events, whatever the capital letters', () => {
  const events = [techMeet, jazzNight, summary({ id: 'c', title: 'Banjul Food Fair', city: 'BANJUL' })];
  assert.deepEqual(titles(filterEvents(events, { city: 'banjul' })).sort(), ['Banjul Food Fair', 'Banjul Tech Meet']);
});

test('S05: city matches exactly, not partly', () => {
  assert.deepEqual(filterEvents([techMeet], { city: 'Banj' }), []);
});

test('S05: max price + sort by price gives cheapest first and leaves out events with no tiers', () => {
  const events = [
    summary({ id: '1', title: 'Pricey', cheapestPriceCents: 90000 }),
    summary({ id: '2', title: 'Middle', cheapestPriceCents: 50000 }),
    summary({ id: '3', title: 'Cheap', cheapestPriceCents: 10000 }),
    summary({ id: '4', title: 'No tiers', cheapestPriceCents: null, seatsLeft: 0 })
  ];
  const result = searchEvents(events, { maxPriceCents: 50000 }, 'price');
  assert.deepEqual(titles(result), ['Cheap', 'Middle']);
});

test('S05: sorting by date puts the earlier one first and same-day ties stay in title order', () => {
  const events = [
    summary({ id: '1', title: 'Zulu Party', date: '2026-12-05T17:00:00Z' }),
    summary({ id: '2', title: 'Alpha Party', date: '2026-12-05T17:00:00Z' }),
    summary({ id: '3', title: 'Earlier Event', date: '2026-12-01T09:00:00Z' })
  ];
  assert.deepEqual(titles(sortEvents(events, 'date')), ['Earlier Event', 'Alpha Party', 'Zulu Party']);
});

test('S05: an event at 5 PM on 5 December is included when filtering up to 2026-12-05', () => {
  const evening = summary({ title: 'Evening', date: '2026-12-05T17:00:00Z' });
  assert.deepEqual(titles(filterEvents([evening], { to: '2026-12-05' })), ['Evening']);
  assert.deepEqual(filterEvents([evening], { to: '2026-12-04' }), []);
});

test('S05: from and to are inclusive at both ends', () => {
  const events = [
    summary({ id: '1', title: 'Start', date: '2026-12-01' }),
    summary({ id: '2', title: 'Middle', date: '2026-12-03T12:00:00Z' }),
    summary({ id: '3', title: 'End', date: '2026-12-05T23:59:59Z' }),
    summary({ id: '4', title: 'After', date: '2026-12-06T00:00:00Z' }),
    summary({ id: '5', title: 'Before', date: '2026-11-30T23:59:59Z' })
  ];
  assert.deepEqual(titles(sortEvents(filterEvents(events, { from: '2026-12-01', to: '2026-12-05' }), 'date')),
    ['Start', 'Middle', 'End']);
  // A full timestamp "to" is exact, not the whole day.
  assert.deepEqual(filterEvents([summary({ date: '2026-12-05T17:00:00Z' })], { to: '2026-12-05T16:00:00Z' }), []);
});

test('S05: a bad date, a price that is not a whole number or an unknown sort is VALIDATION', () => {
  const list = [techMeet];
  for (const criteria of [
    { from: 'tomorrow' }, { to: '2026-02-30' }, { from: 5 },
    { maxPriceCents: 10.5 }, { maxPriceCents: '500' }, { maxPriceCents: -1 },
    { q: 42 }, { city: 7 }, { onlyAvailable: 'yes' }
  ]) {
    assert.throws(() => filterEvents(list, criteria), code('VALIDATION'), JSON.stringify(criteria));
  }
  assert.throws(() => sortEvents(list, 'popularity'), code('VALIDATION'));
  assert.throws(() => sortEvents(list, null), code('VALIDATION'));
  assert.throws(() => searchEvents(list, {}, 'popularity'), code('VALIDATION'));
  assert.throws(() => filterEvents('not a list', {}), code('VALIDATION'));
});

test('S05: validation also applies to an empty list', () => {
  assert.throws(() => filterEvents([], { maxPriceCents: 1.5 }), code('VALIDATION'));
  assert.throws(() => sortEvents([], 'nope'), code('VALIDATION'));
});

test('S05: the original list and its events are unchanged by search, filter and sort', () => {
  const original = [
    summary({ id: '1', title: 'Charlie', cheapestPriceCents: 300, date: '2026-12-03' }),
    summary({ id: '2', title: 'Alpha', cheapestPriceCents: 100, date: '2026-12-01' }),
    summary({ id: '3', title: 'Bravo', cheapestPriceCents: 200, date: '2026-12-02' })
  ];
  deepFreeze(original); // any attempt to change it would throw
  const snapshot = JSON.stringify(original);
  const order = [...original];

  const filtered = filterEvents(original, { maxPriceCents: 250 });
  const sorted = sortEvents(original, 'price');
  const searched = searchEvents(original, { q: 'a' }, 'date');

  assert.equal(JSON.stringify(original), snapshot);
  assert.deepEqual(original, order);
  for (const result of [filtered, sorted, searched]) assert.notEqual(result, original);
});

// ---------- More sorting behaviour ----------

test('sort by availability puts the most seats first; ties go by title then id', () => {
  const events = [
    summary({ id: '1', title: 'B', seatsLeft: 5 }),
    summary({ id: '2', title: 'A', seatsLeft: 5 }),
    summary({ id: '3', title: 'C', seatsLeft: 50 }),
    summary({ id: '4', title: 'A', seatsLeft: 5 })
  ];
  assert.deepEqual(sortEvents(events, 'availability').map((e) => e.id), ['3', '2', '4', '1']);
});

test('sort by price puts events with no price last', () => {
  const events = [
    summary({ id: '1', title: 'None', cheapestPriceCents: null }),
    summary({ id: '2', title: 'Dear', cheapestPriceCents: 900 }),
    summary({ id: '3', title: 'Free', cheapestPriceCents: 0 })
  ];
  assert.deepEqual(titles(sortEvents(events, 'price')), ['Free', 'Dear', 'None']);
});

test('sorting is stable: sorting twice gives the same result and ties keep title order', () => {
  const events = Array.from({ length: 20 }, (_, i) =>
    summary({ id: String(i), title: `Event ${String.fromCharCode(90 - i)}`, cheapestPriceCents: 1000 }));
  const once = sortEvents(events, 'price');
  assert.deepEqual(sortEvents(once, 'price'), once);
  assert.deepEqual(titles(once), titles(events).slice().reverse());
});

test('onlyAvailable leaves out sold-out events', () => {
  const events = [summary({ title: 'Open', seatsLeft: 2 }), summary({ id: 'x', title: 'Full', seatsLeft: 0 })];
  assert.deepEqual(titles(filterEvents(events, { onlyAvailable: true })), ['Open']);
  assert.equal(filterEvents(events, { onlyAvailable: false }).length, 2);
});

test('no criteria returns every event; an empty list stays empty', () => {
  assert.equal(filterEvents([techMeet, jazzNight]).length, 2);
  assert.deepEqual(filterEvents([], { q: 'x' }), []);
  assert.deepEqual(sortEvents([], 'date'), []);
  assert.deepEqual(searchEvents([], { city: 'Banjul' }, 'price'), []);
});
