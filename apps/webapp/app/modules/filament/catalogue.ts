/**
 * Filament (fork): Bambu Lab's product lines and the sums behind the Filament
 * page. Pure, so it is used by both the server and the page.
 */

/** Bambu Lab's filament lines, each with its base material. "Other" is typed in. */
export const BAMBU_TYPES = [
  ["PLA Basic", "PLA"],
  ["PLA Basic Gradient", "PLA"],
  ["PLA Matte", "PLA"],
  ["PLA Silk+", "PLA"],
  ["PLA Silk Multi-Color", "PLA"],
  ["PLA Tough+", "PLA"],
  ["PLA Translucent", "PLA"],
  ["PLA Metal", "PLA"],
  ["PLA Marble", "PLA"],
  ["PLA Sparkle", "PLA"],
  ["PLA Galaxy", "PLA"],
  ["PLA Glow", "PLA"],
  ["PLA Wood", "PLA"],
  ["PLA Aero", "PLA"],
  ["PLA-CF", "PLA"],
  ["PETG HF", "PETG"],
  ["PETG Translucent", "PETG"],
  ["PETG-CF", "PETG"],
  ["PET-CF", "PET"],
  ["ABS", "ABS"],
  ["ABS-GF", "ABS"],
  ["ASA", "ASA"],
  ["ASA Aero", "ASA"],
  ["ASA-CF", "ASA"],
  ["TPU 95A HF", "TPU"],
  ["TPU for AMS", "TPU"],
  ["PC", "PC"],
  ["PC FR", "PC"],
  ["PAHT-CF", "PA"],
  ["PA6-CF", "PA"],
  ["PA6-GF", "PA"],
  ["PPA-CF", "PPA"],
  ["PPS-CF", "PPS"],
  ["Support for PLA/PETG", "Support"],
  ["Support for ABS", "Support"],
  ["Support for PA/PET", "Support"],
  ["PVA", "PVA"],
] as const;

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
