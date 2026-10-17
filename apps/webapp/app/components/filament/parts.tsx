/**
 * Filament (fork): the pieces the Filament page and a filament's own page
 * share: the picture, swatch and remaining bar, the spool form, a spool's row.
 */
import { useId, useState } from "react";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import {
  BAMBU_TYPES,
  catalogueEntry,
  coloursFor,
  filamentKey,
  type FilamentMatch,
  type KnownCode,
  PACKAGING,
  type Packaging,
  remainingTone,
  searchFilaments,
  SPOOL_WEIGHTS,
} from "~/modules/filament/catalogue";
import { formatCurrency } from "~/utils/currency";
import { tw } from "~/utils/tw";

export type Result = { error?: { message: string } | null; message?: string };

/** Each filament's picture status, by filament key. */
export type Images = Record<
  string,
  {
    status: string;
    message?: string | null;
    productUrl?: string | null;
    filamentCode?: string | null;
  }
>;

/** What a spool row needs. */
export type SpoolRow = {
  id: string;
  type: string;
  colourName: string;
  colourHex: string;
  weightGrams: number;
  remainingPercent: number;
  pricePaid: number | null;
  purchasedOn: string | Date | null;
  amsSlot: number | null;
  notes: string | null;
  filamentCode: string | null;
  spoolWeightGrams: number | null;
  status: string;
  retiredAt?: string | Date | null;
};

export const inputClass =
  "w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100";

/** A dropdown: the same, with room on the right for its arrow. */
export const selectClass = `${inputClass} pr-8`;

export function useMoney() {
  const organization = useCurrentOrganization();
  const currency = organization?.currency ?? "GBP";
  return (n: number) => formatCurrency({ value: n, currency, locale: "en-GB" });
}

/** The colour of the filament, as a round swatch. */
export function Swatch({
  hex,
  size = "size-6",
}: {
  hex: string;
  size?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={tw(
        "inline-block shrink-0 rounded-full ring-1 ring-black/10",
        size
      )}
      style={{ background: hex }}
    />
  );
}

/** The filament's picture from the Bambu store, or its colour swatch. */
export function FilamentPicture({
  type,
  colourName,
  colourHex,
  images,
  size = "size-12",
}: {
  type: string;
  colourName: string;
  colourHex: string;
  images: Images;
  size?: string;
}) {
  const key = filamentKey(type, colourName);
  if (images[key]?.status !== "found") {
    return (
      <span
        className={tw(
          "flex shrink-0 items-center justify-center rounded-md bg-gray-50",
          size
        )}
      >
        <Swatch hex={colourHex} size="size-1/2" />
      </span>
    );
  }
  return (
    <span
      className={tw(
        "relative inline-block shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-gray-200",
        size
      )}
    >
      <img
        src={`/api/filament/image/${encodeURIComponent(key)}`}
        alt={`${colourName} ${type}`}
        className="size-full object-contain"
        loading="lazy"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0.5 right-0.5 size-2.5 rounded-full ring-1 ring-white"
        style={{ background: colourHex }}
      />
    </span>
  );
}

