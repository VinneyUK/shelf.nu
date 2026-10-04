/**
 * Labels → Queue: printer status, printing now, waiting, search and print,
 * and the printed history. Part of the labels feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import {
  data,
  Form,
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
  type MetaFunction,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { LabelPreview } from "~/components/labels/label-preview";
import { LabelledBadge } from "~/components/labels/labelled-badge";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import { db } from "~/database/db.server";
import { useSearchParams } from "~/hooks/search-params";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import {
  formatBoxId,
  getBoxIds,
  parseBoxNumber,
} from "~/modules/box-numbers/service.server";
import {
  cancelLabelJob,
  getLabelledAssets,
  getLabelQueue,
  getLabelSettings,
  getPrinterStatus,
  qrUrlFor,
  queueBoxLabels,
  queueLabels,
  retryLabelJobsNow,
  type PrinterEntity,
} from "~/modules/labels/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction = () => [
  { title: appendToMetaTitle("Labels") },
];

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();

    const settings = await getLabelSettings(organizationId);
    const [queue, printer, labelled, results] = await Promise.all([
      getLabelQueue(organizationId),
      // Don't let a slow Home Assistant hold up the page
      settings.isConfigured
        ? Promise.race([
            getPrinterStatus(organizationId),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 3000)
            ),
          ])
        : Promise.resolve(null),
      getLabelledAssets(organizationId),
      q
        ? db.asset.findMany({
            where: {
              organizationId,
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { sequentialId: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, title: true, sequentialId: true },
            orderBy: { title: "asc" },
            take: 25,
          })
        : Promise.resolve([]),
    ]);

    // labels feature: boxes (kits) in the search, by name or BOX-0003
    const boxNumber = q ? parseBoxNumber(q) : null;
    const boxIds = q ? await getBoxIds(organizationId) : {};
    const boxes = q
      ? (
          await db.kit.findMany({
            where: {
              organizationId,
              name: { contains: q, mode: "insensitive" },
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: 25,
          })
        ).map((k) => ({ ...k, boxId: boxIds[k.id] ?? "" }))
      : [];
    if (boxNumber !== null) {
      const match = Object.entries(boxIds).find(
        ([, id]) => id === formatBoxId(boxNumber)
      );
      if (match && !boxes.some((b) => b.id === match[0])) {
        const kit = await db.kit.findFirst({
          where: { organizationId, id: match[0] },
          select: { id: true, name: true },
        });
        if (kit) boxes.unshift({ ...kit, boxId: match[1] });
      }
    }

    const withQr = <T extends { qrId: string }>(job: T) => ({
      ...job,
      qrUrl: qrUrlFor(job.qrId),
    });
    return payload({
      settings,
      printer,
      printing: queue.printing ? withQr(queue.printing) : null,
      waiting: queue.waiting.map(withQr),
      history: queue.history,
      q,
      results: results.map((a) => ({
        ...a,
        labelledAt: labelled[a.id] ?? null,
      })),
      boxes: boxes.map((b) => ({ ...b, labelledAt: labelled[b.id] ?? null })),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

const ActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("print"),
    assetIds: z.array(z.string()).default([]),
    kitIds: z.array(z.string()).default([]),
  }),
  z.object({ intent: z.literal("cancel"), jobId: z.string().min(1) }),
  z.object({ intent: z.literal("retry") }),
]);

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const input = parseData(await request.formData(), ActionSchema);
    if (input.intent === "print") {
      const assets = await queueLabels({
        organizationId,
        assetIds: input.assetIds,
        source: "labels-page",
        userId,
      });
      const boxes = await queueBoxLabels({
        organizationId,
        kitIds: input.kitIds,
        source: "labels-page",
        userId,
      });
      return payload({
        success: true,
        queued: assets.queued + boxes.queued,
        alreadyQueued: assets.alreadyQueued + boxes.alreadyQueued,
        noQrCode: assets.noQrCode + boxes.noQrCode,
      });
    }
    if (input.intent === "cancel") {
      await cancelLabelJob(organizationId, input.jobId);
      return payload({ success: true });
    }
    await retryLabelJobsNow(organizationId);
    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

const SOURCE_LABELS: Record<string, string> = {
  asset: "Asset page",
  bulk: "Assets list",
  tag: "Tag",
  "labels-page": "Labels page",
};

/** Battery, connection and labels left, from the printer's sensors. */
function printerSummary(entities: PrinterEntity[] | null) {
  if (!entities) return null;
  const find = (test: (e: PrinterEntity) => boolean) => entities.find(test);
  const nameHas = (e: PrinterEntity, word: string) =>
    `${e.entity} ${e.name ?? ""}`.toLowerCase().includes(word);
  const battery = find((e) => e.device_class === "battery");
  const connection = find(
    (e) => e.device_class === "connectivity" || nameHas(e, "connectivity")
  );
  const total = find(
    (e) => nameHas(e, "labels total") || nameHas(e, "labels_total")
  );
  const used = find(
    (e) => nameHas(e, "labels used") || nameHas(e, "labels_used")
  );
  const left =
    total && used && !isNaN(Number(total.state)) && !isNaN(Number(used.state))
      ? Number(total.state) - Number(used.state)
      : null;
  return {
    connected: connection ? connection.state === "on" : null,
    battery:
      battery && !isNaN(Number(battery.state))
        ? Math.round(Number(battery.state))
        : null,
    labelsLeft: left,
  };
}

