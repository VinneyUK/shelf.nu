import { BAMBU_CATALOGUE, type CatalogueEntry } from "./bambu-catalogue";
/**
 * Filament (fork): Bambu Lab's product lines and the sums behind the Filament
 * page. Pure, so it is used by both the server and the page.
 */

/** Lines Bambu sells that the catalogue has no colours for yet: typed in by hand. */
const EXTRA_TYPES: [string, string][] = [
  ["PPA-CF", "PPA"],
  ["ASA Aero", "ASA"],
];

/** Bambu Lab's filament lines, each with its base material. "Other" is typed in. */
export const BAMBU_TYPES: readonly (readonly [string, string])[] = [
  ...BAMBU_CATALOGUE.map((e) => [e.type, e.material] as const),
  ...EXTRA_TYPES.filter(([t]) => !BAMBU_CATALOGUE.some((e) => e.type === t)),
];

/** A line's catalogue entry (colours, empty-spool weight, temperatures), if it has one. */
export function catalogueEntry(type: string): CatalogueEntry | null {
  const t = type.trim().toLowerCase();
  return BAMBU_CATALOGUE.find((e) => e.type.toLowerCase() === t) ?? null;
}

/** Bambu's colours for a line, as [name, "#RRGGBB"]. */
export const coloursFor = (type: string) => catalogueEntry(type)?.colours ?? [];

/** The base material of a product line; an unknown line is its own first word. */
export function materialOf(type: string): string {
  const known = BAMBU_TYPES.find(
    ([t]) => t.toLowerCase() === type.trim().toLowerCase()
  );
  if (known) return known[1];
  return type.trim().split(/[\s-]/)[0]?.toUpperCase() || "Other";
}

/** Common full-spool weights, in grams. */
export const SPOOL_WEIGHTS = [250, 500, 750, 1000] as const;

export const AMS_SLOTS = [1, 2, 3, 4] as const;

/** "#rrggbb", or null if it isn't one. Three-digit and alpha forms are normalised. */
export function cleanHex(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v))
    return `#${v
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase()}`;
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v))
    return `#${v.slice(0, 6).toUpperCase()}`;
  return null;
}

type Weighable = {
  weightGrams: number;
  remainingPercent: number;
  pricePaid: number | null;
};

export const clampPercent = (n: number) =>
  Math.max(0, Math.min(100, Math.round(n)));

/** Grams of filament left on the spool. */
export const gramsLeft = (s: Weighable) =>
  Math.round((s.weightGrams * clampPercent(s.remainingPercent)) / 100);

/** What the filament left on the spool cost you, to the penny. */
export const valueLeft = (s: Weighable) =>
  s.pricePaid === null
    ? 0
    : Math.round(s.pricePaid * clampPercent(s.remainingPercent)) / 100;

/** Price per kilogram, or null if the price or weight isn't known. */
export const costPerKg = (s: Pick<Weighable, "weightGrams" | "pricePaid">) =>
  s.pricePaid === null || s.weightGrams <= 0
    ? null
    : Math.round((s.pricePaid / s.weightGrams) * 100000) / 100;

/** How full a spool is, for the colour of its bar. */
export function remainingTone(
  percent: number
): "full" | "ok" | "low" | "empty" {
  if (percent <= 0) return "empty";
  if (percent <= 15) return "low";
  if (percent >= 80) return "full";
  return "ok";
}

/** The figures at the top of the Filament page. */
export function summarise(spools: (Weighable & { status: string })[]) {
  const onHand = spools.filter((s) => s.status === "active");
  return {
    spools: onHand.length,
    gramsLeft: onHand.reduce((n, s) => n + gramsLeft(s), 0),
    valueLeft:
      Math.round(onHand.reduce((n, s) => n + valueLeft(s), 0) * 100) / 100,
    spent:
      Math.round(spools.reduce((n, s) => n + (s.pricePaid ?? 0), 0) * 100) /
      100,
  };
}

/**
 * What's left, from the spool's weight on a kitchen scale: the gross weight
 * less the empty spool, as a share of a full one. Null if it can't be worked out.
 */
