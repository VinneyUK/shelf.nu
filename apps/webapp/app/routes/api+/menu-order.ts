/**
 * Saves the menu's order, as dragged in the sidebar (fork). "reset" puts it
 * back as Shelf ships it. Reports with the pop-up.
 */
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { saveMenuOrder } from "~/modules/customisation/service.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { done, failed } from "~/utils/fork-notify.server";
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
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.update,
    });
    const form = await request.formData();
    if (form.get("intent") === "reset") {
      await saveMenuOrder(organizationId, []);
      return done(userId, "Menu order reset", "It's back as Shelf ships it.");
    }
    let order: unknown;
    try {
      order = JSON.parse(String(form.get("order") ?? "[]"));
    } catch {
      order = null;
    }
    if (!Array.isArray(order)) {
      throw new ShelfError({
        cause: null,
        message: "That order couldn't be read.",
        status: 400,
        label: "Settings",
      });
    }
    await saveMenuOrder(organizationId, order as string[]);
    return done(userId, "Menu order saved", null);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    failed(userId, "Couldn't save the menu order", reason.message);
    return data(error(reason), { status: reason.status });
  }
}
