/**
 * The IoT assets (fork): each with its protocol and type, for the mark
 * beside their names in the assets list and the type icon in place of a
 * missing picture. Asked for once per list.
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
    const assets = await db.asset.findMany({
      where: {
        organizationId,
        OR: [{ iotProtocol: { not: null } }, { iotType: { not: null } }],
      },
      select: { id: true, iotProtocol: true, iotType: true },
    });
    return payload({
      assets: assets.map((a) => ({
        id: a.id,
        protocol: a.iotProtocol,
        type: a.iotType,
      })),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
