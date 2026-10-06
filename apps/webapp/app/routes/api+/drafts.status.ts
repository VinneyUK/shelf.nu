/**
 * A tiny "has anything changed?" check for the Drafts page (fork). It polls this
 * instead of reloading the whole page, so waiting for Claude costs one small query.
 * Part of the AI feature; not in upstream Shelf.
 */
import { data, type LoaderFunctionArgs } from "react-router";
import {
  getDraftsSignature,
  kickDraftProcessing,
} from "~/modules/ai/drafts.server";
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
      action: PermissionAction.create,
    });
    const status = await getDraftsSignature(organizationId);
    // anything left waiting (a restart, a missed kick) gets going again
    if (status.pending > 0) kickDraftProcessing();
    return payload(status);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}
