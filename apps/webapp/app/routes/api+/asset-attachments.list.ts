/**
 * One asset's attachments with fresh links, for the hover card in the assets
 * list. Part of the attachments feature; not in upstream Shelf.
 */
import { data, type LoaderFunctionArgs } from "react-router";
import {
  assertAssetInOrganization,
  getAssetAttachments,
} from "~/modules/asset-attachment/service.server";
import { makeShelfError, ShelfError } from "~/utils/error";
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
    const assetId = new URL(request.url).searchParams.get("assetId");
    if (!assetId) {
      throw new ShelfError({
        cause: null,
        message: "Which asset?",
        status: 400,
        label: "Assets",
        shouldBeCaptured: false,
      });
    }
    await assertAssetInOrganization({ assetId, organizationId });
    const attachments = await getAssetAttachments({ assetId, organizationId });
    return payload({
      attachments: attachments.map(
        ({ id, fileName, contentType, size, openUrl }) => ({
          id,
          fileName,
          contentType,
          size,
          openUrl,
        })
      ),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
