/**
 * Filament's Advanced view (fork), built like Assets' Advanced: one row per
 * filament, the columns you choose in your order (the columns button, as on
 * Assets), the
 * filament's own column staying put when you scroll sideways, a click on a
 * heading to sort by it, and click-to-edit cells for the line, colour and
 * code (for every spool and refill of it), each save confirmed by a pop-up.
 */
import { useMemo } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Link, useRevalidator } from "react-router";
import { FilamentIdChip } from "~/components/labels/filament-id-chip";
import { ColumnsPicker } from "~/components/list/columns-picker";
import { useSearchParams } from "~/hooks/search-params";
import {
  ADVANCED_COLUMNS,
  type AdvancedRow,
  type ColumnId,
  columnLabel,
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

/**
 * Choose and order the Advanced view's columns, with the same picker as
 * Assets' Advanced view; kept in a cookie.
 */
export function AdvancedColumns({ columns }: { columns: ColumnId[] }) {
  const revalidator = useRevalidator();
  const pickerColumns = useMemo(
    () =>
      [
        ...columns.filter((id) => id !== FIXED_COLUMN),
        ...ADVANCED_COLUMNS.map((c) => c.id).filter(
          (id) => id !== FIXED_COLUMN && !columns.includes(id)
        ),
      ].map((id) => ({
        name: id,
        label: columnLabel(id),
        visible: columns.includes(id),
      })),
    [columns]
  );
  return (
    <ColumnsPicker
      fixedLabel={columnLabel(FIXED_COLUMN)}
      columns={pickerColumns}
      onApply={(picked) => {
        const shown = picked.filter((c) => c.visible).map((c) => c.name);
        document.cookie = `${COOKIE}=${encodeURIComponent(
          [FIXED_COLUMN, ...shown].join(",")
        )}; Path=/; Max-Age=31536000; SameSite=Lax`;
        void revalidator.revalidate();
      }}
    />
  );
}
