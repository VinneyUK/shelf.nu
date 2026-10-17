/**
 * The Filament page's filters (fork, pure): Assets' advanced filter model, in
 * the same address form ("material=is:PLA", "left=lt:20"), for filament.
 * Some test each spool or refill (a filament shows if any of its stock
 * matches); some test the filament as a whole (its kg left, store price,
 * offer).
 */
import { spoolState } from "./catalogue";

export type FilterOp =
  | "is"
  | "isNot"
  | "contains"
  | "lt"
  | "gt"
  | "before"
  | "after";
export type FilterKind =
  | "enum"
  | "text"
  | "number"
  | "amount"
  | "boolean"
  | "date";

export const FILTER_FIELDS = [
  {
    name: "material",
    label: "Material",
    kind: "enum",
    ops: ["is", "isNot"],
    level: "item",
  },
  {
    name: "line",
    label: "Line",
    kind: "enum",
    ops: ["is", "isNot", "contains"],
    level: "item",
  },
  {
    name: "colour",
    label: "Colour",
    kind: "text",
    ops: ["is", "contains"],
    level: "item",
  },
  { name: "type", label: "Type", kind: "enum", ops: ["is"], level: "item" },
  {
    name: "status",
    label: "Status",
    kind: "enum",
    ops: ["is", "isNot"],
    level: "item",
  },
  {
    name: "code",
    label: "Code",
    kind: "text",
    ops: ["is", "contains"],
    level: "item",
  },
  {
    name: "left",
    label: "Left (%)",
    kind: "number",
    ops: ["lt", "gt"],
    level: "item",
  },
  {
    name: "paid",
    label: "Paid",
    kind: "amount",
    ops: ["lt", "gt"],
    level: "item",
  },
  {
    name: "bought",
    label: "Bought on",
    kind: "date",
    ops: ["before", "after"],
    level: "item",
  },
  {
    name: "opened",
    label: "Opened on",
    kind: "date",
    ops: ["before", "after"],
    level: "item",
  },
  {
    name: "kgLeft",
    label: "Left (kg, all of it)",
    kind: "number",
    ops: ["lt", "gt"],
    level: "group",
  },
  {
    name: "store",
    label: "Store price",
    kind: "amount",
    ops: ["lt", "gt"],
    level: "group",
  },
  {
    name: "offer",
    label: "On offer",
    kind: "boolean",
    ops: ["is"],
    level: "group",
  },
] as const satisfies readonly {
  name: string;
  label: string;
  kind: FilterKind;
  ops: readonly FilterOp[];
  level: "item" | "group";
}[];

export type FilterName = (typeof FILTER_FIELDS)[number]["name"];
export const FILTER_NAMES = FILTER_FIELDS.map((f) => f.name) as FilterName[];

export const OP_LABELS: Record<FilterOp, string> = {
  is: "is",
  isNot: "is not",
  contains: "contains",
  lt: "below",
  gt: "above",
  before: "before",
  after: "after",
};

/** The fixed choices for Type and Status (Material and Line come from your stock). */
export const TYPE_CHOICES = [
  { value: "spool", label: "Spool" },
  { value: "refill", label: "Refill" },
];
export const STATUS_CHOICES = [
  { value: "new", label: "New" },
  { value: "opened", label: "Opened" },
  { value: "inuse", label: "In the AMS" },
  { value: "out", label: "Run out?" },
];

export type ActiveFilter = { name: FilterName; op: FilterOp; value: string };

const OPS = new Set(Object.keys(OP_LABELS));

/**
 * The filters in an address. A bare value ("line=PLA Basic", as the
 * click-to-filter links make) means "is". Unknown fields and conditions are
 * ignored.
 */
export function parseFilters(params: URLSearchParams): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const field of FILTER_FIELDS) {
    const raw = params.get(field.name);
    if (raw === null || raw === "") continue;
    const hit = /^([a-zA-Z]+):(.*)$/s.exec(raw);
    const op = (hit && OPS.has(hit[1]) ? hit[1] : "is") as FilterOp;
    const value = (hit && OPS.has(hit[1]) ? hit[2] : raw).trim();
    if (!value || !(field.ops as readonly string[]).includes(op)) continue;
    out.push({ name: field.name, op, value });
  }
  return out;
}

export const filterParam = (f: { op: FilterOp; value: string }) =>
  `${f.op}:${f.value}`;

const levelOf = (name: FilterName) =>
  FILTER_FIELDS.find((f) => f.name === name)!.level;

function compareText(
  actual: string | null | undefined,
  op: FilterOp,
  wanted: string
) {
  const a = (actual ?? "").toLowerCase();
  const w = wanted.toLowerCase();
  if (op === "is") return a === w;
  if (op === "isNot") return a !== w;
  if (op === "contains") return a.includes(w);
  return false;
}
function compareNumber(
  actual: number | null | undefined,
  op: FilterOp,
  wanted: string
) {
  const w = Number(wanted);
  if (actual === null || actual === undefined || !Number.isFinite(w))
    return false;
  return op === "lt" ? actual < w : op === "gt" ? actual > w : false;
}
function compareDate(
  actual: Date | string | null | undefined,
  op: FilterOp,
  wanted: string
) {
  if (!actual) return false;
  const a = new Date(actual).getTime();
  const w = new Date(`${wanted.slice(0, 10)}T00:00:00.000Z`).getTime();
  if (Number.isNaN(w)) return false;
  return op === "before" ? a < w : op === "after" ? a > w : false;
}

type Item = {
  material: string;
  type: string;
  colourName: string;
  packaging?: string | null;
  status: string;
  amsSlot: number | null;
  openedOn: Date | string | null;
  purchasedOn: Date | string | null;
  remainingPercent: number;
  pricePaid: number | null;
  filamentCode: string | null;
};

const statusOf = (s: Item) =>
  ({
    new: "new",
    opened: "opened",
    "in-use": "inuse",
    "run-out": "out",
    retired: "retired",
  })[spoolState(s)];

/** Whether one spool or refill passes every item-level filter. */
export function matchesItem(s: Item, filters: ActiveFilter[]) {
  return filters
    .filter((f) => levelOf(f.name) === "item")
    .every((f) => {
      switch (f.name) {
        case "material":
          return compareText(s.material, f.op, f.value);
        case "line":
          return compareText(s.type, f.op, f.value);
        case "colour":
          return compareText(s.colourName, f.op, f.value);
        case "type":
          return compareText(
            s.packaging === "refill" ? "refill" : "spool",
            f.op,
            f.value
          );
        case "status":
          return compareText(statusOf(s), f.op, f.value);
        case "code":
          return compareText(s.filamentCode, f.op, f.value);
        case "left":
          return compareNumber(s.remainingPercent, f.op, f.value);
        case "paid":
          return compareNumber(s.pricePaid, f.op, f.value);
        case "bought":
          return compareDate(s.purchasedOn, f.op, f.value);
        case "opened":
          return compareDate(s.openedOn, f.op, f.value);
        default:
          return true;
      }
    });
}

/** Whether a whole filament passes every filament-level filter. */
export function matchesGroup(
  g: { gramsLeft: number },
  price: { best?: number | null; onOffer?: boolean } | undefined,
  filters: ActiveFilter[]
) {
  return filters
    .filter((f) => levelOf(f.name) === "group")
    .every((f) => {
      switch (f.name) {
        case "kgLeft":
          return compareNumber(g.gramsLeft / 1000, f.op, f.value);
        case "store":
          return compareNumber(price?.best ?? null, f.op, f.value);
        case "offer":
          return (f.value === "yes") === Boolean(price?.onOffer);
        default:
          return true;
      }
    });
}
