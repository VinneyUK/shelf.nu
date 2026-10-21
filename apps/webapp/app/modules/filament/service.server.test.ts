const imageRows = vi.hoisted(() => vi.fn());

import { beforeEach, describe, expect, it, vi } from "vitest";
import { filamentSlug } from "./catalogue";

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
// filament labels: numbering has its own tests; here, only that it's told
const carryFilamentNumber = vi.hoisted(() => vi.fn());
vi.mock("./numbers.server", () => ({ carryFilamentNumber }));

vi.mock("./codes.server", () => ({
  storeCodes: vi.fn().mockResolvedValue([]),
}));
vi.mock("~/database/db.server", () => ({
  db: {
    filamentImage: { findMany: imageRows },
    spool: m.spool,
    spoolCandidate: m.spoolCandidate,
    $transaction: (fn: unknown) =>
      typeof fn === "function"
        ? fn({ spool: m.spool, spoolCandidate: m.spoolCandidate })
        : Promise.all(fn as unknown[]),
  },
}));

import {
  approveCandidate,
  changeSpoolState,
  createSpool,
  createSpools,
  getFilamentBySlug,
  keepSpool,
  knownCodes,
  linkUntaggedToTray,
  openedFor,
  openSpool,
  proposeSpool,
  renameFilament,
  retireSpool,
  syncAmsTrays,
  updateFilament,
  updateFilamentField,
  setAmsSlot,
  reorderSealed,
  updateSpool,
  updateSpoolDetails,
  updateSpoolField,
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
  it("retires on confirmation, and takes it out of the AMS, keeping what was left", async () => {
    m.spool.findFirst.mockResolvedValue({ remainingPercent: 27 });
    await retireSpool("o1", "s1");
    expect(m.spool.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "s1", organizationId: "o1" },
      data: {
        status: "retired",
        amsSlot: null,
        remainingPercent: 0,
        retiredPercent: 27,
      },
    });
  });
  it("can be told it isn't empty after all, with how much is left", async () => {
    m.spool.findFirst.mockResolvedValue({ retiredPercent: null });
    await keepSpool("o1", "s1", 15);
    expect(m.spool.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "active",
      remainingPercent: 15,
      retiredPercent: null,
    });
    await expect(keepSpool("o1", "s1", 0)).rejects.toThrow(/more than 0%/);
  });
  it("brings it back as it was when it was marked finished (fork)", async () => {
    m.spool.findFirst.mockResolvedValue({ retiredPercent: 27 });
    expect(await keepSpool("o1", "s1")).toBe(27);
    expect(m.spool.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "active",
      remainingPercent: 27,
    });
  });
  it("marked Opened again, a finished one comes back with what it had (fork)", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "retired",
      remainingPercent: 0,
      retiredPercent: 40,
      openedOn: new Date("2026-10-01"),
      amsSlot: null,
    });
    m.spool.update.mockResolvedValue({});
    await changeSpoolState("o1", "s1", "opened");
    expect(m.spool.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      status: "active",
      remainingPercent: 40,
      retiredPercent: null,
    });
  });
  it("asks how much is left when that wasn't kept", async () => {
    m.spool.findFirst.mockResolvedValue({ retiredPercent: null });
    await expect(keepSpool("o1", "s1")).rejects.toThrow(/more than 0%/);
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

describe("an inbox entry for several spools", () => {
  it("approving adds that many, the first taking the tag and AMS slot", async () => {
    m.spoolCandidate.findFirst.mockResolvedValue({
      id: "c1",
      source: "receipt",
      tagUid: "T",
      quantity: 3,
    });
    await approveCandidate("o1", "c1", { ...input, amsSlot: 2 });
    const made = m.spool.create.mock.calls.map((c) => c[0].data);
    expect(made).toHaveLength(3);
    expect(made.map((d) => [d.amsSlot, d.tagUid ?? null])).toEqual([
      [2, "T"],
      [null, null],
      [null, null],
    ]);
  });
  it("adds the number you choose when approving", async () => {
    m.spoolCandidate.findFirst.mockResolvedValue({
      id: "c1",
      source: "receipt",
      tagUid: null,
      quantity: 3,
    });
    await approveCandidate("o1", "c1", input, 1);
    expect(m.spool.create).toHaveBeenCalledTimes(1);
  });
  it("keeps a receipt's quantity on the entry it proposes", async () => {
    m.spool.findFirst.mockResolvedValue(null);
    m.spoolCandidate.findFirst.mockResolvedValue(null);
    await proposeSpool("o1", {
      source: "receipt",
      type: "PLA Basic",
      colourName: "Jade White",
      colourHex: "#ffffff",
      quantity: 4,
    });
    expect(m.spoolCandidate.create.mock.calls[0][0].data).toMatchObject({
      quantity: 4,
      source: "receipt",
    });
  });
});

describe("opening spools", () => {
  const todayDate = () =>
    new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  it("opens itself when it goes into the AMS or starts being used, unless a date is given", () => {
    expect(
      openedFor({ openedOn: null, amsSlot: null, remainingPercent: 100 })
    ).toBeNull();
    expect(
      openedFor({ openedOn: null, amsSlot: 3, remainingPercent: 100 })
    ).toEqual(todayDate());
    expect(
      openedFor({ openedOn: null, amsSlot: null, remainingPercent: 80 })
    ).toEqual(todayDate());
    const given = new Date("2026-09-01T00:00:00.000Z");
    expect(
      openedFor({ openedOn: given, amsSlot: 3, remainingPercent: 20 })
    ).toBe(given);
  });
  it("adds new spools sealed, except the one going into the AMS", async () => {
    const made = await createSpools("o1", { ...input, amsSlot: 1 }, 3);
    expect(made.map((s) => (s.openedOn ? "opened" : "new"))).toEqual([
      "opened",
      "new",
      "new",
    ]);
  });
  it("won't have a spool opened before it was bought", async () => {
    await expect(
      createSpool("o1", {
        ...input,
        purchasedOn: new Date("2026-10-10"),
        openedOn: new Date("2026-10-01"),
      })
    ).rejects.toThrow(/before the bought date/);
  });
  it("opens a New spool today, or on the day you say", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      purchasedOn: new Date("2026-09-01"),
    });
    expect(await openSpool("o1", "s1")).toEqual(todayDate());
    expect(await openSpool("o1", "s1", new Date("2026-09-15"))).toEqual(
      new Date("2026-09-15")
    );
    await expect(openSpool("o1", "s1", new Date("2026-08-01"))).rejects.toThrow(
      /before the bought date/
    );
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "retired",
      purchasedOn: null,
    });
    await expect(openSpool("o1", "s1")).rejects.toThrow(/retired/);
  });
  it("opens a spool when weighing shows some has gone", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      type: "PLA Basic",
      weightGrams: 1000,
      spoolWeightGrams: 250,
      openedOn: null,
    });
    await weighSpool("o1", "s1", 750);
    expect(m.spool.update.mock.calls.at(-1)?.[0].data.openedOn).toEqual(
      todayDate()
    );
    await weighSpool("o1", "s1", 1250); // still full: still sealed
    expect(m.spool.update.mock.calls.at(-1)?.[0].data.openedOn).toBeNull();
  });
  it("brings a spool the AMS found in opened, and a receipt's spools in new", async () => {
    m.spoolCandidate.findFirst.mockResolvedValue({
      id: "c1",
      source: "ams",
      tagUid: "T",
      quantity: 1,
    });
    await approveCandidate("o1", "c1", input);
    expect(m.spool.create.mock.calls.at(-1)?.[0].data.openedOn).toEqual(
      todayDate()
    );
    m.spoolCandidate.findFirst.mockResolvedValue({
      id: "c2",
      source: "receipt",
      tagUid: null,
      quantity: 2,
    });
    await approveCandidate("o1", "c2", {
      ...input,
      purchasedOn: new Date("2026-10-12"),
    });
    const last = m.spool.create.mock.calls.slice(-2).map((c) => c[0].data);
    expect(last.map((d) => d.openedOn)).toEqual([null, null]);
    expect(last[0].purchasedOn).toEqual(new Date("2026-10-12"));
  });
  it("lets you clear an opened date on a full spool on the shelf, but not on one in use", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      openedOn: new Date("2026-10-01"),
    });
    const cleared = await updateSpoolDetails("o1", "s1", {
      remainingPercent: 100,
      pricePaid: null,
      purchasedOn: null,
      openedOn: null,
      amsSlot: null,
      notes: null,
    });
    expect(cleared.openedOn).toBeNull();
    const inUse = await updateSpoolDetails("o1", "s1", {
      remainingPercent: 100,
      pricePaid: null,
      purchasedOn: null,
      openedOn: null,
      amsSlot: 2,
      notes: null,
    });
    expect(inUse.openedOn).toEqual(todayDate());
  });
});

