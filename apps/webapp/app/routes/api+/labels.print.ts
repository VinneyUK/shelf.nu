/**
 * Queue labels for assets: the asset page's "Print label", the assets list's
 * "Print labels" bulk action (including select-all), and the Labels page.
 * Boxes and filament too.
 * Part of the labels feature; not in upstream Shelf.
 */
import { data, type ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/database/db.server";
import { resolveAssetIdsForBulkOperation } from "~/modules/asset/bulk-operations-helper.server";
import { CurrentSearchParamsSchema } from "~/modules/asset/utils.server";
import { getAssetIndexSettings } from "~/modules/asset-index-settings/service.server";
import {
  queueBoxLabels,
  queueFilamentLabels,
  queueLabels,
  removeLabels,
} from "~/modules/labels/service.server";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { assertIsPost, error, parseData, payload } from "~/utils/http.server";
import { ALL_SELECTED_KEY } from "~/utils/list";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

const PrintSchema = z
  .object({
    assetIds: z.array(z.string()).default([]),
    /** Boxes (kits) to print labels for */
    kitIds: z.array(z.string()).default([]),
    /** Every box in the workspace (the boxes list's "select all") */
    allBoxes: z.enum(["true"]).optional(),
    /** Filament to print labels for: their numbers' ids */
    filamentIds: z.array(z.string()).default([]),
    source: z
      .enum(["asset", "bulk", "labels-page", "filament"])
      .default("asset"),
    /** "remove" takes the Labelled status off instead of printing */
    intent: z.enum(["print", "remove"]).default("print"),
  })
  .and(CurrentSearchParamsSchema);

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    assertIsPost(request);
    const formData = await request.formData();
    const { organizationId, canUseBarcodes, role } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const {
      assetIds,
      kitIds: chosenKitIds,
      allBoxes,
      filamentIds,
      source,
      currentSearchParams,
      intent,
    } = parseData(formData, PrintSchema);

    // A cross-page "select all" resolves through the list's filters, as
    // Shelf's own bulk actions do
    let ids = assetIds;
    if (assetIds.includes(ALL_SELECTED_KEY)) {
      const settings = await getAssetIndexSettings({
        userId,
        organizationId,
        canUseBarcodes,
        role,
      });
      ids = await resolveAssetIdsForBulkOperation({
        assetIds,
        organizationId,
        currentSearchParams,
        settings,
        // Reachable only with an asset write permission, which BASE and
        // SELF_SERVICE do not hold, so the custodian filter needs no narrowing.
        allowedTeamMemberIds: "all",
      });
    }

    const kitIds = allBoxes
      ? (
          await db.kit.findMany({
            where: { organizationId },
            select: { id: true },
          })
        ).map((k) => k.id)
      : chosenKitIds;
    if (
      assetIds.length === 0 &&
      kitIds.length === 0 &&
      filamentIds.length === 0
    ) {
      throw new ShelfError({
        cause: null,
        message: "Choose at least one asset, box or filament.",
        status: 400,
        label: "Assets",
        shouldBeCaptured: false,
      });
    }

    if (intent === "remove") {
      const removed = await removeLabels({
        organizationId,
        assetIds: [...ids, ...kitIds, ...filamentIds],
        userId,
      });
      // what was asked for, in its own words
      const what =
        filamentIds.length && !ids.length && !kitIds.length
          ? "filament"
          : kitIds.length && !ids.length && !filamentIds.length
          ? "box"
          : "asset";
      const many =
        what === "filament"
          ? "filament"
          : `${what}${what === "box" ? "es" : "s"}`;
      sendNotification({
        title: "Label removed",
        message: removed
          ? `${
              removed === 1 ? `The ${what} is` : `${removed} ${many} are`
            } no longer marked as labelled.`
          : `That ${what} wasn't marked as labelled.`,
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });
      return payload({ success: true, removed });
    }

    const assets = await queueLabels({
      organizationId,
      assetIds: ids,
      source,
      userId,
    });
    const boxes = await queueBoxLabels({
      organizationId,
      kitIds,
      source,
      userId,
    });
    const filament = await queueFilamentLabels({
      organizationId,
      filamentIds,
      source,
      userId,
    });
    const result = {
      queued: assets.queued + boxes.queued + filament.queued,
      alreadyQueued:
        assets.alreadyQueued + boxes.alreadyQueued + filament.alreadyQueued,
      noQrCode: assets.noQrCode + boxes.noQrCode + filament.noQrCode,
    };
    if (result.queued === 0 && result.alreadyQueued === 0) {
      throw new ShelfError({
        cause: null,
        title: "Nothing to print",
        message: filament.noQrCode
          ? "That filament has nothing in stock to name its label by."
          : "None of those assets have a QR code to print.",
        status: 400,
        label: "Assets",
        shouldBeCaptured: false,
      });
    }
    const single =
      filamentIds.length === 1 && !ids.length && !kitIds.length
        ? filament
        : null;
    sendNotification({
      title: single
        ? single.queued
          ? "Label queued"
          : "Already queued"
        : result.queued
        ? "Labels queued"
        : "Already queued",
      message: single
        ? single.queued
          ? `${single.labels[0]} will print shortly.`
          : `${single.labels[0]} is already waiting to print.`
        : result.queued
        ? `${result.queued} label${
            result.queued === 1 ? "" : "s"
          } will print shortly.${
            result.alreadyQueued
              ? ` ${result.alreadyQueued} already in the queue.`
              : ""
          }`
        : "Those labels are already waiting to print.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });
    return payload({ success: true, ...result });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
