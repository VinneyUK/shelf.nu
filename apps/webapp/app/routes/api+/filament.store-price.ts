/**
 * Today's Bambu store price for a filament as a spool or a refill (fork), for
 * pre-filling Price paid when adding filament. { price: number | null }
 */
import { data, type LoaderFunctionArgs } from "react-router";
import { storePriceFor } from "~/modules/filament/prices.server";
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
    const q = new URL(request.url).searchParams;
    const type = (q.get("type") ?? "").trim();
    const colourName = (q.get("colour") ?? "").trim();
    if (!type || !colourName) return payload({ price: null });
    const price = await storePriceFor(organizationId, {
      type,
      colourName,
      filamentCode: q.get("code")?.trim() || null,
      packaging: q.get("packaging") === "refill" ? "refill" : "spool",
    });
    return payload({ price });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