export function weighedPercent({
  grossGrams,
  spoolWeightGrams,
  weightGrams,
}: {
  grossGrams: number;
  spoolWeightGrams: number | null;
  weightGrams: number;
}): number | null {
  if (!Number.isFinite(grossGrams) || grossGrams <= 0) return null;
  if (spoolWeightGrams === null || weightGrams <= 0) return null;
  return clampPercent(((grossGrams - spoolWeightGrams) / weightGrams) * 100);
}

/** A filament's address: "pla-silk-plus--champagne". Line and colour, readable and reversible enough. */
export function filamentSlug(type: string, colourName: string) {
  const part = (v: string) =>
    v
      .trim()
      .toLowerCase()
      .replace(/\+/g, "-plus")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${part(type)}--${part(colourName)}`;
}

/** The key spools of the same filament share, for their picture. */
export const filamentKey = (type: string, colourName: string) =>
  `${type.trim().toLowerCase()}|${colourName.trim().toLowerCase()}`;

/**
 * Spools grouped by filament (line and colour), the way Spoolman lists them:
 * one row per filament with the spool count and total left.
 */
export function groupSpools<
  S extends Weighable & { type: string; colourName: string; colourHex: string },
>(spools: S[]) {
  const groups = new Map<
    string,
    {
      key: string;
      type: string;
      colourName: string;
      colourHex: string;
      spools: S[];
      gramsLeft: number;
    }
  >();
  for (const s of spools) {
    const key = filamentKey(s.type, s.colourName);
    const g = groups.get(key) ?? {
      key,
      type: s.type,
      colourName: s.colourName,
      colourHex: s.colourHex,
      spools: [],
      gramsLeft: 0,
    };
    g.spools.push(s);
    g.gramsLeft += gramsLeft(s);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** The order for a stocktake: by line, then colour, then oldest spool first. */
export function stocktakeOrder<
  S extends { type: string; colourName: string; createdAt: Date | string },
>(spools: S[]) {
  return [...spools].sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      a.colourName.localeCompare(b.colourName) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// ---------------------------------------------------------- a spool's life

/** New (sealed) → Opened (on the shelf) → In use (in the AMS) → Run out? → Retired. */
export type SpoolState = "new" | "opened" | "in-use" | "run-out" | "retired";

export const SPOOL_STATES: Record<SpoolState, { label: string; tone: string }> =
  {
    new: { label: "New", tone: "bg-gray-100 text-gray-700" },
    opened: { label: "Opened", tone: "bg-success-50 text-success-700" },
    "in-use": { label: "In use", tone: "bg-blue-50 text-blue-700" },
    "run-out": { label: "Run out?", tone: "bg-warning-50 text-warning-700" },
    retired: { label: "Retired", tone: "bg-gray-100 text-gray-600" },
  };

type Lifecycle = {
  status: string;
  amsSlot: number | null;
  openedOn: Date | string | null;
};

/** A spool's state, from its facts: retired, run out, in the AMS, opened, or still sealed. */
export function spoolState(s: Lifecycle): SpoolState {
  if (s.status === "retired") return "retired";
  if (s.status === "empty") return "run-out";
  if (s.amsSlot !== null) return "in-use";
  return s.openedOn ? "opened" : "new";
}

/** The state's words, with the slot for a spool in use: "In use · AMS 2". */
export function stateLabel(s: Lifecycle) {
  const state = spoolState(s);
  return state === "in-use"
    ? `In use · AMS ${s.amsSlot}`
    : SPOOL_STATES[state].label;
}

/** "today", "yesterday", "3 days ago", "3 weeks ago", "8 months ago", "2 years ago". */
export function daysAgo(date: Date | string, now: Date = new Date()) {
  const day = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((day(now) - day(new Date(date))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30.44)} months ago`;
  return `${Math.round(days / 365.25)} years ago`;
}

/** The New spool to open next: the oldest bought (unknown dates last), then the first added. */
export function oldestNew<
  S extends Lifecycle & {
    purchasedOn: Date | string | null;
    createdAt: Date | string;
  },
