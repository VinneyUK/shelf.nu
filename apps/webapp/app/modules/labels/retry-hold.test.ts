/**
 * After a failed print (fork): tried again on its own only when nothing can
 * have printed; anything Home Assistant answered waits for you, so a label is
 * never printed over and over (as one was, all night, on "paper out").
 */
import { describe, expect, it } from "vitest";
import { afterFailure, HELD_UNTIL, isHeld, MAX_AUTOMATIC_TRIES } from "./retry";

const now = Date.parse("2026-10-25T07:00:00Z");

describe("afterFailure", () => {
  it("waits for you after any answer from Home Assistant, which may come after it printed", () => {
    for (const message of [
      `Home Assistant couldn't print it (HTTP 500). {"message":"Failed to print: Printer error: PaperOutException"}`,
      "Home Assistant refused the token. Check it in Labels → Settings.",
      "Printing failed unexpectedly.",
    ]) {
      const out = afterFailure(message, 1, now);
      expect(out.held).toBe(true);
      expect(out.nextAttemptAt).toEqual(HELD_UNTIL);
    }
  });

  it("tries again on its own when Home Assistant couldn't be reached, a few times only", () => {
    const first = afterFailure(
      "Couldn't reach Home Assistant at http://ha:8123.",
      1,
      now
    );
    expect(first.held).toBe(false);
    expect(first.nextAttemptAt.getTime()).toBe(now + 30_000);
    const last = afterFailure(
      "Couldn't reach Home Assistant at http://ha:8123.",
      MAX_AUTOMATIC_TRIES,
      now
    );
    expect(last.held).toBe(true);
  });

  it("knows a held job when it sees one", () => {
    expect(isHeld(HELD_UNTIL)).toBe(true);
    expect(isHeld(new Date(now))).toBe(false);
    expect(isHeld(null)).toBe(false);
  });
});