describe("changing a spool's status by hand", () => {
  const last = () => m.spool.update.mock.calls.at(-1)?.[0].data;
  it("back to New: unopened, out of the AMS, full", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      openedOn: new Date("2026-10-01"),
      amsSlot: 2,
      remainingPercent: 60,
    });
    expect(await changeSpoolState("o1", "s1", "new")).toMatch(/back to 100%/);
    expect(last()).toMatchObject({
      openedOn: null,
      amsSlot: null,
      remainingPercent: 100,
      status: "active",
    });
  });
  it("to Opened: opens a New spool today", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      openedOn: null,
      amsSlot: null,
      remainingPercent: 100,
    });
    expect(await changeSpoolState("o1", "s1", "opened")).toBe("Opened today.");
    expect(last().openedOn).toBeInstanceOf(Date);
  });
  it("to Opened: takes a spool out of the AMS, keeping its opened date", async () => {
    const opened = new Date("2026-09-20");
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      openedOn: opened,
      amsSlot: 3,
      remainingPercent: 40,
    });
    expect(await changeSpoolState("o1", "s1", "opened")).toMatch(
      /Taken out of AMS 3/
    );
    expect(last()).toMatchObject({
      openedOn: opened,
      amsSlot: null,
      remainingPercent: 40,
    });
  });
  it("to Opened: brings back a retired spool with a little left", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "retired",
      openedOn: new Date("2026-09-20"),
      amsSlot: null,
      remainingPercent: 0,
    });
    expect(await changeSpoolState("o1", "s1", "opened")).toMatch(/5% left/);
    expect(last()).toMatchObject({
      status: "active",
      retiredAt: null,
      remainingPercent: 5,
    });
  });
  it("to Retired", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      status: "active",
      openedOn: null,
      amsSlot: null,
      remainingPercent: 30,
    });
    expect(await changeSpoolState("o1", "s1", "retired")).toMatch(/Retired/);
  });
});

