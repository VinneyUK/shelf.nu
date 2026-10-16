/**
 * Filament (fork): one filament's own page, like Spoolman's. Its picture and
 * name; its spools (weigh, edit, retire, bring back, delete); its specs, edited
 * once for every spool; Bambu's catalogue facts; and Add spools of this.
 */
import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, Link, redirect, useFetcher, useLoaderData } from "react-router";
import { z } from "zod";
import { ErrorContent } from "~/components/errors";
import {
  barColour,
  FilamentPicture,
  inputClass,
  OTHER,
  ResultLine,
  Swatch,
  useMoney,
  type Images,
  type Result,
  selectClass,
} from "~/components/filament/parts";
import { ChevronRight } from "~/components/icons/library";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import { useSearchParams } from "~/hooks/search-params";
import {
  AMS_SLOTS,
  BAMBU_TYPES,
  catalogueEntry,
  coloursFor,
  costPerKg,
  filamentKey,
  gramsLeft,
  SPOOL_WEIGHTS,
} from "~/modules/filament/catalogue";
import {
  fetchMissingImages,
  imageStatuses,
} from "~/modules/filament/images.server";
import { priceSummary } from "~/modules/filament/prices";
import {
  priceStatuses,
  refreshPrice,
  refreshStalePrices,
} from "~/modules/filament/prices.server";
import {
  createSpools,
  deleteSpool,
  getFilamentBySlug,
  keepSpool,
  retireSpool,
  updateFilament,
  updateSpoolDetails,
  weighSpool,
} from "~/modules/filament/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError, ShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    const slug = String(params.slug ?? "");
    const spools = await getFilamentBySlug(organizationId, slug);
    if (spools.length === 0) {
      throw new ShelfError({
        cause: null,
        message: "That filament isn't in your spools.",
        status: 404,
        label: "Assets",
      });
    }
    const first = spools[0];
    const [images, prices] = await Promise.all([
      imageStatuses(organizationId),
      priceStatuses(organizationId),
    ]);
    refreshStalePrices(organizationId); // anything over a day old, in the background
    const entry = catalogueEntry(first.type);
    return payload({
      header: { title: first.colourName },
      slug,
      filament: {
        type: first.type,
        material: first.material,
        colourName: first.colourName,
        colourHex: first.colourHex,
        filamentCode: spools.find((s) => s.filamentCode)?.filamentCode ?? null,
        weightGrams: first.weightGrams,
        spoolWeightGrams: first.spoolWeightGrams,
        key: filamentKey(first.type, first.colourName),
      },
      catalogue: entry
        ? {
            density: entry.density,
            nozzleTemp: entry.nozzleTemp,
            bedTemp: entry.bedTemp,
            spoolWeight: entry.spoolWeight,
          }
        : null,
      spools,
      images,
      price: prices[filamentKey(first.type, first.colourName)] ?? null,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const handle = {
  // "Filament > Hot Pink": Shelf's "single" crumb only knows assets, boxes and places
  breadcrumb: (match: { data?: { header?: { title?: string } } }) => (
    <span className="flex items-center gap-2">
      <Link to="/filament" className="text-gray-600 hover:text-gray-900">
        Filament
      </Link>
      <ChevronRight className="size-4 text-gray-400" aria-hidden="true" />
      <span className="single-crumb">
        {match?.data?.header?.title ?? "Filament"}
      </span>
    </span>
  ),
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

const optionalNumber = z
  .string()
  .default("")
  .transform((v) => (v.trim() === "" ? null : Number(v)));
const optionalDate = z
  .string()
  .default("")
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null));
const optionalText = z
  .string()
  .default("")
  .transform((v) => v.trim() || null);

const FilamentForm = z.object({
  type: z.string().trim().min(1, "Choose the filament type."),
  colourName: z.string().trim().min(1, "Give the colour a name."),
  colourHex: z.string(),
  filamentCode: optionalText,
  weightGrams: z.coerce.number(),
  spoolWeightGrams: optionalNumber,
});

const SpoolDetailsForm = z.object({
  remainingPercent: z.coerce.number(),
  pricePaid: optionalNumber,
  purchasedOn: optionalDate,
  amsSlot: optionalNumber,
  notes: optionalText,
});

const AddForm = z.object({
  quantity: z.coerce.number().default(1),
  remainingPercent: z.coerce.number().default(100),
  pricePaid: optionalNumber,
  purchasedOn: optionalDate,
  amsSlot: optionalNumber,
});

export async function action({ context, request, params }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const slug = String(params.slug ?? "");
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "");
    const id = String(form.get("id") ?? "");

    switch (intent) {
      case "filament": {
        const next = await updateFilament(
          organizationId,
          slug,
          parseData(form, FilamentForm)
        );
        fetchMissingImages(organizationId);
        return next === slug
          ? payload({ message: "Saved for every spool." })
          : redirect(`/filament/${next}`);
      }
      case "add": {
        const spools = await getFilamentBySlug(organizationId, slug);
        const first = spools[0];
        if (!first)
          return payload({ message: "That filament isn't in your spools." });
        const extra = parseData(form, AddForm);
        const made = await createSpools(
          organizationId,
          {
            type: first.type,
            colourName: first.colourName,
            colourHex: first.colourHex,
            weightGrams: first.weightGrams,
            filamentCode:
              spools.find((s) => s.filamentCode)?.filamentCode ?? null,
            spoolWeightGrams: first.spoolWeightGrams,
            remainingPercent: extra.remainingPercent,
            pricePaid: extra.pricePaid,
            purchasedOn: extra.purchasedOn,
            amsSlot: extra.amsSlot,
            notes: null,
          },
          extra.quantity
        );
        return payload({
          message:
            made.length === 1 ? "Spool added." : `${made.length} spools added.`,
        });
      }
      case "spool":
        await updateSpoolDetails(
          organizationId,
          id,
          parseData(form, SpoolDetailsForm)
        );
        return payload({ message: "Saved." });
      case "weigh": {
        const percent = await weighSpool(
          organizationId,
          id,
          Number(form.get("grossGrams") ?? 0)
        );
        return payload({ message: `${percent}% left.` });
      }
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
      case "delete": {
        await deleteSpool(organizationId, id);
        const left = await getFilamentBySlug(organizationId, slug);
        return left.length === 0
          ? redirect("/filament")
          : payload({ message: "Deleted." });
      }
      case "check-prices": {
        const spools = await getFilamentBySlug(organizationId, slug);
        const first = spools[0];
        if (!first)
          return payload({ message: "That filament isn't in your spools." });
        const result = await refreshPrice(organizationId, {
          type: first.type,
          colourName: first.colourName,
          filamentCode:
            spools.find((s) => s.filamentCode)?.filamentCode ?? null,
        });
        return payload({
          message:
            result === "found"
              ? "Prices updated."
              : result === "missing"
              ? "The Bambu store doesn't list this line and colour."
              : "Couldn't check the price; see the note below.",
        });
      }
      case "fetch-image":
        fetchMissingImages(organizationId);
        return payload({
          message: "Getting the picture; refresh in a moment.",
        });
      default:
        return payload({ message: "Unknown action." });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

type PageData = ReturnType<typeof useLoaderData<typeof loader>>;
type Spool = PageData["spools"][number];

const label = "text-sm text-gray-500";

/** The column headings above the spools. */
function SpoolHeadings() {
  return (
    <div className="hidden items-center gap-x-4 border-b border-gray-200 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 md:flex">
      <span className="w-8">#</span>
      <span className="w-28">Where</span>
      <span className="min-w-40 flex-1">Left</span>
      <span className="w-20 text-right">Weight</span>
      <span className="w-20 text-right">Paid</span>
      <span className="w-24 text-right">Bought</span>
      <span className="w-[9.5rem]" />
    </div>
  );
}

/** One spool of this filament: where it is, what's left, what it cost; weigh, edit, retire. */
function SpoolLine({
  spool,
  index,
  tare,
}: {
  spool: Spool;
  index: number;
  tare: number | null;
}) {
  const money = useMoney();
  const edit = useFetcher<Result>();
  const act = useFetcher<Result>();
  const [mode, setMode] = useState<"none" | "weigh" | "edit">("none");
  useEffect(() => {
    if (edit.state === "idle" && edit.data && !edit.data.error) setMode("none");
  }, [edit.state, edit.data]);
  const retired = spool.status === "retired";
  const busy = isFormProcessing(act.state) || isFormProcessing(edit.state);
  return (
    <li className={tw("px-4 py-3", retired ? "bg-gray-25" : "")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-8 font-mono text-sm text-gray-400">
          #{index + 1}
        </span>
        <span className="w-28 text-xs">
          {retired ? (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
              Finished
            </span>
          ) : spool.status === "empty" ? (
            <span className="rounded bg-warning-50 px-1.5 py-0.5 text-warning-700">
              Run out?
            </span>
          ) : spool.amsSlot ? (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
              In AMS {spool.amsSlot}
            </span>
          ) : (
            <span className="rounded bg-success-50 px-1.5 py-0.5 text-success-700">
              On the shelf
            </span>
          )}
        </span>
        <div className="flex min-w-40 flex-1 items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-gray-100">
            <div
              className={tw(
                "h-2 rounded-full",
                barColour(spool.remainingPercent)
              )}
              style={{ width: `${spool.remainingPercent}%` }}
            />
          </div>
          <span className="w-10 text-right text-sm tabular-nums text-gray-700">
            {spool.remainingPercent}%
          </span>
        </div>
        <span className="w-20 text-right text-sm tabular-nums text-gray-700">
          {(gramsLeft(spool) / 1000).toFixed(2)} kg
        </span>
        <span className="w-20 text-right text-sm tabular-nums text-gray-700">
          {spool.pricePaid !== null ? (
            money(spool.pricePaid)
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </span>
        <span className="w-24 text-right text-sm text-gray-700">
          {spool.purchasedOn ? (
            <DateS date={spool.purchasedOn} />
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </span>
        <div className="flex w-[9.5rem] justify-end gap-2">
          {retired ? (
            <act.Form method="post">
              <input type="hidden" name="id" value={spool.id} />
              <input type="hidden" name="remainingPercent" value={5} />
              <Button
                type="submit"
                name="intent"
                value="keep"
                variant="secondary"
                size="sm"
                disabled={busy}
              >
                Bring back
              </Button>
            </act.Form>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setMode(mode === "weigh" ? "none" : "weigh")}
              >
                Weigh
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setMode(mode === "edit" ? "none" : "edit")}
              >
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {mode === "weigh" ? (
        <act.Form
          method="post"
          className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm"
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
              : "set the empty spool's weight in Filament details first"}
          </span>
          <Button type="submit" size="sm" disabled={busy || !tare}>
            Update
          </Button>
        </act.Form>
      ) : null}

      {mode === "edit" ? (
        <edit.Form
          method="post"
          className="mt-3 grid gap-3 rounded-lg bg-gray-25 p-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          <input type="hidden" name="intent" value="spool" />
          <input type="hidden" name="id" value={spool.id} />
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Left (%)
            <input
              name="remainingPercent"
              type="number"
              min={0}
              max={100}
              defaultValue={spool.remainingPercent}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Price paid
            <input
              name="pricePaid"
              type="number"
              min={0}
              step={0.01}
              defaultValue={spool.pricePaid ?? ""}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Bought on
            <input
              name="purchasedOn"
              type="date"
              defaultValue={
                spool.purchasedOn ? String(spool.purchasedOn).slice(0, 10) : ""
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            In the AMS
            <select
              name="amsSlot"
              defaultValue={spool.amsSlot ? String(spool.amsSlot) : ""}
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
            Notes
            <input
              name="notes"
              defaultValue={spool.notes ?? ""}
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-3 lg:col-span-5">
            <ResultLine fetcher={edit} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    "Delete this spool? To keep it in the history, retire it instead."
                  )
                )
                  return;
                void act.submit(
                  { intent: "delete", id: spool.id },
                  { method: "post" }
                );
              }}
            >
              Delete
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void act.submit(
                  { intent: "retire", id: spool.id },
                  { method: "post" }
                )
              }
            >
              Retire
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              Save spool
            </Button>
          </div>
        </edit.Form>
      ) : null}
      <div className="mt-1 flex justify-end">
        <ResultLine fetcher={act} />
      </div>
    </li>
  );
}

/** Add more spools of this filament (opened by the header's button, ?add=1). */
function AddMore() {
  const fetcher = useFetcher<Result>();
  const [, setParams] = useSearchParams();
  const close = () =>
    setParams((prev) => {
      prev.delete("add");
      return prev;
    });
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error)
      close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <Card className="my-0">
      <fetcher.Form method="post" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="intent" value="add" />
        <h3 className="w-full text-text-md font-semibold text-gray-900">
          Add spools of this
        </h3>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
          How many
          <input
            name="quantity"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            className={tw(inputClass, "w-20")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
          Price paid (each)
          <input
            name="pricePaid"
            type="number"
            min={0}
            step={0.01}
            className={tw(inputClass, "w-28")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
          Bought on
          <input name="purchasedOn" type="date" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
          Left (%)
          <input
            name="remainingPercent"
            type="number"
            min={0}
            max={100}
            defaultValue={100}
            className={tw(inputClass, "w-20")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
          In the AMS
          <select name="amsSlot" defaultValue="" className={selectClass}>
            <option value="">Not loaded</option>
            {AMS_SLOTS.map((n) => (
              <option key={n} value={n}>
                Slot {n}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <ResultLine fetcher={fetcher} />
          <Button type="button" variant="secondary" onClick={close}>
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

/** The filament's specs, edited once for every spool, Spoolman-style: label on the left, value on the right. */
function Specs({
  filament,
  storeCode,
  spoolCount,
}: {
  filament: PageData["filament"];
  /** The code the Bambu store gave for this filament, when none is saved yet */
  storeCode: string | null;
  spoolCount: number;
}) {
  const fetcher = useFetcher<Result>();
  const known = BAMBU_TYPES.some(([t]) => t === filament.type);
  const [type, setType] = useState(known ? filament.type : OTHER);
  const [otherType, setOtherType] = useState(known ? "" : filament.type);
  const line = type === OTHER ? otherType : type;
  const colours = coloursFor(line);
  const knownColour = colours.find(([n]) => n === filament.colourName);
  const [colour, setColour] = useState<string>(
    knownColour ? knownColour[0] : OTHER
  );
  const [otherName, setOtherName] = useState(
    knownColour ? "" : filament.colourName
  );
  const [otherHex, setOtherHex] = useState(filament.colourHex);
  const picked = colours.find(([n]) => n === colour);
  const colourName = picked ? picked[0] : otherName;
  const colourHex = picked ? picked[1] : otherHex;
  const tare = catalogueEntry(line)?.spoolWeight ?? null;
  const row =
    "grid grid-cols-[8rem_1fr] items-center gap-3 border-b border-gray-100 py-2";
  return (
    <Card className="my-0">
      <h3 className="text-text-md font-semibold text-gray-900">
        Filament details
      </h3>
      <p className="text-xs text-gray-500">
        Changes apply to every spool of this filament.
      </p>
      <fetcher.Form method="post" className="mt-2">
        <input type="hidden" name="intent" value="filament" />
        <div className={row}>
          <span className={label}>Line</span>
          <span className="flex flex-col gap-1">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                const first = coloursFor(
                  e.target.value === OTHER ? otherType : e.target.value
                )[0];
                setColour(first ? first[0] : OTHER);
              }}
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
                className={inputClass}
              />
            ) : null}
          </span>
          <input type="hidden" name="type" value={line} />
        </div>
        <div className={row}>
          <span className={label}>Colour</span>
          <span className="flex flex-col gap-1">
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
            <span className="font-mono text-xs text-gray-500">{colourHex}</span>
          </span>
          <input type="hidden" name="colourName" value={colourName} />
          <input type="hidden" name="colourHex" value={colourHex} />
        </div>
        <label className={row}>
          <span className={label}>Code on the box</span>
          <input
            name="filamentCode"
            defaultValue={filament.filamentCode ?? storeCode ?? ""}
            placeholder="e.g. 10100"
            className={inputClass}
          />
          {storeCode ? (
            <span className="col-start-2 text-xs text-gray-500">
              From the Bambu store. Save to keep it.
            </span>
          ) : null}
        </label>
        <label className={row}>
          <span className={label}>Spool size</span>
          <select
            name="weightGrams"
            defaultValue={String(filament.weightGrams)}
            className={selectClass}
          >
            {SPOOL_WEIGHTS.map((g) => (
              <option key={g} value={g}>
                {g >= 1000 ? `${g / 1000} kg` : `${g} g`}
              </option>
            ))}
          </select>
        </label>
        <label className={row}>
          <span className={label}>Empty spool (g)</span>
          <input
            name="spoolWeightGrams"
            type="number"
            min={0}
            defaultValue={filament.spoolWeightGrams ?? ""}
            placeholder={tare ? String(tare) : ""}
            className={inputClass}
          />
        </label>
        <div className="mt-3 flex items-center justify-end gap-2">
          <ResultLine fetcher={fetcher} />
          <Button
            type="submit"
            size="sm"
            disabled={isFormProcessing(fetcher.state)}
          >
            {spoolCount === 1 ? "Save" : `Save for all ${spoolCount} spools`}
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}

/** "3 hours ago", for when a price was checked. */
function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** The filament on the Bambu store: spool and refill prices, any offer, and what you've paid. */
function StoreCard({
  price,
  paidPerKg,
  productUrl,
}: {
  price: PageData["price"];
  paidPerKg: number | null;
  productUrl: string | null;
}) {
  const money = useMoney();
  const fetcher = useFetcher<Result>();
  const summary = priceSummary(price?.variants);
  const row = (label: string, p: { now: number; was: number | null } | null) =>
    p ? (
      <div className="grid grid-cols-[7rem_1fr] border-b border-gray-100 py-2 text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="tabular-nums text-gray-900">
          {money(p.now)}
          {p.was ? (
            <span className="ml-2 text-xs text-gray-400 line-through">
              {money(p.was)}
            </span>
          ) : null}
        </span>
      </div>
    ) : null;
  return (
    <Card className="my-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-text-md font-semibold text-gray-900">
          Bambu store
        </h3>
        {summary.onOffer ? (
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            On offer
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        {price?.status === "found" ? (
          <>
            {row("Spool, 1 kg", summary.spool)}
            {row("Refill, 1 kg", summary.refill)}
            {!summary.spool && !summary.refill ? (
              <p className="py-2 text-sm text-gray-500">
                The store has no 1 kg price for this colour.
              </p>
            ) : null}
          </>
        ) : price ? (
          <p className="py-2 text-sm text-gray-500">{price.message}</p>
        ) : (
          <p className="py-2 text-sm text-gray-500">Not checked yet.</p>
        )}
        {paidPerKg !== null ? (
          <div className="grid grid-cols-[7rem_1fr] py-2 text-sm">
            <span className="text-gray-500">You've paid</span>
            <span className="tabular-nums text-gray-900">
              {money(paidPerKg)}/kg on average
            </span>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {price ? `Checked ${ago(price.checkedAt)}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <ResultLine fetcher={fetcher} />
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="check-prices" />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={isFormProcessing(fetcher.state)}
            >
              Check now
            </Button>
          </fetcher.Form>
          {productUrl ? (
            <Button
              to={productUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              Buy again
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default function FilamentDetail() {
  const { filament, catalogue, spools, images, price } =
    useLoaderData<typeof loader>();
  const money = useMoney();
  const picture = useFetcher<Result>();
  const [params] = useSearchParams();
  const [showFinished, setShowFinished] = useState(false);
  const onHand = spools.filter((s) => s.status !== "retired");
  const finished = spools.filter((s) => s.status === "retired");
  const shown = showFinished ? spools : onHand;
  const grams = onHand.reduce((n, s) => n + gramsLeft(s), 0);
  const priced = spools
    .map((s) => costPerKg(s))
    .filter((n): n is number => n !== null);
  const perKg = priced.length
    ? priced.reduce((a, b) => a + b, 0) / priced.length
    : null;
  const anyPrice = spools.some((s) => s.pricePaid !== null);
  const spent = spools.reduce((n, s) => n + (s.pricePaid ?? 0), 0);
  const image = (images as Images)[filament.key];
  const tare = filament.spoolWeightGrams ?? catalogue?.spoolWeight ?? null;
  const code = filament.filamentCode ?? image?.filamentCode ?? null;
  const fact = (k: string, v: string | null) =>
    v ? (
      <div
        key={k}
        className="grid grid-cols-[7rem_1fr] border-b border-gray-100 py-2 text-sm last:border-0"
      >
        <span className="text-gray-500">{k}</span>
        <span className="tabular-nums text-gray-900">{v}</span>
      </div>
    ) : null;

  return (
    <>
      <Header
        slots={{
          "left-of-title": (
            <FilamentPicture
              {...filament}
              images={images as Images}
              size="mr-4 size-14"
            />
          ),
        }}
        subHeading={
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span>{filament.type}</span>
            <span aria-hidden="true">·</span>
            <span>Bambu Lab</span>
            <span aria-hidden="true">·</span>
            <span>1.75 mm</span>
            {code ? (
              <span className="rounded border border-gray-200 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                {code}
              </span>
            ) : null}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          {image?.productUrl ? (
            <Button
              to={image.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
            >
              Bambu store
            </Button>
          ) : (
            <picture.Form method="post" className="flex items-center gap-2">
              <input type="hidden" name="intent" value="fetch-image" />
              <ResultLine fetcher={picture} />
              <Button
                type="submit"
                variant="secondary"
                disabled={isFormProcessing(picture.state)}
              >
                Get picture
              </Button>
            </picture.Form>
          )}
          <Button to="?add=1" disabled={params.get("add") === "1"}>
            Add spools of this
          </Button>
        </div>
      </Header>

      <div className="mt-4 flex flex-col gap-4">
        {params.get("add") === "1" ? <AddMore /> : null}
        {!image?.productUrl && image?.message ? (
          <p className="text-xs text-gray-500">Picture: {image.message}</p>
        ) : null}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-4">
            <Card className="my-0 p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
                <h3 className="text-text-md font-semibold text-gray-900">
                  Spools{" "}
                  <span className="font-normal text-gray-500">
                    · {onHand.length} · {(grams / 1000).toFixed(2)} kg left
                  </span>
                </h3>
                {finished.length > 0 ? (
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={showFinished}
                      onChange={(e) => setShowFinished(e.target.checked)}
                    />
                    Show finished ({finished.length})
                  </label>
                ) : null}
              </div>
              {shown.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-600">
                  All of this filament's spools are finished.
                </p>
              ) : (
                <>
                  <SpoolHeadings />
                  <ul className="divide-y divide-gray-100">
                    {shown.map((s) => (
                      <SpoolLine
                        key={s.id}
                        spool={s}
                        index={spools.indexOf(s)}
                        tare={tare}
                      />
                    ))}
                  </ul>
                </>
              )}
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="my-0">
                <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  From Bambu's catalogue
                </h3>
                <div className="mt-2">
                  {fact("Material", filament.material)}
                  {fact("Diameter", "1.75 mm")}
                  {fact(
                    "Density",
                    catalogue?.density ? `${catalogue.density} g/cm³` : null
                  )}
                  {fact(
                    "Nozzle",
                    catalogue?.nozzleTemp ? `${catalogue.nozzleTemp} °C` : null
                  )}
                  {fact(
                    "Bed",
                    catalogue?.bedTemp ? `${catalogue.bedTemp} °C` : null
                  )}
                  {!catalogue ? (
                    <p className="py-2 text-sm text-gray-500">
                      This line isn't in the catalogue.
                    </p>
                  ) : null}
                </div>
              </Card>
              <Card className="my-0">
                <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Your figures
                </h3>
                <div className="mt-2">
                  {fact(
                    "Left",
                    `${(grams / 1000).toFixed(2)} kg on ${onHand.length} spool${
                      onHand.length === 1 ? "" : "s"
                    }`
                  )}
                  {fact("Cost per kg", perKg !== null ? money(perKg) : "—")}
                  {fact("Spent", anyPrice ? money(spent) : "—")}
                  {fact("Spools ever", String(spools.length))}
                </div>
              </Card>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <StoreCard
              price={price}
              paidPerKg={perKg}
              productUrl={price?.productUrl ?? image?.productUrl ?? null}
            />

            <Specs
              key={`${filament.type}|${filament.colourName}`}
              filament={filament}
              storeCode={
                filament.filamentCode ? null : image?.filamentCode ?? null
              }
              spoolCount={spools.length}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
