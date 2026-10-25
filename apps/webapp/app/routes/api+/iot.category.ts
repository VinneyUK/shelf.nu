/**
 * Whether a category is IoT (fork): the asset form shows its IoT panel when
 * the chosen category is.
 */
import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { isIotCategoryId } from "~/modules/iot/asset-settings.server";
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
    const id = new URL(request.url).searchParams.get("id") ?? "";
    return payload({
      isIot: id ? await isIotCategoryId(organizationId, id) : false,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