>(spools: S[]): S | null {
  const time = (d: Date | string | null) =>
    d ? new Date(d).getTime() : Infinity;
  return (
    spools
      .filter((s) => spoolState(s) === "new")
      .sort(
        (a, b) =>
          time(a.purchasedOn) - time(b.purchasedOn) ||
          time(a.createdAt) - time(b.createdAt)
      )[0] ?? null
  );
}

/** How many of a filament's spools are new, opened and in use, for its tile: "2 new · 1 open". */
export function stateCounts(spools: Lifecycle[]) {
  const states = spools.map(spoolState);
  return {
    new: states.filter((s) => s === "new").length,
    open: states.filter((s) => s === "opened" || s === "in-use").length,
  };
}

// ------------------------------------------------------------ refill or spool

export type Packaging = "spool" | "refill";
export const PACKAGING: Record<Packaging, string> = {
  spool: "Spool",
  refill: "Refill",
};
export const cleanPackaging = (value: unknown): Packaging =>
  value === "refill" ? "refill" : "spool";

// -------------------------------------------------------- finding a filament

/** A code Shelf already knows, from your spools or the Bambu store. */
export type KnownCode = { code: string; type: string; colourName: string };

export type FilamentMatch = {
  type: string;
  colourName: string;
  colourHex: string;
  code: string | null;
};

/**
 * The plain colour words a shade answers to ("black" for Charcoal), judged
 * from its hex, so you needn't know Bambu's colour names.
 */
export function colourWords(hex: string): string[] {
  const h = cleanHex(hex);
  if (!h) return [];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s =
    max === min
      ? 0
      : l > 0.5
      ? (max - min) / (2 - max - min)
      : (max - min) / (max + min);
  if (l < 0.2) return ["black"];
  if (s < 0.15) return l > 0.85 ? ["white"] : ["grey", "gray"];
  if (l > 0.92) return ["white"];
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue >= 15 && hue < 45 && l < 0.45) return ["brown"];
  if (hue < 15 || hue >= 330) return l > 0.6 ? ["pink"] : ["red"]; // a light red reads as pink
  if (hue < 45) return ["orange"];
  if (hue < 70) return ["yellow"];
  if (hue < 170) return ["green"];
  if (hue < 245) return ["blue"];
  if (hue < 290) return ["purple"];
  return ["pink"];
}

/**
 * Bambu's filaments matching what you type: a line, a colour, a material or
 * the code on the box, in any order ("matte black", "10100", "jade"). Every
 * word must match. Codes come from the ones Shelf knows.
 */
export function searchFilaments(
  query: string,
  codes: KnownCode[] = [],
  limit = 8
): FilamentMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const codeFor = new Map(
    codes.map((c) => [filamentKey(c.type, c.colourName), c.code])
  );
  const found: (FilamentMatch & { score: number })[] = [];
  for (const entry of BAMBU_CATALOGUE) {
    for (const [colourName, colourHex] of entry.colours) {
      const code = codeFor.get(filamentKey(entry.type, colourName)) ?? null;
      const text = `${entry.type} ${entry.material} ${colourName} ${
        code ?? ""
      } ${colourWords(colourHex).join(" ")}`.toLowerCase();
      if (!words.every((w) => text.includes(w))) continue;
      const q = words.join(" ");
      const score =
        (code && code === q ? 0 : 10) +
        (colourName.toLowerCase().startsWith(words[0]) ? 0 : 3) +
        (entry.type.toLowerCase().startsWith(words[0]) ? 0 : 1);
      found.push({ type: entry.type, colourName, colourHex, code, score });
    }
  }
  // known codes for filaments outside the catalogue
  for (const c of codes) {
    if (
      found.some(
        (f) =>
          filamentKey(f.type, f.colourName) ===
          filamentKey(c.type, c.colourName)
      )
    )
      continue;
    const text = `${c.type} ${c.colourName} ${c.code}`.toLowerCase();
    if (words.every((w) => text.includes(w))) {
      found.push({
        type: c.type,
        colourName: c.colourName,
        colourHex: "#888888",
        code: c.code,
        score: c.code === words.join(" ") ? 0 : 5,
      });
    }
  }
  return found
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.type.localeCompare(b.type) ||
        a.colourName.localeCompare(b.colourName)
    )
    .slice(0, limit)
    .map(({ score: _score, ...m }) => m);
}
