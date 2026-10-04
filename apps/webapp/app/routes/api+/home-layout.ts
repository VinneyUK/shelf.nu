/**
 * Saves the user's Home page layout. Part of the home layout feature; not in
 * upstream Shelf.
 */
import { data, type ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { saveHomeLayout } from "~/modules/home-layout/service.server";
import { makeShelfError } from "~/utils/error";
import { assertIsPost, error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    assertIsPost(request);
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.dashboard,
      action: PermissionAction.read,
    });
    const { order, hidden } = parseData(
      await request.formData(),
      z.object({
        order: z.string().transform((v) => (v ? v.split(",") : [])),
        hidden: z.string().transform((v) => (v ? v.split(",") : [])),
      })
    );
    await saveHomeLayout({ userId, organizationId, order, hidden });
    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
