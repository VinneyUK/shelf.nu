/**
 * Live AMS for an open Filament page (fork): each report the printer sends,
 * the moment Shelf has it, over a server-sent event stream like Shelf's own
 * pop-ups. Only this workspace's reports reach the page.
 */
import type { LoaderFunctionArgs } from "react-router";
import { eventStream } from "remix-utils/sse/server";
import type { AmsLive } from "~/modules/filament/printer.server";
import { emitter } from "~/utils/emitter/emitter.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  const { organizationId } = await requirePermission({
    userId,
    request,
    entity: PermissionEntity.asset,
    action: PermissionAction.read,
  });

  return eventStream(request.signal, function setup(send) {
    function handle(message: string) {
      const live = JSON.parse(message) as AmsLive;
      if (live.organizationId !== organizationId) return;
      try {
        // the workspace id stays on the server
        const { organizationId: _, ...forPage } = live;
        send({ event: "ams", data: JSON.stringify(forPage) });
      } catch {
        // the page went away mid-send: its stream is closing anyway
      }
    }
    emitter.on("ams", handle);
    return function clear() {
      emitter.off("ams", handle);
    };
  });
}
