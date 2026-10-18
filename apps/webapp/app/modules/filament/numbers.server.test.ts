/**
 * Filament numbers and their QR codes, against a pretend database that
 * enforces the same unique rules as the real one.
 * Part of the filament labels feature (fork).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; organizationId: string; key: string; number: number };

const store = vi.hoisted(() => ({
  spools: [] as {
    organizationId: string;
    type: string;
    colourName: string;
    createdAt: Date;
  }[],
  numbers: [] as Row[],
  qrs: [] as {
    id: string;
    organizationId: string;
    filamentId: string;
    createdAt: Date;
  }[],
  /** Make the next transaction fail as if another request numbered first */
  collideOnce: false,
  notes: [] as { title: string; message: string }[],
}));

vi.mock("~/utils/emitter/send-notification.server", () => ({
  sendNotification: (n: { title: string; message: string }) =>
    store.notes.push(n),
}));

vi.mock("~/database/db.server", () => {
  const unique = () =>
    Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  const create = ({
    data,
  }: {
    data: { organizationId: string; key: string; number: number };
  }) => {
    if (
      store.numbers.some(
        (r) =>
          r.organizationId === data.organizationId &&
          (r.key === data.key || r.number === data.number)
      )
    )
      throw unique();
    store.numbers.push({ id: `n${store.numbers.length + 1}`, ...data });
  };
  const tx = {
    filamentNumber: {
      aggregate: ({ where }: { where: { organizationId: string } }) => ({
        _max: {
          number:
            Math.max(
              0,
              ...store.numbers
                .filter((r) => r.organizationId === where.organizationId)
                .map((r) => r.number)
            ) || null,
        },
      }),
      create,
    },
  };
  return {
    db: {
      spool: {
        findMany: ({ where }: { where: { organizationId: string } }) =>
          store.spools
            .filter((s) => s.organizationId === where.organizationId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      },
      filamentNumber: {
        findMany: ({ where }: { where: { organizationId: string } }) =>
          store.numbers.filter(
            (r) => r.organizationId === where.organizationId
          ),
        findUnique: ({
          where,
        }: {
          where: {
            organizationId_key: { organizationId: string; key: string };
          };
        }) =>
          store.numbers.find(
            (r) =>
              r.organizationId === where.organizationId_key.organizationId &&
              r.key === where.organizationId_key.key
          ) ?? null,
        findFirst: ({
          where,
        }: {
          where: { id: string; organizationId: string };
        }) =>
          store.numbers.find(
            (r) =>
              r.id === where.id && r.organizationId === where.organizationId
          ) ?? null,
        updateMany: ({
          where,
          data,
        }: {
          where: { id: string; organizationId: string };
          data: { key: string };
        }) => {
          const row = store.numbers.find(
            (r) =>
              r.id === where.id && r.organizationId === where.organizationId
          );
          if (!row) return { count: 0 };
          if (
            store.numbers.some(
              (r) =>
                r !== row &&
                r.organizationId === row.organizationId &&
                r.key === data.key
            )
          )
            throw unique();
          row.key = data.key;
          return { count: 1 };
        },
      },
      qr: {
        findFirst: ({
          where,
        }: {
          where: { organizationId: string; filamentId: string };
        }) =>
          store.qrs.find(
            (q) =>
              q.organizationId === where.organizationId &&
              q.filamentId === where.filamentId
          ) ?? null,
        create: ({
          data,
        }: {
          data: { organizationId: string; filamentId: string };
        }) => {
          const qr = {
            id: `qr${store.qrs.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          store.qrs.push(qr);
          return { id: qr.id };
        },
      },
      $transaction: async (fn: (t: typeof tx) => Promise<void>) => {
        if (store.collideOnce) {
          store.collideOnce = false;
          // another request numbers this workspace's filament first
          create({
            data: {
              organizationId: "org",
              key: "pla matte|charcoal",
              number: 1,
            },
          });
          create({
            data: {
              organizationId: "org",
              key: "pla basic|jade white",
              number: 2,
            },
          });
          throw unique();
        }
        await fn(tx);
      },
    },
  };
});

const {
  carryFilamentNumber,
  ensureFilamentQr,
  filamentScanTarget,
  getFilamentNumbers,
} = await import("./numbers.server");

const spool = (
  type: string,
  colourName: string,
  at: string,
  organizationId = "org"
) => ({
  organizationId,
  type,
  colourName,
  createdAt: new Date(at),
});

beforeEach(() => {
  store.spools = [
    spool("PLA Basic", "Jade White", "2026-08-01"),
    spool("PLA Basic", "Jade White ", "2026-09-01"),
    spool("PLA Matte", "Charcoal", "2026-07-01"),
    spool("PETG HF", "Black", "2026-01-01", "other"),
  ];
  store.numbers = [];
  store.qrs = [];
  store.collideOnce = false;
  store.notes = [];
});

describe("getFilamentNumbers", () => {
  it("numbers each line and colour once, oldest first, per workspace", async () => {
    const n = await getFilamentNumbers("org");
    expect(n["pla matte|charcoal"].label).toBe("FIL-0001");
    expect(n["pla basic|jade white"].label).toBe("FIL-0002");
    expect(Object.keys(n)).toHaveLength(2);
    expect((await getFilamentNumbers("other"))["petg hf|black"].label).toBe(
      "FIL-0001"
    );
  });

  it("carries on from the highest number and never reuses one", async () => {
    store.numbers.push({
      id: "gone",
      organizationId: "org",
      key: "pla silk|gold",
      number: 5,
    });
    const n = await getFilamentNumbers("org");
    expect(n["pla matte|charcoal"].number).toBe(6);
    expect(n["pla basic|jade white"].number).toBe(7);
    // filament with nothing left keeps its number
    expect(n["pla silk|gold"].number).toBe(5);
  });

  it("leaves numbers alone once given", async () => {
    await getFilamentNumbers("org");
    store.spools.push(spool("PLA Basic", "Black", "2025-01-01"));
    const n = await getFilamentNumbers("org");
    expect(n["pla matte|charcoal"].number).toBe(1);
    expect(n["pla basic|black"].number).toBe(3);
  });

  it("reads what another request assigned when both number at once", async () => {
    store.collideOnce = true;
    const n = await getFilamentNumbers("org");
    expect(n["pla matte|charcoal"].number).toBe(1);
    expect(n["pla basic|jade white"].number).toBe(2);
    expect(store.numbers).toHaveLength(2);
  });
});

describe("carryFilamentNumber", () => {
  it("moves the number with a renamed filament", async () => {
    await getFilamentNumbers("org");
    store.spools = store.spools.map((s) =>
      s.colourName === "Charcoal" ? { ...s, colourName: "Graphite" } : s
    );
    await carryFilamentNumber(
      "org",
      { type: "PLA Matte", colourName: "Charcoal" },
      { type: "PLA Matte", colourName: "Graphite" }
    );
    expect((await getFilamentNumbers("org"))["pla matte|graphite"].number).toBe(
      1
    );
  });

  it("keeps the target's number when it joins another filament", async () => {
    await getFilamentNumbers("org");
    store.spools = store.spools.map((s) =>
      s.colourName === "Charcoal"
        ? { ...s, type: "PLA Basic", colourName: "Jade White" }
        : s
    );
    await carryFilamentNumber(
      "org",
      { type: "PLA Matte", colourName: "Charcoal" },
      { type: "PLA Basic", colourName: "Jade White" }
    );
    const n = await getFilamentNumbers("org");
    expect(n["pla basic|jade white"].number).toBe(2);
    expect(n["pla matte|charcoal"].number).toBe(1);
  });

  it("leaves the number behind when other items of it stay", async () => {
    await getFilamentNumbers("org");
    store.spools[0] = { ...store.spools[0], colourName: "Cyan" };
    await carryFilamentNumber(
      "org",
      { type: "PLA Basic", colourName: "Jade White" },
      { type: "PLA Basic", colourName: "Cyan" }
    );
    const n = await getFilamentNumbers("org");
    expect(n["pla basic|jade white"].number).toBe(2);
    expect(n["pla basic|cyan"].number).toBe(3);
  });

  it("does nothing when the line and colour didn't change", async () => {
    await getFilamentNumbers("org");
    await carryFilamentNumber(
      "org",
      { type: "PLA Basic", colourName: "Jade White" },
      { type: "pla basic", colourName: " jade white" }
    );
    expect(store.numbers.map((r) => r.key).sort()).toEqual([
      "pla basic|jade white",
      "pla matte|charcoal",
    ]);
  });
});

describe("ensureFilamentQr", () => {
  it("makes the filament's QR code once and reuses it", async () => {
    const first = await ensureFilamentQr("org", "n1");
    const again = await ensureFilamentQr("org", "n1");
    expect(again).toBe(first);
    expect(store.qrs).toHaveLength(1);
  });
});

describe("filamentScanTarget", () => {
  it("opens the filament's page with a pop-up saying what was scanned", async () => {
    const n = await getFilamentNumbers("org");
    const to = await filamentScanTarget({
      organizationId: "org",
      filamentId: n["pla basic|jade white"].id,
      userId: "u",
    });
    expect(to.slug).toBe("pla-basic--jade-white");
    expect(store.notes[0]).toEqual(
      expect.objectContaining({
        title: "Scanned FIL-0002",
        message: "Jade White, PLA Basic.",
      })
    );
  });

  it("says so when none of it is left", async () => {
    store.numbers.push({
      id: "gone",
      organizationId: "org",
      key: "pla silk|gold",
      number: 9,
    });
    const to = await filamentScanTarget({
      organizationId: "org",
      filamentId: "gone",
      userId: "u",
    });
    expect(to.slug).toBeNull();
    expect(store.notes[0].title).toBe("Scanned FIL-0009");
  });

  it("won't open another workspace's filament", async () => {
    const n = await getFilamentNumbers("other");
    const to = await filamentScanTarget({
      organizationId: "org",
      filamentId: n["petg hf|black"].id,
      userId: "u",
    });
    expect(to.slug).toBeNull();
    expect(store.notes).toHaveLength(0);
  });
});
