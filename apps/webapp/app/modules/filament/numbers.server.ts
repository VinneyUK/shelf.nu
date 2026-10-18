/**
 * Filament numbers (FIL-0001) and their QR codes, for filament labels.
 * Numbered on first use, in the order the filaments were added; never reused.
 * A number belongs to the line and colour, so it follows a rename.
 * Part of the filament labels feature (fork).
 */
import { db } from "~/database/db.server";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { filamentKey, filamentSlug } from "./catalogue";
import { formatFilamentId, toNumber } from "./numbers";

export type FilamentNumberInfo = {
  /** The FilamentNumber row's id: what labels and QR codes point at */
  id: string;
  /** FIL-0001 */
  label: string;
  number: number;
};

/**
 * Every filament's number in the workspace, by its key, numbering any that
 * don't have one yet. Filament whose spools have all been deleted keeps its
 * number, so a printed label never ends up meaning something else.
 */
export async function getFilamentNumbers(
  organizationId: string,
  /** Re-reads after numbering; a bound so a persistent fault can't loop forever */
  retries = 3
): Promise<Record<string, FilamentNumberInfo>> {
  const [spools, rows] = await Promise.all([
    db.spool.findMany({
      where: { organizationId },
      select: { type: true, colourName: true, createdAt: true },
    }),
    db.filamentNumber.findMany({
      where: { organizationId },
      select: { id: true, key: true, number: true },
    }),
  ]);
  const missing = toNumber(
    spools.map((s) => ({
      key: filamentKey(s.type, s.colourName),
      createdAt: s.createdAt,
    })),
    new Set(rows.map((r) => r.key))
  );
  if (missing.length && retries >= 0) {
    try {
      await db.$transaction(async (tx) => {
        const top = await tx.filamentNumber.aggregate({
          where: { organizationId },
          _max: { number: true },
        });
        let next = (top._max.number ?? 0) + 1;
        for (const key of missing) {
          await tx.filamentNumber.create({
            data: { organizationId, key, number: next++ },
          });
        }
      });
    } catch (cause) {
      // Two requests numbering at once: the database's unique rules let
      // exactly one win, so the loser just reads what the winner assigned.
      if ((cause as { code?: string }).code !== "P2002") throw cause;
    }
    return getFilamentNumbers(organizationId, retries - 1);
  }
  const out: Record<string, FilamentNumberInfo> = {};
  for (const r of rows)
    out[r.key] = {
      id: r.id,
      label: formatFilamentId(r.number),
      number: r.number,
    };
  return out;
}

/** One filament's number, by its line and colour. */
export async function getFilamentNumber(
  organizationId: string,
  type: string,
  colourName: string
) {
  return (
    (await getFilamentNumbers(organizationId))[filamentKey(type, colourName)] ??
    null
  );
}

/**
 * After a filament's line or colour changes: its number goes with it, unless
 * the new line and colour already have one (it joined another filament), or
 * some of its spools stayed behind (one spool was moved to another filament).
 */
export async function carryFilamentNumber(
  organizationId: string,
  from: { type: string; colourName: string },
  to: { type: string; colourName: string }
) {
  const fromKey = filamentKey(from.type, from.colourName);
  const toKey = filamentKey(to.type, to.colourName);
  if (fromKey === toKey) return;
  const [source, target, left] = await Promise.all([
    db.filamentNumber.findUnique({
      where: { organizationId_key: { organizationId, key: fromKey } },
      select: { id: true },
    }),
    db.filamentNumber.findUnique({
      where: { organizationId_key: { organizationId, key: toKey } },
      select: { id: true },
    }),
    db.spool.findMany({
      where: { organizationId },
      select: { type: true, colourName: true },
    }),
  ]);
  if (!source || target) return;
  if (left.some((s) => filamentKey(s.type, s.colourName) === fromKey)) return;
  try {
    await db.filamentNumber.updateMany({
      where: { id: source.id, organizationId },
      data: { key: toKey },
    });
  } catch (cause) {
    // the new key was numbered in the meantime: it keeps that number
    if ((cause as { code?: string }).code !== "P2002") throw cause;
  }
}

/** The filament's QR code, made the first time it's needed. */
export async function ensureFilamentQr(
  organizationId: string,
  filamentId: string
): Promise<string> {
  const existing = await db.qr.findFirst({
    where: { organizationId, filamentId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.qr.create({
    data: { organizationId, filamentId },
    select: { id: true },
  });
  return created.id;
}

/**
 * Where a scanned filament label goes: that filament's page, with a pop-up
 * saying what was scanned. No slug when none of it is left in stock (the
 * filament list instead, and the pop-up says so).
 */
export async function filamentScanTarget({
  organizationId,
  filamentId,
  userId,
}: {
  organizationId: string;
  filamentId: string;
  userId: string;
}): Promise<{ slug: string | null }> {
  const number = await db.filamentNumber.findFirst({
    where: { id: filamentId, organizationId },
    select: { key: true, number: true },
  });
  if (!number) return { slug: null };
  const label = formatFilamentId(number.number);
  const spools = await db.spool.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { type: true, colourName: true },
  });
  const spool = spools.find(
    (s) => filamentKey(s.type, s.colourName) === number.key
  );
  sendNotification({
    title: `Scanned ${label}`,
    message: spool
      ? `${spool.colourName}, ${spool.type}.`
      : "None of this filament is in stock any more.",
    icon: spool
      ? { name: "success", variant: "success" }
      : { name: "x", variant: "error" },
    senderId: userId,
  });
  return { slug: spool ? filamentSlug(spool.type, spool.colourName) : null };
}
