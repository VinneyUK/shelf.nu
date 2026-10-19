/**
 * A filament's picture from the Bambu store, as kept in Shelf (fork); with
 * ?size=thumb, its small copy.
 */
import { type LoaderFunctionArgs } from "react-router";
import {
  getFilamentImage,
  getFilamentThumb,
} from "~/modules/filament/images.server";
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
  const key = String(params.key ?? "");
  // ?size=thumb: the small copy, for tiles and lists
  const thumb = new URL(request.url).searchParams.get("size") === "thumb";
  const image = thumb
    ? await getFilamentThumb(organizationId, key)
    : await getFilamentImage(organizationId, key);
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
