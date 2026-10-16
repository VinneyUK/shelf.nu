/**
 * Filament (fork): the pieces the Filament page and a filament's own page
 * share: the picture, swatch and remaining bar, the spool form, a spool's row.
 */
import { useState } from "react";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import {
  AMS_SLOTS,
  BAMBU_TYPES,
  catalogueEntry,
  coloursFor,
  filamentKey,
  remainingTone,
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
export function SpoolFields({
  initial,
  withQuantity = false,
}: {
  initial?: Initial;
  withQuantity?: boolean;
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
  const purchased = initial?.purchasedOn
    ? String(initial.purchasedOn).slice(0, 10)
    : "";

  const changeType = (next: string) => {
    setType(next);
    const first = coloursFor(next === OTHER ? otherType : next)[0];
    setColour(first ? first[0] : OTHER);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Type
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
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Bought on
        <input
          name="purchasedOn"
          type="date"
          defaultValue={purchased}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        In the AMS
        <select
          name="amsSlot"
          defaultValue={initial?.amsSlot ? String(initial.amsSlot) : ""}
          className={selectClass}
        >
          <option value="">Not loaded</option>
          {AMS_SLOTS.map((n) => (
            <option key={n} value={n}>
              Slot {n}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Code on the box
        <input
          name="filamentCode"
          defaultValue={initial?.filamentCode ?? ""}
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
