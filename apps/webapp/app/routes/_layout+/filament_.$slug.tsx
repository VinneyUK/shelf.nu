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
import { data, redirect, useFetcher, useLoaderData } from "react-router";
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
} from "~/components/filament/parts";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
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
    const images = await imageStatuses(organizationId);
    const entry = catalogueEntry(first.type);
    return payload({
      header: { title: `${first.colourName} · ${first.type}` },
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
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const handle = {
  // the filament's name, after "Filament", as on Shelf's own detail pages
  breadcrumb: () => "single",
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

/** One spool of this filament: state, what's left, price; weigh, edit, retire. */
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
            <span className="rounded bg-primary-50 px-1.5 py-0.5 text-primary-700">
              In AMS {spool.amsSlot}
            </span>
          ) : (
            <span className="text-gray-500">On the shelf</span>
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
        <span className="w-16 text-right text-sm tabular-nums text-gray-700">
          {gramsLeft(spool)} g
        </span>
        <span className="w-20 text-right text-sm tabular-nums text-gray-700">
          {spool.pricePaid !== null ? money(spool.pricePaid) : "—"}
        </span>
        <span className="w-24 text-right text-xs text-gray-500">
          {spool.purchasedOn ? <DateS date={spool.purchasedOn} /> : ""}
        </span>
        <div className="flex gap-2">
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
              : "set the empty spool's weight in Specs first"}
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
              Save
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

/** Add more spools of this filament: how many, what they cost, when. */
function AddMore() {
  const fetcher = useFetcher<Result>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error)
      setOpen(false);
  }, [fetcher.state, fetcher.data]);
  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Add spools of this
      </Button>
    );
  }
  return (
    <fetcher.Form
      method="post"
      className="flex w-full flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3"
    >
      <input type="hidden" name="intent" value="add" />
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
        <select name="amsSlot" defaultValue="" className={inputClass}>
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
  );
}

/** The filament's specs, edited once for every spool, Spoolman-style: label on the left, value on the right. */
function Specs({ filament }: { filament: PageData["filament"] }) {
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
      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Specs, for every spool
      </h3>
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
            <span className="font-mono text-xs text-gray-500">{colourHex}</span>
          </span>
          <input type="hidden" name="colourName" value={colourName} />
          <input type="hidden" name="colourHex" value={colourHex} />
        </div>
        <label className={row}>
          <span className={label}>Code on the box</span>
          <input
            name="filamentCode"
            defaultValue={filament.filamentCode ?? ""}
            placeholder="e.g. 10100"
            className={inputClass}
          />
        </label>
        <label className={row}>
          <span className={label}>Spool size</span>
          <select
            name="weightGrams"
            defaultValue={String(filament.weightGrams)}
            className={inputClass}
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
            Save
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}

export default function FilamentDetail() {
  const { filament, catalogue, spools, images } =
    useLoaderData<typeof loader>();
  const money = useMoney();
  const picture = useFetcher<Result>();
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
  const spent = spools.reduce((n, s) => n + (s.pricePaid ?? 0), 0);
  const image = (images as Images)[filament.key];
  const tare = filament.spoolWeightGrams ?? catalogue?.spoolWeight ?? null;
  const fact = (k: string, v: string | null) =>
    v ? (
      <div
        key={k}
        className="grid grid-cols-[8rem_1fr] border-b border-gray-100 py-2 text-sm"
      >
        <span className={label}>{k}</span>
        <span className="tabular-nums text-gray-900">{v}</span>
      </div>
    ) : null;

  return (
    <>
      <Header />
      <div className="mt-4 flex flex-col gap-4">
        {/* the filament: picture, name, line, code */}
        <Card className="my-0">
          <div className="flex flex-wrap items-center gap-5">
            <FilamentPicture
              {...filament}
              images={images as Images}
              size="size-28"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-display-xs font-semibold text-gray-900">
                {filament.colourName}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span>{filament.type}</span>
                <span aria-hidden="true">·</span>
                <span>Bambu Lab</span>
                <span aria-hidden="true">·</span>
                <span>1.75 mm</span>
                {filament.filamentCode ? (
                  <span className="rounded border border-gray-200 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                    {filament.filamentCode}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {image?.productUrl ? (
                  <a
                    href={image.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline"
                  >
                    See it on the Bambu store
                  </a>
                ) : (
                  <picture.Form
                    method="post"
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="intent" value="fetch-image" />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={isFormProcessing(picture.state)}
                    >
                      Get picture
                    </Button>
                    <ResultLine fetcher={picture} />
                    {!picture.data && image?.message ? (
                      <span className="text-xs text-gray-500">
                        Last time: {image.message}
                      </span>
                    ) : null}
                  </picture.Form>
                )}
              </div>
            </div>
            <AddMore />
          </div>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
          {/* its spools */}
          <Card className="my-0 p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Spools · {onHand.length} · {(grams / 1000).toFixed(2)} kg left
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
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <Specs
              key={`${filament.type}|${filament.colourName}`}
              filament={filament}
            />
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
              <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-400">
                Your figures
              </h3>
              <div className="mt-2">
                {fact("Cost per kg", perKg !== null ? money(perKg) : "—")}
                {fact("Spent", money(spent))}
                {fact("Spools ever", String(spools.length))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
