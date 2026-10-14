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
import { cleanHex, clampPercent, materialOf } from "./catalogue";

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
  amsSlot: number | null;
  notes: string | null;
};

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
    amsSlot: input.amsSlot,
    notes: input.notes?.trim().slice(0, 500) || null,
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

export async function createSpool(
  organizationId: string,
  input: SpoolInput,
  source = "manual"
) {
  const data = clean(input);
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
  if (!existing) throw bad("That spool doesn't exist.", 404);
  const data = clean(input);
  const status =
    existing.status === "retired"
      ? "retired"
      : data.remainingPercent === 0
      ? "empty"
      : "active";
  return db.$transaction(async (tx) => {
    await freeSlot(tx, organizationId, data.amsSlot, id);
    return tx.spool.update({
      where: { id, organizationId },
      data: { ...data, status },
    });
  });
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
  if (count === 0) throw bad("That spool can't be retired.", 404);
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
  if (count === 0) throw bad("That spool can't be brought back.", 404);
}

export async function deleteSpool(organizationId: string, id: string) {
  const { count } = await db.spool.deleteMany({
    where: { id, organizationId },
  });
  if (count === 0) throw bad("That spool doesn't exist.", 404);
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
  input: SpoolInput
) {
  const candidate = await db.spoolCandidate.findFirst({
    where: { id, organizationId, status: "pending" },
  });
  if (!candidate) throw bad("That one has already been dealt with.", 404);
  const data = clean(input);
  return db.$transaction(async (tx) => {
    await freeSlot(tx, organizationId, data.amsSlot);
    const spool = await tx.spool.create({
      data: {
        ...data,
        organizationId,
        source: candidate.source,
        tagUid: candidate.tagUid,
        status: data.remainingPercent === 0 ? "empty" : "active",
      },
    });
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
