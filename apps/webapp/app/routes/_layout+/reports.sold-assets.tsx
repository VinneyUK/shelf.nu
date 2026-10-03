/**
 * Reports → Sold Assets: every sale, with totals, between optional dates.
 * Part of the sold feature; not in upstream Shelf.
 */
import {
  data,
  Form,
  Link,
  useLoaderData,
  type MetaFunction,
} from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { parseDay } from "~/modules/sold/report-utils";
import { getSoldReport } from "~/modules/sold/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { formatCurrency } from "~/utils/currency";
import { makeShelfError } from "~/utils/error";
import { error, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";

export const meta: MetaFunction = () => [
  { title: appendToMetaTitle("Sold Assets") },
];

export const handle = { breadcrumb: () => "Sold Assets" };

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
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const report = await getSoldReport({
      organizationId,
      from: parseDay(from),
      to: parseDay(to),
    });
    return payload({
      header: { title: "Sold Assets" },
      from,
      to,
      ...report,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export default function SoldAssetsReport() {
  const { from, to, rows, totals } = useLoaderData<typeof loader>();
  const organization = useCurrentOrganization();
  const money = (value: number | null) =>
    value === null || !organization
      ? "—"
      : formatCurrency({
          value,
          currency: organization.currency,
          locale:
            typeof navigator === "undefined" ? "en-GB" : navigator.language,
        });
  const day = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const csvHref = `/reports/sold-assets.csv?${new URLSearchParams({
    from,
    to,
  })}`;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-4">
        <Card className="my-0">
          <Form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              From
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="rounded border border-gray-300 px-3 py-2 font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              To
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="rounded border border-gray-300 px-3 py-2 font-normal"
              />
            </label>
            <Button type="submit" variant="secondary">
              Show
            </Button>
            {from || to ? (
              <Button to="/reports/sold-assets" variant="link">
                All time
              </Button>
            ) : null}
            <span className="grow" />
            <Button
              to={csvHref}
              variant="secondary"
              icon="download"
              reloadDocument
            >
              Download CSV
            </Button>
          </Form>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Sold", value: String(totals.count) },
            { label: "Sale prices", value: money(totals.price) },
            { label: "Recorded value", value: money(totals.value) },
            {
              label: "Difference",
              value: money(totals.difference),
              signed: totals.difference,
            },
          ].map((t) => (
            <Card key={t.label} className="my-0">
              <p className="text-sm text-gray-600">{t.label}</p>
              <p
                className={tw(
                  "text-display-xs font-semibold text-gray-900",
                  t.signed !== undefined && t.signed > 0 && "text-success-700",
                  t.signed !== undefined && t.signed < 0 && "text-error-600"
                )}
              >
                {t.value}
              </p>
            </Card>
          ))}
        </div>
        {totals.withoutPrice > 0 ? (
          <p className="text-sm text-gray-500">
            {totals.withoutPrice} sale
            {totals.withoutPrice === 1 ? " has" : "s have"} no price, so{" "}
            {totals.withoutPrice === 1 ? "isn't" : "aren't"} in the price
            totals.
          </p>
        ) : null}

        <Card className="my-0">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {from || to
                ? "Nothing sold in those dates."
                : "Nothing sold yet. Use Mark as sold in an asset's menu, or as a bulk action in the assets list."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">Sold</th>
                    <th className="py-2 pr-4 font-medium">Asset</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Sale price
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Recorded value
                    </th>
                    <th className="py-2 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.assetId}>
                      <td className="whitespace-nowrap py-2 pr-4 text-gray-600">
                        {day(row.soldOn)}
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          to={`/assets/${row.assetId}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {row.title}
                        </Link>{" "}
                        <span className="text-gray-500">
                          {row.sequentialId}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(row.price)}
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-600">
                        {money(row.value)}
                      </td>
                      <td
                        className={tw(
                          "py-2 text-right",
                          row.difference !== null &&
                            row.difference > 0 &&
                            "text-success-700",
                          row.difference !== null &&
                            row.difference < 0 &&
                            "text-error-600"
                        )}
                      >
                        {money(row.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