describe("refills", () => {
  it("are kept as refills, and anything else is a spool", async () => {
    const [refill] = await createSpools(
      "o1",
      { ...input, packaging: "refill" },
      1
    );
    expect(refill.packaging).toBe("refill");
    const [spool] = await createSpools("o1", input, 1);
    expect(spool.packaging).toBe("spool");
  });
  it("come through the inbox as refills", async () => {
    m.spool.findFirst.mockResolvedValue(null);
    m.spoolCandidate.findFirst.mockResolvedValue(null);
    await proposeSpool("o1", {
      source: "receipt",
      type: "PLA Basic",
      colourName: "Jade White",
      colourHex: "#fff",
      packaging: "refill",
    });
    expect(m.spoolCandidate.create.mock.calls.at(-1)?.[0].data.packaging).toBe(
      "refill"
    );
  });
});

describe("codes Shelf knows", () => {
  it("come from your spools and from the store, one per filament", async () => {
    m.spool.findMany.mockResolvedValue([
      { type: "PLA Basic", colourName: "Jade White", filamentCode: "10100" },
      { type: "PLA Basic", colourName: "Jade White", filamentCode: "10100" },
      { type: "PLA Basic", colourName: "Hot Pink", filamentCode: null },
    ]);
    imageRows.mockResolvedValue([
      { key: "pla basic|hot pink", filamentCode: "10204" },
      { key: "pla basic|gone", filamentCode: "99999" },
    ]);
    expect(await knownCodes("o1")).toEqual([
      { code: "10100", type: "PLA Basic", colourName: "Jade White" },
      { code: "10204", type: "PLA Basic", colourName: "Hot Pink" },
    ]);
  });
});

