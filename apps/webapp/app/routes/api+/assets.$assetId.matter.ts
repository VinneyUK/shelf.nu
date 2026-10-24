/**
 * An asset's Matter device (fork): what's known about it (GET), and saving,
 * revealing, filling in or removing its setup code (POST). The code itself is
 * only sent back on "reveal", to people who can change the asset.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { done } from "~/modules/filament/notify.server";
import { queueMatterLabel } from "~/modules/labels/service.server";
import {
  getMatter,
  removeMatter,
  revealMatter,
  saveMatterCode,
  updateMatterDetails,
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
    return payload({ matter: await getMatter(organizationId, assetId) });
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
    switch (form.get("intent")) {
      case "save": {
        const { names } = await saveMatterCode(
          organizationId,
          assetId,
          String(form.get("code") ?? "")
        );
        return done(
          userId,
          "Matter code saved",
          names.productName
            ? `${names.vendorName ?? ""} ${
                names.productName
              }: kept encrypted.`.trim()
            : "Kept encrypted."
        );
      }
      case "reveal":
        return payload({ code: await revealMatter(organizationId, assetId) });
      case "details": {
        const text = (k: string) => {
          const v = String(form.get(k) ?? "").trim();
          return v || null;
        };
        const transport = text("transport");
        await updateMatterDetails(organizationId, assetId, {
          transport:
            transport && TRANSPORTS.includes(transport) ? transport : null,
          firmware: text("firmware"),
          mac: text("mac"),
          controllers: form
            .getAll("controllers")
            .map((c) => String(c).trim())
            .filter(Boolean),
        });
        return done(userId, "Matter details saved", "");
      }
      // a Matter label on the label printer
      case "print": {
        await queueMatterLabel({ organizationId, userId, assetId });
        return done(userId, "Matter label queued", "It will print shortly.");
      }
      case "remove":
        await removeMatter(organizationId, assetId);
        return done(userId, "Matter code removed", "");
      default:
        return payload({ ok: false });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
