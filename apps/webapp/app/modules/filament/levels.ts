/**
 * A filament's usage over time (fork): the daily record of what's on hand,
 * filled out day by day, the average used, and where it heads from here.
 * The parts that don't need the database.
 */

const DAY = 24 * 60 * 60 * 1000;

export type DayLevel = { day: string; grams: number };

/** "2026-10-20", in UTC, as the database's date column keeps it. */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * One value for each of the last `days` days up to today: the day's own
 * record, or else the last one before it. Days before the first record are
 * left out, so the chart starts when the records do.
 */
export function dailySeries(
  rows: { day: Date | string; grams: number }[],
  today: Date,
  days = 30
): DayLevel[] {
  const known = new Map(
    rows.map((r) => [dayKey(new Date(r.day)), r.grams] as const)
  );
  const out: DayLevel[] = [];
  let last: number | null = null;
  // the last record before the window, to carry in
  const start = new Date(today.getTime() - (days - 1) * DAY);
  for (const r of [...rows].sort((a, b) => +new Date(a.day) - +new Date(b.day)))
    if (dayKey(new Date(r.day)) < dayKey(start)) last = r.grams;
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(today.getTime() - i * DAY));
    if (known.has(key)) last = known.get(key)!;
    if (last !== null) out.push({ day: key, grams: last });
  }
  return out;
}

/**
 * Grams used a day, on average over the last `window` days of the series:
 * each day's drop (a day that went up, when stock was bought, counts as no
 * use). Null with fewer than three days to go on.
 */
export function averageUse(series: DayLevel[], window = 14): number | null {
  const recent = series.slice(-(window + 1));
  if (recent.length < 4) return null;
  let used = 0;
  for (let i = 1; i < recent.length; i++)
    used += Math.max(0, recent[i - 1].grams - recent[i].grams);
  return used / (recent.length - 1);
}

/** Where what's on hand heads at that rate: a day at a time until it runs out (at most `max` days). */
export function projection(
  from: DayLevel | undefined,
  perDay: number | null,
  max = 90
): DayLevel[] {
  if (!from || !perDay || perDay <= 0) return [];
  const out: DayLevel[] = [];
  const start = new Date(`${from.day}T00:00:00Z`).getTime();
  let grams = from.grams;
  for (let i = 1; i <= max && grams > 0; i++) {
    grams = Math.max(0, Math.round(grams - perDay));
    out.push({ day: dayKey(new Date(start + i * DAY)), grams });
  }
  return out;
}