describe("the AMS, brought into Filament", () => {
  beforeEach(() => {
    m.spool.findMany.mockResolvedValue([]); // nothing leaving, unless a test says so
  });
  const tray = (
    slot: number,
    tagUid: string,
    over: Record<string, unknown> = {}
  ) => ({
    slot,
    tagUid,
    rawTag: tagUid,
    type: "PLA Basic",
    colourHex: "#C12E1F",
    colourName: "Red",
    remainingPercent: 93,
    weightGrams: 1000,
    ...over,
  });
  it("updates a known tag's slot and what's left, and opens it", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      openedOn: null,
      status: "active",
    });
    m.spool.updateMany.mockResolvedValue({ count: 0 });
    const result = await syncAmsTrays("o1", [
      tray(2, "TAG1", { remainingPercent: 46 }),
    ]);
    expect(m.spool.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      amsSlot: 2,
      remainingPercent: 46,
      status: "active",
    });
    expect(m.spool.update.mock.calls.at(-1)?.[0].data.openedOn).toBeInstanceOf(
      Date
    );
    expect(result).toMatchObject({ inSlots: 1, proposed: 0, unloaded: 0 });
  });
  it("tells an open page just the new level when only that changed (live, fork)", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      openedOn: new Date("2026-10-01"),
      status: "active",
      amsSlot: 2,
    });
    m.spool.findMany.mockResolvedValue([]);
    m.spool.updateMany.mockResolvedValue({ count: 0 });
    const result = await syncAmsTrays("o1", [
      tray(2, "TAG1", { remainingPercent: 45 }),
    ]);
    expect(result.levels).toEqual([
      { id: "s1", remainingPercent: 45, amsSlot: 2 },
    ]);
    expect(result.refresh).toBe(false);
  });
  it("asks an open page to refresh when a spool is opened, moved or runs out (live, fork)", async () => {
    m.spool.findMany.mockResolvedValue([]);
    m.spool.updateMany.mockResolvedValue({ count: 0 });
    const opened = {
      id: "s1",
      openedOn: new Date("2026-10-01"),
      status: "active",
      amsSlot: 2,
    };
    m.spool.findFirst.mockResolvedValue({ ...opened, openedOn: null });
    expect((await syncAmsTrays("o1", [tray(2, "TAG1")])).refresh).toBe(true);
    m.spool.findFirst.mockResolvedValue({ ...opened, amsSlot: 1 });
    expect((await syncAmsTrays("o1", [tray(2, "TAG1")])).refresh).toBe(true);
    m.spool.findFirst.mockResolvedValue(opened);
    expect(
      (await syncAmsTrays("o1", [tray(2, "TAG1", { remainingPercent: 0 })]))
        .refresh
    ).toBe(true);
  });
  it("sends a new tag to the inbox with its slot, line and colour", async () => {
    m.spool.findFirst.mockResolvedValue(null);
    m.spoolCandidate.findFirst.mockResolvedValue(null);
    m.spool.findMany.mockResolvedValue([]);
    m.spool.updateMany.mockResolvedValue({ count: 0 });
    const result = await syncAmsTrays("o1", [tray(1, "TAGNEW")]);
    expect(result.events).toEqual([
      "New filament in AMS slot 1: Red PLA Basic, waiting for you.",
    ]);
    expect(m.spoolCandidate.create.mock.calls.at(-1)?.[0].data).toMatchObject({
      source: "ams",
      type: "PLA Basic",
      colourName: "Red",
      colourHex: "#C12E1F",
      amsSlot: 1,
      tagUid: "TAGNEW",
      remainingPercent: 93,
    });
    expect(result.proposed).toBe(1);
  });
  it("takes tagged filament out of the AMS when its tag has gone, leaving hand-placed and retired alone", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "s9",
      openedOn: new Date(),
      status: "retired",
    });
    m.spool.update.mockClear();
    m.spool.findMany.mockResolvedValue([
      { colourName: "Black", type: "PLA Basic", amsSlot: 2 },
      { colourName: "Green", type: "PLA Basic", amsSlot: 4 },
    ]);
    m.spool.updateMany.mockResolvedValue({ count: 2 });
    const result = await syncAmsTrays("o1", [tray(3, "RETIRED")]);
    expect(result.events).toEqual([
      "Black PLA Basic came out of AMS slot 2.",
      "Green PLA Basic came out of AMS slot 4.",
    ]);
    expect(m.spool.update).not.toHaveBeenCalled();
    const where = m.spool.updateMany.mock.calls.at(-1)?.[0].where;
    expect(where.tagUid).toEqual({ not: null, notIn: ["RETIRED"] });
    expect(result.unloaded).toBe(2);
  });
  it("says when known filament has moved to another slot, and stays quiet when it hasn't", async () => {
    m.spool.updateMany.mockResolvedValue({ count: 0 });
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      openedOn: new Date(),
      status: "active",
      amsSlot: 4,
    });
    expect((await syncAmsTrays("o1", [tray(2, "TAG1")])).events).toEqual([
      "Red PLA Basic is in AMS slot 2.",
    ]);
    m.spool.findFirst.mockResolvedValue({
      id: "s1",
      openedOn: new Date(),
      status: "active",
      amsSlot: 2,
    });
    expect((await syncAmsTrays("o1", [tray(2, "TAG1")])).events).toEqual([]);
  });
});

