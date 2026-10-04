/**
 * Box numbers: BOX-0001, BOX-0002… for kits ("boxes"), which Shelf doesn't
 * number. Assigned on first use, in the order the boxes were created.
 * Part of the labels feature; not in upstream Shelf.
 */
import { db } from "~/database/db.server";

export const BOX_PREFIX = "BOX";

export function formatBoxId(number: number) {
  return `${BOX_PREFIX}-${String(number).padStart(4, "0")}`;
}

/** Every box's ID in the workspace, numbering any that don't have one yet. */
export async function getBoxIds(
  organizationId: string,
  /** Re-reads after numbering; a bound so a persistent fault can't loop forever */
  retries = 3
): Promise<Record<string, string>> {
  if (retries < 0) return {};
  const kits = await db.kit.findMany({
    where: { organizationId },
    select: {
      id: true,
      createdAt: true,
      boxNumber: { select: { number: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const missing = kits.filter((k) => !k.boxNumber);
  if (missing.length) {
    try {
      await db.$transaction(async (tx) => {
        const top = await tx.boxNumber.aggregate({
          where: { organizationId },
          _max: { number: true },
        });
        let next = (top._max.number ?? 0) + 1;
        for (const kit of missing) {
          await tx.boxNumber.create({
            data: { kitId: kit.id, organizationId, number: next++ },
          });
        }
      });
    } catch (cause) {
      // Two requests numbering at once: the database's unique rule lets
      // exactly one win, so the loser just reads what the winner assigned.
      if ((cause as { code?: string }).code !== "P2002") throw cause;
    }
    return getBoxIds(organizationId, retries - 1);
  }
  const ids: Record<string, string> = {};
  for (const kit of kits)
    if (kit.boxNumber) ids[kit.id] = formatBoxId(kit.boxNumber.number);
  return ids;
}

/** A box's ID, e.g. for the box page or a search by "BOX-0003". */
export async function getBoxId(organizationId: string, kitId: string) {
  return (await getBoxIds(organizationId))[kitId] ?? null;
}

/** Looks up a box by its ID text, e.g. "box-3" or "BOX-0003". */
export function parseBoxNumber(text: string): number | null {
  const m = text.trim().match(new RegExp(`^${BOX_PREFIX}-?0*(\\d{1,8})$`, "i"));
  return m ? Number(m[1]) : null;
}
