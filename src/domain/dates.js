import { assertValid } from './errors.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Parses an ISO date string: "2026-12-05" or "2026-12-05T17:00:00Z".
 * A time with no offset is read as UTC (The Gambia is on GMT all year).
 * Throws VALIDATION for anything that is not a real date.
 * Returns { ms, dateOnly }.
 */
export function parseIsoDate(value, label = 'date') {
  assertValid(typeof value === 'string', `${label} must be an ISO date string`);
  const match = ISO_PATTERN.exec(value.trim());
  assertValid(match !== null, `${label} is not a valid ISO date: ${value}`);

  const [, y, m, d, hh, mm, ss, frac, offset] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  assertValid(
    calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day,
    `${label} is not a real calendar date: ${value}`
  );

  if (hh === undefined) return { ms: calendar.getTime(), dateOnly: true };

  assertValid(Number(hh) <= 23 && Number(mm) <= 59 && (ss === undefined || Number(ss) <= 59),
    `${label} has an impossible time: ${value}`);
  if (offset && offset !== 'Z') {
    assertValid(Number(offset.slice(1, 3)) <= 23 && Number(offset.slice(4, 6)) <= 59,
      `${label} has an impossible offset: ${value}`);
  }
  const text = `${y}-${m}-${d}T${hh}:${mm}:${ss ?? '00'}.${(frac ?? '0').padEnd(3, '0')}${offset ?? 'Z'}`;
  const ms = Date.parse(text);
  assertValid(Number.isFinite(ms), `${label} is not a valid ISO date: ${value}`);
  return { ms, dateOnly: false };
}
