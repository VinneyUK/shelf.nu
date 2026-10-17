import { describe, expect, it, vi } from "vitest";

vi.mock("~/database/db.server", () => ({ db: {} }));
vi.mock("mqtt", () => ({ default: { connect: vi.fn() } }));
vi.mock("./service.server", () => ({ syncAmsTrays: vi.fn() }));

import { amsUpdatesSince, recordChange } from "./printer.server";

describe("what an open Filament page hears", () => {
  it("nothing on its first ask, then only what's new, and a version that moves on every change", () => {
    recordChange("o1", [
      "New filament in AMS slot 2: Red PLA Basic, waiting for you.",
    ]);
    const first = amsUpdatesSince("o1", null);
    expect(first.events).toEqual([]); // opening the page isn't noisy
    expect(first.version).toBe(1);

    recordChange("o1", []); // filament used: the page refreshes, nothing to say
    recordChange("o1", ["Black PLA Basic came out of AMS slot 1."]);
    const next = amsUpdatesSince("o1", first.lastEventId);
    expect(next.version).toBe(3);
    expect(next.events).toEqual(["Black PLA Basic came out of AMS slot 1."]);
    expect(amsUpdatesSince("o1", next.lastEventId).events).toEqual([]);
  });
  it("keeps each workspace's changes apart", () => {
    expect(amsUpdatesSince("someone-else", 0)).toEqual({
      version: 0,
      lastEventId: 0,
      events: [],
    });
  });
});
