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
