/**
 * Keeping each filament's daily level (fork), against a pretend database.
 */
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ spools: vi.fn(), upsert: vi.fn() }));
vi.mock("~/database/db.server", () => ({
  db: {
    spool: { findMany: m.spools },
    filamentLevel: { upsert: m.upsert, findMany: vi.fn() },
  },
}));
const { recordLevels } = await import("./levels.server");

describe("recordLevels", () => {
  it("saves today's grams on hand for each filament, finished ones left out", async () => {
    m.spools.mockResolvedValue([
      {
        type: "PLA Basic",
        colourName: "Jade White",
        weightGrams: 1000,
        remainingPercent: 27,
        pricePaid: null,
      },
      {
        type: "PLA Basic",
        colourName: "Jade White",
        weightGrams: 1000,
        remainingPercent: 100,
        pricePaid: null,
      },
      {
        type: "PLA Matte",
        colourName: "Charcoal",
        weightGrams: 1000,
        remainingPercent: 50,
        pricePaid: null,
      },
    ]);
    m.upsert.mockResolvedValue({});
    await recordLevels("o1");
    expect(m.spools.mock.calls[0][0].where).toEqual({
      organizationId: "o1",
      status: { not: "retired" },
    });
    const saved = m.upsert.mock.calls.map((c) => [
      c[0].create.key,
      c[0].create.grams,
    ]);
    expect(saved).toEqual([
      ["pla basic|jade white", 1270],
      ["pla matte|charcoal", 500],
    ]);
  });

  it("records a 0 for one filament with nothing left", async () => {
    m.spools.mockResolvedValue([]);
    m.upsert.mockClear();
    await recordLevels("o1", "pla silk|gold");
    expect(m.upsert.mock.calls[0][0].create).toMatchObject({
      key: "pla silk|gold",
      grams: 0,
    });
  });
});
