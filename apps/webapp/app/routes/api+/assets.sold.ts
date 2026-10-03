/**
 * Mark assets sold or not sold (asset menu and bulk action), and list sales
 * for the Sold status. Part of the sold feature; not in upstream Shelf.
 */
import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { resolveAssetIdsForBulkOperation } from "~/modules/asset/bulk-operations-helper.server";
import { CurrentSearchParamsSchema } from "~/modules/asset/utils.server";
import { getAssetIndexSettings } from "~/modules/asset-index-settings/service.server";
import {
  getSales,
  markAssetsNotSold,
  markAssetsSold,
} from "~/modules/sold/service.server";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { assertIsPost, error, parseData, payload } from "~/utils/http.server";
import { ALL_SELECTED_KEY } from "~/utils/list";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    return payload({ sales: await getSales(organizationId) });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

const SoldSchema = z
  .discriminatedUnion("intent", [
    z.object({
      intent: z.literal("mark"),
      assetIds: z.array(z.string()).min(1, "Choose at least one asset."),
      soldOn: z.coerce.date({ message: "Enter the date it was sold." }),
      price: z
        .string()
        .optional()
        .transform((v) => (v && v.trim() !== "" ? Number(v) : null))
        .pipe(z.number().min(0, "The price can't be negative.").nullable()),
    }),
    z.object({
      intent: z.literal("unmark"),
      assetIds: z.array(z.string()).min(1, "Choose at least one asset."),
    }),
  ])
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
    const input = parseData(formData, SoldSchema);

    let ids = input.assetIds;
    if (ids.includes(ALL_SELECTED_KEY)) {
      const settings = await getAssetIndexSettings({
        userId,
        organizationId,
        canUseBarcodes,
        role,
      });
      ids = await resolveAssetIdsForBulkOperation({
        assetIds: ids,
        organizationId,
        currentSearchParams: input.currentSearchParams,
        settings,
        // Reachable only with an asset write permission, which BASE and
        // SELF_SERVICE do not hold, so the custodian filter needs no narrowing.
        allowedTeamMemberIds: "all",
      });
    }

    const count =
      input.intent === "mark"
        ? await markAssetsSold({
            organizationId,
            assetIds: ids,
            soldOn: input.soldOn,
            price: input.price,
          })
        : await markAssetsNotSold({ organizationId, assetIds: ids });

    const plural = count === 1 ? "" : "s";
    sendNotification({
      title: input.intent === "mark" ? "Marked as sold" : "Marked as not sold",
      message: `${count} asset${plural} updated.`,
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });
    return payload({ success: true, count });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
