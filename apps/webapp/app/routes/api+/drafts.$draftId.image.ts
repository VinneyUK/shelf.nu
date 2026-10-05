/**
 * A draft's photo or receipt, for the Drafts page to show (fork). Only the
 * workspace's own drafts.
 */
import { type LoaderFunctionArgs } from "react-router";
import { getDraftFile } from "~/modules/ai/drafts.server";
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
  const file = await getDraftFile(organizationId, String(params.draftId));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.type,
      "content-disposition": `inline; filename="${file.name.replace(
        /"/g,
        ""
      )}"`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
