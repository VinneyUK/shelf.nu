/**
 * A filament's usage over time (fork): the daily series, the average and
 * the projection.
 */
import { describe, expect, it } from "vitest";
import { averageUse, dailySeries, projection } from "./levels";

const today = new Date("2026-10-20T12:00:00Z");

describe("dailySeries", () => {
  it("fills days without a record with the last one, starting at the first record", () => {
    const s = dailySeries(
      [
        { day: "2026-10-17", grams: 3000 },
        { day: "2026-10-19", grams: 2600 },
      ],
      today,
      7
    );
    expect(s).toEqual([
      { day: "2026-10-17", grams: 3000 },
      { day: "2026-10-18", grams: 3000 },
      { day: "2026-10-19", grams: 2600 },
      { day: "2026-10-20", grams: 2600 },
    ]);
  });

  it("carries in the last record from before the window", () => {
    const s = dailySeries([{ day: "2026-09-01", grams: 900 }], today, 3);
    expect(s.map((d) => d.grams)).toEqual([900, 900, 900]);
  });
});

describe("averageUse", () => {
  it("averages the drops, a day of buying counting as no use", () => {
    const s = [3000, 2800, 2700, 3700, 3500].map((grams, i) => ({
      day: `d${i}`,
      grams,
    }));
    // drops: 200, 100, 0 (bought), 200 → 500 over 4 days
    expect(averageUse(s)).toBe(125);
  });

  it("needs a few days to go on", () => {
    expect(
      averageUse([
        { day: "a", grams: 1 },
        { day: "b", grams: 0 },
      ])
    ).toBeNull();
  });
});

describe("projection", () => {
  it("runs down a day at a time to empty", () => {
    const p = projection({ day: "2026-10-20", grams: 250 }, 100);
    expect(p).toEqual([
      { day: "2026-10-21", grams: 150 },
      { day: "2026-10-22", grams: 50 },
      { day: "2026-10-23", grams: 0 },
    ]);
  });

  it("is nothing without a rate", () => {
    expect(projection({ day: "2026-10-20", grams: 250 }, null)).toEqual([]);
    expect(projection(undefined, 100)).toEqual([]);
  });
});