describe("changing one cell of a filament's row", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    id: "s1",
    status: "active",
    amsSlot: null,
    openedOn: null,
    purchasedOn: new Date("2026-09-01"),
    remainingPercent: 100,
    weightGrams: 1000,
    ...over,
  });
  const lastSaved = () => m.spool.update.mock.calls.at(-1)?.[0].data;
  it("loads it into an AMS slot, opening it and freeing the slot", async () => {
    m.spool.findFirst.mockResolvedValue(item());
    m.spool.updateMany.mockResolvedValue({ count: 1 });
    expect(await updateSpoolField("o1", "s1", "status", "ams2")).toBe(
      "In AMS slot 2."
    );
    expect(lastSaved()).toMatchObject({ amsSlot: 2, status: "active" });
    expect(lastSaved().openedOn).toBeInstanceOf(Date);
    expect(m.spool.updateMany).toHaveBeenCalled(); // whatever was in slot 2 is out
  });
  it("takes what's left in kg, by the item's own size", async () => {
    m.spool.findFirst.mockResolvedValue(item({ weightGrams: 500 }));
    expect(await updateSpoolField("o1", "s1", "leftKg", "0.25")).toBe(
      "50% left (0.25 kg)."
    );
    expect(lastSaved()).toMatchObject({
      remainingPercent: 50,
      status: "active",
    });
    expect(lastSaved().openedOn).toBeInstanceOf(Date); // some used: it's open
  });
  it("at 0% it waits for you to confirm it's run out", async () => {
    m.spool.findFirst.mockResolvedValue(
      item({ openedOn: new Date("2026-09-10") })
    );
    await updateSpoolField("o1", "s1", "left", "0");
    expect(lastSaved()).toMatchObject({ remainingPercent: 0, status: "empty" });
  });
  it("sets and clears a price", async () => {
    m.spool.findFirst.mockResolvedValue(item());
    expect(await updateSpoolField("o1", "s1", "pricePaid", "13.994")).toBe(
      "Paid £13.99."
    );
    expect(await updateSpoolField("o1", "s1", "pricePaid", "")).toBe(
      "Price cleared."
    );
    expect(lastSaved()).toEqual({ pricePaid: null });
    await expect(
      updateSpoolField("o1", "s1", "pricePaid", "-1")
    ).rejects.toThrow(/from 0/);
  });
  it("won't have it opened before it was bought", async () => {
    m.spool.findFirst.mockResolvedValue(item());
    await expect(
      updateSpoolField("o1", "s1", "openedOn", "2026-08-01")
    ).rejects.toThrow(/before the bought date/);
    expect(await updateSpoolField("o1", "s1", "openedOn", "2026-09-05")).toBe(
      "Opened date saved."
    );
  });
  it("tidies a box code and its sizes", async () => {
    m.spool.findFirst.mockResolvedValue(item());
    expect(await updateSpoolField("o1", "s1", "filamentCode", " 10-100 ")).toBe(
      "Code 10100."
    );
    await updateSpoolField("o1", "s1", "spoolWeightGrams", "");
    expect(lastSaved()).toEqual({ spoolWeightGrams: null });
    await expect(
      updateSpoolField("o1", "s1", "weightGrams", "0")
    ).rejects.toThrow(/from 1/);
  });
});

