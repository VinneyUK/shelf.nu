/**
 * Box numbering, against a pretend database that enforces the same unique
 * rules as the real one. Part of the labels feature; not in upstream Shelf.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  kits: [] as { id: string; createdAt: Date }[],
  numbers: new Map<string, number>(),
  /** Make the next transaction fail as if another request numbered first */
  collideOnce: false,
}));

vi.mock("~/database/db.server", () => {
  const rows = () =>
    store.kits.map((k) => ({
      ...k,
      boxNumber: store.numbers.has(k.id)
        ? { number: store.numbers.get(k.id)! }
        : null,
    }));
  const tx = {
    boxNumber: {
      aggregate: () => ({
        _max: { number: Math.max(0, ...store.numbers.values()) || null },
      }),
      create: ({ data }: { data: { kitId: string; number: number } }) => {
        if (
          [...store.numbers.values()].includes(data.number) ||
          store.numbers.has(data.kitId)
        ) {
          throw Object.assign(new Error("Unique constraint failed"), {
            code: "P2002",
          });
        }
        store.numbers.set(data.kitId, data.number);
      },
    },
  };
  return {
    db: {
      kit: {
        findMany: () =>
          rows().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      },
      $transaction: async (fn: (t: typeof tx) => Promise<void>) => {
        if (store.collideOnce) {
          store.collideOnce = false;
          // another request numbers every box first
          store.kits.forEach((k, i) => store.numbers.set(k.id, i + 1));
          throw Object.assign(new Error("Unique constraint failed"), {
            code: "P2002",
          });
        }
        await fn(tx);
      },
    },
  };
});

import { formatBoxId, getBoxIds, parseBoxNumber } from "./service.server";

const day = (n: number) => new Date(2026, 9, n);

beforeEach(() => {
  store.kits = [
    { id: "cables", createdAt: day(1) },
    { id: "camera", createdAt: day(2) },
    { id: "tools", createdAt: day(3) },
  ];
  store.numbers = new Map();
  store.collideOnce = false;
});

describe("getBoxIds", () => {
  it("numbers boxes oldest first", async () => {
    expect(await getBoxIds("o1")).toEqual({
      cables: "BOX-0001",
      camera: "BOX-0002",
      tools: "BOX-0003",
    });
  });

  it("keeps numbers stable, and gives a new box the next one", async () => {
    await getBoxIds("o1");
    store.kits.push({ id: "spare", createdAt: day(9) });
    const ids = await getBoxIds("o1");
    expect(ids.cables).toBe("BOX-0001");
    expect(ids.spare).toBe("BOX-0004");
  });

  it("never reuses the number of a deleted box", async () => {
    await getBoxIds("o1");
    store.kits = store.kits.filter((k) => k.id !== "camera");
    store.numbers.delete("camera");
    store.kits.push({ id: "spare", createdAt: day(9) });
    expect((await getBoxIds("o1")).spare).toBe("BOX-0004");
  });

  it("copes when two requests number the boxes at the same moment", async () => {
    store.collideOnce = true;
    expect(await getBoxIds("o1")).toEqual({
      cables: "BOX-0001",
      camera: "BOX-0002",
      tools: "BOX-0003",
    });
  });
});

describe("box ID text", () => {
  it("formats and reads IDs", () => {
    expect(formatBoxId(3)).toBe("BOX-0003");
    expect(formatBoxId(12345)).toBe("BOX-12345");
    for (const text of ["BOX-0003", "box-3", "Box-3", "  BOX-03 ", "box3"]) {
      expect(parseBoxNumber(text), text).toBe(3);
    }
    expect(parseBoxNumber("SAM-0003")).toBeNull();
    expect(parseBoxNumber("boxes")).toBeNull();
  });
});
