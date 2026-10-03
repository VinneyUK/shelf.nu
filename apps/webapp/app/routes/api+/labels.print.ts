/**
 * Queue labels for assets: the asset page's "Print label", the assets list's
 * "Print labels" bulk action (including select-all), and the Labels page.
 * Part of the labels feature; not in upstream Shelf.
 */
import { data, type ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { resolveAssetIdsForBulkOperation } from "~/modules/asset/bulk-operations-helper.server";
import { CurrentSearchParamsSchema } from "~/modules/asset/utils.server";
import { getAssetIndexSettings } from "~/modules/asset-index-settings/service.server";
import { queueLabels } from "~/modules/labels/service.server";
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
    assetIds: z.array(z.string()).min(1, "Choose at least one asset."),
    source: z.enum(["asset", "bulk", "labels-page"]).default("asset"),
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
    const { assetIds, source, currentSearchParams } = parseData(
      formData,
      PrintSchema
    );

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

    const result = await queueLabels({
      organizationId,
      assetIds: ids,
      source,
      userId,
    });
    if (result.queued === 0 && result.alreadyQueued === 0) {
      throw new ShelfError({
        cause: null,
        title: "Nothing to print",
        message: "None of those assets have a QR code to print.",
        status: 400,
        label: "Assets",
        shouldBeCaptured: false,
      });
    }
    sendNotification({
      title: result.queued ? "Labels queued" : "Already queued",
      message: result.queued
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
