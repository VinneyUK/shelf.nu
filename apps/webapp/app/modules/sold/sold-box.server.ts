/**
 * The Sold box (fork): marking an asset as sold moves it into a box called
 * "Sold" (made the first time), and marking it as not sold puts it back in the
 * box it came from.
 *
 * It goes through Shelf's own box functions, so each move is logged on the
 * asset (and in the activity summary as "Box changed") like any other.
 *
 * Nothing here may stop a sale. Every failure is caught and logged; and if an
 * asset has left its box but can't join the Sold box, it is put back.
 *
 * Only individually tracked assets move: Shelf lets a quantity-tracked asset sit
 * in several boxes at once, in slices, so "its" box isn't a single place.
 *
 * Part of the sold feature; not in upstream Shelf.
 */
import { db } from "~/database/db.server";
import { createKit, updateKitAssets } from "~/modules/kit/service.server";
import { ShelfError } from "~/utils/error";
import { Logger } from "~/utils/logger";

export const SOLD_BOX_NAME = "Sold";

/** Shelf's box functions want a request; these moves aren't made by one. */
const internalRequest = () => new Request("http://localhost/internal/sold-box");

/** On, and boxes switched on (Settings → Customise). Both default to on. */
async function soldBoxWanted(organizationId: string) {
  const setting = await db.workspaceCustomisation.findUnique({
    where: { organizationId },
    select: { soldBoxEnabled: true, kitsEnabled: true },
  });
  return (setting?.soldBoxEnabled ?? true) && (setting?.kitsEnabled ?? true);
}

/** The workspace's Sold box, if it has one (found by name, so renaming or deleting it just works). */
async function findSoldBox(organizationId: string) {
  return db.kit.findFirst({
    where: {
      organizationId,
      name: { equals: SOLD_BOX_NAME, mode: "insensitive" },
    },
    select: { id: true },
  });
}

async function findOrCreateSoldBox(organizationId: string, userId: string) {
  const existing = await findSoldBox(organizationId);
  if (existing) return existing.id;
  const kit = await createKit({
    name: SOLD_BOX_NAME,
    description: "Items that have been sold.",
    createdById: userId,
    organizationId,
    categoryId: null,
    locationId: null,
  });
  return kit.id;
}

/** What is in a box right now. */
async function assetsIn(kitId: string) {
  const rows = await db.assetKit.findMany({
    where: { kitId },
    select: { assetId: true },
  });
  return rows.map((r) => r.assetId);
}

const logFailure = (cause: unknown, message: string, organizationId: string) =>
  Logger.error(
    new ShelfError({
      cause,
      message,
      additionalData: { organizationId },
      label: "Assets",
      shouldBeCaptured: false,
    })
  );

/**
 * Puts these (just sold) assets in the Sold box, remembering which box each
 * came from. Returns how many were moved. Never throws.
 */
export async function moveToSoldBox({
  organizationId,
  userId,
  assetIds,
}: {
  organizationId: string;
  userId: string | null;
  assetIds: string[];
}): Promise<number> {
  // Shelf's box functions need a person to log the move against
  if (!userId || assetIds.length === 0) return 0;
  /** box id → the assets that left it, so a failed move can be undone */
  const left = new Map<string, string[]>();
  const request = internalRequest();
  try {
    if (!(await soldBoxWanted(organizationId))) return 0;
    const assets = await db.asset.findMany({
      where: {
        id: { in: [...new Set(assetIds)] },
        organizationId,
        type: "INDIVIDUAL",
      },
      select: { id: true, assetKits: { select: { kitId: true } } },
    });
    if (assets.length === 0) return 0;

    const soldKitId = await findOrCreateSoldBox(organizationId, userId);
    /** asset → the box it was in (null: none), for those that have to move */
    const previous = new Map<string, string | null>();
    for (const asset of assets) {
      const kitId = asset.assetKits[0]?.kitId ?? null;
      if (kitId === soldKitId) continue; // already there
      previous.set(asset.id, kitId);
      if (kitId) left.set(kitId, [...(left.get(kitId) ?? []), asset.id]);
    }
    if (previous.size === 0) return 0;

    // An individual asset can be in only one box: leave the old one first
    for (const [kitId, leaving] of left) {
      const remaining = (await assetsIn(kitId)).filter(
        (id) => !leaving.includes(id)
      );
      await updateKitAssets({
        kitId,
        organizationId,
        userId,
        request,
        assetIds: remaining,
      });
    }
    await updateKitAssets({
      kitId: soldKitId,
      organizationId,
      userId,
      request,
      assetIds: [...previous.keys()],
      addOnly: true,
    });
    await db.$transaction(
      [...previous].map(([assetId, previousKitId]) =>
        db.assetSale.updateMany({
          where: { assetId, organizationId },
          data: { previousKitId },
        })
      )
    );
    return previous.size;
  } catch (cause) {
    logFailure(
      cause,
      "Couldn't put sold items in the Sold box",
      organizationId
    );
    // Anything that already left its box goes back, so nothing ends up in no box
    for (const [kitId, leaving] of left) {
      try {
        await updateKitAssets({
          kitId,
          organizationId,
          userId,
          request,
          assetIds: leaving,
          addOnly: true,
        });
      } catch {
        /* nothing more to do: the failure is logged above */
      }
    }
    return 0;
  }
}

/**
 * Takes assets out of the Sold box (they are no longer sold) and puts each back
 * in the box it came from, if that box still exists. An asset someone has since
 * moved to another box is left where it is. Never throws.
 */
export async function moveBackFromSoldBox({
  organizationId,
  userId,
  previousBoxes,
}: {
  organizationId: string;
  userId: string | null;
  /** asset → the box it was in before it was sold, from the sale record */
  previousBoxes: Map<string, string | null>;
}): Promise<number> {
  if (!userId || previousBoxes.size === 0) return 0;
  const request = internalRequest();
  try {
    const soldBox = await findSoldBox(organizationId);
    if (!soldBox) return 0;
    const inSoldBox = new Set(await assetsIn(soldBox.id));
    const returning = [...previousBoxes.keys()].filter((id) =>
      inSoldBox.has(id)
    );
    if (returning.length === 0) return 0;

    const remaining = [...inSoldBox].filter((id) => !returning.includes(id));
    await updateKitAssets({
      kitId: soldBox.id,
      organizationId,
      userId,
      request,
      assetIds: remaining,
    });

    // Back to where each came from, one call per box
    const back = new Map<string, string[]>();
    for (const assetId of returning) {
      const kitId = previousBoxes.get(assetId);
      if (kitId) back.set(kitId, [...(back.get(kitId) ?? []), assetId]);
    }
    for (const [kitId, ids] of back) {
      const stillThere = await db.kit.findFirst({
        where: { id: kitId, organizationId },
        select: { id: true },
      });
      if (!stillThere) continue; // that box was deleted: the asset just leaves the Sold box
      await updateKitAssets({
        kitId,
        organizationId,
        userId,
        request,
        assetIds: ids,
        addOnly: true,
      });
    }
    return returning.length;
  } catch (cause) {
    logFailure(
      cause,
      "Couldn't take unsold items out of the Sold box",
      organizationId
    );
    return 0;
  }
}
