/**
 * Palettes from your filament (fork): colour maths for Filament › Palettes.
 * Colours are compared in OKLab (the way the eye sees them), harmony rules
 * worked out in OKLCH, and every suggestion snapped to a filament you have.
 */

export type PaletteFilament = {
  /** The filament's key: "pla basic|red" */
  key: string;
  slug: string;
  name: string;
  hex: string;
  line: string;
  finish: "matte" | "silk" | "other";
  /** in the AMS (some unit), open (some unit open), or only sealed units */
  state: "ams" | "open" | "sealed";
  slot: number | null;
  hasOpen: boolean;
  hasSealed: boolean;
};

export type PaletteItem = {
  f: PaletteFilament;
  /** How close it is to the colour wanted, 0–100; null when it was the pick itself */
  match: number | null;
  /** The colour that was wanted (harmony, photo, trending) */
  want?: string;
  /** Why it was chosen (AI) */
  why?: string;
};

const toLin = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (c: number) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
};

/** "#RRGGBB" (or "RRGGBB") to OKLab [L, a, b]. */
export function hexToOklab(hex: string): [number, number, number] {
  const h = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  const n = parseInt(h, 16);
  const r = toLin(n >> 16);
  const g = toLin((n >> 8) & 255);
  const b = toLin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLCH (lightness 0–1, chroma, hue degrees) to "#rrggbb". */
export function oklchToHex(L: number, C: number, H: number) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toSrgb);
  return `#${rgb.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** [lightness, chroma, hue°] */
export function lch(hex: string): [number, number, number] {
  const [L, a, b] = hexToOklab(hex);
  return [
    L,
    Math.hypot(a, b),
    ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  ];
}

/** How far apart two colours look (OKLab distance). */
export function colourDistance(a: string, b: string) {
  const x = hexToOklab(a);
  const y = hexToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** A distance as a match percentage. */
export const matchPercent = (d: number) =>
  Math.max(0, Math.round(100 - d * 260));

/** Dark text on light colours, light on dark. */
export const textOn = (hex: string) =>
  lch(hex)[0] > 0.68 ? "#101828" : "#FFFFFF";

/** The filament closest to a colour, leaving out those already used. */
export function nearestFilament(
  hex: string,
  pool: PaletteFilament[],
  used: string[] = [],
  bias: (f: PaletteFilament) => number = () => 0
) {
  let best: { f: PaletteFilament; d: number } | null = null;
  for (const f of pool) {
    if (used.includes(f.key)) continue;
    const d = colourDistance(hex, f.hex) + bias(f);
    if (!best || d < best.d) best = { f, d };
  }
  return best;
}

export const HARMONIES = {
  random: { label: "Random", offsets: null },
  complementary: { label: "Complementary", offsets: [0, 180] },
  analogous: { label: "Analogous", offsets: [0, 30, -30, 60, -60] },
  triadic: { label: "Triadic", offsets: [0, 120, 240] },
  split: { label: "Split-complementary", offsets: [0, 150, 210] },
  tetradic: { label: "Four-colour", offsets: [0, 90, 180, 270] },
  mono: { label: "Single hue", offsets: [0] },
  contrast: { label: "High contrast", offsets: null },
} as const;
export type Harmony = keyof typeof HARMONIES;

/** A small seeded random number source, so the same seed gives the same palette. */
export function seeded(seed: number) {
  let r = Math.abs(Math.floor(seed * 9301)) % 233280;
  return () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
}

/**
 * A palette of `count` filaments from the pool: the locked ones kept, the
 * rest by the harmony rule from a base colour (the first locked, else one
 * picked by the seed), each snapped to the closest filament you have.
 * preferAms nudges filaments already in the AMS ahead.
 */
export function generatePalette({
  pool,
  count,
  harmony,
  locked = [],
  seed,
  preferAms = false,
}: {
  pool: PaletteFilament[];
  count: number;
  harmony: Harmony;
  locked?: string[];
  seed: number;
  preferAms?: boolean;
}): PaletteItem[] {
  if (!pool.length) return [];
  const rand = seeded(seed);
  const bias = (f: PaletteFilament) =>
    preferAms && f.state === "ams" ? -0.03 : 0;
  const keep = locked
    .map((k) => pool.find((f) => f.key === k))
    .filter((f): f is PaletteFilament => !!f);
  const out: PaletteItem[] = keep.map((f) => ({ f, match: null }));
  const used = keep.map((f) => f.key);
  const base = keep[0] ?? pool[Math.floor(rand() * pool.length)];
  if (!keep.length) {
    out.push({ f: base, match: null });
    used.push(base.key);
  }
  const [L0, C0, H0] = lch(base.hex);
  const offsets = HARMONIES[harmony].offsets;
  for (
    let guard = 0;
    out.length < Math.min(count, pool.length) && guard < 50;
    guard++
  ) {
    const i = out.length;
    if (harmony === "random") {
      const left = pool.filter((f) => !used.includes(f.key));
      if (!left.length) break;
      const f = left[Math.floor(rand() * left.length)];
      used.push(f.key);
      out.push({ f, match: null });
      continue;
    }
    let target: string;
    if (harmony === "contrast")
      target = oklchToHex(
        i % 2 ? 0.25 : 0.9,
        Math.min(0.15, C0 + 0.05),
        (H0 + 180 * (i % 2)) % 360
      );
    else if (harmony === "mono")
      target = oklchToHex(
        Math.max(
          0.2,
          Math.min(0.95, L0 + (i % 2 ? -1 : 1) * 0.18 * Math.ceil(i / 2))
        ),
        Math.max(0.03, C0 * 0.8),
        H0
      );
    else {
      const list = offsets ?? [0];
      const off = list[i % list.length];
      // a mid lightness, so a very dark or light base still gives real colours
      target = oklchToHex(
        Math.max(0.62, Math.min(0.85, L0 + (i >= list.length ? 0.15 : 0))),
        Math.max(0.1, C0),
        (H0 + off + 360) % 360
      );
    }
    const n = nearestFilament(target, pool, used, bias);
    if (!n) break;
    used.push(n.f.key);
    out.push({ f: n.f, match: matchPercent(n.d), want: target });
  }
  return out.slice(0, count);
}

/** A palette of wanted colours (trending, a photo) matched to your filaments. */
export function matchColours(
  hexes: string[],
  pool: PaletteFilament[]
): PaletteItem[] {
  const used: string[] = [];
  const out: PaletteItem[] = [];
  for (const hex of hexes) {
    const n = nearestFilament(hex, pool, used);
    if (!n) break;
    used.push(n.f.key);
    out.push({ f: n.f, match: matchPercent(n.d), want: hex });
  }
  return out;
}

/** The main colours of an image's pixels ([r,g,b] list), by k-means. */
export function mainColours(pixels: [number, number, number][], k: number) {
  if (!pixels.length) return [];
  let cents = Array.from(
    { length: k },
    (_, i) => pixels[Math.floor((i * pixels.length) / k)]
  );
  for (let it = 0; it < 10; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let bi = 0;
      let bd = Infinity;
      cents.forEach((c, ci) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = ci;
        }
      });
      sums[bi][0] += p[0];
      sums[bi][1] += p[1];
      sums[bi][2] += p[2];
      sums[bi][3]++;
    }
    cents = sums.map((s, i) =>
      s[3]
        ? ([s[0] / s[3], s[1] / s[3], s[2] / s[3]] as [number, number, number])
        : cents[i]
    );
  }
  return cents.map(
    (c) =>
      `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`
  );
}

/**
 * Gaps in your colours: twelve hue bands round the wheel, the ones with no
 * strong colour in them, each as a colour worth buying, the biggest gaps
 * (the most empty bands either side) first.
 */
export function colourGaps(all: PaletteFilament[], max = 4) {
  const bands = Array.from({ length: 12 }, () => 0);
  for (const f of all) {
    const [, C, H] = lch(f.hex);
    if (C > 0.05) bands[Math.floor(H / 30) % 12]++;
  }
  return bands
    .map((n, i) => ({
      band: i,
      n,
      hex: oklchToHex(0.68, 0.13, i * 30 + 15),
      lonely:
        (bands[(i + 11) % 12] === 0 ? 1 : 0) +
        (bands[(i + 1) % 12] === 0 ? 1 : 0),
    }))
    .filter((b) => b.n === 0)
    .sort((a, b) => b.lonely - a.lonely)
    .slice(0, max);
}

/** Coolors' address for a palette: coolors.co/hex-hex-hex */
export const coolorsUrl = (hexes: string[]) =>
  `https://coolors.co/${hexes
    .map((h) => h.replace("#", "").slice(0, 6).toLowerCase())
    .join("-")}`;

/** The filament's finish, from its line's name. */
export function finishOf(line: string): PaletteFilament["finish"] {
  const l = line.toLowerCase();
  if (l.includes("silk")) return "silk";
  if (l.includes("matte")) return "matte";
  return "other";
}

/** A starter set of palettes, to see how much of each you can print from stock. */
export const TRENDING_PALETTES: { name: string; hexes: string[] }[] = [
  {
    name: "Autumn walk",
    hexes: ["#9D432C", "#E4BD68", "#3F8E43", "#F7E6DE", "#7D6556"],
  },
  {
    name: "Sorbet",
    hexes: ["#E8AFCF", "#F99963", "#F4EE2A", "#A3D8E1", "#AE96D4"],
  },
  { name: "Nordic", hexes: ["#F2F1EC", "#9B9EA0", "#A3D8E1", "#161616"] },
  {
    name: "Retro arcade",
    hexes: ["#0A2989", "#F55A74", "#F4EE2A", "#0086D6", "#161616"],
  },
  { name: "Forest floor", hexes: ["#3F8E43", "#61C680", "#7D6556", "#E8DBB7"] },
  { name: "Luxe", hexes: ["#161616", "#E4BD68", "#E8B4A6", "#F3CFB2"] },
  { name: "Ocean", hexes: ["#0A2989", "#0078BF", "#A3D8E1", "#F2F1EC"] },
  { name: "Sunset", hexes: ["#5E43B7", "#F55A74", "#FF6A13", "#F4EE2A"] },
  {
    name: "Lavender field",
    hexes: ["#AE96D4", "#5E43B7", "#61C680", "#F7E6DE"],
  },
  { name: "Desert", hexes: ["#E8DBB7", "#F99963", "#9D432C", "#7D6556"] },
  { name: "Mint chip", hexes: ["#B6E3C9", "#5E3A2B", "#F2F1EC", "#3F8E43"] },
  { name: "Seaside", hexes: ["#F2F1EC", "#0078BF", "#E8DBB7", "#C12E1F"] },
  { name: "Neon night", hexes: ["#161616", "#F55A74", "#00AE42", "#0086D6"] },
  { name: "Terracotta", hexes: ["#C9663D", "#E8DBB7", "#7D6556", "#3F8E43"] },
  { name: "Berry", hexes: ["#5E43B7", "#C12E1F", "#E8AFCF", "#F2F1EC"] },
  { name: "Monochrome", hexes: ["#161616", "#8E9089", "#C8C8C8", "#F2F1EC"] },
];
