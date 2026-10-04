/**
 * Activity entries for the fork's features — sold, labels, attachments, email
 * receipts — written as Shelf notes so they show on the asset's Activity tab.
 * Not in upstream Shelf.
 *
 * Never throws: an activity entry that fails to write must not fail the
 * action it describes.
 */
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import { Logger } from "~/utils/logger";
import { wrapUserLinkForNote } from "~/utils/markdoc-wrappers";

/**
 * Adds "<who> <did what>" to each asset's activity. `userId` null means Shelf
 * did it by itself (printing by tag, an emailed receipt).
 */
export async function addAssetActivity({
  organizationId,
  assetIds,
  userId,
  action,
}: {
  organizationId: string;
  assetIds: string[];
  userId: string | null;
  /** e.g. "marked this asset as sold for £120." */
  action: string;
}) {
  try {
    const ids = [...new Set(assetIds)];
    if (ids.length === 0) return;
    const assets = await db.asset.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true },
    });
    const user = userId
      ? await db.user.findFirst({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
          },
        })
      : null;
    const who = user ? wrapUserLinkForNote(user) : "**Shelf**";
    await db.note.createMany({
      data: assets.map(({ id }) => ({
        assetId: id,
        userId: user?.id ?? null,
        type: "UPDATE",
        content: `${who} ${action}`,
      })),
    });
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Couldn't add an activity entry",
        additionalData: { organizationId, action },
        label: "Assets",
        shouldBeCaptured: false,
      })
    );
  }
}
