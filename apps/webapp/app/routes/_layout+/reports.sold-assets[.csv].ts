/**
 * Sold Assets report as CSV. Part of the sold feature; not in upstream Shelf.
 */
import { data, type LoaderFunctionArgs } from "react-router";
import { csvField, parseDay } from "~/modules/sold/report-utils";
import { getSoldReport } from "~/modules/sold/service.server";
import { csvResponse } from "~/utils/csv-utf8";
import { makeShelfError } from "~/utils/error";
import { error } from "~/utils/http.server";
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
      entity: PermissionEntity.reports,
      action: PermissionAction.read,
    });
    const params = new URL(request.url).searchParams;
    const { rows } = await getSoldReport({
      organizationId,
      from: parseDay(params.get("from")),
      to: parseDay(params.get("to")),
    });
    const lines = [
      [
        "Date sold",
        "Asset ID",
        "Asset",
        "Sale price",
        "Recorded value",
        "Difference",
      ],
      ...rows.map((r) => [
        r.soldOn,
        r.sequentialId,
        r.title,
        r.price,
        r.value,
        r.difference,
      ]),
    ].map((cells) => cells.map(csvField).join(","));
    return csvResponse(`${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Disposition": 'attachment; filename="sold-assets.csv"',
      },
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}
