/**
 * What's changed in the AMS since an open Filament page last asked (fork):
 * { version, lastEventId, events }. The page refreshes when the version moves
 * and shows the events as a pop-up.
 */
import { data, type LoaderFunctionArgs } from "react-router";
import {
  amsUpdatesSince,
  ensureAmsWatcher,
} from "~/modules/filament/printer.server";
import { makeShelfError } from "~/utils/error";
import { error, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    void ensureAmsWatcher(organizationId);
    const since = new URL(request.url).searchParams.get("since");
    return payload(
      amsUpdatesSince(
        organizationId,
        since === null ? null : Number(since) || 0
      )
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
