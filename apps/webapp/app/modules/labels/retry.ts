/** labels feature: gap before trying a failed print again — 30 s, 1, 2, 4… up to 10 minutes. */
export function retryDelayMs(attempts: number) {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000);
}

/**
 * A job held for you (fork): not tried again on its own. Its next try is set
 * this far ahead, and only "Try again now" brings it back.
 */
export const HELD_UNTIL = new Date("9999-01-01T00:00:00Z");

/** Most automatic tries for a job Home Assistant couldn't be reached for. */
export const MAX_AUTOMATIC_TRIES = 6;

/** Whether a job's next try is a hold, waiting for you. */
export const isHeld = (next: Date | string | null | undefined) =>
  !!next && new Date(next).getFullYear() >= 9999;

/**
 * What to do after a failed print (fork). Only when Home Assistant couldn't be
 * reached at all, or isn't set up, is it certain nothing printed: those are
 * tried again on their own, a few times. Any answer from Home Assistant, an
 * error included, may come after the label has printed (a Niimbot can report
 * paper out or a Bluetooth error once it's done), so trying again on its own
 * could print it twice, and did, all night: those wait for you instead.
 */
export function afterFailure(
  message: string,
  attempts: number,
  now = Date.now()
): { nextAttemptAt: Date; held: boolean } {
  const certainNothingPrinted =
    message.startsWith("Couldn't reach Home Assistant") ||
    message.startsWith("The printer isn't set up");
  if (certainNothingPrinted && attempts < MAX_AUTOMATIC_TRIES)
    return {
      nextAttemptAt: new Date(now + retryDelayMs(attempts)),
      held: false,
    };
  return { nextAttemptAt: HELD_UNTIL, held: true };
}
