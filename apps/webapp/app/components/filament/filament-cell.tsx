/**
 * Click a cell in a filament's table to change it (fork), the same way as
 * Assets' click-to-edit cells: a small editor for that one field, saved
 * straight away (intent "field" on the filament's page), the page refreshing.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { PencilIcon } from "lucide-react";
import { useFetcher } from "react-router";
import { Button } from "~/components/shared/button";
import { tw } from "~/utils/tw";
import { inputClass, selectClass } from "./parts";

export type CellEditor =
  | { kind: "text"; value: string; placeholder?: string }
  | {
      kind: "number";
      value: number | null;
      step?: number;
      min?: number;
      max?: number;
      suffix?: string;
    }
  | { kind: "date"; value: string | Date | null }
  | {
      kind: "select";
      value: string;
      options: { value: string; label: string; disabled?: boolean }[];
    };

export function FilamentCell({
  id,
  field,
  label,
  editor,
  children,
  className,
}: {
  /** The filament item's id */
  id: string;
  field: string;
  /** What the cell is, for the editor's heading and screen readers */
  label: string;
  editor: CellEditor;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ ok?: boolean; error?: { message: string } }>();
  const handled = useRef<unknown>(null);
  useEffect(() => {
    // each save is handled once: close when it worked (the page refreshes itself)
    if (
      fetcher.state !== "idle" ||
      !fetcher.data ||
      handled.current === fetcher.data
    )
      return;
    handled.current = fetcher.data;
    if (fetcher.data.ok) setOpen(false);
  }, [fetcher.state, fetcher.data]);
  const initial =
    editor.kind === "date"
      ? editor.value
        ? String(editor.value).slice(0, 10)
        : ""
      : editor.value === null
      ? ""
      : String(editor.value);
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const busy = fetcher.state !== "idle";
  const save = (v: string) =>
    void fetcher.submit(
      { intent: "field", id, field, value: v },
      { method: "post" }
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Change ${label}`}
          title="Click to change"
          className={tw(
            "group/cell inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200",
            className
          )}
        >
          <span className="min-w-0">{children}</span>
          <PencilIcon
            className="size-3 shrink-0 text-gray-400 opacity-0 group-hover/cell:opacity-100"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="z-[60] w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg"
        >
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save(value);
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              {label}
              {editor.kind === "select" ? (
                <select
                  autoFocus
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    save(e.target.value); // a choice saves at once
                  }}
                  className={selectClass}
                  disabled={busy}
                >
                  {editor.options.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    type={
                      editor.kind === "number"
                        ? "number"
                        : editor.kind === "date"
                        ? "date"
                        : "text"
                    }
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    step={
                      editor.kind === "number" ? editor.step ?? 1 : undefined
                    }
                    min={editor.kind === "number" ? editor.min : undefined}
                    max={editor.kind === "number" ? editor.max : undefined}
                    placeholder={
                      editor.kind === "text" ? editor.placeholder : undefined
                    }
                    className={tw(inputClass, "w-full")}
                  />
                  {editor.kind === "number" && editor.suffix ? (
                    <span className="text-sm font-normal text-gray-500">
                      {editor.suffix}
                    </span>
                  ) : null}
                </span>
              )}
            </label>
            {editor.kind === "date" ? (
              <span className="text-xs text-gray-500">
                Leave it empty if you don't know it.
              </span>
            ) : null}
            {fetcher.data?.error ? (
              <p role="alert" className="text-sm text-error-600">
                {fetcher.data.error.message}
              </p>
            ) : null}
            {editor.kind === "select" ? null : (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  Save
                </Button>
              </div>
            )}
          </form>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
