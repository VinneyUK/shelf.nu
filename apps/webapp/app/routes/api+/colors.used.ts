/**
 * Fork: every category and tag colour in the workspace, so the colour box can
 * suggest one that stands apart.
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
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.category,
      action: PermissionAction.read,
    });
    const [categories, tags] = await Promise.all([
      db.category.findMany({
        where: { organizationId },
        select: { color: true },
      }),
      db.tag.findMany({ where: { organizationId }, select: { color: true } }),
    ]);
    return payload({
      colors: [...categories, ...tags]
        .map((c) => c.color)
        .filter((c): c is string => Boolean(c)),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