export default function LabelsQueue() {
  const { settings, printer, printing, waiting, history, q, results, boxes } =
    useLoaderData<typeof loader>();
  const { isAdministratorOrOwner } = useUserRoleHelper();
  const revalidator = useRevalidator();
  const busy = Boolean(printing) || waiting.length > 0;

  // Keep the queue live: every 4 s while anything's queued, otherwise every 30 s
  useEffect(() => {
    const id = setInterval(
      () => {
        if (revalidator.state === "idle" && !document.hidden)
          void revalidator.revalidate();
      },
      busy ? 4000 : 30000
    );
    return () => clearInterval(id);
  }, [busy, revalidator]);

  const summary = printerSummary(printer);
  const hasErrors = waiting.some((job) => job.lastError);

  return (
    <div className="flex flex-col gap-4">
      {!settings.isConfigured ? (
        <Card className="my-0 border-warning-200 bg-warning-25">
          <p className="font-medium text-gray-900">
            The printer isn't set up yet.
          </p>
          <p className="text-sm text-gray-600">
            {isAdministratorOrOwner ? (
              <>
                Add your Home Assistant details in{" "}
                <Link
                  to="/labels/settings"
                  className="font-semibold text-primary-700 underline"
                >
                  Settings
                </Link>
                . Labels you queue now will print once it is.
              </>
            ) : (
              "Ask a workspace admin to set up the printer. Labels you queue now will print once it is."
            )}
          </p>
        </Card>
      ) : (
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-600">
          {summary === null ? (
            <span>
              Printer status unavailable — Home Assistant didn't answer.
            </span>
          ) : (
            <>
              {summary.connected !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-2 rounded-full ${
                      summary.connected ? "bg-success-500" : "bg-gray-300"
                    }`}
                    aria-hidden="true"
                  />
                  {summary.connected ? "Connected" : "Not connected right now"}
                </span>
              ) : null}
              {summary.battery !== null ? (
                <span>Battery {summary.battery}%</span>
              ) : null}
              {summary.labelsLeft !== null ? (
                <span>{summary.labelsLeft} labels left</span>
              ) : null}
            </>
          )}
        </p>
      )}

      <Card className="my-0">
        <h3 className="mb-3 text-text-md font-semibold text-gray-900">
          Printing now
        </h3>
        {printing ? (
          <div className="flex flex-wrap items-center gap-4">
            <LabelPreview
              sequentialId={printing.sequentialId}
              title={printing.title}
              qrUrl={printing.qrUrl}
              settings={settings}
            />
            <p className="text-sm font-medium text-primary-700">
              Printing {printing.sequentialId || printing.title}…
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Idle.</p>
        )}
      </Card>

      <Card className="my-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-text-md font-semibold text-gray-900">
            Waiting{waiting.length ? ` (${waiting.length})` : ""}
          </h3>
          {hasErrors ? <RetryNowButton /> : null}
        </div>
        {waiting.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing waiting. Print from an asset's menu, the assets list, the
            search below
            {settings.queueTagName ? (
              <>
                , or by giving an asset the{" "}
                <strong>{settings.queueTagName}</strong> tag
              </>
            ) : null}
            .
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {waiting.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center gap-4 py-3"
              >
                <LabelPreview
                  sequentialId={job.sequentialId}
                  title={job.title}
                  qrUrl={job.qrUrl}
                  settings={settings}
                  scale={0.8}
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-gray-900">
                    {job.sequentialId} {job.title}
                  </p>
                  <p className="text-gray-500">
                    From {SOURCE_LABELS[job.source] ?? job.source}
                  </p>
                  {job.lastError ? (
                    <p className="text-error-600">
                      {job.lastError}
                      {job.nextAttemptAt ? (
                        <>
                          {" "}
                          Trying again at{" "}
                          <DateS date={job.nextAttemptAt} onlyTime />.
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <CancelButton jobId={job.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SearchAndPrint q={q} results={results} boxes={boxes} />

      <Card className="my-0">
        <h3 className="mb-3 text-text-md font-semibold text-gray-900">
          Printed
        </h3>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing printed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500">
                <tr className="border-b">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Asset</th>
                  <th className="py-2 pr-4 font-medium">From</th>
                  <th className="py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((job) => (
                  <tr key={job.id}>
                    <td className="whitespace-nowrap py-2 pr-4 text-gray-600">
                      <DateS
                        date={job.printedAt ?? job.createdAt}
                        includeTime
                        keepTime
                      />
                    </td>
                    <td className="py-2 pr-4">
                      {job.assetId ? (
                        <Link
                          to={`/assets/${job.assetId}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {job.sequentialId} {job.title}
                        </Link>
                      ) : (
                        <span className="text-gray-600">
                          {job.sequentialId} {job.title} (deleted)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {SOURCE_LABELS[job.source] ?? job.source}
                    </td>
                    <td className="py-2 text-gray-600">
                      {job.status === "printed" ? "Printed" : "Cancelled"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CancelButton({ jobId }: { jobId: string }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="cancel" />
      <input type="hidden" name="jobId" value={jobId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={isFormProcessing(fetcher.state)}
      >
        Cancel
      </Button>
    </fetcher.Form>
  );
}

function RetryNowButton() {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="retry" />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={isFormProcessing(fetcher.state)}
      >
        Try again now
      </Button>
    </fetcher.Form>
  );
}

function SearchAndPrint({
  q,
  results,
  boxes,
}: {
  q: string;
  boxes: {
    id: string;
    name: string;
    boxId: string;
    labelledAt: string | null;
  }[];
  results: {
    id: string;
    title: string;
    sequentialId: string | null;
    labelledAt: string | null;
  }[];
}) {
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher<{
    error?: { message: string };
    queued?: number;
    alreadyQueued?: number;
  }>();
  const done =
    fetcher.state === "idle" && fetcher.data && !fetcher.data.error
      ? fetcher.data.queued
        ? `Queued ${fetcher.data.queued} label${
            fetcher.data.queued === 1 ? "" : "s"
          }.`
        : "Already in the queue."
      : null;

  return (
    <Card className="my-0">
      <h3 className="mb-3 text-text-md font-semibold text-gray-900">
        Search and print
      </h3>
      <Form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q || searchParams.get("q") || ""}
          placeholder="Asset name or ID"
          aria-label="Search assets"
          className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </Form>
      {fetcher.data?.error ? (
        <p role="alert" className="mt-2 text-sm text-error-600">
          {fetcher.data.error.message}
        </p>
      ) : done ? (
        <p role="status" className="mt-2 text-sm text-gray-600">
          {done}
        </p>
      ) : null}
      {q && results.length === 0 && boxes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nothing matches "{q}".</p>
      ) : null}
      {boxes.length > 0 ? (
        <ul className="mt-3 divide-y">
          {boxes.map((box) => (
            <li key={box.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/kits/${box.id}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {box.name}
                </Link>{" "}
                <span className="text-sm text-gray-500">{box.boxId} · Box</span>{" "}
                <LabelledBadge labelledAt={box.labelledAt} />
              </div>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="print" />
                <input type="hidden" name="kitIds[0]" value={box.id} />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isFormProcessing(fetcher.state)}
                >
                  Print
                </Button>
              </fetcher.Form>
            </li>
          ))}
        </ul>
      ) : null}
      {results.length > 0 ? (
        <>
          <ul className="mt-3 divide-y">
            {results.map((asset) => (
              <li key={asset.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/assets/${asset.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {asset.title}
                  </Link>{" "}
                  <span className="text-sm text-gray-500">
                    {asset.sequentialId}
                  </span>{" "}
                  <LabelledBadge labelledAt={asset.labelledAt} />
                </div>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="print" />
                  <input type="hidden" name="assetIds[0]" value={asset.id} />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isFormProcessing(fetcher.state)}
                  >
                    Print
                  </Button>
                </fetcher.Form>
              </li>
            ))}
          </ul>
          {results.length > 1 ? (
            <fetcher.Form method="post" className="mt-3">
              <input type="hidden" name="intent" value="print" />
              {results.map((asset, i) => (
                <input
                  key={asset.id}
                  type="hidden"
                  name={`assetIds[${i}]`}
                  value={asset.id}
                />
              ))}
              <Button
                type="submit"
                variant="secondary"
                disabled={isFormProcessing(fetcher.state)}
              >
                Print all {results.length}
              </Button>
            </fetcher.Form>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
