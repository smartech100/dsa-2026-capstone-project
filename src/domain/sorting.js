import { assertValid } from './errors.js';

/**
 * Stable merge sort. Returns a NEW array and never modifies `items`.
 * Time O(n log n), extra space O(n). Does not use Array.prototype.sort.
 *
 * Stability: when compare(a, b) is 0 the item from the LEFT half (which came
 * earlier in the input) is taken first, so equal items keep their order.
 */
export function mergeSort(items, compare) {
  assertValid(Array.isArray(items), 'mergeSort needs an array');
  assertValid(typeof compare === 'function', 'mergeSort needs a compare function');
  return sortRange(items.slice(), compare);
}

function sortRange(list, compare) {
  if (list.length <= 1) return list;
  const middle = Math.floor(list.length / 2);
  const left = sortRange(list.slice(0, middle), compare);
  const right = sortRange(list.slice(middle), compare);
  return merge(left, right, compare);
}

function merge(left, right, compare) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    // <= 0 (not < 0) is what makes the sort stable.
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i]);
      i += 1;
    } else {
      result.push(right[j]);
      j += 1;
    }
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}
