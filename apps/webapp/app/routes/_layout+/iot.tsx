/**
 * IoT (fork): every IoT device on every asset in one place. As cards, a
 * table, or by room; filtered by type, protocol and what's still to do (not
 * named, no label, not paired); each device links to its asset. Print
 * missing labels prints the Matter devices' labels not yet printed.
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
} from "~/components/iot/icons";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { listAllDevices } from "~/modules/matter/service.server";
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
      devices: await listAllDevices(organizationId),
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

type Device = ReturnType<
  typeof useLoaderData<typeof loader>
>["devices"][number];
type Todo = "unnamed" | "nolabel" | "unpaired";

const isTodo = (d: Device, todo: Todo) =>
  todo === "unnamed"
    ? !d.name
    : todo === "nolabel"
    ? d.protocol === "Matter" && !d.labelPrintedAt
    : !d.controllers.length;

function DeviceTile({ d }: { d: Device }) {
  return (
    <Card className="my-0 flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <DeviceTypeIcon type={d.deviceType} size={44} />
        <div className="min-w-0 flex-1">
          <div
            className={tw(
              "truncate text-sm font-semibold",
              d.name ? "text-gray-900" : "text-gray-400"
            )}
          >
            {d.name || "Not named"}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <MapPinIcon className="size-3" aria-hidden="true" />
            {d.place || "No room"}
          </div>
        </div>
        <ProtocolBadge protocol={d.protocol} />
      </div>
      <div className="text-xs text-gray-500">
        {d.deviceType ?? "No type"} ·{" "}
        <Link
          to={`/assets/${d.assetId}/overview`}
          className="text-gray-900 underline"
        >
          {d.assetTitle}
        </Link>
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 pt-2.5 text-xs">
        <span
          className={
            d.controllers.length ? "text-gray-500" : "text-warning-700"
          }
        >
          {d.controllers.join(", ") || "Not paired"}
        </span>
        {d.protocol !== "Matter" ? null : d.labelPrintedAt ? (
          <span className="font-medium text-success-700">Label printed</span>
        ) : (
          <span className="font-medium text-warning-700">No label</span>
        )}
      </div>
    </Card>
  );
}

export default function IotPage() {
  const { devices } = useLoaderData<typeof loader>();
  const print = useFetcher();
  const [view, setView] = useState<"cards" | "table" | "room">("cards");
  const [type, setType] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [todo, setTodo] = useState<Todo | null>(null);
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      devices.filter(
        (d) =>
          (!type || (d.deviceType ?? "No type") === type) &&
          (!protocol || d.protocol === protocol) &&
          (!todo || isTodo(d, todo)) &&
          (!q ||
            `${d.name ?? ""} ${d.place ?? ""} ${d.assetTitle} ${
              d.deviceType ?? ""
            }`
              .toLowerCase()
              .includes(q.toLowerCase()))
      ),
    [devices, type, protocol, todo, q]
  );
  const types = [...new Set(devices.map((d) => d.deviceType ?? "No type"))];
  const protocols = [...new Set(devices.map((d) => d.protocol))];
  const missing = list.filter((d) => isTodo(d, "nolabel"));
  const chip = (on: boolean) =>
    tw(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
      on
        ? "border-primary-500 bg-primary-50 text-primary-700"
        : "border-gray-300 bg-white text-gray-700"
    );
  const figures: [string, number, string][] = [
    [
      "Devices",
      devices.length,
      `on ${new Set(devices.map((d) => d.assetId)).size} assets`,
    ],
    [
      "Rooms",
      new Set(devices.map((d) => d.place).filter(Boolean)).size,
      "with devices in",
    ],
    [
      "Labels to print",
      devices.filter((d) => isTodo(d, "nolabel")).length,
      "Matter devices without one",
    ],
    [
      "Not paired",
      devices.filter((d) => isTodo(d, "unpaired")).length,
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
                    ["cards", "Cards"],
                    ["table", "Table"],
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
                  for (const id of new Set(missing.map((d) => d.assetId)))
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
            {types.map((k) => (
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
            {protocols.map((k) => (
              <button
                key={k}
                type="button"
                className={chip(protocol === k)}
                onClick={() => setProtocol(protocol === k ? null : k)}
              >
                <ProtocolIcon protocol={k} className="size-3" />
                {k}
              </button>
            ))}
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
                {l} · {devices.filter((d) => isTodo(d, k)).length}
              </button>
            ))}
          </div>
        </Card>

        {devices.length === 0 ? (
          <Card className="my-0 p-6 text-sm text-gray-600">
            No IoT devices yet. Put an asset in the IoT category, then add its
            devices on its page: Add device.
          </Card>
        ) : view === "table" ? (
          <Card className="my-0 overflow-x-auto p-0">
            <table className="w-full">
              <thead className="bg-gray-25">
                <tr>
                  {[
                    "",
                    "Device",
                    "Type",
                    "Protocol",
                    "Asset",
                    "Paired with",
                    "Label",
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500 first:pl-4"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pl-4">
                      <DeviceTypeIcon type={d.deviceType} size={30} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      <div
                        className={tw(
                          "font-semibold",
                          d.name ? "text-gray-900" : "text-gray-400"
                        )}
                      >
                        {d.name || "Not named"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {d.place ?? "—"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                      {d.deviceType ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <ProtocolBadge protocol={d.protocol} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      <Link
                        to={`/assets/${d.assetId}/overview`}
                        className="text-gray-900 underline"
                      >
                        {d.assetTitle}
                      </Link>
                    </td>
                    <td className="max-w-48 truncate px-3 py-2 text-sm text-gray-600">
                      {d.controllers.join(", ") || "Not paired"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {d.protocol !== "Matter" ? (
                        "—"
                      ) : d.labelPrintedAt ? (
                        <span className="font-medium text-success-700">
                          Printed
                        </span>
                      ) : (
                        <span className="font-medium text-warning-700">
                          No label
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : view === "room" ? (
          [...new Set(list.map((d) => d.place ?? "No room"))].map((room) => (
            <div key={room}>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <MapPinIcon className="size-4" aria-hidden="true" />
                {room}
                <span className="text-xs font-normal text-gray-500">
                  {list.filter((d) => (d.place ?? "No room") === room).length}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list
                  .filter((d) => (d.place ?? "No room") === room)
                  .map((d) => (
                    <DeviceTile key={d.id} d={d} />
                  ))}
              </div>
            </div>
          ))
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((d) => (
              <DeviceTile key={d.id} d={d} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
