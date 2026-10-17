/**
 * Bambu order emails (fork): a forwarded Bambu Lab order confirmation puts
 * its filament in the Filament inbox, each line (product line, colour,
 * quantity, price per spool, order date) read by Claude, waiting for approval.
 *
 * Forwarded mail arrives from your own allowed address, so an order is
 * recognised by what it says, not who sent it. If it holds no filament (or AI
 * is off), nothing happens here and the email goes on to asset drafts as
 * before.
 */
import {
  callClaude,
  pdfBlock,
  type ContentBlock,
  type Tool,
} from "~/modules/ai/claude.server";
import { getAiSettingsRow } from "~/modules/ai/settings.server";
import { BAMBU_TYPES, coloursFor } from "./catalogue";
import { proposeSpool } from "./service.server";

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * The order date as a date: 2026-10-12, 12/10/2026 (UK order: day first) or
 * 12 October 2026. Null if it isn't a real date: an unknown date stays blank.
 */
export function parseOrderDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  let y: number, m: number, d: number;
  let hit = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)))
    [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if (
    (hit = v.match(
      /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[A-Za-z]*,?\s+(\d{4})$/
    ))
  ) {
    [d, y] = [Number(hit[1]), Number(hit[3])];
    m = MONTHS.indexOf(hit[2].toLowerCase()) + 1;
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  return real && y > 2015 && date.getTime() <= Date.now() + 86_400_000
    ? date
    : null;
}

/** Mentions Bambu Lab and reads like an order. */
export function looksLikeBambuOrder({
  subject,
  text,
}: {
  subject: string;
  text: string | null;
}) {
  const all = `${subject}\n${text ?? ""}`;
  return (
    /bambu\s*lab|bambulab\.com/i.test(all) &&
    /\border\b|receipt|invoice|confirm|shipped|dispatched/i.test(all)
  );
}

type Line = {
  isFilament: boolean;
  line: string;
  colour: string;
  code: string | null;
  quantity: number;
  unitPrice: number | null;
  sizeGrams: number | null;
  kind?: string;
};

const TOOL: Tool = {
  name: "record_bambu_order",
  description: "Record the filament bought in a Bambu Lab order.",
  input_schema: {
    type: "object",
    properties: {
      isBambuOrder: {
        type: "boolean",
        description:
          "True if this is a Bambu Lab store order, receipt or invoice.",
      },
      orderDate: {
        type: ["string", "null"],
        description:
          "The order date as YYYY-MM-DD. If the order doesn't print one, use the date of the original Bambu Lab email in the forwarded header (Date: …). Null if neither is shown.",
      },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            isFilament: {
              type: "boolean",
              description:
                "True for filament spools or refills; false for anything else.",
            },
            line: {
              type: "string",
              description:
                "Bambu's product line, e.g. PLA Basic, PLA Matte, PETG HF.",
            },
            colour: {
              type: "string",
              description:
                "The colour name exactly as Bambu writes it, e.g. Jade White.",
            },
            code: {
              type: ["string", "null"],
              description: "The filament code if shown, e.g. 10100.",
            },
            quantity: {
              type: "integer",
              description: "How many spools or refills of this colour.",
            },
            unitPrice: {
              type: ["number", "null"],
              description: "Price paid per spool in pounds, after discounts.",
            },
            kind: {
              type: "string",
              enum: ["spool", "refill"],
              description:
                "spool if it comes on a spool; refill if it is filament only, for a reusable spool.",
            },
            sizeGrams: {
              type: ["integer", "null"],
              description: "Filament per spool in grams, e.g. 1000.",
            },
          },
          required: ["isFilament", "line", "colour", "quantity"],
        },
      },
    },
    required: ["isBambuOrder", "items"],
  },
};

const SYSTEM = `You read Bambu Lab store orders and list the filament bought.
Use Bambu's own product line names where they fit: ${BAMBU_TYPES.map(
  ([t]) => t
).join(", ")}.
Give each colour exactly as Bambu writes it. A line of 4 spools of one colour is one item with quantity 4.
The price is per spool, in pounds, after any discount (divide a line total by its quantity).
Mark nozzles, plates, tools and anything that isn't filament as isFilament false.`;

/** Bambu's hex for a colour of a line, when the catalogue knows it. */
function hexFor(line: string, colour: string) {
  const c = colour.trim().toLowerCase();
  return (
    coloursFor(line).find(([name]) => name.toLowerCase() === c)?.[1] ??
    "#888888"
  );
}

/**
 * Reads a Bambu order into the Filament inbox. Returns how many inbox entries
 * it made: 0 means it wasn't an order with filament, or AI is off, and the
 * caller carries on as usual.
 */
export async function spoolsFromBambuOrder(
  {
    organizationId,
    subject,
    text,
    files,
  }: {
    organizationId: string;
    subject: string;
    text: string | null;
    files: { name: string; type: string; bytes: Uint8Array }[];
  },
  deps: { call?: typeof callClaude; propose?: typeof proposeSpool } = {}
): Promise<number> {
  const ai = await getAiSettingsRow(organizationId);
  if (!ai.enabled || !ai.apiKey) return 0;
  const content: ContentBlock[] = [
    {
      type: "text",
      text: `Subject: ${subject}\n\n${(text ?? "").slice(0, 20000)}`,
    },
  ];
  const pdf = files.find((f) => f.type === "application/pdf");
  if (pdf) content.push(pdfBlock(pdf.bytes));

  const answer = await (deps.call ?? callClaude)({
    apiKey: ai.apiKey,
    model: ai.model,
    workspaceId: ai.workspaceId || undefined,
    system: SYSTEM,
    content,
    tool: TOOL,
  });
  if (!answer.isBambuOrder) return 0;
  const purchasedOn = parseOrderDate(answer.orderDate);
  const lines = (
    Array.isArray(answer.items) ? (answer.items as Line[]) : []
  ).filter((l) => l && l.isFilament && l.line && l.colour);
  const propose = deps.propose ?? proposeSpool;
  for (const l of lines) {
    await propose(organizationId, {
      source: "receipt",
      type: l.line,
      colourName: l.colour,
      colourHex: hexFor(l.line, l.colour),
      weightGrams: l.sizeGrams && l.sizeGrams > 0 ? l.sizeGrams : 1000,
      remainingPercent: 100,
      pricePaid:
        typeof l.unitPrice === "number" && l.unitPrice >= 0
          ? Math.round(l.unitPrice * 100) / 100
          : null,
      purchasedOn,
      filamentCode: l.code,
      quantity: l.quantity,
      packaging: l.kind === "refill" ? "refill" : "spool",
    });
  }
  return lines.length;
}
