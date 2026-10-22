/**
 * Usage per print (fork): the pieces a filament's page and the Prints page
 * share: how a print ended, how long it took, when.
 */
import { CheckCircle2Icon, MinusCircleIcon, XCircleIcon } from "lucide-react";
import { tw } from "~/utils/tw";

export type PrintUse = {
  key: string;
  spoolId: string | null;
  slot: number | null;
  grams: number;
  cost: number | null;
};

export type PrintRow = {
  id: string;
  name: string;
  startedAt: string | Date;
  endedAt: string | Date | null;
  status: string;
  uses: PrintUse[];
};

/** How long a print took: "1h 48m", "41m". */
export function took(row: Pick<PrintRow, "startedAt" | "endedAt">) {
  if (!row.endedAt) return "—";
  const mins = Math.max(
    0,
    Math.round(
      (new Date(row.endedAt).getTime() - new Date(row.startedAt).getTime()) /
        60000
    )
  );
  return mins >= 60
    ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`
    : `${mins}m`;
}

/** When a print started: "Today 14:20", "Yesterday 19:05", "18 Oct 2026". */
export function when(startedAt: string | Date, now = new Date()) {
  const d = new Date(startedAt);
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = (x: Date) => x.toDateString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(yesterday)) return `Yesterday ${time}`;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Finished, Failed or Cancelled, as a small badge. */
export function PrintResult({ status }: { status: string }) {
  const [Icon, label, cls] =
    status === "done"
      ? [CheckCircle2Icon, "Finished", "bg-success-50 text-success-700"]
      : status === "failed"
      ? [XCircleIcon, "Failed", "bg-error-50 text-error-700"]
      : [MinusCircleIcon, "Cancelled", "bg-gray-100 text-gray-600"];
  return (
    <span
      className={tw(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        cls
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
