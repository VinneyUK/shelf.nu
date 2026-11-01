/**
 * Palettes on the server (fork): saved palettes, and Claude only ever
 * picking from your own filaments. The database and Claude are pretend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  palette: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  spool: { findMany: vi.fn() },
  settings: vi.fn(),
}));
vi.mock("~/database/db.server", () => ({
  db: { filamentPalette: m.palette, spool: m.spool },
}));
vi.mock("~/modules/ai/settings.server", () => ({
  getAiSettingsRow: m.settings,
}));
const { aiPalette, paletteFilaments, savePalette } = await import(
  "./palette.server"
);

beforeEach(() => {
  vi.clearAllMocks();
  m.settings.mockResolvedValue({
    enabled: true,
    apiKey: "k",
    model: "m",
    workspaceId: "",
  });
});

describe("paletteFilaments", () => {
  it("is one colour per line and colour, in the AMS if any unit is", async () => {
    m.spool.findMany.mockResolvedValue([
      {
        type: "PLA Basic",
        colourName: "Red",
        colourHex: "#C12E1F",
        amsSlot: null,
        openedOn: null,
      },
      {
        type: "PLA Basic",
        colourName: "Red",
        colourHex: "#C12E1F",
        amsSlot: 3,
        openedOn: new Date(),
      },
      {
        type: "PLA Silk+",
        colourName: "Gold",
        colourHex: "E4BD68",
        amsSlot: null,
        openedOn: null,
      },
    ]);
    const out = await paletteFilaments("o1");
    expect(out).toHaveLength(2);
    expect(out.find((f) => f.name === "Red")).toMatchObject({
      state: "ams",
      slot: 3,
      hasOpen: true,
      hasSealed: true,
    });
    expect(out.find((f) => f.name === "Gold")).toMatchObject({
      state: "sealed",
      hex: "#E4BD68",
      finish: "silk",
    });
  });
});

describe("savePalette", () => {
  it("needs a name and 2 to 8 colours", async () => {
    await expect(savePalette("o1", " ", ["a", "b"])).rejects.toThrow(/name/);
    await expect(savePalette("o1", "One", ["a"])).rejects.toThrow(/2 to 8/);
    await savePalette("o1", "Autumn", ["a", "b", "c"]);
    expect(m.palette.create.mock.calls[0][0].data).toEqual({
      organizationId: "o1",
      name: "Autumn",
      keys: ["a", "b", "c"],
    });
  });
});

describe("aiPalette", () => {
  const pool = [
    { key: "pla basic|orange", name: "Orange", hex: "#FF6A13" },
    { key: "pla basic|black", name: "Black", hex: "#161616" },
    { key: "pla basic|purple", name: "Purple", hex: "#5E43B7" },
  ].map((x) => ({
    ...x,
    slug: x.name.toLowerCase(),
    line: "PLA Basic",
    finish: "other" as const,
    state: "open" as const,
    slot: null,
    hasOpen: true,
    hasSealed: false,
  }));

  it("keeps only Claude's picks from your filaments, once each", async () => {
    const call = vi.fn().mockResolvedValue({
      name: "Cute Halloween",
      picks: [
        { key: "pla basic|orange", why: "the pumpkin" },
        { key: "pla basic|neon green", why: "made up" },
        { key: "pla basic|black", why: "outlines" },
        { key: "pla basic|orange", why: "again" },
      ],
    });
    const out = await aiPalette("o1", "Halloween but cute", 3, pool, call);
    expect(out.name).toBe("Cute Halloween");
    expect(out.items.map((x) => [x.f.name, x.why])).toEqual([
      ["Orange", "the pumpkin"],
      ["Black", "outlines"],
    ]);
    // Claude is given only these filaments
    expect(JSON.stringify(call.mock.calls[0][0].content)).toContain(
      "pla basic|purple"
    );
  });

  it("says so when AI is off", async () => {
    m.settings.mockResolvedValue({
      enabled: false,
      apiKey: "",
      model: "m",
      workspaceId: "",
    });
    await expect(aiPalette("o1", "x", 3, pool, vi.fn())).rejects.toThrow(
      /Settings → AI/
    );
  });
});