describe("the line and colour of a filament", () => {
  it("move every spool and refill of it, and give its new address", async () => {
    m.spool.findMany.mockResolvedValue([
      { id: "a", type: "PLA Basic", colourName: "Jade White" },
      { id: "b", type: "PLA Basic", colourName: "Jade White" },
    ]);
    m.spool.updateMany.mockResolvedValue({ count: 2 });
    const next = await renameFilament(
      "o1",
      filamentSlug("PLA Basic", "Jade White"),
      {
        type: "PLA Matte",
        colourName: "Ivory White",
        colourHex: "#ffffff",
      }
    );
    expect(next).toBe(filamentSlug("PLA Matte", "Ivory White"));
    expect(m.spool.updateMany.mock.calls.at(-1)?.[0]).toMatchObject({
      where: { id: { in: ["a", "b"] } },
      data: {
        type: "PLA Matte",
        material: "PLA",
        colourName: "Ivory White",
        colourHex: "#FFFFFF",
      },
    });
    // its label number goes with it
    expect(carryFilamentNumber).toHaveBeenLastCalledWith(
      "o1",
      expect.objectContaining({ type: "PLA Basic", colourName: "Jade White" }),
      { type: "PLA Matte", colourName: "Ivory White" }
    );
  });
});

describe("a tag the AMS reports, matched to filament you added by hand", () => {
  const tray = (over: Record<string, unknown> = {}) => ({
    slot: 4,
    tagUid: "TAG4",
    rawTag: "TAG4",
    type: "PLA Basic",
    colourHex: "#FFFFFF",
    colourName: "Jade White",
    remainingPercent: 72,
    weightGrams: 1000,
    ...over,
  });
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    openedOn: null as Date | null,
    amsSlot: null as number | null,
    remainingPercent: 100,
    purchasedOn: null as Date | null,
    createdAt: new Date("2026-09-01"),
    ...over,
  });
  const linkedTo = () => m.spool.update.mock.calls.at(-1)?.[0];
  beforeEach(() => {
    m.spool.update.mockReset().mockResolvedValue({});
    m.spool.updateMany.mockResolvedValue({ count: 0 });
    m.spoolCandidate.updateMany.mockResolvedValue({ count: 1 });
  });

  it("links the opened one: it takes the tag, the slot and the AMS's % left, and its inbox entry goes", async () => {
    m.spool.findMany.mockResolvedValueOnce([
      row("new1"),
      row("open1", { openedOn: new Date("2026-10-01"), remainingPercent: 70 }),
    ]);
    expect(await linkUntaggedToTray("o1", tray())).toEqual({
      spoolId: "open1",
      wasNew: false,
    });
    expect(linkedTo()).toMatchObject({
      where: { id: "open1" },
      data: {
        tagUid: "TAG4",
        amsSlot: 4,
        remainingPercent: 72,
        status: "active",
      },
    });
    expect(m.spoolCandidate.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: "o1",
        tagUid: { in: ["TAG4", "TAG4"] },
        status: "pending",
      },
      data: { status: "dismissed" },
    });
  });
  it("among opened ones, prefers the one in that slot, else the closest % left", async () => {
    const open = (id: string, over: Record<string, unknown>) =>
      row(id, { openedOn: new Date("2026-10-01"), ...over });
    m.spool.findMany.mockResolvedValueOnce([
      open("far", { remainingPercent: 10 }),
      open("inslot", { amsSlot: 4, remainingPercent: 20 }),
    ]);
    expect((await linkUntaggedToTray("o1", tray()))?.spoolId).toBe("inslot");
    m.spool.findMany.mockResolvedValueOnce([
      open("far", { remainingPercent: 10 }),
      open("close", { remainingPercent: 75 }),
    ]);
    expect((await linkUntaggedToTray("o1", tray()))?.spoolId).toBe("close");
  });
  it("with only new ones, takes the oldest bought and opens it", async () => {
    m.spool.findMany.mockResolvedValueOnce([
      row("later", { purchasedOn: new Date("2026-10-01") }),
      row("first", { purchasedOn: new Date("2026-06-01") }),
    ]);
    expect(await linkUntaggedToTray("o1", tray())).toEqual({
      spoolId: "first",
      wasNew: true,
    });
    expect(linkedTo().data.openedOn).toBeInstanceOf(Date);
  });
  it("looks only at the same line and colour, untagged and not retired; by shade when Bambu's name isn't known", async () => {
    m.spool.findMany.mockResolvedValueOnce([]);
    expect(
      await linkUntaggedToTray("o1", tray({ colourName: null }))
    ).toBeNull();
    const where = m.spool.findMany.mock.calls.at(-1)?.[0].where;
    expect(where).toMatchObject({
      status: { not: "retired" },
      type: { equals: "PLA Basic", mode: "insensitive" },
    });
    expect(where.AND).toEqual([
      { OR: [{ tagUid: null }, { tagUid: { notIn: ["TAG4", "TAG4"] } }] },
      { OR: [{ colourHex: { equals: "#FFFFFF", mode: "insensitive" } }] },
    ]);
  });
  it("in the sync: a match is followed, not offered again", async () => {
    m.spool.findFirst.mockResolvedValue(null); // the tag isn't known
    m.spool.findMany
      .mockResolvedValueOnce([
        row("open1", { openedOn: new Date("2026-10-01") }),
      ]) // the match
      .mockResolvedValueOnce([]); // nothing leaving
    const result = await syncAmsTrays("o1", [tray()]);
    expect(result.proposed).toBe(0);
    expect(result.events[0]).toMatch(
      /AMS slot 4: matched to the one you added/
    );
  });
  it("in the sync: filament you've never had goes to the inbox, told only the first time", async () => {
    m.spool.findFirst.mockResolvedValue(null);
    m.spool.findMany.mockResolvedValue([]); // no match, nothing leaving
    m.spoolCandidate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null); // first time: none waiting
    expect((await syncAmsTrays("o1", [tray()])).events).toEqual([
      "New filament in AMS slot 4: Jade White PLA Basic, waiting for you.",
    ]);
    m.spoolCandidate.findFirst.mockResolvedValue({ id: "c1" }); // already waiting
    expect(
      (await syncAmsTrays("o1", [tray({ remainingPercent: 70 })])).events
    ).toEqual([]);
  });
});

