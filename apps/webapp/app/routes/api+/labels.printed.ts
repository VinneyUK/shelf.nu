/**
 * One asset's current printed label, for the card on the asset overview.
 * Part of the labels feature; not in upstream Shelf.
 */
import { data, type LoaderFunctionArgs } from "react-router";
import { getPrintedLabel } from "~/modules/labels/service.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { error, payload } from "~/utils/http.server";
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
    const assetId = new URL(request.url).searchParams.get("assetId");
    if (!assetId) {
      throw new ShelfError({
        cause: null,
        message: "Which asset?",
        status: 400,
        label: "Assets",
        shouldBeCaptured: false,
      });
    }
    return payload({
      label: await getPrintedLabel({ organizationId, assetId }),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
