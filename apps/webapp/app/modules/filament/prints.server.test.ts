/**
 * Usage per print (fork): measured from the slicer's figures in the print's
 * file, scaled by how far it got; recorded from the printer's reports. The
 * database is pretend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  job: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  use: { createMany: vi.fn(), deleteMany: vi.fn() },
  spool: { findMany: vi.fn() },
}));
vi.mock("~/database/db.server", () => ({
  db: {
    printJob: m.job,
    printJobUse: m.use,
    spool: m.spool,
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));
const { measurePrint, outcome, setPrintUses, trackPrint, usesFromSlicer } =
  await import("./prints.server");

const start = {
  "1": {
    spoolId: "red",
    key: "pla basic|red",
    percent: 96,
    weightGrams: 1000,
    pricePaid: 16.99,
    colourHex: "#D62B2B",
    material: "PLA",
  },
  "2": {
    spoolId: "black",
    key: "pla basic|black",
    percent: 45,
    weightGrams: 1000,
    pricePaid: 16.99,
    colourHex: "#161616",
    material: "PLA",
  },
};
const black = [{ id: 1, type: "PLA", colourHex: "#000000", grams: 33.4 }];

beforeEach(() => vi.clearAllMocks());

describe("usesFromSlicer", () => {
  it("is the slicer's grams on the spool it printed from, priced at what was paid", () => {
    expect(usesFromSlicer(black, start, [2], 1)).toEqual([
      {
        spoolId: "black",
        key: "pla basic|black",
        slot: 2,
        grams: 33,
        cost: 0.56,
      },
    ]);
  });
  it("is scaled by how far a print that stopped early got", () => {
    expect(usesFromSlicer(black, start, [2], 0.4)[0].grams).toBe(13);
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
  it("opens a record when printing starts, with its file and the AMS spools", async () => {
    m.job.findFirst.mockResolvedValue(null);
    m.spool.findMany.mockResolvedValue([
      {
        id: "red",
        amsSlot: 1,
        type: "PLA Basic",
        material: "PLA",
        colourName: "Red",
        colourHex: "#D62B2B",
        remainingPercent: 96,
        weightGrams: 1000,
        pricePaid: 16.99,
      },
    ]);
    await trackPrint("o1", "idle", {
      state: "printing",
      jobName: "Cable clips",
      gcodeFile: "Metadata/plate_1.gcode",
      activeSlot: 1,
    });
    expect(m.job.create.mock.calls[0][0].data).toMatchObject({
      name: "Cable clips",
      gcodeFile: "Metadata/plate_1.gcode",
      fedSlots: [1],
      startLevels: { "1": { spoolId: "red", colourHex: "#D62B2B" } },
    });
  });

  it("keeps each slot that feeds it while it prints", async () => {
    m.job.findFirst.mockResolvedValue({
      id: "j1",
      name: "Cable clips",
      gcodeFile: "x",
      fedSlots: [1],
    });
    await trackPrint("o1", "printing", { state: "printing", activeSlot: 2 });
    expect(m.job.updateMany.mock.calls[0][0].data).toEqual({
      fedSlots: [1, 2],
    });
  });

  it("carries on with the open record when Shelf restarts mid-print", async () => {
    m.job.findFirst.mockResolvedValue({
      id: "j1",
      name: "Cable clips",
      fedSlots: [],
    });
    await trackPrint("o1", undefined, {
      state: "printing",
      jobName: "Cable clips",
    });
    expect(m.job.create).not.toHaveBeenCalled();
  });

  it("closes it when printing stops, and measures it from its file", async () => {
    m.job.findFirst
      .mockResolvedValueOnce({ id: "j1", name: "Cable clips", fedSlots: [2] })
      .mockResolvedValueOnce({
        id: "j1",
        name: "Cable clips",
        status: "done",
        endPercent: 100,
        gcodeFile: "Metadata/plate_1.gcode",
        fedSlots: [2],
        startLevels: start,
      });
    m.job.updateMany.mockResolvedValue({ count: 1 });
    const readFile = vi.fn().mockResolvedValue(black);
    await trackPrint(
      "o1",
      "printing",
      { state: "idle", percent: 100 },
      readFile
    );
    expect(m.job.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "done",
      endPercent: 100,
    });
    expect(readFile).toHaveBeenCalledWith(
      "Metadata/plate_1.gcode",
      "Cable clips"
    );
    expect(m.use.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ jobId: "j1", spoolId: "black", grams: 33 }),
    ]);
  });
});

describe("measurePrint", () => {
  it("says so when the printer no longer has the file", async () => {
    m.job.findFirst.mockResolvedValue({
      id: "j1",
      name: "Gone",
      status: "done",
      startLevels: start,
      fedSlots: [],
    });
    expect(
      await measurePrint("o1", "j1", vi.fn().mockResolvedValue(null))
    ).toEqual({ measured: false });
    expect(m.use.createMany).not.toHaveBeenCalled();
  });
});

describe("setPrintUses", () => {
  it("replaces a print's filament with what's set by hand, priced", async () => {
    m.job.findFirst.mockResolvedValue({ id: "j1" });
    m.spool.findMany.mockResolvedValue([
      {
        id: "black",
        type: "PLA Basic",
        colourName: "Black",
        amsSlot: 2,
        weightGrams: 1000,
        pricePaid: 16.99,
      },
    ]);
    await setPrintUses("o1", "j1", [
      { spoolId: "black", grams: 34 },
      { spoolId: "nope", grams: 5 },
    ]);
    expect(m.use.deleteMany).toHaveBeenCalled();
    expect(m.use.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        spoolId: "black",
        key: "pla basic|black",
        grams: 34,
        cost: 0.58,
      }),
    ]);
    expect(m.job.updateMany.mock.calls[0][0].data).toEqual({
      source: "manual",
    });
  });
});
