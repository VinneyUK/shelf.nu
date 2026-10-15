/**
 * A filament's picture from the Bambu store, as kept in Shelf (fork).
 */
import { type LoaderFunctionArgs } from "react-router";
import { getFilamentImage } from "~/modules/filament/images.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  const { organizationId } = await requirePermission({
    userId,
    request,
    entity: PermissionEntity.asset,
    action: PermissionAction.read,
  });
  const image = await getFilamentImage(
    organizationId,
    String(params.key ?? "")
  );
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
