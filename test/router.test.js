import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/http/router.js';

test('router matches method and path parameters', async () => {
  const handler = () => 'matched';
  const router = new Router().get('/events/:eventId/bookings/:bookingId', handler);
  const match = router.match('GET', '/events/event%201/bookings/booking-2');

  assert.equal(match.handler, handler);
  assert.deepEqual(match.params, { eventId: 'event 1', bookingId: 'booking-2' });
  assert.equal(await match.handler(), 'matched');
});

test('router matches methods case-insensitively and does not match another method or path', () => {
  const handler = () => {};
  const router = new Router().add('get', '/events/:eventId', handler);

  assert.equal(router.match('GET', '/events/123').handler, handler);
  assert.equal(router.match('POST', '/events/123'), null);
  assert.equal(router.match('GET', '/events/123/bookings'), null);
});

test('router rejects invalid route definitions and malformed encoded parameters', () => {
  const router = new Router().get('/events/:eventId', () => {});

  assert.throws(() => router.get('events', () => {}), TypeError);
  assert.throws(() => router.get('/events/:bad-name', () => {}), TypeError);
  assert.throws(() => router.get('/events/:eventId', () => {}), TypeError);
  assert.throws(() => router.match('GET', '/events/%E0%A4%A'), URIError);
});
