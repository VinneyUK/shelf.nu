/**
 * Filament (fork): one filament's own page, like Spoolman's. Its picture and
 * name; its spools (weigh, edit, retire, bring back, delete); its specs, edited
 * once for every spool; Bambu's catalogue facts; and Add spools of this.
 */
import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { MoreHorizontalIcon } from "lucide-react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, redirect, useFetcher, useLoaderData } from "react-router";
import { z } from "zod";
import { ErrorContent } from "~/components/errors";
import { FilamentCell } from "~/components/filament/filament-cell";
import { useAmsLiveUpdates } from "~/components/filament/live-updates";
import {
  barFill,
  CodeChip,
  DateField,
  FilamentPicture,
  FilamentSearch,
  type Images,
  inputClass,
  OTHER,
  PackagingToggle,
  type Result,
  selectClass,
  Swatch,
  todayIso,
  useMoney,
} from "~/components/filament/parts";
import { TrashIcon } from "~/components/icons/library";
import { FilamentIdChip } from "~/components/labels/filament-id-chip";
import { FilamentLabelPreview } from "~/components/labels/filament-label-preview";
import { useLabelledAt } from "~/components/labels/labelled-badge";
import { PrintLabelButton } from "~/components/labels/print-label-button";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/shared/modal";
import { useSearchParams } from "~/hooks/search-params";
import { isFeatureSwitchedOff } from "~/modules/customisation/service.server";
import {
  BAMBU_TYPES,
  catalogueEntry,
  coloursFor,
  costPerKg,
  daysAgo,
  filamentKey,
  gramsLeft,
  oldestNew,
  SPOOL_STATES,
  spoolState,
  stateLabel,
  stockOrder,
  typeWords,
} from "~/modules/filament/catalogue";
import {
  fetchMissingImages,
  imageStatuses,
  linkStorePage,
  setFilamentImageFromUrl,
} from "~/modules/filament/images.server";
import { done, failed, notify } from "~/modules/filament/notify.server";
import {
  ensureFilamentQr,
  getFilamentNumber,
} from "~/modules/filament/numbers.server";
import { priceSummary } from "~/modules/filament/prices";
import {
  priceStatuses,
  refreshPrice,
  refreshStalePrices,
} from "~/modules/filament/prices.server";
import {
  changeSpoolState,
  createSpools,
  deleteSpool,
  fillFilamentCode,
  getFilamentBySlug,
  keepSpool,
  knownCodes,
  openSpool,
  renameFilament,
  retireSpool,
  SPOOL_FIELDS,
  type SpoolField,
  updateFilament,
  updateSpoolDetails,
  updateSpoolField,
  weighSpool,
} from "~/modules/filament/service.server";
import { getLabelSettings, qrUrlFor } from "~/modules/labels/service.server";
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
        message: "That filament isn't in your stock.",
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
    const codes = await knownCodes(organizationId);
    const entry = catalogueEntry(first.type);
    // its label: FIL-0001 and what the printed label looks like
    const labelsOff = await isFeatureSwitchedOff(
      organizationId,
      "labelsEnabled"
    );
    const fil = !labelsOff
      ? await getFilamentNumber(organizationId, first.type, first.colourName)
      : null;
    const labelSettings = fil ? await getLabelSettings(organizationId) : null;
    const label =
      fil && labelSettings
        ? {
            qrUrl: qrUrlFor(await ensureFilamentQr(organizationId, fil.id)),
            settings: {
              labelWidth: labelSettings.labelWidth,
              leftMargin: labelSettings.leftMargin,
            },
          }
        : null;
    return payload({
      fil: fil ? { id: fil.id, label: fil.label } : null,
      label,
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
      codes,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const handle = {
  // after the parent's "Filament": the filament's name
  breadcrumb: (match: { data?: { header?: { title?: string } } }) => (
    <span className="single-crumb">
      {match?.data?.header?.title ?? "Filament"}
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
  packaging: z.enum(["spool", "refill"]).default("spool"),
  remainingPercent: z.coerce.number(),
  pricePaid: optionalNumber,
  purchasedOn: optionalDate,
  openedOn: optionalDate,
  amsSlot: optionalNumber,
  notes: optionalText,
});

const AddForm = z.object({
  packaging: z.enum(["spool", "refill"]).default("spool"),
  quantity: z.coerce.number().default(1),
  remainingPercent: z.coerce.number().default(100),
  pricePaid: optionalNumber,
  purchasedOn: optionalDate,
  amsSlot: optionalNumber,
});

export async function action({ context, request, params }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  let intent = "";
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const slug = String(params.slug ?? "");
    const form = await request.formData();
    intent = String(form.get("intent") ?? "");
    const id = String(form.get("id") ?? "");

    switch (intent) {
      case "filament": {
        const next = await updateFilament(
          organizationId,
          slug,
          parseData(form, FilamentForm)
        );
        fetchMissingImages(organizationId);
        notify(
          userId,
          "Filament details saved",
          "The changes apply to every spool and refill of this filament."
        );
        return next === slug
          ? payload({ ok: true })
          : redirect(`/filament/${next}`);
      }
      case "add": {
        const spools = await getFilamentBySlug(organizationId, slug);
        const first = spools[0];
        if (!first)
          throw new ShelfError({
            cause: null,
            message: "That filament isn't in your stock.",
            status: 404,
            label: "Assets",
          });
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
            packaging: extra.packaging,
          },
          extra.quantity
        );
        return done(
          userId,
          made.length === 1
            ? "Filament added"
            : `${made.length} filaments added`,
          `${first.colourName} · ${first.type}`
        );
      }
      case "field": {
        const field = String(form.get("field") ?? "");
        if (!(SPOOL_FIELDS as readonly string[]).includes(field)) {
          throw new ShelfError({
            cause: null,
            message: "That can't be changed here.",
            status: 400,
            label: "Assets",
          });
        }
        const what = await updateSpoolField(
          organizationId,
          id,
          field as SpoolField,
          String(form.get("value") ?? "")
        );
        return done(userId, "Filament saved", what);
      }
      case "rename": {
        const next = await renameFilament(organizationId, slug, {
          type: String(form.get("type") ?? ""),
          colourName: String(form.get("colourName") ?? ""),
          colourHex: String(form.get("colourHex") ?? ""),
        });
        fetchMissingImages(organizationId);
        notify(
          userId,
          "Filament saved",
          "Its line and colour apply to every spool and refill of it."
        );
        return next === slug
          ? payload({ ok: true })
          : redirect(`/filament/${next}`);
      }
      case "store-page": {
        const spools = await getFilamentBySlug(organizationId, slug);
        const first = spools[0];
        if (!first) {
          throw new ShelfError({
            cause: null,
            message: "That filament isn't in your stock.",
            status: 404,
            label: "Assets",
          });
        }
        const code = spools.find((s) => s.filamentCode)?.filamentCode ?? null;
        const linked = await linkStorePage(
          organizationId,
          {
            type: first.type,
            colourName: first.colourName,
            filamentCode: code,
          },
          String(form.get("url") ?? "")
        );
        const filled = await fillFilamentCode(
          organizationId,
          slug,
          linked.filamentCode
        );
        const priced = await refreshPrice(organizationId, {
          type: first.type,
          colourName: first.colourName,
          filamentCode: linked.filamentCode ?? code,
        });
        return done(
          userId,
          "Linked to the Bambu store",
          [
            linked.picture ? "Picture" : "No picture on that page",
            linked.filamentCode
              ? `code ${linked.filamentCode}${
                  filled ? ` (filled in on ${filled})` : ""
                }`
              : "no code",
            priced === "found"
              ? "prices checked there"
              : "no price on that page",
          ].join(", ") + "."
        );
      }
      case "image-url": {
        const spools = await getFilamentBySlug(organizationId, slug);
        const first = spools[0];
        if (!first)
          throw new ShelfError({
            cause: null,
            message: "That filament isn't in your stock.",
            status: 404,
            label: "Assets",
          });
        await setFilamentImageFromUrl(
          organizationId,
          filamentKey(first.type, first.colourName),
          String(form.get("url") ?? "")
        );
        return done(
          userId,
          "Picture updated",
          "Fetched from that address and kept."
        );
      }
      case "state": {
        const target = String(form.get("target") ?? "");
        if (target !== "new" && target !== "opened" && target !== "retired") {
          throw new ShelfError({
            cause: null,
            message: "Choose New, Opened or Retired.",
            status: 400,
            label: "Assets",
          });
        }
        const what = await changeSpoolState(organizationId, id, target);
        return done(
          userId,
          "Status changed",
          `${String(form.get("label") ?? "The filament")}: ${what}`
        );
      }
      case "open": {
        await openSpool(organizationId, id);
        return done(
          userId,
          "Filament opened",
          `${String(form.get("label") ?? "The filament")}: opened today.`
        );
      }
      case "spool":
        await updateSpoolDetails(
          organizationId,
          id,
          parseData(form, SpoolDetailsForm)
        );
        return done(userId, "Filament saved", null);
      case "weigh": {
        const percent = await weighSpool(
          organizationId,
          id,
          Number(form.get("grossGrams") ?? 0)
        );
        return done(
          userId,
          "Filament weighed",
          percent === 0
            ? "It's empty: confirm it on the Filament page."
            : `${percent}% left.`
        );
      }
      case "retire":
        await retireSpool(organizationId, id);
        return done(
          userId,
          "Filament retired",
          "Tick Show finished to see it, or bring it back."
        );
      case "keep":
        await keepSpool(
          organizationId,
          id,
          Number(form.get("remainingPercent") ?? 0)
        );
        return done(userId, "Filament back in use", null);
      case "delete": {
        await deleteSpool(organizationId, id);
        notify(userId, "Filament deleted", null);
        const left = await getFilamentBySlug(organizationId, slug);
        return left.length === 0
          ? redirect("/filament")
          : payload({ ok: true });
      }
      case "fetch-image":
        fetchMissingImages(organizationId);
        return done(
          userId,
          "Getting the picture",
          "It's coming from the Bambu store. Refresh in a moment."
        );
      case "check-prices": {
        const spools = await getFilamentBySlug(organizationId, slug);
        const first = spools[0];
        if (!first)
          throw new ShelfError({
            cause: null,
            message: "That filament isn't in your stock.",
            status: 404,
            label: "Assets",
          });
        const result = await refreshPrice(organizationId, {
          type: first.type,
          colourName: first.colourName,
          filamentCode:
            spools.find((s) => s.filamentCode)?.filamentCode ?? null,
        });
        if (result === "found")
          return done(
            userId,
            "Prices updated",
            "From the Bambu store, just now."
          );
        if (result === "missing") {
          notify(
            userId,
            "Not on the Bambu store",
            "The store doesn't list this line and colour.",
            "gray"
          );
          return payload({ ok: true });
        }
        failed(
          userId,
          intent,
          "The Bambu store didn't answer. The card says why."
        );
        return payload({ ok: false });
      }
      default:
        return payload({ ok: false });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    failed(userId, intent, reason.message);
    return data(error(reason), { status: reason.status });
  }
}

