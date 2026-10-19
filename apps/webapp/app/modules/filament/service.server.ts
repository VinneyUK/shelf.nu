/**
 * Filament (fork): spools and the approval inbox.
 *
 * A spool is active until it reaches 0%, when it becomes "empty" and waits for
 * you to confirm before it is retired. Retired spools stay as history. Spools
 * the AMS or a receipt find (phase 2 and 3) go to the inbox as candidates and
 * only become spools when you approve them.
 */
import { db } from "~/database/db.server";

/** The client inside db.$transaction (Shelf's client is an extended one). */
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
import { ShelfError } from "~/utils/error";
import type { Tray } from "./ams";
import {
  catalogueEntry,
  clampPercent,
  cleanHex,
  cleanPackaging,
  filamentKey,
  filamentSlug,
  type KnownCode,
  materialOf,
  type Packaging,
  weighedPercent,
} from "./catalogue";
import { storeCodes } from "./codes.server";
import { carryFilamentNumber } from "./numbers.server";

const label = "Assets" as const;
const bad = (message: string, status: 400 | 404 = 400) =>
  new ShelfError({
    cause: null,
    message,
    status,
    label,
    shouldBeCaptured: false,
  });

export type SpoolInput = {
  type: string;
  colourName: string;
  colourHex: string;
  weightGrams: number;
  remainingPercent: number;
  pricePaid: number | null;
  purchasedOn: Date | null;
  /** When it was opened; none for a New (sealed) spool */
  openedOn?: Date | null;
  amsSlot: number | null;
  notes: string | null;
  /** With its spool, or a refill */
  packaging?: Packaging;
  /** The code Bambu prints on the spool and box */
  filamentCode?: string | null;
  /** The empty spool, in grams; from the catalogue when not given */
  spoolWeightGrams?: number | null;
};

/** Today, as a date. */
const today = () =>
  new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

/** An opened date can't be before the bought date. */
function checkOpened(purchasedOn: Date | null, openedOn: Date | null) {
  if (purchasedOn && openedOn && openedOn.getTime() < purchasedOn.getTime()) {
    throw bad("The opened date can't be before the bought date.");
  }
  return openedOn;
}

/**
 * A spool opens itself when it goes into the AMS or starts being used (today),
 * unless it already has a date. A date you give always wins.
 */
export function openedFor({
  openedOn,
  amsSlot,
  remainingPercent,
}: {
  openedOn: Date | null;
  amsSlot: number | null;
  remainingPercent: number;
}) {
  if (openedOn) return openedOn;
  return amsSlot !== null || remainingPercent < 100 ? today() : null;
}

/** Checks and tidies what was typed in. */
function clean(input: SpoolInput) {
  const type = input.type.trim();
  if (!type) throw bad("Choose the filament type.");
  const colourName = input.colourName.trim().slice(0, 60);
  if (!colourName) throw bad("Give the colour a name.");
  const colourHex = cleanHex(input.colourHex);
  if (!colourHex) throw bad("Choose a colour.");
  if (
    !Number.isFinite(input.weightGrams) ||
    input.weightGrams <= 0 ||
    input.weightGrams > 10000
  ) {
    throw bad("The spool weight should be in grams, between 1 and 10,000.");
  }
  if (
    input.pricePaid !== null &&
    (!Number.isFinite(input.pricePaid) || input.pricePaid < 0)
  ) {
    throw bad("The price paid should be a positive amount.");
  }
  if (input.amsSlot !== null && ![1, 2, 3, 4].includes(input.amsSlot))
    throw bad("The AMS has slots 1 to 4.");
  return {
    type: type.slice(0, 60),
    material: materialOf(type),
    colourName,
    colourHex,
    weightGrams: Math.round(input.weightGrams),
    remainingPercent: clampPercent(input.remainingPercent),
    pricePaid:
      input.pricePaid === null ? null : Math.round(input.pricePaid * 100) / 100,
    purchasedOn: input.purchasedOn,
    openedOn: checkOpened(input.purchasedOn, input.openedOn ?? null),
    packaging: cleanPackaging(input.packaging),
    amsSlot: input.amsSlot,
    notes: input.notes?.trim().slice(0, 500) || null,
    filamentCode:
      input.filamentCode
        ?.trim()
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 12) || null,
    spoolWeightGrams:
      input.spoolWeightGrams && input.spoolWeightGrams > 0
        ? Math.round(input.spoolWeightGrams)
        : catalogueEntry(type)?.spoolWeight ?? null,
  };
}

