/**
 * Filament's Advanced view (fork), built like Assets' Advanced: one row per
 * filament, the columns you choose in your order (Columns, top right), the
 * filament's own column staying put when you scroll sideways, a click on a
 * heading to sort by it, and click-to-edit cells for the line, colour and
 * code (for every spool and refill of it), each save confirmed by a pop-up.
 */
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Columns3Icon,
} from "lucide-react";
import { Link, useRevalidator } from "react-router";
import { FilamentIdChip } from "~/components/labels/filament-id-chip";
import { Button } from "~/components/shared/button";
import { useSearchParams } from "~/hooks/search-params";
import {
  ADVANCED_COLUMNS,
  type AdvancedRow,
  type ColumnId,
  columnLabel,
  DEFAULT_COLUMNS,
  FIXED_COLUMN,
} from "~/modules/filament/advanced";
import { tw } from "~/utils/tw";
import { FilamentCell } from "./filament-cell";
import { CodeChip, Swatch, useMoney } from "./parts";

const COOKIE = "filament_adv_cols";

export type AdvancedItem = {
  key: string;
  slug: string;
  colourHex: string;
  fil: { id: string; label: string } | null;
  adv: AdvancedRow;
};

const NUMERIC: ColumnId[] = [
  "spools",
  "refills",
  "left",
  "paidKg",
  "spent",
  "store",
];