type PageData = ReturnType<typeof useLoaderData<typeof loader>>;
type Spool = PageData["spools"][number];

/** Delete a spool, after Shelf's own confirmation dialog (as for deleting an asset). */
function DeleteSpool({
  label,
  disabled,
  onDelete,
}: {
  label: string;
  disabled: boolean;
  onDelete: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" disabled={disabled}>
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto md:m-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
              <TrashIcon />
            </span>
          </div>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes it completely. To keep it in the history, retire it
            instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex justify-center gap-2">
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button
              type="button"
              className="border-error-600 bg-error-600 hover:border-error-800 hover:!bg-error-800"
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Add more spools of this filament (opened by the header's button, ?add=1). */
function AddMore({
  storePrices,
}: {
  storePrices: { spool: number | null; refill: number | null };
}) {
  const [packaging, setPackaging] = useState<"spool" | "refill">("spool");
  const [typed, setTyped] = useState<string | null>(null);
  const fromStore =
    packaging === "refill"
      ? storePrices.refill ?? storePrices.spool
      : storePrices.spool ?? storePrices.refill;
  const price = typed ?? (fromStore != null ? String(fromStore) : "");
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
          Add more of this
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
        <PackagingToggle onChange={setPackaging} />
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
          Price paid (each)
          <input
            name="pricePaid"
            type="number"
            min={0}
            step={0.01}
            value={price}
            onChange={(e) => setTyped(e.target.value)}
            className={tw(inputClass, "w-28")}
          />
          {typed === null && fromStore != null ? (
            <span className="text-xs font-normal text-gray-500">
              From the Bambu store
            </span>
          ) : null}
        </label>
        <DateField name="purchasedOn" label="Bought on" initial={todayIso()} />
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
        <div className="ml-auto flex items-center gap-2">
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

/** A date, or how it reads when it isn't known. */
function DateText({
  date,
  empty = "Not known",
}: {
  date: string | Date | null;
  empty?: string;
}) {
  return date ? (
    <span className="flex flex-col leading-tight">
      <DateS date={date} />
      <span className="text-[11px] text-gray-400">{daysAgo(date)}</span>
    </span>
  ) : (
    <span className="text-gray-400">{empty}</span>
  );
}

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "opened", label: "Opened" },
  { value: "ams1", label: "AMS 1" },
  { value: "ams2", label: "AMS 2" },
  { value: "ams3", label: "AMS 3" },
  { value: "ams4", label: "AMS 4" },
  { value: "retired", label: "Retired" },
];

/**
 * A filament's stock as a table: every cell click-to-change, as in Assets.
 * Open ones first (least left at the top), then new (oldest bought first),
 * then retired. Left shows as % or kg.
 */
function StockTable({
  items,
  numbers,
  tare,
  openFirstId,
}: {
  items: Spool[];
  /** Each item's number, by the order it was added */
  numbers: Map<string, number>;
  /** The empty spool's weight from the catalogue, for items without their own */
  tare: number | null;
  /** The new one to open next, when there's a choice */
  openFirstId: string | null;
}) {
  const [unit, setUnit] = useState<"percent" | "kg">("percent");
  const head =
    "px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-400";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] text-sm">
        <thead className="border-b border-gray-200">
          <tr>
            <th className={tw(head, "w-10 pl-4")}>#</th>
            <th className={head}>Status</th>
            <th className={head}>Type</th>
            <th className={tw(head, "w-56")}>
              <span className="flex items-center gap-2">
                Left
                <span
                  className="inline-flex rounded border border-gray-200 p-0.5 normal-case"
                  role="radiogroup"
                  aria-label="Show what's left in"
                >
                  {(["percent", "kg"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      role="radio"
                      aria-checked={unit === u}
                      onClick={() => setUnit(u)}
                      className={tw(
                        "rounded px-1.5 text-[11px] tracking-normal",
                        unit === u
                          ? "bg-gray-100 font-semibold text-gray-900"
                          : "text-gray-500"
                      )}
                    >
                      {u === "percent" ? "%" : "kg"}
                    </button>
                  ))}
                </span>
              </span>
            </th>
            <th className={head}>Paid</th>
            <th className={head}>Bought</th>
            <th className={head}>Opened</th>
            <th className={head}>Code</th>
            <th className={head}>Size</th>
            <th className={head}>Empty spool</th>
            <th className={tw(head, "w-10 pr-4")}>
              <span className="sr-only">More</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((s) => (
            <StockRow
              key={s.id}
              spool={s}
              number={numbers.get(s.id) ?? 0}
              unit={unit}
              tare={tare}
              openFirst={s.id === openFirstId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockRow({
  spool,
  number,
  unit,
  tare,
  openFirst,
}: {
  spool: Spool;
  number: number;
  unit: "percent" | "kg";
  tare: number | null;
  openFirst: boolean;
}) {
  const money = useMoney();
  const state = spoolState(spool);
  const kg = gramsLeft(spool) / 1000;
  const cell = "px-2 py-2 align-middle";
  return (
    <tr className={state === "retired" ? "bg-gray-25 text-gray-500" : ""}>
      <td className={tw(cell, "pl-4 font-mono text-gray-400")}>
        #{number}
        {openFirst ? (
          <span
            className="mt-0.5 block whitespace-nowrap font-sans text-[10px] text-primary-600"
            title="Bought first: open this one before the others"
          >
            open next
          </span>
        ) : null}
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field="status"
          label="Status"
          editor={{
            kind: "select",
            value:
              state === "in-use"
                ? `ams${spool.amsSlot}`
                : state === "run-out"
                ? "run-out"
                : state,
            options:
              state === "run-out"
                ? [
                    { value: "run-out", label: "Run out?", disabled: true },
                    ...STATUS_OPTIONS,
                  ]
                : STATUS_OPTIONS,
          }}
        >
          <span
            className={tw(
              "whitespace-nowrap rounded px-1.5 py-0.5 text-xs",
              SPOOL_STATES[state].tone
            )}
          >
            {stateLabel(spool)}
          </span>
        </FilamentCell>
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field="packaging"
          label="Type"
          editor={{
            kind: "select",
            value: spool.packaging === "refill" ? "refill" : "spool",
            options: [
              { value: "spool", label: "Spool" },
              { value: "refill", label: "Refill" },
            ],
          }}
        >
          {spool.packaging === "refill" ? "Refill" : "Spool"}
        </FilamentCell>
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field={unit === "percent" ? "left" : "leftKg"}
          label={unit === "percent" ? "Left (%)" : "Left (kg)"}
          editor={
            unit === "percent"
              ? {
                  kind: "number",
                  value: spool.remainingPercent,
                  min: 0,
                  max: 100,
                  suffix: "%",
                }
              : {
                  kind: "number",
                  value: Number(kg.toFixed(3)),
                  min: 0,
                  max: spool.weightGrams / 1000,
                  step: 0.001,
                  suffix: "kg",
                }
          }
          className="w-full"
        >
          <span className="flex w-48 items-center gap-2">
            <span className="h-1.5 flex-1 rounded-full bg-gray-100">
              <span
                className={"block h-1.5 rounded-full"}
                style={barFill(spool.remainingPercent)}
              />
            </span>
            <span className="w-16 text-right tabular-nums text-gray-900">
              {unit === "percent"
                ? `${spool.remainingPercent}%`
                : `${kg.toFixed(2)} kg`}
            </span>
          </span>
        </FilamentCell>
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field="pricePaid"
          label="Price paid (£)"
          editor={{
            kind: "number",
            value: spool.pricePaid,
            min: 0,
            step: 0.01,
          }}
        >
          <span className="tabular-nums">
            {spool.pricePaid !== null ? (
              money(spool.pricePaid)
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </span>
        </FilamentCell>
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field="purchasedOn"
          label="Bought on"
          editor={{ kind: "date", value: spool.purchasedOn }}
        >
          <DateText date={spool.purchasedOn} />
        </FilamentCell>
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field="openedOn"
          label="Opened on"
          editor={{ kind: "date", value: spool.openedOn }}
        >
          <DateText date={spool.openedOn} empty="—" />
        </FilamentCell>
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field="filamentCode"
          label="Code on the box"
          editor={{
            kind: "text",
            value: spool.filamentCode ?? "",
            placeholder: "e.g. 10100",
          }}
        >
          {spool.filamentCode ? (
            <span className="font-mono text-xs">{spool.filamentCode}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </FilamentCell>
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field="weightGrams"
          label="Size (filament, g)"
          editor={{
            kind: "number",
            value: spool.weightGrams,
            min: 1,
            max: 10000,
            suffix: "g",
          }}
        >
          <span className="whitespace-nowrap tabular-nums">
            {spool.weightGrams >= 1000
              ? `${spool.weightGrams / 1000} kg`
              : `${spool.weightGrams} g`}
          </span>
        </FilamentCell>
      </td>
      <td className={cell}>
        <FilamentCell
          id={spool.id}
          field="spoolWeightGrams"
          label="Empty spool (g)"
          editor={{
            kind: "number",
            value: spool.spoolWeightGrams,
            min: 0,
            max: 2000,
            suffix: "g",
          }}
        >
          {spool.spoolWeightGrams !== null ? (
            <span className="whitespace-nowrap tabular-nums">
              {spool.spoolWeightGrams} g
            </span>
          ) : tare ? (
            <span
              className="whitespace-nowrap tabular-nums text-gray-400"
              title="Bambu's figure; click to set this one's own"
            >
              {tare} g
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </FilamentCell>
      </td>
      <td className={tw(cell, "pr-4 text-right")}>
        <RowMenu
          spool={spool}
          number={number}
          tare={spool.spoolWeightGrams ?? tare}
        />
      </td>
    </tr>
  );
}

/** A row's "⋯" menu: weigh it on the scale, or delete it. */
function RowMenu({
  spool,
  number,
  tare,
}: {
  spool: Spool;
  number: number;
  tare: number | null;
}) {
  const act = useFetcher<Result>();
  const [open, setOpen] = useState(false);
  const [grams, setGrams] = useState("");
  const busy = isFormProcessing(act.state);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`More for #${number}`}
          className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <MoreHorizontalIcon className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="z-[60] w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg"
        >
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act.submit(
                { intent: "weigh", id: spool.id, grossGrams: grams },
                { method: "post" }
              );
              setOpen(false);
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Weigh it: on the scale
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                  className={tw(inputClass, "w-full")}
                  autoFocus
                />
                <span className="text-sm font-normal text-gray-500">g</span>
              </span>
            </label>
            <span className="text-xs text-gray-500">
              {tare
                ? `Less the empty spool, ${tare} g.`
                : "Set its empty spool weight first."}
            </span>
            <Button type="submit" size="sm" disabled={busy || !tare || !grams}>
              Update what's left
            </Button>
          </form>
          <div className="mt-3 border-t border-gray-100 pt-3">
            <DeleteSpool
              label={`#${number} of ${spool.colourName}`}
              disabled={busy}
              onDelete={() =>
                void act.submit(
                  { intent: "delete", id: spool.id },
                  { method: "post" }
                )
              }
            />
          </div>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

/**
 * The filament's picture: click it to see where it came from and give another
 * address, or to change the line and colour (for every spool and refill of it).
 */
function PicturePopover({
  filament,
  images,
  codes,
}: {
  filament: PageData["filament"];
  images: Images;
  codes: PageData["codes"];
}) {
  const image = images[filament.key] as
    | (Images[string] & { sourceUrl?: string | null })
    | undefined;
  const picture = useFetcher<Result>();
  const rename = useFetcher<Result>();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const knownType = BAMBU_TYPES.some(([t]) => t === filament.type);
  const [type, setType] = useState(knownType ? filament.type : OTHER);
  const [otherType, setOtherType] = useState(knownType ? "" : filament.type);
  const line = type === OTHER ? otherType : type;
  const colours = coloursFor(line);
  const knownColour = colours.some(([n]) => n === filament.colourName);
  const [colour, setColour] = useState<string>(
    knownColour ? filament.colourName : OTHER
  );
  const [otherName, setOtherName] = useState(
    knownColour ? "" : filament.colourName
  );
  const [otherHex, setOtherHex] = useState(filament.colourHex);
  const picked = colours.find(([n]) => n === colour);
  const colourName = colour === OTHER ? otherName : colour;
  const colourHex = colour === OTHER ? otherHex : picked?.[1] ?? otherHex;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="The picture, line and colour"
          title="Change the picture, line or colour"
          className="mr-4 rounded-md hover:ring-2 hover:ring-primary-200"
        >
          <FilamentPicture {...filament} images={images} size="size-14" />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="z-[60] w-96 rounded-md border border-gray-200 bg-white p-4 shadow-lg"
        >
          <h4 className="text-sm font-semibold text-gray-900">Picture</h4>
          <p className="mt-1 break-all text-xs text-gray-600">
            {image?.sourceUrl ? (
              <>
                From{" "}
                <a
                  href={image.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 underline"
                >
                  {image.sourceUrl}
                </a>
              </>
            ) : image?.status === "found" ? (
              "From the Bambu store (its address wasn't kept)."
            ) : (
              image?.message ?? "No picture yet."
            )}
          </p>
          <p className="mt-2 text-xs text-gray-600">
            {image?.productUrl ? (
              <>
                Linked to{" "}
                <a
                  href={image.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 underline"
                >
                  its Bambu store page
                </a>
                : its picture, box code and prices come from there.
              </>
            ) : (
              "Not linked to the Bambu store yet. Link its page for the picture, box code and prices."
            )}
          </p>
          <picture.Form
            method="post"
            className="mt-2 flex gap-2"
            onSubmit={() => setUrl("")}
          >
            <input type="hidden" name="intent" value="store-page" />
            <input
              name="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Its Bambu store page (https://uk.store.bambulab.com/products/…)"
              className={tw(inputClass, "min-w-0 flex-1")}
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={!url || isFormProcessing(picture.state)}
            >
              Link
            </Button>
          </picture.Form>

          <h4 className="mt-4 border-t border-gray-100 pt-3 text-sm font-semibold text-gray-900">
            Line and colour
          </h4>
          <p className="text-xs text-gray-500">
            For every spool and refill of this filament.
          </p>
          <rename.Form method="post" className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="intent" value="rename" />
            <input type="hidden" name="type" value={line} />
            <input type="hidden" name="colourName" value={colourName} />
            <input type="hidden" name="colourHex" value={colourHex} />
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
              }}
            />
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Line
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={selectClass}
              >
                {BAMBU_TYPES.map(([t]) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value={OTHER}>Other…</option>
              </select>
            </label>
            {type === OTHER ? (
              <input
                value={otherType}
                onChange={(e) => setOtherType(e.target.value)}
                placeholder="The line's name"
                className={inputClass}
              />
            ) : null}
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Colour
              <span className="flex items-center gap-2">
                <Swatch hex={colourHex} size="size-6" />
                <select
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  className={tw(selectClass, "flex-1")}
                >
                  {colours.map(([n]) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value={OTHER}>Other…</option>
                </select>
              </span>
            </label>
            {colour === OTHER ? (
              <span className="flex items-center gap-2">
                <input
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                  placeholder="The colour's name"
                  className={tw(inputClass, "flex-1")}
                />
                <input
                  type="color"
                  value={otherHex}
                  onChange={(e) => setOtherHex(e.target.value)}
                  aria-label="The colour"
                  className="h-9 w-12 rounded border border-gray-300"
                />
              </span>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  !line || !colourName || isFormProcessing(rename.state)
                }
              >
                Save
              </Button>
            </div>
          </rename.Form>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

export default function FilamentDetail() {
  useAmsLiveUpdates(); // the page follows the AMS
  const { filament, catalogue, spools, images, price, codes, fil, label } =
    useLoaderData<typeof loader>();
  const money = useMoney();
  const picture = useFetcher<Result>();
  const [params] = useSearchParams();
  const [showFinished, setShowFinished] = useState(false);
  const onHand = spools.filter((s) => s.status !== "retired");
  const finished = spools.filter((s) => s.status === "retired");
  const shown = stockOrder(showFinished ? spools : onHand);
  // each item keeps its number, by the order it was added
  const numbers = new Map(
    [...spools]
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      .map((s, i) => [s.id, i + 1])
  );
  const firstToOpen = oldestNew(spools);
  const newCount = spools.filter((s) => spoolState(s) === "new").length;
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
  const tare = catalogue?.spoolWeight ?? null;
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
            <PicturePopover
              filament={filament}
              images={images as Images}
              codes={codes}
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
            {code ? <CodeChip code={code} /> : null}
            <FilamentIdChip fil={fil} className="h-7" />
          </div>
        }
      >
        <div className="flex items-center gap-2">
          {fil ? (
            <PrintLabelButton id={fil.id} kind="filament" withText />
          ) : null}
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
            Add more of this
          </Button>
        </div>
      </Header>

      <div className="mt-4 flex flex-col gap-4">
        {params.get("add") === "1" ? (
          <AddMore
            storePrices={{
              spool: priceSummary(price?.variants).spool?.now ?? null,
              refill: priceSummary(price?.variants).refill?.now ?? null,
            }}
          />
        ) : null}

        <Card className="my-0 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
            <h3 className="text-text-md font-semibold text-gray-900">
              In stock{" "}
              <span className="font-normal text-gray-500">
                · {typeWords(onHand)} · {(grams / 1000).toFixed(2)} kg left
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
              All of this filament is finished.
            </p>
          ) : (
            <StockTable
              items={shown}
              numbers={numbers}
              tare={tare}
              openFirstId={newCount > 1 ? firstToOpen?.id ?? null : null}
            />
          )}
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-3">
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
                `${(grams / 1000).toFixed(2)} kg on ${typeWords(onHand)}`
              )}
              {fact("Cost per kg", perKg !== null ? money(perKg) : "—")}
              {fact("Spent", anyPrice ? money(spent) : "—")}
              {fact("Bought ever", String(spools.length))}
            </div>
          </Card>
          <StoreCard
            price={price}
            paidPerKg={perKg}
            productUrl={price?.productUrl ?? image?.productUrl ?? null}
          />
          {fil && label ? (
            <LabelCard
              fil={fil}
              qrUrl={label.qrUrl}
              settings={label.settings}
              colour={filament.colourName}
              line={filament.type}
              boxCode={code}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * The filament's label as it prints: FIL-0001, the Bambu code, the colour and
 * the line, at the label size set in Labels → Settings. Filament labels (fork).
 */
function LabelCard({
  fil,
  qrUrl,
  settings,
  colour,
  line,
  boxCode,
}: {
  fil: { id: string; label: string };
  qrUrl: string;
  settings: { labelWidth: number; leftMargin: number };
  colour: string;
  line: string;
  boxCode: string | null;
}) {
  const labelledAt = useLabelledAt(fil.id);
  return (
    <Card className="my-0">
      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Label
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        <FilamentLabelPreview
          content={{ filamentId: fil.label, colour, line, boxCode, qrUrl }}
          settings={settings}
          scale={1.1}
          className="max-w-full"
        />
        <p className="text-xs text-gray-500">
          {labelledAt ? (
            <>
              Printed <DateS date={labelledAt} />
            </>
          ) : (
            "Not printed yet. Every spool and refill of this filament shares this label."
          )}
        </p>
      </div>
    </Card>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
