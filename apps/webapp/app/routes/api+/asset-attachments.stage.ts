/**
 * Holding area for attachments added in the asset form. Files upload here as
 * soon as they're dropped, before the asset is saved; saving the form then
 * claims them for the asset. Unclaimed files are removed after a day.
 * Part of the attachments feature; not in upstream Shelf.
 *
 *   GET                                    → the size limit, for the form
 *   POST multipart, field "file"           → stage files
 *   POST intent=delete&attachmentId=…      → remove a staged file
 */
import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import {
  deleteAssetAttachment,
  getAttachmentMaxBytes,
  uploadAssetAttachments,
} from "~/modules/asset-attachment/service.server";
import { makeShelfError } from "~/utils/error";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    return payload({ maxBytes: getAttachmentMaxBytes() });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    // Adding a new asset needs create; editing one needs update
    const editing = new URL(request.url).searchParams.get("mode") === "edit";
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: editing ? PermissionAction.update : PermissionAction.create,
    });

    const isUpload = (request.headers.get("content-type") ?? "").startsWith(
      "multipart/form-data"
    );
    if (isUpload) {
      const staged = await uploadAssetAttachments({
        request,
        assetId: null,
        organizationId,
        userId,
      });
      return payload({ staged, deleted: null });
    }

    const { attachmentId } = parseData(
      await request.formData(),
      z.object({ intent: z.literal("delete"), attachmentId: z.string().min(1) })
    );
    const deleted = await deleteAssetAttachment({
      attachmentId,
      assetId: null,
      organizationId,
    });
    return payload({ staged: null, deleted });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
