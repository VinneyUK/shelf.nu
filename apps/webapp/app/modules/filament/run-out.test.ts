/**
 * Run-out estimates for an open spool (fork).
 */
import { describe, expect, it } from "vitest";
import { daysOnHand, usageRate } from "./run-out";

const now = new Date("2026-10-20T12:00:00Z");

describe("usageRate", () => {
  it("works out grams a day since it was opened, and when it runs out", () => {
    const r = usageRate(
      {
        openedOn: "2026-10-17T12:00:00Z",
        weightGrams: 1000,
        remainingPercent: 27,
      },
      now
    );
    expect(r.used).toBe(730);
    expect(r.perDay).toBeCloseTo(243.33, 1);
    // 270 g left at ~243 g a day: a little over a day
    expect(r.runsOut?.toISOString().slice(0, 10)).toBe("2026-10-21");
  });

  it("says nothing until it's been open a day, or with nothing used", () => {
    expect(
      usageRate(
        {
          openedOn: "2026-10-20T06:00:00Z",
          weightGrams: 1000,
          remainingPercent: 60,
        },
        now
      ).perDay
    ).toBeNull();
    expect(
      usageRate(
        { openedOn: "2026-10-01", weightGrams: 1000, remainingPercent: 100 },
        now
      ).perDay
    ).toBeNull();
    expect(
      usageRate(
        { openedOn: null, weightGrams: 1000, remainingPercent: 50 },
        now
      )
    ).toEqual({
      used: 500,
      perDay: null,
      runsOut: null,
    });
  });
});

describe("daysOnHand", () => {
  it("is what's on hand over the rate", () => {
    expect(daysOnHand(4270, 243.33)).toBe(18);
    expect(daysOnHand(4270, null)).toBeNull();
  });
});

describe("run-out in words (fork)", () => {
  it("gives the year when it isn't this year", async () => {
    const { runOutDate } = await import("./run-out");
    const now = new Date("2026-11-01T12:00:00Z");
    expect(runOutDate(new Date("2026-11-20T12:00:00Z"), now)).toBe("20 Nov");
    expect(runOutDate(new Date("2027-11-05T12:00:00Z"), now)).toBe(
      "5 Nov 2027"
    );
  });
  it("says how long in plain words", async () => {
    const { lastsText } = await import("./run-out");
    expect(lastsText(12)).toBe("12 days");
    expect(lastsText(49)).toBe("about 7 weeks");
    expect(lastsText(330)).toBe("about 11 months");
    expect(lastsText(1042)).toBe("about 2.9 years");
  });
});
