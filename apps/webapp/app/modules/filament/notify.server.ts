/**
 * Filament (fork): every action's outcome as Shelf's pop-up notification, the
 * same as "Asset updated": green with a tick when it worked, red with a cross
 * when it didn't.
 */
import type { NotificationVariant } from "~/atoms/notifications";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { payload } from "~/utils/http.server";

export function notify(
  userId: string,
  title: string,
  message: string | null,
  variant: NotificationVariant = "success"
) {
  sendNotification({
    title,
    message,
    icon: { name: variant === "error" ? "x" : "success", variant },
    senderId: userId,
  });
}

/** It worked: the pop-up, and the action's answer (with anything the page needs). */
export function done(
  userId: string,
  title: string,
  message: string | null,
  extra: Record<string, unknown> = {}
) {
  notify(userId, title, message);
  return payload({ ok: true, message, ...extra });
}

/** What a failed action's pop-up says, by what was being done. */
const FAILED: Record<string, string> = {
  create: "Couldn't add the spools",
  add: "Couldn't add the spools",
  approve: "Couldn't add the spool",
  dismiss: "Couldn't dismiss it",
  retire: "Couldn't retire the spool",
  keep: "Couldn't bring the spool back",
  open: "Couldn't open the spool",
  state: "Couldn't change the status",
  filament: "Couldn't save the filament",
  spool: "Couldn't save the spool",
  weigh: "Couldn't weigh the spool",
  delete: "Couldn't delete the spool",
  "check-prices": "Couldn't check prices",
  "fetch-images": "Couldn't get pictures",
  "fetch-image": "Couldn't get the picture",
};

/** It didn't work: a red pop-up saying what failed and why. */
export function failed(userId: string, intent: string, message: string) {
  notify(userId, FAILED[intent] ?? "Something went wrong", message, "error");
}
