/**
 * Palettes from your filament (fork): the colour maths.
 */
import { describe, expect, it } from "vitest";
import {
  colourDistance,
  colourGaps,
  coolorsUrl,
  finishOf,
  generatePalette,
  lch,
  mainColours,
  matchColours,
  nearestFilament,
  oklchToHex,
  textOn,
  type PaletteFilament,
} from "./palette";

const f = (
  name: string,
  hex: string,
  extra: Partial<PaletteFilament> = {}
): PaletteFilament => ({
  key: `pla basic|${name.toLowerCase()}`,
  slug: name.toLowerCase(),
  name,
  hex,
  line: "PLA Basic",
  finish: "other",
  state: "sealed",
  slot: null,
  hasOpen: false,
  hasSealed: true,
  ...extra,
});
const POOL = [
  f("White", "#F2F1EC"),
  f("Black", "#161616"),
  f("Red", "#C12E1F", { state: "ams", slot: 3, hasOpen: true }),
  f("Green", "#00AE42"),
  f("Blue", "#0A2989"),
  f("Yellow", "#F4EE2A"),
  f("Orange", "#FF6A13"),
  f("Purple", "#5E43B7"),
  f("Cyan", "#0086D6"),
  f("Pink", "#F55A74"),
];

describe("colour maths", () => {
  it("measures colours as the eye sees them", () => {
    expect(colourDistance("#C12E1F", "#C12E1F")).toBe(0);
    expect(colourDistance("#C12E1F", "#D03020")).toBeLessThan(
      colourDistance("#C12E1F", "#0A2989")
    );
  });
  it("goes to OKLCH and back", () => {
    const [L, C, H] = lch("#0086D6");
    expect(colourDistance(oklchToHex(L, C, H), "#0086D6")).toBeLessThan(0.01);
  });
  it("picks dark text on light colours and light on dark", () => {
    expect(textOn("#F2F1EC")).toBe("#101828");
    expect(textOn("#161616")).toBe("#FFFFFF");
  });
  it("finds the nearest filament, leaving out the used ones", () => {
    expect(nearestFilament("#D03020", POOL)?.f.name).toBe("Red");
    expect(
      nearestFilament("#D03020", POOL, ["pla basic|red"])?.f.name
    ).not.toBe("Red");
  });
});

describe("generatePalette", () => {
  it("gives as many different filaments as asked, the same for the same seed", () => {
    const a = generatePalette({
      pool: POOL,
      count: 5,
      harmony: "random",
      seed: 7,
    });
    expect(a).toHaveLength(5);
    expect(new Set(a.map((x) => x.f.key)).size).toBe(5);
    expect(
      generatePalette({ pool: POOL, count: 5, harmony: "random", seed: 7 }).map(
        (x) => x.f.key
      )
    ).toEqual(a.map((x) => x.f.key));
  });
  it("keeps the locked ones, first", () => {
    const out = generatePalette({
      pool: POOL,
      count: 3,
      harmony: "complementary",
      seed: 1,
      locked: ["pla basic|blue"],
    });
    expect(out[0].f.name).toBe("Blue");
    // blue's complement is orange-ish
    expect(["Orange", "Yellow"]).toContain(out[1].f.name);
    expect(out[1].match).toBeGreaterThan(0);
  });
  it("every harmony gives a full palette from a big enough pool", () => {
    for (const harmony of [
      "analogous",
      "triadic",
      "split",
      "tetradic",
      "mono",
      "contrast",
    ] as const)
      expect(
        generatePalette({ pool: POOL, count: 4, harmony, seed: 3 })
      ).toHaveLength(4);
  });
  it("never asks for more colours than there are", () => {
    expect(
      generatePalette({
        pool: POOL.slice(0, 2),
        count: 5,
        harmony: "random",
        seed: 1,
      })
    ).toHaveLength(2);
  });
});

describe("matching, photos, gaps and Coolors", () => {
  it("matches a palette's colours to different filaments", () => {
    const out = matchColours(["#C22E20", "#0B2A88"], POOL);
    expect(out.map((x) => x.f.name)).toEqual(["Red", "Blue"]);
    expect(out[0].match).toBeGreaterThan(90);
  });
  it("finds a photo's main colours", () => {
    const px: [number, number, number][] = [
      ...Array(50).fill([200, 20, 20]),
      ...Array(50).fill([20, 20, 200]),
    ];
    const out = mainColours(px, 2).map((h) => nearestFilament(h, POOL)?.f.name);
    expect(out.sort()).toEqual(["Blue", "Red"]);
  });
  it("finds the gaps on the colour wheel", () => {
    const gaps = colourGaps([f("Red", "#C12E1F"), f("Orange", "#FF6A13")], 12);
    expect(gaps.length).toBeGreaterThan(0);
    expect(colourGaps(POOL, 12).length).toBeLessThan(gaps.length);
  });
  it("makes a Coolors address and tells finishes apart", () => {
    expect(coolorsUrl(["#C12E1F", "#0A2989"])).toBe(
      "https://coolors.co/c12e1f-0a2989"
    );
    expect(finishOf("PLA Silk+")).toBe("silk");
    expect(finishOf("PLA Matte")).toBe("matte");
    expect(finishOf("PLA Basic")).toBe("other");
  });
});
