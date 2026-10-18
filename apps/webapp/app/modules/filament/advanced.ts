/**
 * Filament's Advanced view (fork), like Assets' Advanced: one row per filament
 * (line and colour), the columns you choose in the order you choose, sorted by
 * any column. The parts that don't need the database.
 */
import { costPerKg, gramsLeft, typeCounts, type Weighable } from "./catalogue";

export const ADVANCED_COLUMNS = [
  { id: "colour", label: "Filament" },
  { id: "line", label: "Line" },
  { id: "code", label: "Code" },
  { id: "fil", label: "ID" },
  { id: "material", label: "Material" },
  { id: "spools", label: "Spools" },
  { id: "refills", label: "Refills" },
  { id: "left", label: "Left" },
  { id: "paidKg", label: "Paid/kg" },
  { id: "spent", label: "Spent" },
  { id: "store", label: "Store" },
  { id: "ams", label: "In AMS" },
  { id: "bought", label: "Last bought" },
] as const;

export type ColumnId = (typeof ADVANCED_COLUMNS)[number]["id"];
const IDS = ADVANCED_COLUMNS.map((c) => c.id) as readonly string[];

/** The filament itself is always the first column (and stays put when scrolling). */
export const FIXED_COLUMN: ColumnId = "colour";

export const DEFAULT_COLUMNS: ColumnId[] = [
  "colour",
  "line",
  "code",
  "fil",
  "spools",
  "refills",
  "left",
  "paidKg",
  "store",
  "ams",
];

/** The chosen columns from their cookie: known ones only, no repeats, the filament first. */
export function parseColumns(raw: string | null | undefined): ColumnId[] {
  if (!raw) return DEFAULT_COLUMNS;
  const picked = decodeURIComponent(raw)
    .split(",")
    .map((c) => c.trim())
    .filter((c, i, all) => IDS.includes(c) && all.indexOf(c) === i)
    .filter((c) => c !== FIXED_COLUMN) as ColumnId[];
  return [FIXED_COLUMN, ...picked];
}

export const columnLabel = (id: ColumnId) =>
  ADVANCED_COLUMNS.find((c) => c.id === id)?.label ?? id;

export type AdvancedRow = {
  colour: string;
  line: string;
  code: string | null;
  fil: string | null;
  material: string;
  spools: number;
  refills: number;
  /** grams */
  left: number;
  paidKg: number | null;
  spent: number | null;
  store: number | null;
  /** AMS slots, 1 to 4 */
  ams: number[];
  /** ISO date of the latest bought, if any is known */
  bought: string | null;
};

type Item = Weighable & {
  type: string;
  material: string;
  colourName: string;
  packaging?: string | null;
  pricePaid: number | null;
  amsSlot: number | null;
  purchasedOn: Date | string | null;
  filamentCode: string | null;
};

/** One filament's row. */
export function advancedRow(
  group: { type: string; colourName: string; spools: Item[] },
  extra: { fil: string | null; code: string | null; store: number | null }
): AdvancedRow {
  const items = group.spools;
  const counts = typeCounts(items);
  const perKg = items
    .map((s) => costPerKg(s))
    .filter((n): n is number => n !== null);
  const paid = items.filter((s) => s.pricePaid !== null);
  const bought = items
    .map((s) => (s.purchasedOn ? new Date(s.purchasedOn).toISOString() : null))
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);
  return {
    colour: group.colourName,
    line: group.type,
    code: items.find((s) => s.filamentCode)?.filamentCode ?? extra.code,
    fil: extra.fil,
    material: items[0]?.material ?? "",
    spools: counts.spools,
    refills: counts.refills,
    left: items.reduce((n, s) => n + gramsLeft(s), 0),
    paidKg: perKg.length
      ? perKg.reduce((a, b) => a + b, 0) / perKg.length
      : null,
    spent: paid.length
      ? Math.round(paid.reduce((n, s) => n + (s.pricePaid ?? 0), 0) * 100) / 100
      : null,
    store: extra.store,
    ams: items
      .map((s) => s.amsSlot)
      .filter((n): n is number => n !== null)
      .sort(),
    bought: bought ?? null,
  };
}

export function parseSort(
  by: string | null,
  dir: string | null
): { by: ColumnId; dir: "asc" | "desc" } | null {
  if (!by || !IDS.includes(by)) return null;
  return { by: by as ColumnId, dir: dir === "desc" ? "desc" : "asc" };
}

/** Sorts rows by a column; blanks always last, whichever way. */
export function sortRows<T extends { adv: AdvancedRow }>(
  rows: T[],
  by: ColumnId,
  dir: "asc" | "desc"
): T[] {
  const value = (r: AdvancedRow): string | number | null => {
    const v = r[by];
    if (Array.isArray(v)) return v.length ? v[0] : null;
    return v;
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a.adv);
    const y = value(b.adv);
    if (x === null || x === "") return y === null || y === "" ? 0 : 1;
    if (y === null || y === "") return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return (
      String(x).localeCompare(String(y), undefined, { numeric: true }) * sign
    );
  });
}