export function RemainingBar({ percent }: { percent: number }) {
  const tone = remainingTone(percent);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-100" role="presentation">
        <div
          className={tw(
            "h-2 rounded-full",
            tone === "low" || tone === "empty"
              ? "bg-error-500"
              : tone === "full"
              ? "bg-success-500"
              : "bg-primary-500"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-10 text-right text-sm tabular-nums text-gray-700">
        {percent}%
      </span>
    </div>
  );
}

export type Initial = Partial<{
  packaging: string;
  quantity: number;
  type: string;
  colourName: string;
  colourHex: string;
  weightGrams: number;
  remainingPercent: number | null;
  pricePaid: number | null;
  purchasedOn: string | Date | null;
  amsSlot: number | null;
  notes: string | null;
  filamentCode: string | null;
  spoolWeightGrams: number | null;
}>;

export const OTHER = "__other";

/**
 * The fields of a spool, shared by adding, editing and approving. The line is
 * picked first, then one of Bambu's colours for it (or another, by hand).
 */
/**
 * Find a filament by typing a line, a colour (Bambu's name or a plain word
 * like "black") or the code on the box. Arrow keys and Enter work too.
 */
export function FilamentSearch({
  codes,
  onPick,
}: {
  codes: KnownCode[];
  onPick: (match: FilamentMatch) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = searchFilaments(query, codes);
  const pick = (m: FilamentMatch) => {
    onPick(m);
    setQuery("");
    setOpen(false);
  };
  return (
    <div className="relative">
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Find a filament
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault(); // pick, don't submit the form
              pick(hits[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={
            'Type a line, colour or code: "matte black", "jade", "10100"'
          }
          role="combobox"
          aria-controls={listId}
          aria-expanded={open && hits.length > 0}
          aria-autocomplete="list"
          autoComplete="off"
          className={inputClass}
        />
      </label>
      {open && query.trim() ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">
              No match. Choose the line and colour below.
            </li>
          ) : (
            hits.map((h, i) => (
              <li
                key={`${h.type}|${h.colourName}`}
                role="option"
                aria-selected={i === active}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(h)}
                  className={tw(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50",
                    i === active ? "bg-gray-50" : ""
                  )}
                >
                  <Swatch hex={h.colourHex} size="size-4" />
                  <span className="flex-1 truncate">
                    {h.colourName}{" "}
                    <span className="text-gray-500">· {h.type}</span>
                  </span>
                  {h.code ? (
                    <span className="font-mono text-xs text-gray-500">
                      {h.code}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A date that may not be known. Empty, it says "Not known" (browsers would
 * otherwise show a faint today's date, which looks like a real one).
 */
export function DateField({
  name,
  label,
  initial,
  autoFocus = false,
}: {
  name: string;
  label: string;
  initial?: string | Date | null;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(
    initial ? String(initial).slice(0, 10) : ""
  );
  const [focused, setFocused] = useState(autoFocus);
  const blank = !value && !focused;
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
      {label}
      <span className="relative">
        <input
          type="date"
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          className={tw(inputClass, blank ? "text-transparent" : "")}
        />
        {blank ? (
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm font-normal text-gray-400">
            Not known
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** With its spool, or a refill (filament only, for a reusable spool). */
export function PackagingToggle({
  initial = "spool",
  name = "packaging",
}: {
  initial?: string | null;
  name?: string;
}) {
  const [value, setValue] = useState<Packaging>(
    initial === "refill" ? "refill" : "spool"
  );
  return (
    <div className="flex flex-col gap-1 text-sm font-medium text-gray-900">
      <span>Type</span>
      <div
        className="inline-flex w-fit rounded-md border border-gray-300 p-0.5"
        role="radiogroup"
        aria-label="Type: spool or refill"
      >
        {(["spool", "refill"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            onClick={() => setValue(p)}
            className={tw(
              "rounded px-3 py-1 text-sm",
              value === p
                ? "bg-primary-50 font-semibold text-primary-700"
                : "text-gray-700 hover:bg-gray-50"
            )}
          >
            {PACKAGING[p]}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function SpoolFields({
  initial,
  withQuantity = false,
  codes = [],
}: {
  initial?: Initial;
  withQuantity?: boolean;
  /** Codes Shelf knows, so the search can find a filament by its code */
  codes?: KnownCode[];
}) {
  const knownType = BAMBU_TYPES.some(([t]) => t === initial?.type);
  const [type, setType] = useState(
    initial?.type ? (knownType ? initial.type : OTHER) : "PLA Basic"
  );
  const [otherType, setOtherType] = useState(
    knownType ? "" : initial?.type ?? ""
  );
  const line = type === OTHER ? otherType : type;
  const colours = coloursFor(line);
  const knownColour = colours.find(([n]) => n === initial?.colourName);
  const [code, setCode] = useState(initial?.filamentCode ?? "");
  const [colour, setColour] = useState<string>(
    initial?.colourName
      ? knownColour
        ? knownColour[0]
        : OTHER
      : colours[0]?.[0] ?? OTHER
  );
  const [otherName, setOtherName] = useState(
    knownColour ? "" : initial?.colourName ?? ""
  );
  const [otherHex, setOtherHex] = useState(initial?.colourHex ?? "#FFFFFF");
  const picked = colours.find(([n]) => n === colour);
  const colourName = picked ? picked[0] : otherName;
  const colourHex = picked ? picked[1] : otherHex;
  const tare = catalogueEntry(line)?.spoolWeight ?? null;

  const changeType = (next: string) => {
    setType(next);
    const first = coloursFor(next === OTHER ? otherType : next)[0];
    setColour(first ? first[0] : OTHER);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-3">
        <FilamentSearch
          codes={codes}
          onPick={(m) => {
            const known = BAMBU_TYPES.some(([t]) => t === m.type);
            setType(known ? m.type : OTHER);
            if (!known) setOtherType(m.type);
            const inCatalogue = coloursFor(m.type).some(
              ([n]) => n === m.colourName
            );
            setColour(inCatalogue ? m.colourName : OTHER);
            if (!inCatalogue) {
              setOtherName(m.colourName);
              setOtherHex(m.colourHex);
            }
            if (m.code) setCode(m.code);
          }}
        />
      </div>
      <PackagingToggle initial={initial?.packaging} />
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Line
        <select
          value={type}
          onChange={(e) => changeType(e.target.value)}
          className={selectClass}
        >
          {BAMBU_TYPES.map(([t]) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        {type === OTHER ? (
          <input
            value={otherType}
            onChange={(e) => setOtherType(e.target.value)}
            placeholder="e.g. PLA Basic Refill"
            className={inputClass}
          />
        ) : null}
        <input type="hidden" name="type" value={line} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Colour
        <span className="flex items-center gap-2">
          <Swatch hex={colourHex} size="size-8" />
          <select
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            className={selectClass}
          >
            {colours.map(([n]) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={OTHER}>Other colour…</option>
          </select>
        </span>
        {colour === OTHER ? (
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={otherHex}
              onChange={(e) => setOtherHex(e.target.value.toUpperCase())}
              aria-label="Colour"
              className="h-9 w-10 shrink-0 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
            />
            <input
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              placeholder="Colour name"
              className={inputClass}
            />
          </span>
        ) : null}
        <input type="hidden" name="colourName" value={colourName} />
        <input type="hidden" name="colourHex" value={colourHex} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Spool size
        <select
          name="weightGrams"
          defaultValue={String(initial?.weightGrams ?? 1000)}
          className={selectClass}
        >
          {SPOOL_WEIGHTS.map((g) => (
            <option key={g} value={g}>
              {g >= 1000 ? `${g / 1000} kg` : `${g} g`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Left (%)
        <input
          name="remainingPercent"
          type="number"
          min={0}
          max={100}
          defaultValue={initial?.remainingPercent ?? 100}
          className={inputClass}
        />
      </label>
      {withQuantity ? (
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
          How many
          <input
            name="quantity"
            type="number"
            min={1}
            max={20}
            defaultValue={initial?.quantity ?? 1}
            className={inputClass}
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Price paid (each)
        <input
          name="pricePaid"
          type="number"
          min={0}
          step={0.01}
          defaultValue={initial?.pricePaid ?? ""}
          className={inputClass}
        />
      </label>
      <DateField
        name="purchasedOn"
        label="Bought on"
        initial={initial?.purchasedOn}
      />
      {/* the AMS slot is set by the printer, not here; an AMS-found entry keeps its own */}
      <input type="hidden" name="amsSlot" value={initial?.amsSlot ?? ""} />
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Code on the box
        <input
          name="filamentCode"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. 11101"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Empty spool (g)
        <input
          name="spoolWeightGrams"
          type="number"
          min={0}
          defaultValue={initial?.spoolWeightGrams ?? ""}
          placeholder={tare ? String(tare) : "for weighing"}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900 lg:col-span-2">
        Notes
        <input
          name="notes"
          defaultValue={initial?.notes ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );
}

export const barColour = (percent: number) => {
  const tone = remainingTone(percent);
  return tone === "low" || tone === "empty"
    ? "bg-error-500"
    : tone === "full"
    ? "bg-success-500"
    : "bg-primary-500";
};
