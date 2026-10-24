/**
 * Which assets have Matter devices (fork): their ids, for the Matter mark
 * beside their names in the assets list.
 */
import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { db } from "~/database/db.server";
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
    const rows = await db.matterDevice.findMany({
      where: { organizationId },
      distinct: ["assetId"],
      select: { assetId: true },
    });
    return payload({ assetIds: rows.map((r) => r.assetId) });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
