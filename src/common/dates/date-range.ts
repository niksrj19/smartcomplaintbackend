import { z } from 'zod';

/**
 * Date ranges for analytics and filters. Days are calendar days in India (IST, UTC+05:30),
 * so "1 Nov to 7 Nov" means  a city official expects, whatever the server's time zone.
 */
export const IST_OFFSET = '+05:30';
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isoDaySchema = z.string().regex(ISO_DAY, 'Use a date like 2026-11-14');

/** Today's date in IST as YYYY-MM-DD */
export function todayIst(now = Date.now()): string {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Start of an IST day as a UTC instant */
export function istDayStart(day: string): Date {
  return new Date(`${day}T00:00:00${IST_OFFSET}`);
}

export interface DateRange {
  /** First day included (IST), YYYY-MM-DD */
  fromDay: string;
  /** Last day included (IST), YYYY-MM-DD */
  toDay: string;
  /** Inclusive start instant */
  from: Date;
  /** EXCLUSIVE end instant (start of the day after toDay) */
  to: Date;
  days: number;
}

export function buildRange(fromDay: string, toDay: string): DateRange {
  const days = Math.round((Date.parse(toDay) - Date.parse(fromDay)) / DAY_MS) + 1;
  return { fromDay, toDay, from: istDayStart(fromDay), to: istDayStart(addDays(toDay, 1)), days };
}

/**
 * Resolves optional `from` / `to` (YYYY-MM-DD) into a range. Defaults to the last `defaultDays` days
 * ending today (IST). Returns an error message instead of throwing, for use inside Zod transforms.
 */
export function resolveRange(
  from: string | undefined,
  to: string | undefined,
  defaultDays = 30,
  maxDays = 366,
): DateRange | string {
  const toDay = to ?? todayIst();
  const fromDay = from ?? addDays(toDay, -(defaultDays - 1));
  if (Number.isNaN(Date.parse(fromDay)) || Number.isNaN(Date.parse(toDay))) return 'Invalid date';
  const range = buildRange(fromDay, toDay);
  if (range.days < 1) return '"from" must be on or before "to"';
  if (range.days > maxDays) return `Range can be at most ${maxDays} days`;
  return range;
}
