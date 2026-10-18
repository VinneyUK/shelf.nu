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
  create: "Couldn't add the filament",
  add: "Couldn't add the filament",
  approve: "Couldn't add the filament",
  dismiss: "Couldn't dismiss it",
  retire: "Couldn't retire the filament",
  keep: "Couldn't bring the filament back",
  open: "Couldn't open the filament",
  state: "Couldn't change the status",
  field: "Couldn't save that",
  "filament-field": "Couldn't save that",
  "filament-name": "Couldn't save the filament",
  rename: "Couldn't save the filament",
  "image-url": "Couldn't use that picture",
  "store-page": "Couldn't link that store page",
  filament: "Couldn't save the filament",
  spool: "Couldn't save the filament",
  weigh: "Couldn't weigh the filament",
  delete: "Couldn't delete the filament",
  "check-prices": "Couldn't check prices",
  "fill-prices": "Couldn't fill in the prices",
  "fetch-images": "Couldn't get pictures",
  "fetch-image": "Couldn't get the picture",
};

/** It didn't work: a red pop-up saying what failed and why. */
export function failed(userId: string, intent: string, message: string) {
  notify(userId, FAILED[intent] ?? "Something went wrong", message, "error");
}
