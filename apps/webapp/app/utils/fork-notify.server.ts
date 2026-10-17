/**
 * The fork's pop-ups: every fork action reports how it went with Shelf's own
 * notification, as "Asset updated" does: green with a tick when it worked, red
 * with a cross when it didn't, grey for news that is neither.
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

/** It worked: the pop-up, and the action's answer (with anything the page still needs). */
export function done(
  userId: string,
  title: string,
  message: string | null,
  extra: Record<string, unknown> = {}
) {
  notify(userId, title, message);
  return payload({ ok: true, message, ...extra });
}

/** It didn't: a red pop-up saying what failed and why. */
export function failed(userId: string, title: string, message: string) {
  notify(userId, title, message, "error");
}

type Titles = Record<string, { ok: string; failed: string }>;
type ActionArgs = {
  request: Request;
  context: { getSession: () => { userId: string } };
};

/**
 * Wraps a page's action so whatever it answers becomes a pop-up: the title
 * for the button pressed (its "intent"), the action's own words as the
 * message. An error, or an answer marked failed, becomes the red version.
 * "Saved." on its own needs no message: the title says it.
 */
export function withPopups<A extends (args: never) => Promise<unknown>>(
  run: A,
  titles: Titles
): A {
  return (async (args: ActionArgs) => {
    const form = await args.request
      .clone()
      .formData()
      .catch(() => null);
    const intent = String(form?.get("intent") ?? "");
    const { userId } = args.context.getSession();
    const result = await run(args as never);
    const t = titles[intent];
    if (!t) return result;
    const shape = result as {
      data?: { error?: { message?: string } };
      error?: { message?: string };
      message?: string;
      failed?: boolean;
    } | null;
    const problem = shape?.data?.error?.message ?? shape?.error?.message;
    if (problem) notify(userId, t.failed, problem, "error");
    else if (shape?.failed)
      notify(userId, t.failed, shape.message ?? null, "error");
    else
      notify(
        userId,
        t.ok,
        !shape?.message || shape.message === "Saved." ? null : shape.message
      );
    return result;
  }) as unknown as A;
}
