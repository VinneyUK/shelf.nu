/**
 * Matter labels for IoT assets (fork): all their devices, only those not yet
 * printed, or chosen devices; for one asset or several (bulk). Assets without
 * Matter devices are simply skipped.
 */
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { done } from "~/modules/filament/notify.server";
import { queueMatterLabels } from "~/modules/labels/service.server";
import { makeShelfError } from "~/utils/error";
import { error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const form = await request.formData();
    const assetIds = form.getAll("assetIds").map(String).filter(Boolean);
    const deviceIds = form.getAll("deviceIds").map(String).filter(Boolean);
    const which = String(form.get("which") ?? "all");
    const count = await queueMatterLabels({
      organizationId,
      userId,
      assetIds,
      which: deviceIds.length
        ? "chosen"
        : which === "missing"
        ? "missing"
        : "all",
      deviceIds,
    });
    return done(
      userId,
      count === 1 ? "Matter label queued" : `${count} Matter labels queued`,
      "They will print shortly."
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
