/**
 * Filament numbers: the rules that don't need the database.
 * Part of the filament labels feature (fork).
 */
import { describe, expect, it } from "vitest";
import {
  formatFilamentId,
  keyParts,
  parseFilamentNumber,
  toNumber,
} from "./numbers";

describe("formatFilamentId", () => {
  it("pads to four digits, like BOX-0001", () => {
    expect(formatFilamentId(1)).toBe("FIL-0001");
    expect(formatFilamentId(42)).toBe("FIL-0042");
    expect(formatFilamentId(12345)).toBe("FIL-12345");
  });
});

describe("parseFilamentNumber", () => {
  it("reads the ID however it's typed", () => {
    expect(parseFilamentNumber("FIL-0007")).toBe(7);
    expect(parseFilamentNumber("fil-7")).toBe(7);
    expect(parseFilamentNumber(" FIL7 ")).toBe(7);
  });

  it("ignores anything else", () => {
    expect(parseFilamentNumber("Jade White")).toBeNull();
    expect(parseFilamentNumber("BOX-0007")).toBeNull();
    expect(parseFilamentNumber("FIL-")).toBeNull();
  });
});

describe("toNumber", () => {
  it("orders new filament by when its first item was added", () => {
    const order = toNumber(
      [
        { key: "pla basic|jade white", createdAt: new Date("2026-09-01") },
        { key: "pla matte|charcoal", createdAt: new Date("2026-08-01") },
        { key: "pla basic|jade white", createdAt: new Date("2026-07-01") },
        { key: "petg hf|black", createdAt: "2026-10-01T00:00:00.000Z" },
      ],
      new Set()
    );
    expect(order).toEqual([
      "pla basic|jade white",
      "pla matte|charcoal",
      "petg hf|black",
    ]);
  });

  it("skips filament that already has a number", () => {
    expect(
      toNumber(
        [
          { key: "a|x", createdAt: new Date("2026-01-01") },
          { key: "b|y", createdAt: new Date("2026-02-01") },
        ],
        new Set(["a|x"])
      )
    ).toEqual(["b|y"]);
  });

  it("breaks a tie the same way every time", () => {
    const at = new Date("2026-05-05");
    const items = [
      { key: "z|z", createdAt: at },
      { key: "a|a", createdAt: at },
    ];
    expect(toNumber(items, new Set())).toEqual(["a|a", "z|z"]);
    expect(toNumber([...items].reverse(), new Set())).toEqual(["a|a", "z|z"]);
  });
});

describe("keyParts", () => {
  it("splits a key back into line and colour", () => {
    expect(keyParts("pla basic|jade white")).toEqual({
      type: "pla basic",
      colourName: "jade white",
    });
  });
});
