import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const spool = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const spoolCandidate = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  return { spool, spoolCandidate };
});
vi.mock("~/database/db.server", () => ({
  db: {
    spool: m.spool,
    spoolCandidate: m.spoolCandidate,
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ spool: m.spool, spoolCandidate: m.spoolCandidate }),
  },
}));

import {
  approveCandidate,
  createSpool,
  createSpools,
  getFilamentBySlug,
  keepSpool,
  proposeSpool,
  retireSpool,
  updateFilament,
  updateSpool,
  updateSpoolDetails,
  weighSpool,
} from "./service.server";

const input = {
  type: "PLA Basic",
  colourName: "Jade White",
  colourHex: "#ffffff",
  weightGrams: 1000,
  remainingPercent: 100,
  pricePaid: 19.99,
  purchasedOn: null,
  amsSlot: null,
  notes: null,
};

beforeEach(() => {
  for (const g of [m.spool, m.spoolCandidate])
    Object.values(g).forEach((f) => f.mockReset());
  m.spool.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: "s-new", ...data })
  );
  m.spool.update.mockImplementation(({ data }) => Promise.resolve(data));
  m.spool.updateMany.mockResolvedValue({ count: 1 });
  m.spoolCandidate.create.mockResolvedValue({ id: "c-new" });
});

describe("adding and editing spools", () => {
  it("adds a spool with its material and a tidy colour", async () => {
    const s = await createSpool("o1", input);
    expect(s).toMatchObject({
      material: "PLA",
      colourHex: "#FFFFFF",
      status: "active",
      source: "manual",
      organizationId: "o1",
    });
  });
  it("refuses what doesn't make sense, in plain words", async () => {
    await expect(createSpool("o1", { ...input, type: " " })).rejects.toThrow(
      /filament type/
    );
    await expect(
      createSpool("o1", { ...input, colourHex: "green" })
    ).rejects.toThrow(/Choose a colour/);
    await expect(
      createSpool("o1", { ...input, weightGrams: 0 })
    ).rejects.toThrow(/grams/);
    await expect(createSpool("o1", { ...input, amsSlot: 5 })).rejects.toThrow(
      /slots 1 to 4/
    );
  });
  it("puts one spool in an AMS slot: whatever was there comes out", async () => {
    await createSpool("o1", { ...input, amsSlot: 2 });
    expect(m.spool.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "o1", amsSlot: 2 },
      data: { amsSlot: null },
    });
    m.spool.findFirst.mockResolvedValue({ id: "s1", status: "active" });
    await updateSpool("o1", "s1", { ...input, amsSlot: 3 });
    expect(m.spool.updateMany).toHaveBeenLastCalledWith({
      where: { organizationId: "o1", amsSlot: 3, NOT: { id: "s1" } },
      data: { amsSlot: null },
    });
  });
  it("doesn't retire a spool at 0%: it waits for you to confirm", async () => {
    m.spool.findFirst.mockResolvedValue({ id: "s1", status: "active" });
    const s = await updateSpool("o1", "s1", { ...input, remainingPercent: 0 });
    expect(s.status).toBe("empty");
  });
  it("leaves a retired spool retired when it's edited", async () => {
    m.spool.findFirst.mockResolvedValue({ id: "s1", status: "retired" });
    expect(
      (await updateSpool("o1", "s1", { ...input, remainingPercent: 50 })).status
    ).toBe("retired");
  });
});

describe("running out", () => {
  it("retires on confirmation, and takes it out of the AMS", async () => {
    await retireSpool("o1", "s1");
    expect(m.spool.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "s1", organizationId: "o1" },
      data: { status: "retired", amsSlot: null, remainingPercent: 0 },
    });
  });
  it("can be told it isn't empty after all, with how much is left", async () => {
    await keepSpool("o1", "s1", 15);
    expect(m.spool.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "active",
      remainingPercent: 15,
    });
    await expect(keepSpool("o1", "s1", 0)).rejects.toThrow(/more than 0%/);
  });
});

describe("the inbox", () => {
  const found = {
    source: "ams" as const,
    type: "PLA Matte",
    colourName: "Charcoal",
    colourHex: "000000FF",
    tagUid: "TAG1",
    remainingPercent: 87,
    amsSlot: 1,
  };

  it("never proposes a spool you already have", async () => {
    m.spool.findFirst.mockResolvedValue({ id: "s9" });
    expect(await proposeSpool("o1", found)).toEqual({
      kind: "known",
      spoolId: "s9",
    });
    expect(m.spoolCandidate.create).not.toHaveBeenCalled();
  });
  it("refreshes one that's already waiting, rather than adding it twice", async () => {
    m.spool.findFirst.mockResolvedValue(null);
    m.spoolCandidate.findFirst.mockResolvedValue({ id: "c1" });
    expect(await proposeSpool("o1", found)).toEqual({
      kind: "pending",
      candidateId: "c1",
    });
    expect(m.spoolCandidate.update.mock.calls[0][0].data).toMatchObject({
      remainingPercent: 87,
      colourHex: "#000000",
      material: "PLA",
    });
    expect(m.spoolCandidate.create).not.toHaveBeenCalled();
  });
  it("adds a new one to the inbox", async () => {
    m.spool.findFirst.mockResolvedValue(null);
    m.spoolCandidate.findFirst.mockResolvedValue(null);
    expect(await proposeSpool("o1", found)).toEqual({
      kind: "pending",
      candidateId: "c-new",
    });
  });
  it("approving makes the spool, keeps its tag, and closes the entry", async () => {
    m.spoolCandidate.findFirst.mockResolvedValue({
      id: "c1",
      source: "ams",
      tagUid: "TAG1",
    });
    const s = await approveCandidate("o1", "c1", {
      ...input,
      remainingPercent: 87,
    });
    expect(s).toMatchObject({
      tagUid: "TAG1",
      source: "ams",
      remainingPercent: 87,
    });
    expect(m.spoolCandidate.update).toHaveBeenCalledWith({
      where: { id: "c1", organizationId: "o1" },
      data: { status: "approved" },
    });
  });
  it("can't approve twice", async () => {
    m.spoolCandidate.findFirst.mockResolvedValue(null);
    await expect(approveCandidate("o1", "c1", input)).rejects.toThrow(
      /already been dealt with/
    );
  });
});

