/**
 * How many attachments each asset has, for the paperclip in the assets list.
 * Part of the attachments feature; not in upstream Shelf.
 */
import { data, type LoaderFunctionArgs } from "react-router";
import { db } from "~/database/db.server";
import { makeShelfError } from "~/utils/error";
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
    const rows = await db.assetAttachment.groupBy({
      by: ["assetId"],
      where: { organizationId, assetId: { not: null } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.assetId) counts[row.assetId] = row._count._all;
    }
    return payload({ counts });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
