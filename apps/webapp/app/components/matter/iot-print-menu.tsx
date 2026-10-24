/**
 * Print, for an IoT asset (fork): its devices' Matter labels (all, only those
 * not printed yet, or chosen ones) or its usual asset label. On tiles, the
 * list and the Advanced view, in place of the single print button.
 */
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { PrinterIcon } from "lucide-react";
import { useFetcher } from "react-router";
import { Button } from "~/components/shared/button";
import { useCustomisations } from "~/modules/customisation/use-customisations";
import { isFormProcessing } from "~/utils/form";

type Device = {
  id: string;
  number: number;
  place: string | null;
  labelPrintedAt: string | null;
};

export function IotPrintMenu({ assetId }: { assetId: string }) {
  const { labelsEnabled } = useCustomisations();
  const print = useFetcher();
  const list = useFetcher<{ devices: Device[] }>();
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  if (!labelsEnabled) return null;
  const matter = (fields: Record<string, string | string[]>) => {
    const form = new FormData();
    form.append("assetIds", assetId);
    for (const [k, v] of Object.entries(fields))
      for (const x of Array.isArray(v) ? v : [v]) form.append(k, x);
    void print.submit(form, { method: "post", action: "/api/matter/print" });
    setOpen(false);
    setChoosing(false);
  };
  const item =
    "flex w-full flex-col rounded px-2.5 py-2 text-left hover:bg-gray-50";
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setChoosing(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="p-2"
          aria-label="Print labels"
          tooltip="Print labels"
          disabled={isFormProcessing(print.state)}
        >
          <PrinterIcon className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="z-[60] w-72 rounded-md border border-gray-200 bg-white p-1.5 shadow-lg"
        >
          {choosing ? (
            <div className="flex flex-col gap-1 p-1">
              <div className="px-1.5 pb-1 text-xs font-medium text-gray-500">
                Which devices?
              </div>
              {(list.data?.devices ?? []).map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-2 rounded p-1.5 text-sm text-gray-900 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={chosen.includes(d.id)}
                    onChange={() =>
                      setChosen(
                        chosen.includes(d.id)
                          ? chosen.filter((x) => x !== d.id)
                          : [...chosen, d.id]
                      )
                    }
                  />
                  Device {d.number}
                  {d.place ? (
                    <span className="truncate text-gray-500">{d.place}</span>
                  ) : null}
                  {d.labelPrintedAt ? null : (
                    <span className="ml-auto text-xs text-warning-700">
                      No label yet
                    </span>
                  )}
                </label>
              ))}
              {list.state !== "idle" ? (
                <span className="px-1.5 text-xs text-gray-400">Loading…</span>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={!chosen.length}
                onClick={() => matter({ deviceIds: chosen })}
              >
                Print {chosen.length || ""}{" "}
                {chosen.length === 1 ? "label" : "labels"}
              </Button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={item}
                onClick={() => matter({ which: "all" })}
              >
                <span className="text-sm font-medium text-gray-900">
                  Matter labels: every device
                </span>
                <span className="text-xs text-gray-500">
                  One label per device
                </span>
              </button>
              <button
                type="button"
                className={item}
                onClick={() => matter({ which: "missing" })}
              >
                <span className="text-sm font-medium text-gray-900">
                  Matter labels: only those not printed
                </span>
                <span className="text-xs text-gray-500">
                  Devices without a label yet
                </span>
              </button>
              <button
                type="button"
                className={item}
                onClick={() => {
                  setChoosing(true);
                  setChosen([]);
                  void list.load(`/api/assets/${assetId}/matter`);
                }}
              >
                <span className="text-sm font-medium text-gray-900">
                  Matter labels: choose devices…
                </span>
                <span className="text-xs text-gray-500">
                  Tick the ones you want
                </span>
              </button>
              <button
                type="button"
                className={`${item} border-t border-gray-100`}
                onClick={() => {
                  void print.submit(
                    {
                      "assetIds[0]": assetId,
                      intent: "print",
                      source: "asset",
                    },
                    { method: "post", action: "/api/labels/print" }
                  );
                  setOpen(false);
                }}
              >
                <span className="text-sm font-medium text-gray-900">
                  Asset label
                </span>
                <span className="text-xs text-gray-500">
                  The usual Shelf label, if you want one too
                </span>
              </button>
            </>
          )}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
