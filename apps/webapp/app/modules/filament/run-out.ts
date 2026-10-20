/**
 * How fast an open spool is being used, and when it runs out at that rate
 * (fork). A rough guide, from what's gone since it was opened: shown with
 * "≈" and only once it's been open a day, so a big first print doesn't
 * make the estimate look wild for long.
 */

const DAY = 24 * 60 * 60 * 1000;

export type Rate = {
  /** Grams used since it was opened */
  used: number;
  /** Grams a day, or null when it's too soon to say */
  perDay: number | null;
  /** When it runs out at that rate */
  runsOut: Date | null;
};

export function usageRate(
  spool: {
    openedOn: Date | string | null;
    weightGrams: number;
    remainingPercent: number;
  },
  now: Date = new Date()
): Rate {
  const used = Math.round(
    (spool.weightGrams *
      (100 - Math.max(0, Math.min(100, spool.remainingPercent)))) /
      100
  );
  if (!spool.openedOn) return { used, perDay: null, runsOut: null };
  const days = (now.getTime() - new Date(spool.openedOn).getTime()) / DAY;
  if (days < 1 || used <= 0) return { used, perDay: null, runsOut: null };
  const perDay = used / days;
  const left = spool.weightGrams - used;
  return {
    used,
    perDay,
    runsOut: left > 0 ? new Date(now.getTime() + (left / perDay) * DAY) : now,
  };
}

/** How many days what's on hand lasts at a rate, or null without one. */
export function daysOnHand(grams: number, perDay: number | null) {
  return perDay && perDay > 0 ? Math.round(grams / perDay) : null;
}
