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
  getPartSales,
  getSales,
  markAssetsNotSold,
  markAssetsSold,
  sellPart,
  undoPartSale,
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
    // quantities (fork): one asset's part sales, for its page
    const assetId = new URL(request.url).searchParams.get("assetId");
    if (assetId)
      return payload({
        partSales: await getPartSales(organizationId, assetId),
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
      /** Quantities (fork): how many of one asset are sold; all when not given */
      quantity: z.coerce.number().int().min(1).optional(),
      /** Whether the price is for each one or for them all */
      priceFor: z.enum(["each", "total"]).default("each"),
    }),
    z.object({
      intent: z.literal("undo-part"),
      assetIds: z.array(z.string()).default([]),
      partSaleId: z.string().min(1),
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

    // quantities (fork): some of one asset sold, the rest kept
    if (input.intent === "undo-part") {
      const sale = await undoPartSale({
        organizationId,
        partSaleId: input.partSaleId,
        userId,
      });
      sendNotification({
        title: "Sale undone",
        message: `${sale.quantity} back in stock.`,
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });
      return payload({ success: true, count: 1 });
    }
    if (input.intent === "mark" && input.quantity && ids.length === 1) {
      const total =
        input.price === null
          ? null
          : input.priceFor === "each"
          ? Math.round(input.price * input.quantity * 100) / 100
          : input.price;
      const { kind, left } = await sellPart({
        organizationId,
        assetId: ids[0],
        quantity: input.quantity,
        soldOn: input.soldOn,
        price: total,
        userId,
      });
      sendNotification({
        title: kind === "part" ? `${input.quantity} sold` : "Marked as sold",
        message:
          kind === "part"
            ? `${left} left. The sale is in the Sold report.`
            : "All of it is sold.",
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });
      return payload({ success: true, count: 1 });
    }

    const count =
      input.intent === "mark"
        ? await markAssetsSold({
            organizationId,
            assetIds: ids,
            soldOn: input.soldOn,
            price: input.price,
            userId,
          })
        : await markAssetsNotSold({ organizationId, assetIds: ids, userId });

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
