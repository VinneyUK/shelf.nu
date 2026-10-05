/**
 * Photos and receipts in, drafts out (fork). The browser has already shrunk
 * photos; the server shrinks them again so it never trusts that.
 * Part of the AI feature; not in upstream Shelf.
 */
import { data, type ActionFunctionArgs } from "react-router";
import { addDraftFiles } from "~/modules/ai/drafts.server";
import { isAiReady } from "~/modules/ai/settings.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { assertIsPost, error, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    assertIsPost(request);
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.create,
    });
    if (!(await isAiReady(organizationId))) {
      throw new ShelfError({
        cause: null,
        message:
          "AI isn't set up yet. Turn it on and add an API key in Settings → AI.",
        status: 400,
        label: "Assets",
        shouldBeCaptured: false,
      });
    }
    const form = await request.formData();
    const source = form.get("source") === "receipt" ? "receipt" : "photo";
    const files = await Promise.all(
      form
        .getAll("files")
        .filter((f): f is File => f instanceof File)
        .map(async (f) => ({
          name: f.name || "file",
          type: f.type,
          bytes: new Uint8Array(await f.arrayBuffer()),
        }))
    );
    return payload(
      await addDraftFiles({ organizationId, userId, source, files })
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