describe("a spool's two tags", () => {
  const tray = (over: Record<string, unknown> = {}) => ({
    slot: 4,
    tagUid: "SPOOLID0000000000000000000000001", // the spool ID: the same from either side
    rawTag: "B1B1B1B100000100", // the side the AMS read this time
    type: "PLA Basic",
    colourHex: "#E4BDD0",
    colourName: "Pink",
    remainingPercent: 72,
    weightGrams: 1000,
    ...over,
  });
  beforeEach(() => {
    m.spool.update.mockReset().mockResolvedValue({});
    m.spool.updateMany.mockResolvedValue({ count: 0 });
    m.spoolCandidate.updateMany.mockResolvedValue({ count: 1 });
  });
  it("recognises filament recorded by a tag's ID, and records its spool ID from then on", async () => {
    m.spool.findFirst.mockResolvedValue({
      id: "p1",
      openedOn: new Date(),
      status: "active",
      amsSlot: 3,
    });
    m.spool.findMany.mockResolvedValue([]);
    await syncAmsTrays("o1", [tray()]);
    expect(m.spool.findFirst.mock.calls.at(-1)?.[0].where.tagUid).toEqual({
      in: ["SPOOLID0000000000000000000000001", "B1B1B1B100000100"],
    });
    expect(m.spool.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      tagUid: "SPOOLID0000000000000000000000001",
      amsSlot: 4,
    });
  });
  it("links a spool recorded by its other side's tag, when that tag isn't in the AMS (the Pink in slot 4)", async () => {
    m.spool.findMany.mockResolvedValueOnce([
      {
        id: "pink1",
        tagUid: "A2A2A2A200000100",
        openedOn: new Date("2026-10-17"),
        amsSlot: null,
        remainingPercent: 71,
        purchasedOn: null,
        createdAt: new Date(),
      },
    ]);
    expect(await linkUntaggedToTray("o1", tray())).toEqual({
      spoolId: "pink1",
      wasNew: false,
    });
    expect(m.spool.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      tagUid: "SPOOLID0000000000000000000000001",
      amsSlot: 4,
    });
    expect(
      m.spoolCandidate.updateMany.mock.calls.at(-1)?.[0].where.tagUid
    ).toEqual({
      in: ["SPOOLID0000000000000000000000001", "B1B1B1B100000100"],
    });
  });
  it("never takes a spool recorded by its own spool ID: that's another spool", async () => {
    m.spool.findMany.mockResolvedValueOnce([
      {
        id: "other",
        tagUid: "SPOOLID0000000000000000000000009",
        openedOn: new Date(),
        amsSlot: null,
        remainingPercent: 70,
        purchasedOn: null,
        createdAt: new Date(),
      },
    ]);
    expect(await linkUntaggedToTray("o1", tray())).toBeNull();
  });
});

