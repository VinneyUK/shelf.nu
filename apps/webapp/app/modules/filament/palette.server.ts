/**
 * Palettes from your filament (fork), on the server: the filaments to choose
 * from, saved palettes, and the optional AI parts (a palette from words, and
 * what to buy next explained), through the Claude connection set in
 * Settings → AI. Claude is only ever given your own filaments to pick from.
 */
import { db } from "~/database/db.server";
import { callClaude, ClaudeError } from "~/modules/ai/claude.server";
import { getAiSettingsRow } from "~/modules/ai/settings.server";
import { ShelfError } from "~/utils/error";
import { filamentKey, filamentSlug } from "./catalogue";
import { finishOf, type PaletteFilament } from "./palette";

const label = "Assets";

/** Every filament with something on hand, as palette colours: one per line and colour. */
export async function paletteFilaments(
  organizationId: string
): Promise<PaletteFilament[]> {
  const spools = await db.spool.findMany({
    where: { organizationId, status: { not: "retired" } },
    select: {
      type: true,
      colourName: true,
      colourHex: true,
      amsSlot: true,
      openedOn: true,
    },
    orderBy: [{ type: "asc" }, { colourName: "asc" }],
  });
  const byKey = new Map<string, PaletteFilament>();
  for (const s of spools) {
    const key = filamentKey(s.type, s.colourName);
    const hex = (s.colourHex || "#888888").slice(0, 7);
    const f =
      byKey.get(key) ??
      ({
        key,
        slug: filamentSlug(s.type, s.colourName),
        name: s.colourName,
        hex: hex.startsWith("#") ? hex : `#${hex}`,
        line: s.type,
        finish: finishOf(s.type),
        state: "sealed",
        slot: null,
        hasOpen: false,
        hasSealed: false,
      } as PaletteFilament);
    if (s.amsSlot !== null) {
      f.state = "ams";
      f.slot = f.slot ?? s.amsSlot;
      f.hasOpen = true;
    } else if (s.openedOn) {
      if (f.state !== "ams") f.state = "open";
      f.hasOpen = true;
    } else f.hasSealed = true;
    byKey.set(key, f);
  }
  return [...byKey.values()];
}

/* ------------------------------------------------------ saved palettes */

export function listPalettes(organizationId: string) {
  return db.filamentPalette.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keys: true, createdAt: true },
  });
}

export async function savePalette(
  organizationId: string,
  name: string,
  keys: string[]
) {
  const clean = name.trim().slice(0, 80);
  if (!clean)
    throw new ShelfError({
      cause: null,
      message: "Give the palette a name.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  if (keys.length < 2 || keys.length > 8)
    throw new ShelfError({
      cause: null,
      message: "A palette has 2 to 8 colours.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  return db.filamentPalette.create({
    data: { organizationId, name: clean, keys: keys.slice(0, 8) },
    select: { id: true },
  });
}

export async function deletePalette(organizationId: string, id: string) {
  await db.filamentPalette.deleteMany({ where: { id, organizationId } });
}

/** The saved palettes a filament is in (for its page). */
export async function palettesWith(organizationId: string, key: string) {
  return db.filamentPalette.findMany({
    where: { organizationId, keys: { has: key } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keys: true },
    take: 6,
  });
}

/* ------------------------------------------------------------- the AI parts */

async function aiOrThrow(organizationId: string) {
  const s = await getAiSettingsRow(organizationId);
  if (!s.enabled || !s.apiKey)
    throw new ShelfError({
      cause: null,
      message: "Turn AI on and add your key in Settings → AI to use this.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  return s;
}

const stockList = (pool: PaletteFilament[]) =>
  pool
    .map(
      (f) =>
        `${f.key} | ${f.name} | ${f.hex} | ${f.line} | ${
          f.state === "ams" ? `in AMS ${f.slot}` : f.state
        }`
    )
    .join("\n");

/**
 * A palette from words ("Halloween but cute"): Claude picks `count`
 * filaments, from the pool only, with a short reason for each and a name.
 */
export async function aiPalette(
  organizationId: string,
  prompt: string,
  count: number,
  pool: PaletteFilament[],
  call: typeof callClaude = callClaude
) {
  const s = await aiOrThrow(organizationId);
  if (pool.length < 2)
    throw new ShelfError({
      cause: null,
      message: "Fewer than two filaments to choose from.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  const n = Math.max(2, Math.min(8, count, pool.length));
  const tool = {
    name: "suggest_palette",
    description: "The palette, made only of filaments from the list.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "A short name for the palette, 2–4 words",
        },
        picks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description: "The filament's key, exactly as listed",
              },
              why: {
                type: "string",
                description: "What it's for in the print, under 8 words",
              },
            },
            required: ["key", "why"],
          },
        },
      },
      required: ["name", "picks"],
    },
  };
  try {
    const out = await call({
      apiKey: s.apiKey,
      model: s.model,
      workspaceId: s.workspaceId || undefined,
      maxTokens: 1024,
      system:
        "You choose colour palettes for 3D prints from the filaments a person has. Choose only from the list given, by key. Choose colours that work together for what they describe, with enough contrast to read as separate parts. British English.",
      content: [
        {
          type: "text",
          text: `Make a palette of exactly ${n} colours for: ${prompt.slice(
            0,
            300
          )}\n\nThe filaments (key | colour | hex | line | where):\n${stockList(
            pool
          )}`,
        },
      ],
      tool,
    });
    const picks = Array.isArray(out.picks)
      ? (out.picks as { key?: unknown; why?: unknown }[])
      : [];
    const seen = new Set<string>();
    const items = picks
      .map((p) => ({
        f: pool.find((f) => f.key === String(p.key)),
        why: String(p.why ?? "").slice(0, 80),
      }))
      .filter(
        (p): p is { f: PaletteFilament; why: string } =>
          !!p.f && !seen.has(p.f.key) && !!seen.add(p.f.key)
      )
      .slice(0, n);
    if (items.length < 2)
      throw new ClaudeError(
        "Claude didn't pick enough of your filaments. Try again."
      );
    return { name: String(out.name ?? "Palette").slice(0, 60), items };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message:
        cause instanceof Error
          ? cause.message
          : "Couldn't get a palette from Claude.",
      status: 503,
      label,
      shouldBeCaptured: false,
    });
  }
}

/** What to buy next, explained: a few sentences from Claude on the gaps in your colours. */
export async function aiExplainGaps(
  organizationId: string,
  pool: PaletteFilament[],
  gaps: string[],
  call: typeof callClaude = callClaude
) {
  const s = await aiOrThrow(organizationId);
  const tool = {
    name: "explain_gaps",
    description: "The explanation.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Two or three sentences, plain and friendly",
        },
      },
      required: ["text"],
    },
  };
  try {
    const out = await call({
      apiKey: s.apiKey,
      model: s.model,
      workspaceId: s.workspaceId || undefined,
      maxTokens: 600,
      system:
        "You help someone choose 3D printing filament colours to buy. Say what's missing from their colours and which few colours would open up the most palettes, by everyday colour names. British English, no lists.",
      content: [
        {
          type: "text",
          text: `Their filaments (key | colour | hex | line | where):\n${stockList(
            pool
          )}\n\nHue gaps found (hex): ${gaps.join(", ") || "none"}`,
        },
      ],
      tool,
    });
    return String(out.text ?? "").slice(0, 800);
  } catch (cause) {
    throw new ShelfError({
      cause,
      message:
        cause instanceof Error
          ? cause.message
          : "Couldn't get an answer from Claude.",
      status: 503,
      label,
      shouldBeCaptured: false,
    });
  }
}
