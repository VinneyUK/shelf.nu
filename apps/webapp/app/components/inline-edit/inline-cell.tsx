/**
 * Click a cell to edit it, in any list. Wraps the cell's normal content; a
 * click opens a small editor for that one field, which saves straight away
 * through /api/assets/inline-edit (Shelf's own updateAsset underneath, so
 * the asset's history records it).
 *
 * Part of the inline editing feature; not in upstream Shelf.
 */
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { PencilIcon } from "lucide-react";
import { useFetcher, useRevalidator } from "react-router";
import { Button } from "~/components/shared/button";
import { salesLookup } from "~/components/sold/use-sale";
import { useCustomisations } from "~/modules/customisation/use-customisations";
import { tw } from "~/utils/tw";

export const INLINE_EDIT_URL = "/api/assets/inline-edit";

type Option = { id: string; name: string };
type Lists = {
  categories: Option[];
  tags: Option[];
  locations: Option[];
  boxes: Option[];
};

export type InlineField =
  | { field: "description"; value: string }
  | { field: "valuation"; value: number | null }
  | { field: "quantity"; value: number | null }
  | { field: "category"; value: string | null }
  | { field: "tags"; value: string[] }
  | { field: "location"; value: string | null }
  | { field: "box"; value: string | null }
  | { field: "status"; value: "AVAILABLE" | "SOLD" | "OTHER" }
  | { field: "soldPrice"; value: number | null };

/** One module-wide cache of the pick-lists, loaded on first use. */
let listsCache: Lists | null = null;

export function InlineCell({
  assetId,
  current,
  children,
  className,
  /** Not editable (e.g. a quantity asset's location, managed by placements) */
  disabled = false,
}: {
  assetId: string;
  current: InlineField;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{
    success?: boolean;
    error?: { message: string };
  }>();
  const listsFetcher = useFetcher<Lists>();
  const revalidator = useRevalidator();
  const [lists, setLists] = useState<Lists | null>(listsCache);
  const needsLists = ["category", "tags", "location", "box"].includes(
    current.field
  );

  useEffect(() => {
    if (
      open &&
      needsLists &&
      !lists &&
      listsFetcher.state === "idle" &&
      !listsFetcher.data
    ) {
      void listsFetcher.load(INLINE_EDIT_URL);
    }
  }, [open, needsLists, lists, listsFetcher]);
  useEffect(() => {
    if (listsFetcher.data && "categories" in listsFetcher.data) {
      listsCache = listsFetcher.data;
      setLists(listsFetcher.data);
    }
  }, [listsFetcher.data]);
  // Each save result is handled once. (Listing `revalidator` as a dependency
  // re-ran this after every reload it caused, which reloaded again, forever.)
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.success) return;
    if (handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    setOpen(false);
    void salesLookup.refresh();
    void revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revalidator changes identity on every reload
  }, [fetcher.state, fetcher.data]);

  const save = (values: Record<string, string>) =>
    void fetcher.submit(
      { assetId, field: current.field, ...values },
      { method: "post", action: INLINE_EDIT_URL }
    );
  const busy = fetcher.state !== "idle";
  const errorMessage = fetcher.data?.error?.message;

  if (disabled) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={tw(
            "group/inline inline-flex max-w-full items-center gap-1 rounded text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200",
            className
          )}
          title="Click to edit"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="min-w-0">{children}</span>
          <PencilIcon className="size-3 shrink-0 text-gray-400 opacity-0 group-hover/inline:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="z-[60] w-72 rounded-md border border-gray-200 bg-white p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {needsLists && !lists ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <Editor
              current={current}
              lists={lists}
              busy={busy}
              onSave={save}
              onCancel={() => setOpen(false)}
            />
          )}
          {errorMessage ? (
            <p role="alert" className="mt-2 text-sm text-error-600">
              {errorMessage}
            </p>
          ) : null}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

function Editor({
  current,
  lists,
  busy,
  onSave,
  onCancel,
}: {
  current: InlineField;
  lists: Lists | null;
  busy: boolean;
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const { bookingsEnabled } = useCustomisations();
  const [text, setText] = useState(() => {
    if (current.field === "tags") return current.value.join(",");
    if (current.field === "status")
      return current.value === "SOLD" ? "SOLD" : "AVAILABLE";
    return current.value === null ? "" : String(current.value);
  });
  const [soldOn, setSoldOn] = useState(new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState("");
  const first = useRef<HTMLElement | null>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (
      current.field === "status" &&
      text === "SOLD" &&
      current.value !== "SOLD"
    ) {
      onSave({ value: "SOLD", soldOn, price });
    } else {
      onSave({ value: text });
    }
  };
  const buttons = (
    <div className="mt-3 flex justify-end gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onCancel}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
  const selectClass =
    "w-full rounded border border-gray-300 px-2 py-1.5 text-sm";

  switch (current.field) {
    case "description":
      return (
        <form onSubmit={submit}>
          <textarea
            ref={(el) => {
              first.current = el;
            }}
            className={tw(selectClass, "min-h-24")}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          {buttons}
        </form>
      );
    case "valuation":
    case "soldPrice":
    case "quantity":
      return (
        <form onSubmit={submit}>
          <label className="text-sm text-gray-600">
            {current.field === "quantity"
              ? "Quantity"
              : current.field === "soldPrice"
              ? "Sold for"
              : "Value"}
          </label>
          <input
            ref={(el) => {
              first.current = el;
            }}
            type="number"
            min={0}
            step={current.field === "quantity" ? 1 : 0.01}
            className={selectClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {buttons}
        </form>
      );
    case "category":
    case "location":
    case "box": {
      const options =
        current.field === "category"
          ? lists?.categories
          : current.field === "location"
          ? lists?.locations
          : lists?.boxes;
      const none =
        current.field === "category"
          ? "Uncategorized"
          : current.field === "location"
          ? "No location"
          : "Not in a box";
      return (
        <form onSubmit={submit}>
          <select
            ref={(el) => {
              first.current = el;
            }}
            className={selectClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
          >
            <option value="">{none}</option>
            {(options ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {buttons}
        </form>
      );
    }
    case "tags": {
      const chosen = new Set(text.split(",").filter(Boolean));
      return (
        <form onSubmit={submit}>
          <div className="max-h-56 overflow-auto">
            {(lists?.tags ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No tags yet.</p>
            ) : null}
            {(lists?.tags ?? []).map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={chosen.has(t.id)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(t.id);
                    else next.delete(t.id);
                    setText([...next].join(","));
                  }}
                />
                {t.name}
              </label>
            ))}
          </div>
          {buttons}
        </form>
      );
    }
    case "status":
      return (
        <form onSubmit={submit}>
          <select
            ref={(el) => {
              first.current = el;
            }}
            className={selectClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
          >
            <option value="AVAILABLE">Available</option>
            <option value="SOLD">Sold</option>
          </select>
          {text === "SOLD" && current.value !== "SOLD" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm text-gray-600">
                Date sold
                <input
                  type="date"
                  className={selectClass}
                  value={soldOn}
                  onChange={(e) => setSoldOn(e.target.value)}
                />
              </label>
              <label className="text-sm text-gray-600">
                Price
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={selectClass}
                  value={price}
                  placeholder="Optional"
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
            </div>
          ) : null}
          {current.value === "OTHER" && bookingsEnabled ? (
            <p className="mt-2 text-xs text-gray-500">
              This asset is checked out or in custody; that is changed from its
              page.
            </p>
          ) : null}
          {buttons}
        </form>
      );
  }
}
