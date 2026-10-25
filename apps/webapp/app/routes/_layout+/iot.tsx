/**
 * IoT (fork): every IoT asset and its devices in one place. Type and
 * protocol belong to the asset (set in its form); its devices take them.
 * By asset (each with its devices), all devices, or by room; filtered by type,
 * protocol and what's still to do; each links to its asset. Print missing
 * labels prints the Matter devices' labels not yet printed.
 */
import { useMemo, useState } from "react";
import { MapPinIcon, PrinterIcon, SearchIcon } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { ErrorContent } from "~/components/errors";
import {
  DeviceTypeIcon,
  ProtocolBadge,
  ProtocolIcon,
  ProtocolLogo,
} from "~/components/iot/icons";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { listIotAssets } from "~/modules/matter/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    return payload({
      header: { title: "IoT" },
      assets: await listIotAssets(organizationId),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const handle = {
  breadcrumb: () => <span className="single-crumb">IoT</span>,
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

type Asset = ReturnType<typeof useLoaderData<typeof loader>>["assets"][number];
type Device = Asset["devices"][number] & { asset: Asset };
type Todo = "unnamed" | "nolabel" | "unpaired";

const isTodo = (d: Device, todo: Todo) =>
  todo === "unnamed"
    ? !d.name
    : todo === "nolabel"
    ? d.asset.protocol === "Matter" && !d.labelPrintedAt
    : !d.controllers.length;

function DeviceLine({ d, withAsset }: { d: Device; withAsset?: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-2.5">
      {withAsset ? <DeviceTypeIcon type={d.asset.type} size={30} /> : null}
      <div className="min-w-0 flex-1">
        <div
          className={tw(
            "truncate text-sm font-medium",
            d.name ? "text-gray-900" : "text-gray-400"
          )}
        >
          {d.name || "Not named"}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <MapPinIcon className="size-3" aria-hidden="true" />
          {d.place || "No room"}
          {withAsset ? (
            <>
              {" · "}
              <Link
                to={`/assets/${d.asset.id}/overview`}
                className="text-gray-700 underline"
              >
                {d.asset.title}
              </Link>
            </>
          ) : null}
        </div>
      </div>
      {withAsset && d.asset.protocol ? (
        <ProtocolBadge protocol={d.asset.protocol} />
      ) : null}
      <span
        className={tw(
          "max-w-40 truncate text-xs",
          d.controllers.length ? "text-gray-500" : "text-warning-700"
        )}
      >
        {d.controllers.join(", ") || "Not paired"}
      </span>
    </div>
  );
}

export default function IotPage() {
  const { assets } = useLoaderData<typeof loader>();
  const print = useFetcher();
  const [view, setView] = useState<"assets" | "devices" | "room">("assets");
  const [type, setType] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [todo, setTodo] = useState<Todo | null>(null);
  const [q, setQ] = useState("");
  const allDevices: Device[] = useMemo(
    () => assets.flatMap((a) => a.devices.map((d) => ({ ...d, asset: a }))),
    [assets]
  );
  const shownAssets = assets.filter(
    (a) =>
      (!type || (a.type ?? "No type") === type) &&
      (!protocol || (a.protocol ?? "Not set") === protocol)
  );
  const devices = allDevices.filter(
    (d) =>
      shownAssets.includes(d.asset) &&
      (!todo || isTodo(d, todo)) &&
      (!q ||
        `${d.name ?? ""} ${d.place ?? ""} ${d.asset.title}`
          .toLowerCase()
          .includes(q.toLowerCase()))
  );
  const missing = devices.filter((d) => isTodo(d, "nolabel"));
  const chip = (on: boolean) =>
    tw(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
      on
        ? "border-primary-500 bg-primary-50 text-primary-700"
        : "border-gray-300 bg-white text-gray-700"
    );
  const figures: [string, number, string][] = [
    ["IoT assets", assets.length, "by type and protocol"],
    ["Devices", allDevices.length, "in them"],
    [
      "Labels to print",
      allDevices.filter((d) => isTodo(d, "nolabel")).length,
      "Matter devices",
    ],
    [
      "Not paired",
      allDevices.filter((d) => isTodo(d, "unpaired")).length,
      "with no controller",
    ],
  ];
  return (
    <>
      <Header hidePageDescription />
      <div className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {figures.map(([k, v, sub]) => (
            <Card key={k} className="my-0 p-4">
              <div className="text-xs font-medium text-gray-500">{k}</div>
              <div className="text-display-xs font-semibold text-gray-900">
                {v}
              </div>
              <div className="text-xs text-gray-500">{sub}</div>
            </Card>
          ))}
        </div>

        <Card className="my-0 flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3">
              <SearchIcon className="size-4 text-gray-400" aria-hidden="true" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a device, room or asset"
                aria-label="Find a device"
                className="w-60 border-0 p-0 text-sm focus:ring-0"
              />
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <span className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
                {(
                  [
                    ["assets", "By asset"],
                    ["devices", "All devices"],
                    ["room", "By room"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={tw(
                      "rounded-md px-3 py-1 text-sm font-medium",
                      view === v
                        ? "bg-primary-500 text-white"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={!missing.length || isFormProcessing(print.state)}
                onClick={() => {
                  const form = new FormData();
                  form.set("which", "missing");
                  for (const id of new Set(missing.map((d) => d.asset.id)))
                    form.append("assetIds", id);
                  void print.submit(form, {
                    method: "post",
                    action: "/api/matter/print",
                  });
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <PrinterIcon className="size-4" aria-hidden="true" /> Print
                  missing labels
                  {missing.length ? ` (${missing.length})` : ""}
                </span>
              </Button>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-xs font-medium text-gray-500">Type</span>
            {[...new Set(assets.map((a) => a.type ?? "No type"))].map((k) => (
              <button
                key={k}
                type="button"
                className={chip(type === k)}
                onClick={() => setType(type === k ? null : k)}
              >
                <DeviceTypeIcon type={k === "No type" ? null : k} size={18} />
                {k}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-xs font-medium text-gray-500">
              Protocol
            </span>
            {[...new Set(assets.map((a) => a.protocol ?? "Not set"))].map(
              (k) => (
                <button
                  key={k}
                  type="button"
                  className={tw(
                    "rounded-full",
                    protocol === k && "ring-2 ring-primary-500"
                  )}
                  onClick={() => setProtocol(protocol === k ? null : k)}
                >
                  {k === "Not set" ? (
                    <span className={chip(false)}>Not set</span>
                  ) : (
                    <ProtocolBadge protocol={k} />
                  )}
                </button>
              )
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-xs font-medium text-gray-500">
              To do
            </span>
            {(
              [
                ["unnamed", "Not named"],
                ["nolabel", "No label yet"],
                ["unpaired", "Not paired"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={chip(todo === k)}
                onClick={() => setTodo(todo === k ? null : k)}
              >
                {l} · {allDevices.filter((d) => isTodo(d, k)).length}
              </button>
            ))}
          </div>
        </Card>

        {assets.length === 0 ? (
          <Card className="my-0 p-6 text-sm text-gray-600">
            No IoT assets yet. Put an asset in the IoT category, choose what its
            devices are and how they connect, then add its devices on its page.
          </Card>
        ) : view === "assets" ? (
          shownAssets
            .filter(
              (a) =>
                !q ||
                a.title.toLowerCase().includes(q.toLowerCase()) ||
                devices.some((d) => d.asset === a)
            )
            .map((a) => {
              const mine = devices.filter((d) => d.asset === a);
              return (
                <Card key={a.id} className="my-0 overflow-hidden p-0">
                  <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
                    <DeviceTypeIcon type={a.type} size={36} />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/assets/${a.id}/overview`}
                        className="text-sm font-semibold text-gray-900 underline"
                      >
                        {a.title}
                      </Link>
                      {a.protocol ? (
                        <ProtocolIcon
                          protocol={a.protocol}
                          className="ml-1.5 inline-block size-4 align-middle"
                        />
                      ) : null}
                      <div className="text-xs text-gray-500">
                        {a.type ?? "No type"} · {a.devices.length}{" "}
                        {a.devices.length === 1 ? "device" : "devices"}
                      </div>
                    </div>
                    {a.protocol ? (
                      <ProtocolLogo protocol={a.protocol} className="h-6" />
                    ) : null}
                  </div>
                  {mine.length ? (
                    <div className="grid gap-px bg-gray-100 sm:grid-cols-2 xl:grid-cols-3">
                      {mine.map((d) => (
                        <DeviceLine key={d.id} d={d} />
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-3 text-sm text-gray-500">
                      {a.devices.length
                        ? "None of its devices match."
                        : "No devices added yet."}
                    </p>
                  )}
                </Card>
              );
            })
        ) : (
          (view === "room"
            ? [...new Set(devices.map((d) => d.place ?? "No room"))]
            : [null]
          ).map((room) => (
            <Card key={room ?? "all"} className="my-0 overflow-hidden p-0">
              {room ? (
                <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-900">
                  <MapPinIcon className="size-4" aria-hidden="true" />
                  {room}
                </div>
              ) : null}
              <div className="divide-y divide-gray-100">
                {devices
                  .filter((d) => !room || (d.place ?? "No room") === room)
                  .map((d) => (
                    <DeviceLine key={d.id} d={d} withAsset />
                  ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