export function AdvancedTable({
  items,
  columns,
  sort,
  lineChoices,
}: {
  items: AdvancedItem[];
  columns: ColumnId[];
  sort: { by: ColumnId; dir: "asc" | "desc" } | null;
  lineChoices: string[];
}) {
  const [params] = useSearchParams();
  const sortLink = (id: ColumnId) => {
    const next = new URLSearchParams(params);
    const dir = sort?.by === id && sort.dir === "asc" ? "desc" : "asc";
    next.set("asort", id);
    next.set("adir", dir);
    next.delete("page");
    return `?${next.toString()}`;
  };
  const head =
    "whitespace-nowrap border-b border-gray-200 bg-gray-25 px-3 py-2 text-left text-xs font-medium text-gray-600";
  const cell = "whitespace-nowrap border-b border-gray-100 px-3 py-2 text-sm";
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full">
        <thead>
          <tr>
            {columns.map((id) => (
              <th
                key={id}
                className={tw(
                  head,
                  NUMERIC.includes(id) && "text-right",
                  id === FIXED_COLUMN && "sticky left-0 z-10"
                )}
              >
                <Link
                  to={sortLink(id)}
                  className="inline-flex items-center gap-1 hover:text-gray-900"
                  title={`Sort by ${columnLabel(id)}`}
                >
                  {columnLabel(id)}
                  {sort?.by === id ? (
                    sort.dir === "asc" ? (
                      <ArrowUpIcon className="size-3" aria-label="up" />
                    ) : (
                      <ArrowDownIcon className="size-3" aria-label="down" />
                    )
                  ) : null}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key} className="group hover:bg-gray-25">
              {columns.map((id) => (
                <td
                  key={id}
                  className={tw(
                    cell,
                    NUMERIC.includes(id) && "text-right tabular-nums",
                    id === FIXED_COLUMN &&
                      "sticky left-0 z-[1] bg-white group-hover:bg-gray-25"
                  )}
                >
                  <AdvancedCell id={id} item={item} lineChoices={lineChoices} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdvancedCell({
  id,
  item,
  lineChoices,
}: {
  id: ColumnId;
  item: AdvancedItem;
  lineChoices: string[];
}) {
  const money = useMoney();
  const r = item.adv;
  const none = <span className="text-gray-400">—</span>;
  switch (id) {
    case "colour":
      return (
        <span className="flex items-center gap-2">
          <Link to={`/filament/${item.slug}`} aria-label={`Open ${r.colour}`}>
            <Swatch hex={item.colourHex} size="size-4" />
          </Link>
          <FilamentCell
            id={item.slug}
            intent="filament-name"
            field="colourName"
            label="Colour"
            editor={{ kind: "text", value: r.colour }}
            className="font-medium text-gray-900"
          >
            {r.colour}
          </FilamentCell>
        </span>
      );
    case "line":
      return (
        <FilamentCell
          id={item.slug}
          intent="filament-name"
          field="type"
          label="Line"
          editor={{
            kind: "select",
            value: r.line,
            options: [
              ...(lineChoices.includes(r.line) ? [] : [r.line]),
              ...lineChoices,
            ].map((t) => ({ value: t, label: t })),
          }}
        >
          {r.line}
        </FilamentCell>
      );
    case "code":
      return (
        <FilamentCell
          id={item.slug}
          intent="filament-field"
          field="filamentCode"
          label="Code on the box"
          editor={{
            kind: "text",
            value: r.code ?? "",
            placeholder: "e.g. 10100",
          }}
        >
          {r.code ? <CodeChip code={r.code} /> : none}
        </FilamentCell>
      );
    case "fil":
      return item.fil ? <FilamentIdChip fil={item.fil} /> : none;
    case "material":
      return <>{r.material || none}</>;
    case "spools":
      return <>{r.spools || none}</>;
    case "refills":
      return <>{r.refills || none}</>;
    case "left":
      return <>{(r.left / 1000).toFixed(2)} kg</>;
    case "paidKg":
      return r.paidKg !== null ? <>{money(r.paidKg)}</> : none;
    case "spent":
      return r.spent !== null ? <>{money(r.spent)}</> : none;
    case "store":
      return r.store !== null ? <>{money(r.store)}</> : none;
    case "ams":
      return r.ams.length ? (
        <span className="flex gap-1">
          {r.ams.map((n) => (
            <span
              key={n}
              className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700"
            >
              AMS {n}
            </span>
          ))}
        </span>
      ) : (
        none
      );
    case "bought":
      return r.bought ? (
        <>
          {new Date(r.bought).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </>
      ) : (
        none
      );
  }
}

/** Choose and order the Advanced view's columns; kept in a cookie. */
export function AdvancedColumns({ columns }: { columns: ColumnId[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ColumnId[]>(columns);
  const revalidator = useRevalidator();
  const save = (next: ColumnId[]) => {
    document.cookie = `${COOKIE}=${encodeURIComponent(
      next.join(",")
    )}; Path=/; Max-Age=31536000; SameSite=Lax`;
    void revalidator.revalidate();
  };
  const move = (id: ColumnId, by: -1 | 1) => {
    const at = draft.indexOf(id);
    const to = at + by;
    if (at < 1 || to < 1 || to >= draft.length) return;
    const next = [...draft];
    [next[at], next[to]] = [next[to], next[at]];
    setDraft(next);
  };
  const toggle = (id: ColumnId) =>
    setDraft((d) => (d.includes(id) ? d.filter((c) => c !== id) : [...d, id]));
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(columns);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" className="h-[34px]">
          <span className="inline-flex items-center gap-1.5">
            <Columns3Icon className="size-4" aria-hidden="true" />
            Columns
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="z-[60] w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg"
        >
          <p className="mb-2 text-sm font-medium text-gray-900">Columns</p>
          <ul className="flex flex-col gap-1">
            {[
              ...draft,
              ...ADVANCED_COLUMNS.map((c) => c.id).filter(
                (c) => !draft.includes(c)
              ),
            ].map((id) => {
              const on = draft.includes(id);
              const fixed = id === FIXED_COLUMN;
              return (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <label className="flex flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={fixed}
                      onChange={() => toggle(id)}
                    />
                    {columnLabel(id)}
                  </label>
                  {on && !fixed ? (
                    <span className="flex">
                      <button
                        type="button"
                        className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                        aria-label={`Move ${columnLabel(id)} left`}
                        onClick={() => move(id, -1)}
                      >
                        <ChevronUpIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                        aria-label={`Move ${columnLabel(id)} right`}
                        onClick={() => move(id, 1)}
                      >
                        <ChevronDownIcon className="size-4" />
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDraft(DEFAULT_COLUMNS)}
            >
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                save(draft);
                setOpen(false);
              }}
            >
              Show these
            </Button>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