describe("adding several and weighing", () => {
  it("adds several identical spools, only the first into the AMS slot", async () => {
    const made = await createSpools("o1", { ...input, amsSlot: 2 }, 3);
    expect(made).toHaveLength(3);
    expect(made.map((s) => s.amsSlot)).toEqual([2, null, null]);
    expect(await createSpools("o1", input, 99)).toHaveLength(20); // capped
  });
  it("fills in the empty-spool weight from the catalogue, and keeps the box code", async () => {
    const s = await createSpools(
      "o1",
      { ...input, filamentCode: " 10100 " },
      1
    );
    expect(s[0]).toMatchObject({
      spoolWeightGrams: 250,
      filamentCode: "10100",
    });
  });
  it("sets what's left from the scale, less the empty spool", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      type: "PLA Basic",
      weightGrams: 1000,
      spoolWeightGrams: 250,
    });
    expect(await weighSpool("o1", "s1", 750)).toBe(50);
    expect(m.spool.update.mock.calls.at(-1)?.[0]).toMatchObject({
      where: { id: "s1", organizationId: "o1" },
      data: { remainingPercent: 50, status: "active" },
    });
  });
  it("marks a weighed-empty spool as run out, for you to confirm", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      type: "PLA Basic",
      weightGrams: 1000,
      spoolWeightGrams: 250,
    });
    await weighSpool("o1", "s1", 240);
    expect(m.spool.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      remainingPercent: 0,
      status: "empty",
    });
  });
  it("says what's missing when it can't weigh", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      type: "Mystery",
      weightGrams: 1000,
      spoolWeightGrams: null,
    });
    await expect(weighSpool("o1", "s1", 700)).rejects.toThrow(
      /empty spool's weight/
    );
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      type: "PLA Basic",
      weightGrams: 1000,
      spoolWeightGrams: 250,
    });
    await expect(weighSpool("o1", "s1", 0)).rejects.toThrow(/in grams/);
  });
});

describe("a filament's own page", () => {
  const spool = (id: string, type: string, colourName: string, extra = {}) => ({
    id,
    type,
    colourName,
    status: "active",
    ...extra,
  });
  it("finds every spool of the filament by its address", async () => {
    m.spool.findMany.mockResolvedValue([
      spool("a", "PLA Basic", "Pumpkin Orange"),
      spool("b", "PLA Matte", "Ivory White"),
      spool("c", "PLA Basic", "pumpkin orange"),
    ]);
    expect(
      (await getFilamentBySlug("o1", "pla-basic--pumpkin-orange")).map(
        (s) => s.id
      )
    ).toEqual(["a", "c"]);
  });
  it("edits the filament on every one of its spools, and gives the new address after a rename", async () => {
    m.spool.findMany.mockResolvedValue([
      spool("a", "PLA Basic", "Pumpkin Orange"),
      spool("c", "PLA Basic", "Pumpkin Orange"),
    ]);
    const next = await updateFilament("o1", "pla-basic--pumpkin-orange", {
      type: "PLA Matte",
      colourName: "Mandarin Orange",
      colourHex: "#f99963",
      filamentCode: " 11300 ",
      weightGrams: 1000,
      spoolWeightGrams: null,
    });
    expect(next).toBe("pla-matte--mandarin-orange");
    expect(m.spool.updateMany).toHaveBeenLastCalledWith({
      where: { organizationId: "o1", id: { in: ["a", "c"] } },
      data: {
        type: "PLA Matte",
        material: "PLA",
        colourName: "Mandarin Orange",
        colourHex: "#F99963",
        filamentCode: "11300",
        weightGrams: 1000,
        spoolWeightGrams: 250,
      },
    });
  });
  it("won't edit a filament that isn't there", async () => {
    m.spool.findMany.mockResolvedValue([]);
    await expect(
      updateFilament("o1", "x--y", {
        type: "PLA Basic",
        colourName: "Red",
        colourHex: "#ff0000",
        filamentCode: null,
        weightGrams: 1000,
        spoolWeightGrams: null,
      })
    ).rejects.toThrow(/doesn't exist/);
  });
  it("edits one spool's own details, keeping one spool per AMS slot", async () => {
    m.spool.findFirst.mockResolvedValue({ id: "a", status: "active" });
    const saved = await updateSpoolDetails("o1", "a", {
      remainingPercent: 0,
      pricePaid: 19.994,
      purchasedOn: null,
      amsSlot: 3,
      notes: " ",
    });
    expect(m.spool.updateMany).toHaveBeenLastCalledWith({
      where: { organizationId: "o1", amsSlot: 3, NOT: { id: "a" } },
      data: { amsSlot: null },
    });
    expect(saved).toMatchObject({
      remainingPercent: 0,
      status: "empty",
      pricePaid: 19.99,
      amsSlot: 3,
      notes: null,
    });
  });
  it("never loads a finished spool into the AMS", async () => {
    m.spool.findFirst.mockResolvedValue({ id: "a", status: "retired" });
    expect(
      await updateSpoolDetails("o1", "a", {
        remainingPercent: 0,
        pricePaid: null,
        purchasedOn: null,
        amsSlot: 2,
        notes: null,
      })
    ).toMatchObject({ status: "retired", amsSlot: null });
  });
});
