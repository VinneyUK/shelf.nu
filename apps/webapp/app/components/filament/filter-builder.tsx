/**
 * The Filament page's filter builder (fork), like Assets' advanced filter: a
 * Filter button (with how many are on), and a pop-up of rows (field,
 * condition, value) to add, change and remove, applied together. The address
 * keeps them, in Assets' form ("material=is:PLA").
 */
import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { FilterIcon, PlusIcon, XIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "~/components/shared/button";
import { useSearchParams } from "~/hooks/search-params";
import {
  FILTER_FIELDS,
  FILTER_NAMES,
  filterParam,
  OP_LABELS,
  STATUS_CHOICES,
  TYPE_CHOICES,
  type ActiveFilter,
  type FilterName,
  type FilterOp,
} from "~/modules/filament/filters";
import { tw } from "~/utils/tw";
import { inputClass, selectClass } from "./parts";

type Choices = { materials: string[]; lines: string[]; colours: string[] };

const field = (name: FilterName) => FILTER_FIELDS.find((f) => f.name === name)!;

export function FilterBuilder({
  active,
  choices,
}: {
  active: ActiveFilter[];
  choices: Choices;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ActiveFilter[]>(active);
  useEffect(() => {
    if (open) setRows(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const unused = FILTER_FIELDS.filter(
    (f) => !rows.some((r) => r.name === f.name)
  );
  const ready = rows.every((r) => r.value.trim() !== "");
  const apply = (next: ActiveFilter[]) => {
    const q = new URLSearchParams(params);
    for (const name of FILTER_NAMES) q.delete(name);
    for (const r of next) q.set(r.name, filterParam(r));
    q.delete("page");
    setOpen(false);
    void navigate(`?${q.toString()}`);
  };
  const change = (i: number, patch: Partial<ActiveFilter>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={tw(
            "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm",
            active.length
              ? "border-primary-300 bg-primary-25 text-primary-700"
              : "border-gray-300 text-gray-600 hover:bg-gray-50"
          )}
        >
          <FilterIcon className="size-4" aria-hidden="true" />
          Filter
          {active.length ? (
            <span className="rounded-full bg-primary-600 px-1.5 text-xs font-semibold text-white">
              {active.length}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="z-[60] w-[min(36rem,calc(100vw-2rem))] rounded-md border border-gray-200 bg-white p-4 shadow-lg"
        >
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">
              No filters. Add one to narrow the list.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => {
                const f = field(r.name);
                return (
                  <div
                    key={r.name}
                    className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.5fr)_auto] items-center gap-2"
                  >
                    <select
                      aria-label="Field"
                      value={r.name}
                      onChange={(e) => {
                        const next = field(e.target.value as FilterName);
                        change(i, {
                          name: next.name,
                          op: next.ops[0],
                          value: next.kind === "boolean" ? "yes" : "",
                        });
                      }}
                      className={selectClass}
                    >
                      <option value={r.name}>{f.label}</option>
                      {unused.map((u) => (
                        <option key={u.name} value={u.name}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Condition"
                      value={r.op}
                      onChange={(e) =>
                        change(i, { op: e.target.value as FilterOp })
                      }
                      className={selectClass}
                      disabled={f.ops.length === 1}
                    >
                      {f.ops.map((o) => (
                        <option key={o} value={o}>
                          {OP_LABELS[o]}
                        </option>
                      ))}
                    </select>
                    <ValueInput
                      name={r.name}
                      op={r.op}
                      value={r.value}
                      choices={choices}
                      onChange={(value) => change(i, { value })}
                    />
                    <button
                      type="button"
                      aria-label={`Remove the ${f.label} filter`}
                      onClick={() =>
                        setRows((rs) => rs.filter((_, j) => j !== i))
                      }
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <XIcon className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              disabled={unused.length === 0}
              onClick={() => {
                const next = unused[0];
                setRows((rs) => [
                  ...rs,
                  {
                    name: next.name,
                    op: next.ops[0],
                    value: next.kind === "boolean" ? "yes" : "",
                  },
                ]);
              }}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline disabled:text-gray-300"
            >
              <PlusIcon className="size-4" aria-hidden="true" />
              Add filter
            </button>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => apply([])}
                disabled={active.length === 0 && rows.length === 0}
              >
                Clear all
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => apply(rows)}
                disabled={!ready}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

/** The value box, the right kind for the field. */
function ValueInput({
  name,
  op,
  value,
  choices,
  onChange,
}: {
  name: FilterName;
  op: FilterOp;
  value: string;
  choices: Choices;
  onChange: (value: string) => void;
}) {
  const f = field(name);
  const list =
    name === "material"
      ? choices.materials.map((m) => ({ value: m, label: m }))
      : name === "line" && op !== "contains"
      ? choices.lines.map((l) => ({ value: l, label: l }))
      : name === "type"
      ? TYPE_CHOICES
      : name === "status"
      ? STATUS_CHOICES
      : name === "offer"
      ? [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]
      : null;
  if (list) {
    return (
      <select
        aria-label="Value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        <option value="">Choose…</option>
        {list.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }
  const listId = name === "colour" ? "filament-colours" : undefined;
  return (
    <span className="flex items-center gap-1.5">
      <input
        aria-label="Value"
        type={
          f.kind === "date"
            ? "date"
            : f.kind === "number" || f.kind === "amount"
            ? "number"
            : "text"
        }
        step={
          f.kind === "amount"
            ? 0.01
            : f.kind === "number" && name === "kgLeft"
            ? 0.1
            : 1
        }
        min={f.kind === "number" || f.kind === "amount" ? 0 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        className={tw(inputClass, "w-full")}
      />
      {listId ? (
        <datalist id={listId}>
          {choices.colours.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      ) : null}
      {name === "left" ? (
        <span className="text-sm text-gray-500">%</span>
      ) : null}
      {name === "kgLeft" ? (
        <span className="text-sm text-gray-500">kg</span>
      ) : null}
    </span>
  );
}