describe("a filament's own details, for all of it at once", () => {
  const slug = filamentSlug("PLA Basic", "Jade White");
  beforeEach(() => {
    m.spool.findMany.mockResolvedValue([
      { id: "a", type: "PLA Basic", colourName: "Jade White" },
      { id: "b", type: "PLA Basic", colourName: "Jade White" },
    ]);
    m.spool.updateMany.mockResolvedValue({ count: 2 });
  });

  it("sets the code on the box on every spool and refill", async () => {
    expect(
      await updateFilamentField("o1", slug, "filamentCode", " 10-100 ")
    ).toBe("Code 10100.");
    expect(m.spool.updateMany.mock.calls.at(-1)?.[0]).toMatchObject({
      where: { organizationId: "o1", id: { in: ["a", "b"] } },
      data: { filamentCode: "10100" },
    });
  });

  it("sets or clears the empty spool's weight", async () => {
    expect(
      await updateFilamentField("o1", slug, "spoolWeightGrams", "250")
    ).toBe("Empty spool 250 g.");
    expect(m.spool.updateMany.mock.calls.at(-1)?.[0]).toMatchObject({
      data: { spoolWeightGrams: 250 },
    });
    await updateFilamentField("o1", slug, "spoolWeightGrams", "");
    expect(m.spool.updateMany.mock.calls.at(-1)?.[0]).toMatchObject({
      data: { spoolWeightGrams: null },
    });
  });

  it("refuses a filament that isn't there", async () => {
    m.spool.findMany.mockResolvedValue([]);
    await expect(
      updateFilamentField("o1", slug, "filamentCode", "1")
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("putting it in an AMS slot by hand (fork)", () => {
  it("loads it, taking out whatever was there, and opens it if it was sealed", async () => {
    m.spool.findFirst.mockResolvedValue({ openedOn: null, status: "active" });
    m.spool.updateMany.mockResolvedValue({ count: 1 });
    m.spool.update.mockResolvedValue({});
    expect(await setAmsSlot("o1", "s1", 3)).toBe("In AMS slot 3.");
    expect(m.spool.updateMany.mock.calls.at(-1)?.[0]).toMatchObject({
      where: { organizationId: "o1", amsSlot: 3, NOT: { id: "s1" } },
      data: { amsSlot: null },
    });
    expect(m.spool.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      amsSlot: 3,
      status: "active",
    });
    expect(m.spool.update.mock.calls.at(-1)?.[0].data.openedOn).toBeInstanceOf(
      Date
    );
  });

  it("takes it out and leaves it open", async () => {
    m.spool.findFirst.mockResolvedValue({
      openedOn: new Date("2026-10-01"),
      status: "active",
    });
    m.spool.update.mockResolvedValue({});
    expect(await setAmsSlot("o1", "s1", null)).toBe(
      "Out of the AMS, still open."
    );
    expect(m.spool.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      amsSlot: null,
    });
  });

  it("refuses a slot that isn't 1 to 4, or a finished spool", async () => {
    await expect(setAmsSlot("o1", "s1", 5)).rejects.toThrow(/1 to 4/);
    m.spool.findFirst.mockResolvedValue({ openedOn: null, status: "retired" });
    await expect(setAmsSlot("o1", "s1", 1)).rejects.toThrow(/Bring it back/);
  });
});

describe("the order of sealed stock (fork)", () => {
  it("saves each one's place, only for that filament's own", async () => {
    m.spool.findMany.mockResolvedValue([
      { id: "a", type: "PLA Basic", colourName: "Jade White" },
      { id: "b", type: "PLA Basic", colourName: "Jade White" },
    ]);
    m.spool.updateMany.mockResolvedValue({ count: 1 });
    const slug = filamentSlug("PLA Basic", "Jade White");
    expect(await reorderSealed("o1", slug, ["b", "elsewhere", "a"])).toBe(2);
    const calls = m.spool.updateMany.mock.calls.slice(-2).map((c) => c[0]);
    expect(calls).toEqual([
      { where: { id: "b", organizationId: "o1" }, data: { stockOrder: 0 } },
      { where: { id: "a", organizationId: "o1" }, data: { stockOrder: 1 } },
    ]);
  });
});
