import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTransition,
  BOOKING_STATES,
  BOOKING_TRANSITIONS,
  canTransition
} from '../src/domain/bookingStateMachine.js';
import { DomainError } from '../src/domain/errors.js';

const allowedMoves = [
  ['pending', 'paid'],
  ['pending', 'cancelled'],
  ['paid', 'checked_in'],
  ['paid', 'refunded'],
  ['paid', 'cancelled']
];

test('every allowed booking transition can be checked and asserted', () => {
  for (const [from, to] of allowedMoves) {
    assert.equal(canTransition(from, to), true, `${from} -> ${to}`);
    assert.doesNotThrow(() => assertTransition(from, to), `${from} -> ${to}`);
  }
});

test('every other transition among the booking states is refused', () => {
  for (const from of BOOKING_STATES) {
    for (const to of BOOKING_STATES) {
      if (allowedMoves.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to)) continue;

      assert.equal(canTransition(from, to), false, `${from} -> ${to}`);
      assert.throws(
        () => assertTransition(from, to),
        (error) => error instanceof DomainError && error.code === 'INVALID_TRANSITION',
        `${from} -> ${to}`
      );
    }
  }
});

test('transition data lists all states and only the specified moves', () => {
  assert.deepEqual(Object.keys(BOOKING_TRANSITIONS), BOOKING_STATES);
  assert.deepEqual(BOOKING_TRANSITIONS.pending, ['paid', 'cancelled']);
  assert.deepEqual(BOOKING_TRANSITIONS.paid, ['checked_in', 'refunded', 'cancelled']);
  assert.deepEqual(BOOKING_TRANSITIONS.cancelled, []);
  assert.deepEqual(BOOKING_TRANSITIONS.refunded, []);
  assert.deepEqual(BOOKING_TRANSITIONS.checked_in, []);
});

test('unknown booking states are illegal transitions', () => {
  for (const state of ['unknown', 'toString', '__proto__']) {
    assert.equal(canTransition(state, 'paid'), false);
    assert.throws(
      () => assertTransition(state, 'paid'),
      (error) => error instanceof DomainError && error.code === 'INVALID_TRANSITION'
    );
  }
});
