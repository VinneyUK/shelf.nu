/**
 * What Claude is asked, and how its answer is checked. Pure: no I/O, so it's
 * easy to test. Part of the AI feature; not in upstream Shelf.
 */
import type { ContentBlock, Tool } from "./claude.server";

export type CategoryOption = {
  id: string;
  name: string;
  description?: string | null;
};

export type DraftFields = {
  name: string;
  description: string;
  valuation: number | null;
  valueEstimated: boolean;
  categoryId: string | null;
  purchasedOn: Date | null;
  vendor: string | null;
  notes: string | null;
};

const NAME_MAX = 120;
/** Shelf's own limit on an asset description */
const DESCRIPTION_MAX = 1000;

/** How a photographed item is described: a catalogue entry, then its setting. */
const CATALOGUE_STYLE = [
  "Write the description as a catalogue entry, in the style of a good product description, in two paragraphs separated by a blank line.",
  "First paragraph (three to five sentences): what the item is and what it is for; its brand and model if identifiable; its key features and specifications that are visible, or that you are confident belong to that exact model; colour and finish; size if apparent; its condition, including any wear, marks or missing parts; any accessories or parts that are included; any visible text, model or serial number.",
  'Second paragraph, starting "In the photo:" (one or two sentences): where the item is and what is around it, such as the surface it sits on and the things next to it, so that its setting is recorded.',
  "Keep the whole description under 800 characters, and don't put the price in it.",
].join("\n");
const MAX_ITEMS = 5;

const itemProperties = {
  name: {
    type: "string",
    description: "Short, specific name. Brand and model if visible.",
  },
  description: {
    type: "string",
    description: "One to three sentences. Only what can be seen or read.",
  },
  categoryId: {
    type: ["string", "null"],
    description: "The id of the best matching category, or null.",
  },
  notes: {
    type: "string",
    description:
      "Anything you could not tell, or are unsure of. Empty if nothing.",
  },
};

export const PHOTO_TOOL: Tool = {
  name: "record_items",
  description: "Record the items seen in the photo for the home inventory.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        maxItems: MAX_ITEMS,
        items: {
          type: "object",
          properties: {
            ...itemProperties,
            description: {
              type: "string",
              description:
                'A catalogue entry in two paragraphs separated by a blank line: first the item itself (what it is, brand and model, key features, colour, condition, accessories), then "In the photo: …" describing its surroundings. Under 800 characters. Only what is visible, or certain for that exact model.',
            },
            estimatedValue: {
              type: ["number", "null"],
              description:
                "Estimated price to buy this item NEW today, from a UK retailer: one number, in the stated currency. If it is no longer sold, the price of the closest current equivalent. Null if you can't tell what it is.",
            },
          },
          required: ["name", "description", "estimatedValue", "categoryId"],
        },
      },
    },
    required: ["items"],
  },
};

export const RECEIPT_TOOL: Tool = {
  name: "record_purchase",
  description:
    "Record the items bought on this receipt for the home inventory.",
  input_schema: {
    type: "object",
    properties: {
      vendor: { type: ["string", "null"] },
      purchaseDate: {
        type: ["string", "null"],
        description: "YYYY-MM-DD, or null if not shown.",
      },
      items: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            ...itemProperties,
            price: {
              type: ["number", "null"],
              description:
                "Price paid for ONE of this item, in the receipt's currency.",
            },
            quantity: {
              type: "number",
              description: "How many were bought. 1 if not shown.",
            },
          },
          required: ["name", "description", "price", "quantity", "categoryId"],
        },
      },
    },
    required: ["items"],
  },
};

const categoryList = (categories: CategoryOption[]) =>
  categories.length
    ? categories
        .map(
          (c) =>
            `- ${c.id}: ${c.name}${c.description ? ` (${c.description})` : ""}`
        )
        .join("\n")
    : "(no categories yet: use null)";

export const photoSystemPrompt = (currency: string) =>
  [
    "You help catalogue a household's belongings for a home inventory, in the UK.",
    "For the photo, identify the main item and record: a short specific name (brand and model if visible, such as 'Anker Nano 2 65W USB-C Charger'), a catalogue description (described below), the estimated price to buy it NEW today from a UK retailer (its replacement value, not what it would sell for second-hand) in " +
      currency +
      " as a single number, and the best matching category from the list given. If it is no longer sold new, use the price of the closest current equivalent.",
    CATALOGUE_STYLE,
    "Never invent details that aren't visible. State a specification only if it is visible or you are confident it belongs to that exact model. If you can't tell the model, say what it looks like instead. If you can't estimate a value, use null.",
    "Normally return ONE item. Return more only when several distinct items are clearly shown, up to " +
      MAX_ITEMS +
      ".",
    "Use the notes field for what you couldn't tell, and end it with one short sentence saying what the value is based on (for example the web price research, or your own estimate).",
  ].join("\n");

export const receiptSystemPrompt = (currency: string) =>
  [
    "You read purchase receipts and invoices to add what was bought to a home inventory, in the UK.",
    "Record only physical items worth keeping track of as possessions. Skip delivery, postage, fees, taxes, discounts, warranties, subscriptions, and consumables such as food, ink or batteries.",
    "For each item: a short specific name, a one-to-three sentence description, the price paid for ONE unit, the quantity, and the best matching category from the list given. The currency is " +
      currency +
      " unless the receipt shows another.",
    "Record the vendor and the purchase date (YYYY-MM-DD) if shown. Never invent details. Use the notes field for what you couldn't tell.",
  ].join("\n");

