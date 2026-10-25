/**
 * The asset form's IoT panel (fork): shown when the category is IoT. What
 * its devices are (type) and how they connect (protocol); saved as the
 * asset's tags too.
 */
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { DEVICE_TYPES, PROTOCOLS } from "~/modules/iot/catalogue";
import { tw } from "~/utils/tw";
import { DeviceTypeIcon, ProtocolBadge } from "./icons";

export function IotPanel({
  categoryId,
  iotType,
  iotProtocol,
}: {
  categoryId: string | null | undefined;
  iotType?: string | null;
  iotProtocol?: string | null;
}) {
  const check = useFetcher<{ isIot?: boolean }>();
  const [type, setType] = useState(iotType ?? "");
  const [protocol, setProtocol] = useState(iotProtocol ?? "");
  useEffect(() => {
    if (categoryId)
      void check.load(`/api/iot/category?id=${encodeURIComponent(categoryId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);
  if (!categoryId || !check.data?.isIot) return null;
  return (
    <div className="my-3 rounded-xl border border-primary-200 bg-primary-25 p-4">
      <input type="hidden" name="iotType" value={type} />
      <input type="hidden" name="iotProtocol" value={protocol} />
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-text-md font-semibold text-gray-900">IoT</span>
        <span className="text-xs text-gray-600">
          Every device in this asset is this.
        </span>
      </div>
      <div className="mt-3 text-xs font-medium text-gray-600">
        What are they?
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {DEVICE_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setType(t.id)}
            className={tw(
              "flex items-center gap-2 rounded-lg border bg-white p-2 text-left text-sm font-medium text-gray-900",
              type === t.id
                ? "border-primary-500 ring-1 ring-primary-500"
                : "border-gray-200"
            )}
          >
            <DeviceTypeIcon type={t.id} size={26} />
            {t.id}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs font-medium text-gray-600">
        How do they connect?
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {PROTOCOLS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              if (
                iotProtocol &&
                p.id !== iotProtocol &&
                !window.confirm(
                  `Its devices so far have ${iotProtocol} details. Change to ${p.id} anyway? Their details are kept.`
                )
              )
                return;
              setProtocol(p.id);
            }}
            className={tw(
              "rounded-full p-0.5",
              protocol === p.id && "ring-2 ring-primary-500"
            )}
            title={p.note}
          >
            <ProtocolBadge protocol={p.id} />
          </button>
        ))}
      </div>
      {type || protocol ? (
        <p className="mt-3 text-xs text-gray-600">
          Saved as its tags too:{" "}
          {[type, protocol].filter(Boolean).join(" and ")}.
        </p>
      ) : null}
    </div>
  );
}
