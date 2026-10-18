/**
 * Find new pictures for selected assets (fork): "search" looks one asset up
 * (the dialog asks for each in turn); "use" sets the chosen pictures.
 */
import { data, type ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { findPictures, setPictureFromUrl } from "~/modules/ai/pictures.server";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { assertIsPost, error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

const Schema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("search"), assetId: z.string().min(1) }),
  z.object({
    intent: z.literal("use"),
    /** "assetId|url" for each chosen picture */
    choices: z.array(z.string()).default([]),
  }),
]);

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    assertIsPost(request);
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const input = parseData(await request.formData(), Schema);
    if (input.intent === "search") {
      return payload({
        result: await findPictures({ organizationId, assetId: input.assetId }),
      });
    }
    let updated = 0;
    const failed: string[] = [];
    for (const choice of input.choices) {
      const at = choice.indexOf("|");
      if (at < 1) continue;
      const assetId = choice.slice(0, at);
      try {
        await setPictureFromUrl({
          organizationId,
          userId,
          assetId,
          url: choice.slice(at + 1),
        });
        updated += 1;
      } catch (cause) {
        failed.push(makeShelfError(cause).message);
      }
    }
    sendNotification({
      title: updated
        ? `${updated} picture${updated === 1 ? "" : "s"} updated`
        : "No pictures updated",
      message: failed.length
        ? `${failed.length} couldn't be used: ${failed[0]}`
        : updated
        ? "The new pictures are the assets' main images now."
        : "Nothing was chosen.",
      icon:
        failed.length && !updated
          ? { name: "x", variant: "error" }
          : { name: "success", variant: "success" },
      senderId: userId,
    });
    return payload({ success: true, updated, failed: failed.length });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