export function photoContent(
  image: ContentBlock,
  categories: CategoryOption[],
  currency: string,
  /** What a web price lookup found, if one was done */
  research?: string | null
): ContentBlock[] {
  return [
    image,
    {
      type: "text",
      text:
        `Currency: ${currency}\n\nCategories:\n${categoryList(
          categories
        )}\n\n` +
        (research?.trim()
          ? `Price research from a web search (use it for the new price, with your own judgement, as it can be wrong. If it says unknown, estimate from what you know. It also names the exact model, which you can use for the description's features):\n${research
              .trim()
              .slice(0, 1500)}\n\n`
          : "") +
        "Record the item(s) in this photo.",
    },
  ];
}

/** The web price lookup: identify the item, search, and answer in a fixed plain-text shape. */
export const priceResearchSystemPrompt = (currency: string) =>
  [
    "You research the price of an item in a photo, for a home inventory in the UK.",
    `Identify the item (brand and model if visible). Then use web search to find what it costs NEW today from UK retailers, in ${currency}. Prefer the manufacturer's UK site and major UK retailers. If it has been renamed or discontinued, find the closest current equivalent and say so. Ignore second-hand, auction and "opened" listings unless nothing else exists, and say so if you use one.`,
    "Two or three searches is plenty. If you can't tell what the item is, don't search: say so.",
    `Reply in plain text, under 100 words, in exactly this shape:\nItem: <what it is>\nNew price (${currency}): <one number, or unknown>\nBasis: <one sentence: what the price is and where it came from>\nConfidence: <high, medium or low>`,
  ].join("\n");

export const priceResearchContent = (image: ContentBlock): ContentBlock[] => [
  image,
  {
    type: "text",
    text: "Find the current new price in the UK of the item in this photo.",
  },
];

export function receiptContent(
  parts: { blocks: ContentBlock[]; emailText?: string | null },
  categories: CategoryOption[],
  currency: string
): ContentBlock[] {
  const text = [
    `Currency: ${currency}`,
    "",
    "Categories:",
    categoryList(categories),
    "",
    parts.emailText?.trim()
      ? `The email this arrived in (it may be the receipt itself):\n${parts.emailText
          .trim()
          .slice(0, 6000)}`
      : "",
    "Record the items bought.",
  ]
    .filter((l) => l !== "")
    .join("\n");
  return [...parts.blocks, { type: "text", text }];
}

// ------------------------------------------------------------------ results

/** Text with its paragraph breaks kept: spaces collapse, a blank line separates paragraphs. */
const asParagraphs = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n\n")
        .slice(0, max)
    : "";

const asText = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** A positive, finite amount rounded to pence; anything else is "unknown". */
export function cleanAmount(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.replace(/[^0-9.]/g, ""))
      : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

export function cleanDate(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v)
    return null;
  // A receipt dated in the future, or before 1990, is a misread
  return d.getTime() > Date.now() + 86_400_000 || d.getUTCFullYear() < 1990
    ? null
    : d;
}

function cleanItem(
  raw: unknown,
  categories: CategoryOption[],
  extras: Partial<DraftFields>,
  price: number | null,
  estimated: boolean
): DraftFields | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const name = asText(item.name, NAME_MAX);
  if (!name) return null;
  const categoryId =
    typeof item.categoryId === "string" &&
    categories.some((c) => c.id === item.categoryId)
      ? item.categoryId
      : null;
  const quantity =
    typeof item.quantity === "number" && item.quantity > 1
      ? Math.floor(item.quantity)
      : 1;
  const description =
    asParagraphs(item.description, DESCRIPTION_MAX - 40) +
    (quantity > 1 ? ` Bought ${quantity} of these.` : "");
  return {
    name,
    description: description.trim().slice(0, DESCRIPTION_MAX),
    valuation: price,
    valueEstimated: estimated && price !== null,
    categoryId,
    purchasedOn: null,
    vendor: null,
    notes: asText(item.notes, 300) || null,
    ...extras,
  };
}

/** The photo result as draft fields: at most five items, each checked. */
export function cleanPhotoResult(
  result: Record<string, unknown>,
  categories: CategoryOption[]
): DraftFields[] {
  const items = Array.isArray(result.items)
    ? result.items.slice(0, MAX_ITEMS)
    : [];
  return items
    .map((raw) =>
      cleanItem(
        raw,
        categories,
        {},
        cleanAmount((raw as Record<string, unknown> | null)?.estimatedValue),
        true
      )
    )
    .filter((i): i is DraftFields => i !== null);
}

/** The receipt result as draft fields: the price is what was paid, not an estimate. */
export function cleanReceiptResult(
  result: Record<string, unknown>,
  categories: CategoryOption[]
): DraftFields[] {
  const items = Array.isArray(result.items) ? result.items.slice(0, 20) : [];
  const vendor = asText(result.vendor, 80) || null;
  const purchasedOn = cleanDate(result.purchaseDate);
  return items
    .map((raw) =>
      cleanItem(
        raw,
        categories,
        { vendor, purchasedOn },
        cleanAmount((raw as Record<string, unknown> | null)?.price),
        false
      )
    )
    .filter((i): i is DraftFields => i !== null);
}

/** The description to save: the draft's own, plus where and when it was bought. */
export function descriptionWithPurchase(
  description: string,
  vendor: string | null,
  purchasedOn: Date | null
): string {
  const bits = [
    vendor ? `from ${vendor}` : "",
    purchasedOn
      ? `on ${purchasedOn
          .toISOString()
          .slice(0, 10)
          .split("-")
          .reverse()
          .join("/")}`
      : "",
  ].filter(Boolean);
  if (bits.length === 0) return description;
  const line = `Bought ${bits.join(" ")}.`;
  return description.includes(line)
    ? description
    : `${description}${description ? " " : ""}${line}`.slice(
        0,
        DESCRIPTION_MAX
      );
}
