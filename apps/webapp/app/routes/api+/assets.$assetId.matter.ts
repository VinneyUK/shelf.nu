/**
 * An IoT asset's Matter devices (fork): the list, without codes, and the
 * layout chosen in Settings → Customise (GET); adding a device, revealing,
 * changing or removing one, and printing their labels (POST). A code is only
 * sent back on "reveal", to people who can change the asset.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { db } from "~/database/db.server";
import { done } from "~/modules/filament/notify.server";
import { queueMatterLabels } from "~/modules/labels/service.server";
import {
  addDevice,
  listDevices,
  removeDevice,
  revealDevice,
  updateDevice,
} from "~/modules/matter/service.server";
import { makeShelfError } from "~/utils/error";
import { error, getParams, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  const { assetId } = getParams(params, z.object({ assetId: z.string() }));
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    const [devices, settings] = await Promise.all([
      listDevices(organizationId, assetId),
      db.workspaceCustomisation.findUnique({
        where: { organizationId },
        select: { matterLayout: true },
      }),
    ]);
    // the layout chosen in Settings → Customise
    const layout = settings?.matterLayout === "cards" ? "cards" : "table";
    return payload({ devices, layout });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

const TRANSPORTS = ["Thread", "Wi-Fi", "Ethernet"];

export async function action({ context, request, params }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  const { assetId } = getParams(params, z.object({ assetId: z.string() }));
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    const text = (k: string) => {
      const v = String(form.get(k) ?? "").trim();
      return v || null;
    };
    switch (form.get("intent")) {
      case "add": {
        const { names, quantity } = await addDevice(
          organizationId,
          assetId,
          String(form.get("code") ?? ""),
          text("place")
        );
        return done(
          userId,
          "Matter device added",
          `${
            names.productName ? `${names.productName}: ` : ""
          }kept encrypted. Quantity is now ${quantity}.`
        );
      }
      case "reveal":
        return payload({ id, code: await revealDevice(organizationId, id) });
      // one field, changed in its cell (click to change, as on Filament)
      case "field": {
        const field = String(form.get("field") ?? "");
        const value = text("value");
        if (field === "controllers")
          await updateDevice(organizationId, id, {
            controllers: form
              .getAll("value")
              .map((c) => String(c).trim())
              .filter(Boolean),
          });
        else if (field === "transport")
          await updateDevice(organizationId, id, {
            transport: value && TRANSPORTS.includes(value) ? value : null,
          });
        else if (["name", "place", "firmware", "mac"].includes(field))
          await updateDevice(organizationId, id, { [field]: value });
        else return payload({ ok: false });
        return payload({ ok: true });
      }
      case "remove": {
        const quantity = await removeDevice(organizationId, id);
        return done(
          userId,
          "Matter device removed",
          quantity ? `Quantity is now ${quantity}.` : ""
        );
      }
      // Matter labels: all the asset's devices, those not printed yet, or one
      case "print": {
        const which = String(form.get("which") ?? "all");
        const count = await queueMatterLabels({
          organizationId,
          userId,
          assetIds: [assetId],
          which: which === "missing" ? "missing" : id ? "chosen" : "all",
          deviceIds: id ? [id] : undefined,
        });
        return done(
          userId,
          count === 1 ? "Matter label queued" : `${count} Matter labels queued`,
          "They will print shortly."
        );
      }
      default:
        return payload({ ok: false });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
