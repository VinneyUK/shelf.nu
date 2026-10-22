/**
 * Usage per print (fork): what each spool used, how a print ended, and its
 * record kept from the printer's reports. The database is pretend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  job: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  use: { createMany: vi.fn() },
  spool: { findMany: vi.fn() },
}));
vi.mock("~/database/db.server", () => ({
  db: { printJob: m.job, printJobUse: m.use, spool: m.spool },
}));
const { finishPrint, outcome, trackPrint, usesFrom } = await import(
  "./prints.server"
);

const start = {
  "1": {
    spoolId: "red",
    key: "pla basic|red",
    percent: 96,
    weightGrams: 1000,
    pricePaid: 16.99,
  },
  "2": {
    spoolId: "black",
    key: "pla basic|black",
    percent: 45,
    weightGrams: 1000,
    pricePaid: null,
  },
};

beforeEach(() => vi.clearAllMocks());

describe("usesFrom", () => {
  it("is each spool's drop in level, in grams, priced at what was paid", () => {
    expect(
      usesFrom(
        start,
        new Map([
          ["red", 92],
          ["black", 45],
        ])
      )
    ).toEqual([
      { spoolId: "red", key: "pla basic|red", slot: 1, grams: 40, cost: 0.68 },
    ]);
  });
  it("has no cost for a spool with no price", () => {
    expect(
      usesFrom(
        start,
        new Map([
          ["red", 96],
          ["black", 25],
        ])
      )[0]
    ).toMatchObject({
      grams: 200,
      cost: null,
    });
  });
});

describe("outcome", () => {
  it("is finished at the end, failed on an error, otherwise cancelled", () => {
    expect(outcome({ state: "idle", percent: 100 })).toBe("done");
    expect(outcome({ state: "error", percent: 40 })).toBe("failed");
    expect(outcome({ state: "idle", percent: 40 })).toBe("cancelled");
  });
});

describe("trackPrint", () => {
  it("opens a record when printing starts, with each AMS spool's level", async () => {
    m.job.findFirst.mockResolvedValue(null);
    m.spool.findMany.mockResolvedValue([
      {
        id: "red",
        amsSlot: 1,
        type: "PLA Basic",
        colourName: "Red",
        remainingPercent: 96,
        weightGrams: 1000,
        pricePaid: 16.99,
      },
    ]);
    await trackPrint("o1", "idle", {
      state: "printing",
      jobName: "Cable clips",
    });
    expect(m.job.create.mock.calls[0][0].data).toMatchObject({
      organizationId: "o1",
      name: "Cable clips",
      startLevels: { "1": { spoolId: "red", percent: 96 } },
    });
  });

  it("carries on with the open record when Shelf restarts mid-print", async () => {
    m.job.findFirst.mockResolvedValue({ id: "j1", name: "Cable clips" });
    await trackPrint("o1", undefined, {
      state: "printing",
      jobName: "Cable clips",
    });
    expect(m.job.create).not.toHaveBeenCalled();
  });

  it("closes it a little after printing stops, once the levels have settled", async () => {
    vi.useFakeTimers();
    m.job.findFirst.mockResolvedValue({
      id: "j1",
      name: "Cable clips",
      status: "running",
      startLevels: start,
    });
    await trackPrint("o1", "printing", { state: "idle", percent: 100 });
    expect(m.job.updateMany).not.toHaveBeenCalled();
    m.spool.findMany.mockResolvedValue([
      { id: "red", remainingPercent: 92, status: "active" },
      { id: "black", remainingPercent: 45, status: "active" },
    ]);
    m.job.updateMany.mockResolvedValue({ count: 1 });
    await vi.advanceTimersByTimeAsync(91_000);
    expect(m.job.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "done",
    });
    expect(m.use.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ jobId: "j1", spoolId: "red", grams: 40 }),
    ]);
    vi.useRealTimers();
  });
});

describe("finishPrint", () => {
  it("counts a spool that ran out and was finished as empty", async () => {
    m.job.findFirst.mockResolvedValue({
      id: "j1",
      startLevels: { "2": start["2"] },
    });
    m.spool.findMany.mockResolvedValue([
      { id: "black", remainingPercent: 0, status: "retired" },
    ]);
    m.job.updateMany.mockResolvedValue({ count: 1 });
    await finishPrint("o1", "j1", "done");
    expect(m.use.createMany.mock.calls[0][0].data[0]).toMatchObject({
      grams: 450,
    });
  });

  it("records it only once", async () => {
    m.job.findFirst.mockResolvedValue({ id: "j1", startLevels: start });
    m.spool.findMany.mockResolvedValue([
      { id: "red", remainingPercent: 90, status: "active" },
    ]);
    m.job.updateMany.mockResolvedValue({ count: 0 });
    await finishPrint("o1", "j1", "done");
    expect(m.use.createMany).not.toHaveBeenCalled();
  });
});
