import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSort } from '../src/domain/sorting.js';
import { DomainError } from '../src/domain/errors.js';

const byNumber = (a, b) => a - b;

test('mergeSort sorts numbers and returns a new array', () => {
  const input = [5, 2, 9, 1, 5, 6, 0, -3];
  const output = mergeSort(input, byNumber);
  assert.deepEqual(output, [-3, 0, 1, 2, 5, 5, 6, 9]);
  assert.notEqual(output, input);
});

test('mergeSort never modifies the original array', () => {
  const input = Object.freeze([3, 1, 2]);
  assert.deepEqual(mergeSort(input, byNumber), [1, 2, 3]);
  assert.deepEqual([...input], [3, 1, 2]);
});

test('mergeSort handles empty and one-item arrays', () => {
  assert.deepEqual(mergeSort([], byNumber), []);
  const one = [7];
  const result = mergeSort(one, byNumber);
  assert.deepEqual(result, [7]);
  assert.notEqual(result, one);
});

test('mergeSort is stable: equal items keep their original order', () => {
  const items = [
    { group: 2, label: 'a' }, { group: 1, label: 'b' }, { group: 2, label: 'c' },
    { group: 1, label: 'd' }, { group: 2, label: 'e' }, { group: 1, label: 'f' }
  ];
  const sorted = mergeSort(items, (x, y) => x.group - y.group);
  assert.deepEqual(sorted.map((i) => i.label), ['b', 'd', 'f', 'a', 'c', 'e']);
});

test('mergeSort agrees with the built-in sort on 500 random numbers', () => {
  const input = Array.from({ length: 500 }, (_, i) => (i * 7919) % 101);
  assert.deepEqual(mergeSort(input, byNumber), [...input].sort(byNumber));
});

test('mergeSort rejects bad arguments with VALIDATION', () => {
  assert.throws(() => mergeSort('nope', byNumber), (e) => e instanceof DomainError && e.code === 'VALIDATION');
  assert.throws(() => mergeSort([1], null), (e) => e instanceof DomainError && e.code === 'VALIDATION');
});
