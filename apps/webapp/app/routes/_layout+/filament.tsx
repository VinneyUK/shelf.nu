/**
 * Filament (fork): Bambu Lab spools. The AMS's four slots, an inbox of spools
 * waiting for approval, spools that have run out (waiting for you to confirm),
 * every spool on hand grouped by filament, and the retired history.
 *
 * Spools are picked from Bambu's catalogue (line, then colour), several can be
 * added at once, what's left can be set by weighing, and each filament's
 * picture comes from the Bambu store.
 */
import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { z } from "zod";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import {
  AMS_SLOTS,
  BAMBU_TYPES,
  catalogueEntry,
  coloursFor,
  costPerKg,
  filamentKey,
  gramsLeft,
  groupSpools,
  remainingTone,
  SPOOL_WEIGHTS,
  summarise,
} from "~/modules/filament/catalogue";
import {
  fetchMissingImages,
  imageStatuses,
} from "~/modules/filament/images.server";
import {
  approveCandidate,
  createSpools,
  deleteSpool,
  dismissCandidate,
  getFilament,
  keepSpool,
  retireSpool,
  updateSpool,
  weighSpool,
} from "~/modules/filament/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { formatCurrency } from "~/utils/currency";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";

export const handle = { breadcrumb: () => "Filament" };

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    const [{ spools, candidates }, images] = await Promise.all([
      getFilament(organizationId),
      imageStatuses(organizationId),
    ]);
    return payload({
      header: {
        title: "Filament",
        subHeading:
          "Your Bambu Lab spools: what's loaded, what's left, what it cost.",
      },
      spools,
      candidates,
      images,
      summary: summarise(spools),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

const optionalNumber = z
  .string()
  .default("")
  .transform((v) => (v.trim() === "" ? null : Number(v)));

const SpoolForm = z.object({
  type: z.string().trim().min(1, "Choose the filament type."),
  colourName: z.string().trim().min(1, "Give the colour a name."),
  colourHex: z.string(),
  weightGrams: z.coerce.number(),
  remainingPercent: z.coerce.number(),
  pricePaid: optionalNumber,
  purchasedOn: z
    .string()
    .default("")
    .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
  amsSlot: optionalNumber,
  notes: z
    .string()
    .default("")
    .transform((v) => v || null),
  filamentCode: z
    .string()
    .default("")
    .transform((v) => v.trim() || null),
  spoolWeightGrams: optionalNumber,
});

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "");
    const id = String(form.get("id") ?? "");

    switch (intent) {
      case "create": {
        const quantity = Number(form.get("quantity") ?? 1);
        const made = await createSpools(
          organizationId,
          parseData(form, SpoolForm),
          quantity
        );
        fetchMissingImages(organizationId); // the picture, in the background
        return payload({
          message:
            made.length === 1 ? "Spool added." : `${made.length} spools added.`,
        });
      }
      case "update":
        await updateSpool(organizationId, id, parseData(form, SpoolForm));
        fetchMissingImages(organizationId);
        return payload({ message: "Saved." });
      case "weigh": {
        const percent = await weighSpool(
          organizationId,
          id,
          Number(form.get("grossGrams") ?? 0)
        );
        return payload({ message: `${percent}% left.` });
      }
      case "fetch-images":
        return payload({
          message: fetchMissingImages(organizationId)
            ? "Getting pictures from the Bambu store in the background. They appear as they arrive; refresh in a minute."
            : "Already getting pictures; refresh in a minute.",
        });
      case "approve":
        await approveCandidate(organizationId, id, parseData(form, SpoolForm));
        fetchMissingImages(organizationId);
        return payload({ message: "Added." });
      case "dismiss":
        await dismissCandidate(organizationId, id);
        return payload({ message: "Dismissed." });
      case "retire":
        await retireSpool(organizationId, id);
        return payload({ message: "Retired." });
      case "keep":
        await keepSpool(
          organizationId,
          id,
          Number(form.get("remainingPercent") ?? 0)
        );
        return payload({ message: "Back in use." });
      case "delete":
        await deleteSpool(organizationId, id);
        return payload({ message: "Deleted." });
      default:
        return payload({ message: "Unknown action." });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

type Result = { error?: { message: string } | null; message?: string };
type PageData = ReturnType<typeof useLoaderData<typeof loader>>;
type SpoolRow = PageData["spools"][number];
type CandidateRow = PageData["candidates"][number];
type Images = PageData["images"];

const inputClass =
  "w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100";

function useMoney() {
  const organization = useCurrentOrganization();
  const currency = organization?.currency ?? "GBP";
  return (n: number) => formatCurrency({ value: n, currency, locale: "en-GB" });
}

/** The colour of the filament, as a round swatch. */
function Swatch({ hex, size = "size-6" }: { hex: string; size?: string }) {
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
function FilamentPicture({
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
        "relative shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-gray-200",
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

function RemainingBar({ percent }: { percent: number }) {
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

function ResultLine({
  fetcher,
}: {
  fetcher: { state: string; data?: Result };
}) {
  if (fetcher.state !== "idle" || !fetcher.data) return null;
  const bad = Boolean(fetcher.data.error);
  return (
    <p
      role={bad ? "alert" : "status"}
      className={tw("text-sm", bad ? "text-error-600" : "text-gray-600")}
    >
      {fetcher.data.error?.message ?? fetcher.data.message}
    </p>
  );
}

type Initial = Partial<{
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

const OTHER = "__other";

/**
 * The fields of a spool, shared by adding, editing and approving. The line is
 * picked first, then one of Bambu's colours for it (or another, by hand).
 */
function SpoolFields({
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
          className={inputClass}
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
            className={inputClass}
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
          className={inputClass}
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
            defaultValue={1}
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
          className={inputClass}
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

function AddSpool() {
  const fetcher = useFetcher<Result>();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) {
      setOpen(false);
      setKey((k) => k + 1);
    }
  }, [fetcher.state, fetcher.data]);
  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Add spools
      </Button>
    );
  }
  return (
    <Card className="my-0 w-full">
      <fetcher.Form method="post" className="flex flex-col gap-4" key={key}>
        <input type="hidden" name="intent" value="create" />
        <h3 className="text-text-md font-semibold text-gray-900">Add spools</h3>
        <SpoolFields withQuantity />
        <div className="flex items-center justify-end gap-3">
          <ResultLine fetcher={fetcher} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isFormProcessing(fetcher.state)}>
            Add
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}

function GetPictures({
  images,
  spools,
}: {
  images: Images;
  spools: SpoolRow[];
}) {
  const fetcher = useFetcher<Result>();
  const keys = new Set(
    spools
      .filter((s) => s.status !== "retired")
      .map((s) => filamentKey(s.type, s.colourName))
  );
  const missing = [...keys].filter((k) => images[k]?.status !== "found").length;
  const problem = Object.values(images).find((i) => i.status === "error")
    ?.message;
  if (keys.size === 0) return null;
  return (
    <fetcher.Form method="post" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="intent" value="fetch-images" />
      {missing > 0 ? (
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={isFormProcessing(fetcher.state)}
        >
          Get pictures ({missing})
        </Button>
      ) : null}
      <ResultLine fetcher={fetcher} />
      {!fetcher.data && problem ? (
        <span className="text-xs text-gray-500">Last time: {problem}</span>
      ) : null}
    </fetcher.Form>
  );
}

function AmsPanel({ spools, images }: { spools: SpoolRow[]; images: Images }) {
  return (
    <Card className="my-0">
      <div className="flex items-baseline justify-between">
        <h3 className="text-text-md font-semibold text-gray-900">AMS</h3>
        <span className="text-xs text-gray-500">
          set by hand for now; live from the printer in a later update
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {AMS_SLOTS.map((n) => {
          const s = spools.find(
            (x) => x.amsSlot === n && x.status !== "retired"
          );
          return (
            <div key={n} className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Slot {n}
              </div>
              {s ? (
                <div className="mt-2 flex items-start gap-3">
                  <FilamentPicture {...s} images={images} size="size-14" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {s.colourName}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {s.type}
                    </div>
                    <div className="mt-1.5">
                      <RemainingBar percent={s.remainingPercent} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-400">Empty</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CandidateCard({
  candidate,
  images,
}: {
  candidate: CandidateRow;
  images: Images;
}) {
  const fetcher = useFetcher<Result>();
  const busy = isFormProcessing(fetcher.state);
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
      <fetcher.Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="id" value={candidate.id} />
        <div className="flex items-center gap-3">
          <FilamentPicture {...candidate} images={images} size="size-10" />
          <div>
            <div className="font-semibold text-gray-900">
              {candidate.colourName} · {candidate.type}
            </div>
            <div className="text-xs text-gray-600">
              Found by{" "}
              {candidate.source === "ams"
                ? `the AMS${
                    candidate.amsSlot ? `, slot ${candidate.amsSlot}` : ""
                  }`
                : "a receipt"}
              {candidate.remainingPercent !== null
                ? `, ${candidate.remainingPercent}% left`
                : ""}
              . Check it, then add it.
            </div>
          </div>
        </div>
        <SpoolFields initial={candidate} />
        <div className="flex items-center justify-end gap-2">
          <ResultLine fetcher={fetcher} />
          <Button
            type="submit"
            name="intent"
            value="dismiss"
            variant="secondary"
            size="sm"
            disabled={busy}
            formNoValidate
          >
            Dismiss
          </Button>
          <Button
            type="submit"
            name="intent"
            value="approve"
            size="sm"
            disabled={busy}
          >
            Add spool
          </Button>
        </div>
      </fetcher.Form>
    </div>
  );
}

/** A spool that has reached 0%: confirm it's done, or say how much is left. */
function EmptyCard({ spool, images }: { spool: SpoolRow; images: Images }) {
  const fetcher = useFetcher<Result>();
  const busy = isFormProcessing(fetcher.state);
  return (
    <fetcher.Form
      method="post"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-200 bg-warning-25 p-3"
    >
      <input type="hidden" name="id" value={spool.id} />
      <FilamentPicture {...spool} images={images} size="size-9" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-gray-900">
          {spool.colourName} · {spool.type}
        </div>
        <div className="text-xs text-gray-600">
          Shows 0% left. Is it finished?
        </div>
      </div>
      <ResultLine fetcher={fetcher} />
      <label className="flex items-center gap-1 text-sm text-gray-700">
        Not yet, it has
        <input
          name="remainingPercent"
          type="number"
          min={1}
          max={100}
          defaultValue={5}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        %
      </label>
      <Button
        type="submit"
        name="intent"
        value="keep"
        variant="secondary"
        size="sm"
        disabled={busy}
      >
        Keep using
      </Button>
      <Button
        type="submit"
        name="intent"
        value="retire"
        size="sm"
        disabled={busy}
      >
        Yes, retire it
      </Button>
    </fetcher.Form>
  );
}

/** One spool inside its filament group: remaining, cost, weigh and edit. */
function SpoolRowView({ spool, index }: { spool: SpoolRow; index: number }) {
  const money = useMoney();
  const fetcher = useFetcher<Result>();
  const weigh = useFetcher<Result>();
  const [editing, setEditing] = useState(false);
  const [weighing, setWeighing] = useState(false);
  const busy = isFormProcessing(fetcher.state);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error)
      setEditing(false);
  }, [fetcher.state, fetcher.data]);
  const perKg = costPerKg(spool);
  const tare =
    spool.spoolWeightGrams ?? catalogueEntry(spool.type)?.spoolWeight ?? null;
  return (
    <li className="py-2.5 pl-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-8 font-mono text-xs text-gray-400">
          #{index + 1}
        </span>
        <div className="min-w-28 flex-1 text-xs text-gray-500">
          {spool.amsSlot ? (
            <span className="mr-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
              AMS {spool.amsSlot}
            </span>
          ) : null}
          {spool.filamentCode ? (
            <span className="font-mono">{spool.filamentCode}</span>
          ) : null}
        </div>
        <RemainingBar percent={spool.remainingPercent} />
        <div className="w-20 text-right text-sm tabular-nums text-gray-700">
          {gramsLeft(spool)} g
        </div>
        <div className="w-28 text-right text-sm tabular-nums text-gray-700">
          {spool.pricePaid !== null ? money(spool.pricePaid) : "—"}
          {perKg !== null ? (
            <div className="text-xs text-gray-500">{money(perKg)}/kg</div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setWeighing((v) => !v)}
          >
            Weigh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close" : "Edit"}
          </Button>
        </div>
      </div>
      {weighing ? (
        <weigh.Form
          method="post"
          className="mt-2 flex flex-wrap items-center justify-end gap-2 text-sm"
        >
          <input type="hidden" name="intent" value="weigh" />
          <input type="hidden" name="id" value={spool.id} />
          <label className="flex items-center gap-1 text-gray-700">
            On the scale
            <input
              name="grossGrams"
              type="number"
              min={1}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
              autoFocus
            />
            g
          </label>
          <span className="text-xs text-gray-500">
            {tare
              ? `less the empty spool, ${tare} g`
              : "set the empty spool's weight first (Edit)"}
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={isFormProcessing(weigh.state) || !tare}
          >
            Update
          </Button>
          <ResultLine fetcher={weigh} />
        </weigh.Form>
      ) : null}
      {editing ? (
        <fetcher.Form
          method="post"
          className="mt-3 flex flex-col gap-3 rounded-lg bg-gray-25 p-3"
        >
          <input type="hidden" name="id" value={spool.id} />
          <SpoolFields initial={spool} />
          <div className="flex items-center justify-end gap-2">
            <ResultLine fetcher={fetcher} />
            <Button
              type="submit"
              name="intent"
              value="delete"
              variant="secondary"
              size="sm"
              disabled={busy}
              formNoValidate
              onClick={(e) => {
                if (
                  !window.confirm(
                    "Delete this spool? To keep it in the history instead, set Left to 0% and retire it."
                  )
                )
                  e.preventDefault();
              }}
            >
              Delete
            </Button>
            <Button
              type="submit"
              name="intent"
              value="update"
              size="sm"
              disabled={busy}
            >
              Save
            </Button>
          </div>
        </fetcher.Form>
      ) : null}
    </li>
  );
}

/** A filament (line and colour): its picture, how many spools and how much is left. */
function FilamentGroup({
  group,
  images,
}: {
  group: ReturnType<typeof groupSpools<SpoolRow>>[number];
  images: Images;
}) {
  const productUrl = images[group.key]?.productUrl;
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-4 py-3">
          <FilamentPicture {...group} images={images} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900">
              {group.colourName}
            </div>
            <div className="text-xs text-gray-500">{group.type}</div>
          </div>
          <div className="text-right text-sm">
            <div className="tabular-nums text-gray-900">
              {(group.gramsLeft / 1000).toFixed(2)} kg
            </div>
            <div className="text-xs text-gray-500">
              {group.spools.length} spool{group.spools.length === 1 ? "" : "s"}
            </div>
          </div>
          {productUrl ? (
            <a
              href={productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Store
            </a>
          ) : null}
          <span
            aria-hidden="true"
            className="text-gray-400 transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <ul className="mb-2 divide-y divide-gray-100 rounded-lg bg-gray-25">
          {group.spools.map((s, i) => (
            <SpoolRowView key={s.id} spool={s} index={i} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function RetiredRow({ spool }: { spool: SpoolRow }) {
  const money = useMoney();
  const fetcher = useFetcher<Result>();
  return (
    <li className="flex flex-wrap items-center gap-3 py-2 text-sm">
      <Swatch hex={spool.colourHex} size="size-5" />
      <span className="min-w-40 flex-1 text-gray-700">
        {spool.colourName} · {spool.type}
      </span>
      <span className="text-gray-500">
        {spool.retiredAt ? (
          <>
            finished <DateS date={spool.retiredAt} />
          </>
        ) : null}
      </span>
      <span className="w-20 text-right tabular-nums text-gray-500">
        {spool.pricePaid !== null ? money(spool.pricePaid) : "—"}
      </span>
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={spool.id} />
        <input type="hidden" name="remainingPercent" value={5} />
        <Button
          type="submit"
          name="intent"
          value="keep"
          variant="secondary"
          size="xs"
        >
          Bring back
        </Button>
      </fetcher.Form>
    </li>
  );
}

export default function FilamentPage() {
  const { spools, candidates, summary, images } =
    useLoaderData<typeof loader>();
  const money = useMoney();
  const [search, setSearch] = useState("");
  const active = spools.filter((s) => s.status === "active");
  const empty = spools.filter((s) => s.status === "empty");
  const retired = spools.filter((s) => s.status === "retired");
  const q = search.trim().toLowerCase();
  const shown = q
    ? active.filter((s) =>
        `${s.type} ${s.material} ${s.colourName} ${s.filamentCode ?? ""}`
          .toLowerCase()
          .includes(q)
      )
    : active;
  const groups = groupSpools(shown);
  return (
    <>
      <Header />
      <div className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Spools", String(summary.spools)],
            ["Filament left", `${(summary.gramsLeft / 1000).toFixed(1)} kg`],
            ["Worth", money(summary.valueLeft)],
            ["Spent", money(summary.spent)],
          ].map(([k, v]) => (
            <div
              key={k}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {k}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {v}
              </div>
            </div>
          ))}
        </div>

        <AmsPanel spools={spools} images={images} />

        {candidates.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-text-md font-semibold text-gray-900">
              Waiting for you ({candidates.length})
            </h3>
            {candidates.map((c) => (
              <CandidateCard key={c.id} candidate={c} images={images} />
            ))}
          </div>
        ) : null}

        {empty.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-text-md font-semibold text-gray-900">
              Run out?
            </h3>
            {empty.map((s) => (
              <EmptyCard key={s.id} spool={s} images={images} />
            ))}
          </div>
        ) : null}

        <Card className="my-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-text-md font-semibold text-gray-900">
              Spools ({active.length}) · {groups.length} filament
              {groups.length === 1 ? "" : "s"}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Search, e.g. "matte" or "black"'
                className={tw(inputClass, "w-56")}
                aria-label="Search spools"
              />
              <GetPictures images={images} spools={spools} />
              <AddSpool />
            </div>
          </div>
          {active.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              No spools yet. Add your first with Add spools.
            </p>
          ) : groups.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              Nothing matches "{search}".
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {groups.map((g) => (
                <FilamentGroup key={g.key} group={g} images={images} />
              ))}
            </ul>
          )}
        </Card>

        {retired.length > 0 ? (
          <details className="rounded-lg border border-gray-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">
              Finished spools ({retired.length})
            </summary>
            <ul className="mt-2 divide-y divide-gray-100">
              {retired.map((s) => (
                <RetiredRow key={s.id} spool={s} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