/** Only one spool per AMS slot: whatever was in the slot comes out. */
async function freeSlot(
  tx: Tx,
  organizationId: string,
  slot: number | null,
  exceptId?: string
) {
  if (slot === null) return;
  await tx.spool.updateMany({
    where: {
      organizationId,
      amsSlot: slot,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    data: { amsSlot: null },
  });
}

/** Everything the Filament page shows. */
export async function getFilament(organizationId: string) {
  const [spools, candidates] = await Promise.all([
    db.spool.findMany({
      where: { organizationId },
      orderBy: [{ material: "asc" }, { type: "asc" }, { colourName: "asc" }],
    }),
    db.spoolCandidate.findMany({
      where: { organizationId, status: "pending" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { spools, candidates };
}

/**
 * Adds several identical spools at once (a multi-roll order). Only the first
 * goes into the AMS slot, if one was chosen.
 */
export async function createSpools(
  organizationId: string,
  input: SpoolInput,
  quantity: number,
  source = "manual"
) {
  const count = Math.max(1, Math.min(20, Math.round(quantity) || 1));
  const created = [];
  for (let i = 0; i < count; i++) {
    created.push(
      await createSpool(
        organizationId,
        i === 0 ? input : { ...input, amsSlot: null },
        source
      )
    );
  }
  return created;
}

/** Sets what's left from the spool's weight on a scale. */
export async function weighSpool(
  organizationId: string,
  id: string,
  grossGrams: number
) {
  const spool = await db.spool.findFirst({ where: { id, organizationId } });
  if (!spool) throw bad("That filament doesn't exist.", 404);
  const tare =
    spool.spoolWeightGrams ?? catalogueEntry(spool.type)?.spoolWeight ?? null;
  if (tare === null) {
    throw bad(
      "Set the empty spool's weight first (edit the spool), so it can be taken off."
    );
  }
  const percent = weighedPercent({
    grossGrams,
    spoolWeightGrams: tare,
    weightGrams: spool.weightGrams,
  });
  if (percent === null)
    throw bad("Enter the weight in grams, as shown on the scale.");
  await db.spool.update({
    where: { id, organizationId },
    data: {
      remainingPercent: percent,
      openedOn: spool.openedOn ?? (percent < 100 ? today() : null),
      status:
        spool.status === "retired"
          ? "retired"
          : percent === 0
          ? "empty"
          : "active",
    },
  });
  return percent;
}

export async function createSpool(
  organizationId: string,
  input: SpoolInput,
  source = "manual"
) {
  const data = clean(input);
  data.openedOn = openedFor(data);
  return db.$transaction(async (tx) => {
    await freeSlot(tx, organizationId, data.amsSlot);
    return tx.spool.create({
      data: {
        ...data,
        organizationId,
        source,
        status: data.remainingPercent === 0 ? "empty" : "active",
      },
    });
  });
}

/** Saves an edit. Reaching 0% doesn't retire the spool: it waits for you to confirm. */
export async function updateSpool(
  organizationId: string,
  id: string,
  input: SpoolInput
) {
  const existing = await db.spool.findFirst({ where: { id, organizationId } });
  if (!existing) throw bad("That filament doesn't exist.", 404);
  const data = clean(input);
  data.openedOn = openedFor({
    ...data,
    openedOn: input.openedOn === undefined ? existing.openedOn : data.openedOn,
  });
  const status =
    existing.status === "retired"
      ? "retired"
      : data.remainingPercent === 0
      ? "empty"
      : "active";
  const updated = await db.$transaction(async (tx) => {
    await freeSlot(tx, organizationId, data.amsSlot, id);
    return tx.spool.update({
      where: { id, organizationId },
      data: { ...data, status },
    });
  });
  // its label number follows it if it was the filament's only item
  await carryFilamentNumber(organizationId, existing, updated);
  return updated;
}

/** Retires a spool that has run out (or that you've finished with). */
export async function retireSpool(organizationId: string, id: string) {
  const { count } = await db.spool.updateMany({
    where: { id, organizationId, status: { in: ["active", "empty"] } },
    data: {
      status: "retired",
      retiredAt: new Date(),
      amsSlot: null,
      remainingPercent: 0,
    },
  });
  if (count === 0) throw bad("That filament can't be retired.", 404);
}

/** "It's not empty after all": back to active with some filament left. */
export async function keepSpool(
  organizationId: string,
  id: string,
  remainingPercent: number
) {
  const percent = clampPercent(remainingPercent);
  if (percent === 0) throw bad("Say how much is left: more than 0%.");
  const { count } = await db.spool.updateMany({
    where: { id, organizationId, status: { in: ["empty", "retired"] } },
    data: { status: "active", remainingPercent: percent, retiredAt: null },
  });
  if (count === 0) throw bad("That filament can't be brought back.", 404);
}

export async function deleteSpool(organizationId: string, id: string) {
  const { count } = await db.spool.deleteMany({
    where: { id, organizationId },
  });
  if (count === 0) throw bad("That filament doesn't exist.", 404);
}

// ------------------------------------------------------------------ the inbox

export type Candidate = {
  source: "ams" | "receipt";
  type: string;
  colourName: string;
  colourHex: string;
  weightGrams?: number;
  remainingPercent?: number | null;
  pricePaid?: number | null;
  purchasedOn?: Date | null;
  tagUid?: string | null;
  amsSlot?: number | null;
  /** How many spools of it (from a receipt) */
  quantity?: number;
  /** With its spool, or a refill */
  packaging?: Packaging;
  filamentCode?: string | null;
};

/**
 * Something found a spool (the AMS read its tag, or a receipt listed it). If
 * it's a spool you already have, nothing new is proposed. If it's already in
 * the inbox, that entry is refreshed. Otherwise it goes to the inbox.
 */
export async function proposeSpool(
  organizationId: string,
  found: Candidate
): Promise<
  { kind: "known"; spoolId: string } | { kind: "pending"; candidateId: string }
> {
  const tagUid = found.tagUid?.trim() || null;
  if (tagUid) {
    const spool = await db.spool.findFirst({
      where: { organizationId, tagUid },
      select: { id: true },
    });
    if (spool) return { kind: "known", spoolId: spool.id };
  }
  const colourHex = cleanHex(found.colourHex) ?? "#888888";
  const data = {
    quantity: Math.max(1, Math.min(20, Math.round(found.quantity ?? 1) || 1)),
    packaging: cleanPackaging(found.packaging),
    filamentCode: found.filamentCode?.trim() || null,
    source: found.source,
    type: found.type.trim().slice(0, 60) || "Unknown",
    material: materialOf(found.type),
    colourName: found.colourName.trim().slice(0, 60) || "Unknown",
    colourHex,
    weightGrams:
      found.weightGrams && found.weightGrams > 0
        ? Math.round(found.weightGrams)
        : 1000,
    remainingPercent:
      found.remainingPercent === null || found.remainingPercent === undefined
        ? null
        : clampPercent(found.remainingPercent),
    pricePaid: found.pricePaid ?? null,
    purchasedOn: found.purchasedOn ?? null,
    tagUid,
    amsSlot: found.amsSlot ?? null,
  };
  if (tagUid) {
    const pending = await db.spoolCandidate.findFirst({
      where: { organizationId, tagUid, status: "pending" },
      select: { id: true },
    });
    if (pending) {
      await db.spoolCandidate.update({
        where: { id: pending.id, organizationId },
        data,
      });
      return { kind: "pending", candidateId: pending.id };
    }
  }
  const created = await db.spoolCandidate.create({
    data: { ...data, organizationId },
  });
  return { kind: "pending", candidateId: created.id };
}

/** Approve: the candidate becomes a spool (with any corrections you made). */
export async function approveCandidate(
  organizationId: string,
  id: string,
  input: SpoolInput,
  /** How many spools to add; the entry's own quantity when not given */
  quantity?: number
) {
  const candidate = await db.spoolCandidate.findFirst({
    where: { id, organizationId, status: "pending" },
  });
  if (!candidate) throw bad("That one has already been dealt with.", 404);
  const data = clean(input);
  const firstOpened =
    candidate.source === "ams" ? data.openedOn ?? today() : openedFor(data);
  const laterOpened = openedFor({ ...data, amsSlot: null });
  const count = Math.max(
    1,
    Math.min(20, Math.round(quantity ?? candidate.quantity ?? 1) || 1)
  );
  return db.$transaction(async (tx) => {
    await freeSlot(tx, organizationId, data.amsSlot);
    // the first spool takes the tag and the AMS slot; any others are on the shelf
    const spool = await tx.spool.create({
      data: {
        ...data,
        organizationId,
        source: candidate.source,
        tagUid: candidate.tagUid,
        openedOn: firstOpened,
        status: data.remainingPercent === 0 ? "empty" : "active",
      },
    });
    for (let i = 1; i < count; i++) {
      await tx.spool.create({
        data: {
          ...data,
          amsSlot: null,
          openedOn: laterOpened,
          organizationId,
          source: candidate.source,
          status: data.remainingPercent === 0 ? "empty" : "active",
        },
      });
    }
    await tx.spoolCandidate.update({
      where: { id, organizationId },
      data: { status: "approved" },
    });
    return spool;
  });
}

export async function dismissCandidate(organizationId: string, id: string) {
  const { count } = await db.spoolCandidate.updateMany({
    where: { id, organizationId, status: "pending" },
    data: { status: "dismissed" },
  });
  if (count === 0) throw bad("That one has already been dealt with.", 404);
}

// ------------------------------------------------------- one filament's page

/** Every spool of one filament (line and colour), oldest first, by its address. */
export async function getFilamentBySlug(organizationId: string, slug: string) {
  const spools = await db.spool.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  return spools.filter((s) => filamentSlug(s.type, s.colourName) === slug);
}

export type FilamentInput = {
  type: string;
  colourName: string;
  colourHex: string;
  filamentCode: string | null;
  weightGrams: number;
  spoolWeightGrams: number | null;
};

/**
 * Edits the filament itself (line, colour, code, spool size, empty spool) on
 * every one of its spools. Returns its address, which changes with a rename.
 */
export async function updateFilament(
  organizationId: string,
  slug: string,
  input: FilamentInput
) {
  const spools = await getFilamentBySlug(organizationId, slug);
  if (spools.length === 0) throw bad("That filament doesn't exist.", 404);
  const type = input.type.trim().slice(0, 60);
  if (!type) throw bad("Choose the filament type.");
  const colourName = input.colourName.trim().slice(0, 60);
  if (!colourName) throw bad("Give the colour a name.");
  const colourHex = cleanHex(input.colourHex);
  if (!colourHex) throw bad("Choose a colour.");
  if (
    !Number.isFinite(input.weightGrams) ||
    input.weightGrams <= 0 ||
    input.weightGrams > 10000
  ) {
    throw bad("The spool size should be in grams, between 1 and 10,000.");
  }
  await db.spool.updateMany({
    where: { organizationId, id: { in: spools.map((s) => s.id) } },
    data: {
      type,
      material: materialOf(type),
      colourName,
      colourHex,
      filamentCode:
        input.filamentCode
          ?.trim()
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 12) || null,
      weightGrams: Math.round(input.weightGrams),
      spoolWeightGrams:
        input.spoolWeightGrams && input.spoolWeightGrams > 0
          ? Math.round(input.spoolWeightGrams)
          : catalogueEntry(type)?.spoolWeight ?? null,
    },
  });
  await carryFilamentNumber(organizationId, spools[0], { type, colourName });
  return filamentSlug(type, colourName);
}

export type SpoolDetailsInput = {
  remainingPercent: number;
  packaging?: Packaging;
  pricePaid: number | null;
  purchasedOn: Date | null;
  /** When it was opened; none for a New (sealed) spool */
  openedOn?: Date | null;
  amsSlot: number | null;
  notes: string | null;
};

/** Edits one spool's own details: what's left, price, date, AMS slot, notes. */
export async function updateSpoolDetails(
  organizationId: string,
  id: string,
  input: SpoolDetailsInput
) {
  const existing = await db.spool.findFirst({ where: { id, organizationId } });
  if (!existing) throw bad("That filament doesn't exist.", 404);
  if (
    input.pricePaid !== null &&
    (!Number.isFinite(input.pricePaid) || input.pricePaid < 0)
  ) {
    throw bad("The price paid should be a positive amount.");
  }
  if (input.amsSlot !== null && ![1, 2, 3, 4].includes(input.amsSlot))
    throw bad("The AMS has slots 1 to 4.");
  const remainingPercent = clampPercent(input.remainingPercent);
  const openedOn = openedFor({
    openedOn: checkOpened(
      input.purchasedOn,
      input.openedOn === undefined ? existing.openedOn : input.openedOn
    ),
    amsSlot: existing.status === "retired" ? null : input.amsSlot,
    remainingPercent,
  });
  const status =
    existing.status === "retired"
      ? "retired"
      : remainingPercent === 0
      ? "empty"
      : "active";
  return db.$transaction(async (tx) => {
    await freeSlot(tx, organizationId, input.amsSlot, id);
    return tx.spool.update({
      where: { id, organizationId },
      data: {
        remainingPercent,
        pricePaid:
          input.pricePaid === null
            ? null
            : Math.round(input.pricePaid * 100) / 100,
        purchasedOn: input.purchasedOn,
        openedOn,
        ...(input.packaging
          ? { packaging: cleanPackaging(input.packaging) }
          : {}),
        amsSlot: existing.status === "retired" ? null : input.amsSlot,
        notes: input.notes?.trim().slice(0, 500) || null,
        status,
      },
    });
  });
}

/** Opens a New spool: today, or the day you say (not before it was bought). */
export async function openSpool(
  organizationId: string,
  id: string,
  on?: Date | null
) {
  const spool = await db.spool.findFirst({ where: { id, organizationId } });
  if (!spool) throw bad("That filament doesn't exist.", 404);
  if (spool.status === "retired") throw bad("That filament is retired.");
  const openedOn = checkOpened(spool.purchasedOn, on ?? today());
  await db.spool.update({ where: { id, organizationId }, data: { openedOn } });
  return openedOn;
}

/**
 * Changes a spool's status by hand, including going back: New, Opened or
 * Retired (In use comes from choosing an AMS slot). Returns what happened, in
 * words, for the pop-up.
 */
export async function changeSpoolState(
  organizationId: string,
  id: string,
  target: "new" | "opened" | "retired"
): Promise<string> {
  const spool = await db.spool.findFirst({ where: { id, organizationId } });
  if (!spool) throw bad("That filament doesn't exist.", 404);
  if (target === "retired") {
    await retireSpool(organizationId, id);
    return "Retired: it's in the finished filament.";
  }
  if (target === "new") {
    // a sealed spool is full, unopened and out of the printer
    await db.spool.update({
      where: { id, organizationId },
      data: {
        openedOn: null,
        amsSlot: null,
        remainingPercent: 100,
        status: "active",
        retiredAt: null,
      },
    });
    return spool.remainingPercent < 100 || spool.amsSlot
      ? "Marked New: unopened, out of the AMS, back to 100%."
      : "Marked New: unopened.";
  }
  // opened: open a New spool, unload one from the AMS, or bring one back
  const back = spool.status !== "active";
  await db.spool.update({
    where: { id, organizationId },
    data: {
      openedOn: spool.openedOn ?? today(),
      amsSlot: null,
      status: "active",
      retiredAt: null,
      remainingPercent:
        back && spool.remainingPercent === 0 ? 5 : spool.remainingPercent,
    },
  });
  if (back)
    return `Back in use, on the shelf with ${
      spool.remainingPercent || 5
    }% left.`;
  if (spool.amsSlot)
    return `Taken out of AMS ${spool.amsSlot}: opened, on the shelf.`;
  return spool.openedOn ? "Opened, on the shelf." : "Opened today.";
}

/**
 * Every box code Shelf knows, for finding a filament by its code: from your
 * spools, and from the Bambu store (found with the pictures).
 */
export async function knownCodes(organizationId: string): Promise<KnownCode[]> {
  const [spools, images] = await Promise.all([
    db.spool.findMany({
      where: { organizationId },
      select: { type: true, colourName: true, filamentCode: true },
    }),
    db.filamentImage.findMany({
      where: { organizationId, filamentCode: { not: null } },
      select: { key: true, filamentCode: true },
    }),
  ]);
  const byKey = new Map<string, KnownCode>();
  const names = new Map(
    spools.map((s) => [filamentKey(s.type, s.colourName), s])
  );
  for (const s of spools) {
    if (s.filamentCode)
      byKey.set(filamentKey(s.type, s.colourName), {
        code: s.filamentCode,
        type: s.type,
        colourName: s.colourName,
      });
  }
  for (const i of images) {
    const spool = names.get(i.key);
    if (spool && i.filamentCode && !byKey.has(i.key)) {
      byKey.set(i.key, {
        code: i.filamentCode,
        type: spool.type,
        colourName: spool.colourName,
      });
    }
  }
  // then every code the store lists, for filament you've never had
  for (const c of await storeCodes(organizationId)) {
    const key = filamentKey(c.type, c.colourName);
    if (!byKey.has(key) && ![...byKey.values()].some((k) => k.code === c.code))
      byKey.set(key, c);
  }
  return [...byKey.values()];
}

/**
 * The AMS as the printer reports it, brought into Filament: a tag Shelf
 * knows updates that filament's slot and what's left (and opens it);
 * a new tag goes to the inbox with its slot, line and colour; filament whose
 * tag is no longer in any slot is taken out of the AMS.
 */
export async function syncAmsTrays(organizationId: string, trays: Tray[]) {
  const present = new Set<string>();
  let proposed = 0;
  /** What changed, in words, for the pop-up on an open Filament page */
  const events: string[] = [];
  /** Each known spool's level and slot now, for open pages to show live */
  const levels: { id: string; remainingPercent: number; amsSlot: number }[] =
    [];
  /** Something an open page can't just update in place (a status changed) */
  let reshaped = false;
  const name = (t: Tray) => `${t.colourName ?? t.colourHex} ${t.type}`;
  for (const t of trays) {
    present.add(t.tagUid);
    present.add(t.rawTag);
    const known = await db.spool.findFirst({
      where: { organizationId, tagUid: { in: [t.tagUid, t.rawTag] } },
      select: { id: true, openedOn: true, status: true, amsSlot: true },
    });
    if (known) {
      if (known.status === "retired") continue; // retired by you: the AMS doesn't un-retire it
      await db.$transaction(async (tx) => {
        await freeSlot(tx, organizationId, t.slot, known.id);
        await tx.spool.update({
          where: { id: known.id, organizationId },
          data: {
            tagUid: t.tagUid, // recorded by a tag ID before: now by its spool ID
            amsSlot: t.slot,
            remainingPercent: t.remainingPercent,
            openedOn: known.openedOn ?? today(),
            status: t.remainingPercent === 0 ? "empty" : "active",
          },
        });
      });
      if (known.amsSlot !== t.slot)
        events.push(`${name(t)} is in AMS slot ${t.slot}.`);
      // its status changed, or it's just been opened: more than a level moves
      if (
        known.status !== (t.remainingPercent === 0 ? "empty" : "active") ||
        known.openedOn === null
      )
        reshaped = true;
      levels.push({
        id: known.id,
        remainingPercent: t.remainingPercent,
        amsSlot: t.slot,
      });
      continue;
    }
    // Not a tag Shelf knows: is it filament you added by hand (no tag yet)?
    const linked = await linkUntaggedToTray(
      organizationId,
      t,
      trays.flatMap((x) => [x.tagUid, x.rawTag])
    );
    if (linked) {
      events.push(
        `${name(t)} in AMS slot ${t.slot}: matched to the one you added${
          linked.wasNew ? " (now opened)" : ""
        }; its use is followed from now on.`
      );
      continue;
    }
    // Truly new: the inbox, told once (not again on every reading)
    const waiting = await db.spoolCandidate.findFirst({
      where: {
        organizationId,
        tagUid: { in: [t.tagUid, t.rawTag] },
        status: "pending",
      },
      select: { id: true },
    });
    const result = await proposeSpool(organizationId, {
      source: "ams",
      type: t.type,
      colourName: t.colourName ?? `${t.colourHex} (unnamed)`,
      colourHex: t.colourHex,
      weightGrams: t.weightGrams,
      remainingPercent: t.remainingPercent,
      tagUid: t.tagUid,
      amsSlot: t.slot,
    });
    if (result.kind === "pending" && !waiting) {
      proposed += 1;
      events.push(
        `New filament in AMS slot ${t.slot}: ${name(t)}, waiting for you.`
      );
    }
  }
  // tagged filament Shelf thought was in the AMS, whose tag isn't in a slot now, is out
  // (one you put in a slot by hand, with no tag on record, is left where you put it)
  const leaving = await db.spool.findMany({
    where: {
      organizationId,
      amsSlot: { not: null },
      tagUid: { not: null, notIn: [...present] },
    },
    select: { colourName: true, type: true, amsSlot: true },
  });
  for (const l of leaving)
    events.push(`${l.colourName} ${l.type} came out of AMS slot ${l.amsSlot}.`);
  const out = await db.spool.updateMany({
    where: {
      organizationId,
      amsSlot: { not: null },
      tagUid: { not: null, notIn: [...present] },
    },
    data: { amsSlot: null },
  });
  return {
    inSlots: trays.length,
    proposed,
    unloaded: out.count,
    events,
    levels,
    /** Whether an open page needs its data again, or can update in place */
    refresh: reshaped || events.length > 0,
  };
}

/** The cells of a filament's row you can change one at a time. */
export const SPOOL_FIELDS = [
  "status",
  "packaging",
  "left",
  "leftKg",
  "pricePaid",
  "purchasedOn",
  "openedOn",
  "filamentCode",
  "weightGrams",
  "spoolWeightGrams",
] as const;
export type SpoolField = (typeof SPOOL_FIELDS)[number];

const dateOrNull = (raw: string, what: string) => {
  if (!raw.trim()) return null;
  const d = new Date(`${raw.trim().slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw bad(`That isn't a date for ${what}.`);
  return d;
};
const numberIn = (raw: string, what: string, min: number, max: number) => {
  const n = Number(raw);
  if (!raw.trim() || !Number.isFinite(n) || n < min || n > max) {
    throw bad(
      `${what} should be a number from ${min} to ${max.toLocaleString(
        "en-GB"
      )}.`
    );
  }
  return n;
};

/**
 * Changes one cell of a filament's row, keeping the rules: an opened date
 * isn't before the bought date; loading into a slot, or using some, opens it;
 * at 0% it's waiting for you to confirm it's run out. Returns what changed,
 * in words, for the pop-up.
 */
export async function updateSpoolField(
  organizationId: string,
  id: string,
  field: SpoolField,
  raw: string
): Promise<string> {
  const spool = await db.spool.findFirst({ where: { id, organizationId } });
  if (!spool) throw bad("That filament doesn't exist.", 404);
  const save = (data: Parameters<typeof db.spool.update>[0]["data"]) =>
    db.spool.update({ where: { id, organizationId }, data });

  switch (field) {
    case "status": {
      const slot = /^ams([1-4])$/.exec(raw)?.[1];
      if (slot) {
        const n = Number(slot);
        await db.$transaction(async (tx) => {
          await freeSlot(tx, organizationId, n, id);
          await tx.spool.update({
            where: { id, organizationId },
            data: {
              amsSlot: n,
              openedOn: spool.openedOn ?? today(),
              status: "active",
              retiredAt: null,
              remainingPercent:
                spool.remainingPercent === 0 ? 5 : spool.remainingPercent,
            },
          });
        });
        return `In AMS slot ${n}.`;
      }
      if (raw !== "new" && raw !== "opened" && raw !== "retired")
        throw bad("Choose New, Opened, an AMS slot or Retired.");
      return changeSpoolState(organizationId, id, raw);
    }
    case "packaging":
      await save({ packaging: cleanPackaging(raw) });
      return cleanPackaging(raw) === "refill"
        ? "Now a refill."
        : "Now a spool.";
    case "left":
    case "leftKg": {
      const percent =
        field === "left"
          ? clampPercent(numberIn(raw, "Left (%)", 0, 100))
          : clampPercent(
              (numberIn(raw, "Left (kg)", 0, 10) * 1000 * 100) /
                spool.weightGrams
            );
      await save({
        remainingPercent: percent,
        openedOn: openedFor({
          openedOn: spool.openedOn,
          amsSlot: spool.amsSlot,
          remainingPercent: percent,
        }),
        ...(spool.status === "retired"
          ? {}
          : { status: percent === 0 ? "empty" : "active" }),
      });
      return `${percent}% left (${(
        (spool.weightGrams * percent) /
        100 /
        1000
      ).toFixed(2)} kg).`;
    }
    case "pricePaid": {
      const price = raw.trim()
        ? Math.round(numberIn(raw, "The price", 0, 10000) * 100) / 100
        : null;
      await save({ pricePaid: price });
      return price === null ? "Price cleared." : `Paid £${price.toFixed(2)}.`;
    }
    case "purchasedOn": {
      const d = dateOrNull(raw, "Bought on");
      checkOpened(d, spool.openedOn);
      await save({ purchasedOn: d });
      return d ? "Bought date saved." : "Bought date cleared.";
    }
    case "openedOn": {
      const d = checkOpened(spool.purchasedOn, dateOrNull(raw, "Opened on"));
      const openedOn = openedFor({
        openedOn: d,
        amsSlot: spool.amsSlot,
        remainingPercent: spool.remainingPercent,
      });
      await save({ openedOn });
      return openedOn ? "Opened date saved." : "Opened date cleared: it's New.";
    }
    case "filamentCode": {
      const code =
        raw
          .trim()
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 20) || null;
      await save({ filamentCode: code });
      return code ? `Code ${code}.` : "Code cleared.";
    }
    case "weightGrams":
      await save({
        weightGrams: Math.round(numberIn(raw, "The size (g)", 1, 10000)),
      });
      return "Size saved.";
    case "spoolWeightGrams": {
      const g = raw.trim()
        ? Math.round(numberIn(raw, "The empty spool (g)", 0, 2000))
        : null;
      await save({ spoolWeightGrams: g });
      return g === null
        ? "Empty spool weight cleared."
        : "Empty spool weight saved.";
    }
  }
}

/**
 * The line and colour of a filament: all its items move together (the page
 * follows them). Returns the new address.
 */
export async function renameFilament(
  organizationId: string,
  slug: string,
  input: { type: string; colourName: string; colourHex: string }
) {
  const spools = await getFilamentBySlug(organizationId, slug);
  if (spools.length === 0) throw bad("That filament doesn't exist.", 404);
  const type = input.type.trim().slice(0, 60);
  if (!type) throw bad("Choose the line.");
  const colourName = input.colourName.trim().slice(0, 60);
  if (!colourName) throw bad("Give the colour a name.");
  const colourHex = cleanHex(input.colourHex);
  if (!colourHex) throw bad("Choose a colour.");
  await db.spool.updateMany({
    where: { organizationId, id: { in: spools.map((s) => s.id) } },
    data: { type, material: materialOf(type), colourName, colourHex },
  });
  await carryFilamentNumber(organizationId, spools[0], { type, colourName });
  return filamentSlug(type, colourName);
}

/**
 * A tag the AMS reports that Shelf doesn't know, matched to filament you added
 * by hand: same line, same colour (by name, or by shade when Bambu's name for
 * it isn't known), with no tag yet and not retired. An opened one first (one
 * you put in that slot, else the closest to the AMS's % left); else the
 * oldest-bought new one, which is now opened. The tag is recorded on it, so it
 * is known from then on; it takes the slot and the AMS's % left, and any inbox
 * entry for the tag goes. Null when nothing matches: it's filament you've
 * never had.
 */
export async function linkUntaggedToTray(
  organizationId: string,
  t: Tray,
  /** Every spool and tag ID in this report, so filament seen in another slot isn't taken */
  reported: string[] = [t.tagUid, t.rawTag]
) {
  const found = await db.spool.findMany({
    where: {
      organizationId,
      status: { not: "retired" },
      type: { equals: t.type, mode: "insensitive" },
      AND: [
        { OR: [{ tagUid: null }, { tagUid: { notIn: reported } }] },
        {
          OR: [
            ...(t.colourName
              ? [
                  {
                    colourName: {
                      equals: t.colourName,
                      mode: "insensitive" as const,
                    },
                  },
                ]
              : []),
            {
              colourHex: { equals: t.colourHex, mode: "insensitive" as const },
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      tagUid: true,
      openedOn: true,
      amsSlot: true,
      remainingPercent: true,
      purchasedOn: true,
      createdAt: true,
    },
  });
  // No tag yet; or recorded by one tag's ID (16 characters) that isn't in the
  // AMS now: the same spool, read from its other side. One recorded by its
  // spool ID (32) is another spool, and isn't taken.
  const matches = found.filter((m) => !m.tagUid || m.tagUid.length === 16);
  if (matches.length === 0) return null;
  const opened = matches.filter((m) => m.openedOn);
  const time = (d: Date | null) => (d ? d.getTime() : Infinity);
  const pick =
    opened.length > 0
      ? opened.find((m) => m.amsSlot === t.slot) ??
        [...opened].sort(
          (a, b) =>
            Math.abs(a.remainingPercent - t.remainingPercent) -
            Math.abs(b.remainingPercent - t.remainingPercent)
        )[0]
      : [...matches].sort(
          (a, b) =>
            time(a.purchasedOn) - time(b.purchasedOn) ||
            a.createdAt.getTime() - b.createdAt.getTime()
        )[0];
  await db.$transaction(async (tx) => {
    await freeSlot(tx, organizationId, t.slot, pick.id);
    await tx.spool.update({
      where: { id: pick.id, organizationId },
      data: {
        tagUid: t.tagUid,
        amsSlot: t.slot,
        remainingPercent: t.remainingPercent,
        openedOn: pick.openedOn ?? today(),
        status: t.remainingPercent === 0 ? "empty" : "active",
      },
    });
    await tx.spoolCandidate.updateMany({
      where: {
        organizationId,
        tagUid: { in: [t.tagUid, t.rawTag] },
        status: "pending",
      },
      data: { status: "dismissed" },
    });
  });
  return { spoolId: pick.id, wasNew: !pick.openedOn };
}

/** Fills in the box code on a filament's stock where it's missing. Returns how many. */
export async function fillFilamentCode(
  organizationId: string,
  slug: string,
  code: string | null
) {
  if (!code) return 0;
  const spools = await getFilamentBySlug(organizationId, slug);
  const result = await db.spool.updateMany({
    where: {
      organizationId,
      id: { in: spools.map((s) => s.id) },
      filamentCode: null,
    },
    data: { filamentCode: code },
  });
  return result.count;
}

/** Fields of a filament itself, set on every spool and refill of it at once. */
export const FILAMENT_FIELDS = ["filamentCode", "spoolWeightGrams"] as const;
export type FilamentField = (typeof FILAMENT_FIELDS)[number];

/**
 * Sets the code on the box or the empty spool's weight for every spool and
 * refill of a filament, from its page. Returns what was saved, for the pop-up.
 */
export async function updateFilamentField(
  organizationId: string,
  slug: string,
  field: FilamentField,
  raw: string
): Promise<string> {
  const spools = await getFilamentBySlug(organizationId, slug);
  if (spools.length === 0) throw bad("That filament doesn't exist.", 404);
  const where = { organizationId, id: { in: spools.map((s) => s.id) } };
  if (field === "filamentCode") {
    const code =
      raw
        .trim()
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 20) || null;
    await db.spool.updateMany({ where, data: { filamentCode: code } });
    return code ? `Code ${code}.` : "Code cleared.";
  }
  const g = raw.trim()
    ? Math.round(numberIn(raw, "The empty spool (g)", 0, 2000))
    : null;
  await db.spool.updateMany({ where, data: { spoolWeightGrams: g } });
  return g === null
    ? "Empty spool weight cleared: Bambu's figure is used."
    : `Empty spool ${g} g.`;
}

/**
 * Changes a filament's line or colour name for every spool and refill of it,
 * from the Advanced view (its other half and its colour stay as they are).
 * Returns its new address and what was saved.
 */
export async function renameFilamentField(
  organizationId: string,
  slug: string,
  field: "type" | "colourName",
  raw: string
): Promise<{ slug: string; message: string }> {
  const spools = await getFilamentBySlug(organizationId, slug);
  const first = spools[0];
  if (!first) throw bad("That filament doesn't exist.", 404);
  const next = await renameFilament(organizationId, slug, {
    type: field === "type" ? raw : first.type,
    colourName: field === "colourName" ? raw : first.colourName,
    colourHex: first.colourHex,
  });
  return {
    slug: next,
    message:
      field === "type" ? `Line: ${raw.trim()}.` : `Colour: ${raw.trim()}.`,
  };
}
