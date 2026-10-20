/**
 * Filament (fork): one filament's own page, like Spoolman's. Its picture and
 * name; its spools (weigh, edit, retire, bring back, delete); its specs, edited
 * once for every spool; Bambu's catalogue facts; and Add spools of this.
 */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  ScaleIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, redirect, useFetcher, useLoaderData } from "react-router";
import { z } from "zod";
import { ErrorContent } from "~/components/errors";
import { FilamentCell } from "~/components/filament/filament-cell";
import { useAmsLive } from "~/components/filament/live-updates";
import {
  barFill,
  barTrack,
  CodeChip,
  levelColour,
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
  filamentKey,
  gramsLeft,
  spoolState,
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
import { daysOnHand, usageRate } from "~/modules/filament/run-out";
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
  FILAMENT_FIELDS,
  type FilamentField,
  SPOOL_FIELDS,
  type SpoolField,
  updateFilament,
  updateFilamentField,
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
      case "filament-field": {
        const field = String(form.get("field") ?? "");
        if (!(FILAMENT_FIELDS as readonly string[]).includes(field)) {
          throw new ShelfError({
            cause: null,
            message: "That can't be changed here.",
            status: 400,
            label: "Assets",
          });
        }
        const what = await updateFilamentField(
          organizationId,
          slug,
          field as FilamentField,
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
  icon = false,
}: {
  label: string;
  disabled: boolean;
  onDelete: () => void;
  /** As an icon button, like the Delete on asset rows */
  icon?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {icon ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="p-2"
            disabled={disabled}
            aria-label={`Delete ${label}`}
            tooltip="Delete"
          >
            <Trash2Icon className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
          >
            Delete
          </Button>
        )}
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

/** A date, or how it reads when it isn't known. */
function DateText({
  date,
  empty = "Not known",
}: {
  date: string | Date | null;
  empty?: string;
}) {
  return date ? (
    <DateS date={date} />
  ) : (
    <span className="text-gray-400">{empty}</span>
  );
}

/** Weigh it: the grams on the scale, less the empty spool, give what's left. */
function WeighButton({
  spool,
  number,
  tare,
  withText = false,
}: {
  spool: Spool;
  number: number;
  tare: number | null;
  /** "Weigh spool" as the In use card's main button */
  withText?: boolean;
}) {
  const act = useFetcher<Result>();
  const [open, setOpen] = useState(false);
  const [grams, setGrams] = useState("");
  const busy = isFormProcessing(act.state);
  if (spool.status === "retired") return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {withText ? (
          <Button type="button" aria-label={`Weigh #${number}`}>
            <span className="inline-flex items-center gap-2">
              <ScaleIcon className="size-4" aria-hidden="true" />
              Weigh spool
            </span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="p-2"
            aria-label={`Weigh #${number}`}
            tooltip="Weigh it"
          >
            <ScaleIcon className="size-4" aria-hidden="true" />
          </Button>
        )}
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
              setGrams("");
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
                : "Set the empty spool weight in the filament's details first."}
            </span>
            <Button type="submit" size="sm" disabled={busy || !tare || !grams}>
              Update what's left
            </Button>
          </form>
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
  const data = useLoaderData<typeof loader>();
  const { filament, catalogue, images, price, codes, fil, label } = data;
  // the page follows the AMS live: levels and slots update in place
  const { live } = useAmsLive(null, data);
  const spools = useMemo(() => live(data.spools), [live, data.spools]);
  const picture = useFetcher<Result>();
  const [params] = useSearchParams();
  const finished = spools.filter((s) => s.status === "retired");
  const onHand = spools.filter((s) => s.status !== "retired");
  const sealed = onHand.filter((s) => spoolState(s) === "new");
  const open = onHand.filter((s) => spoolState(s) !== "new");
  const inUse = primaryOpen(open);
  const alsoOpen = open.filter((s) => s !== inUse);
  // each item keeps its number, by the order it was added
  const numbers = new Map(
    [...spools]
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      .map((s, i) => [s.id, i + 1])
  );
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
  // the run-out estimate: the spool in use's rate since it was opened
  const rate = inUse ? usageRate(inUse) : null;

  return (
    <>
      <Header>
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

      {/* Ant's design: the summary on top; the spools on the left; Reorder,
          Print settings and Label on the right */}
      <div className="mt-4 flex flex-col gap-5">
        {params.get("add") === "1" ? (
          <AddMore
            storePrices={{
              spool: priceSummary(price?.variants).spool?.now ?? null,
              refill: priceSummary(price?.variants).refill?.now ?? null,
            }}
          />
        ) : null}

        <SummaryCard
          filament={filament}
          images={images as Images}
          codes={codes}
          code={code}
          fil={fil}
          grams={grams}
          openCount={open.length}
          sealedCount={sealed.length}
          perKg={perKg}
          spent={anyPrice ? spent : null}
          daysLeft={daysOnHand(grams, rate?.perDay ?? null)}
        />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            {inUse ? (
              <div className="flex flex-col gap-3">
                <InUseCard
                  spool={inUse}
                  number={numbers.get(inUse.id) ?? 0}
                  tare={tare}
                />
                {alsoOpen.map((s) => (
                  <AlsoOpenRow
                    key={s.id}
                    spool={s}
                    number={numbers.get(s.id) ?? 0}
                    tare={tare}
                  />
                ))}
              </div>
            ) : null}
            <SealedCard items={sealed} numbers={numbers} tare={tare} />
            <FinishedCard items={finished} numbers={numbers} />
          </div>
          <div className="flex flex-col gap-5">
            <ReorderCard
              price={price}
              paidPerKg={perKg}
              bought={spools.length}
              productUrl={price?.productUrl ?? image?.productUrl ?? null}
            />
            <PrintSettingsCard
              filament={filament}
              catalogue={catalogue}
              tare={tare}
              code={code}
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
      </div>
    </>
  );
}

// ------------------------------------------- the page, after Ant's design

const sectionHead =
  "flex flex-wrap items-center gap-2 border-b border-gray-200 px-5 py-3.5";
const factLabel = "text-xs font-medium text-gray-500";
const factValue = "text-sm font-semibold tabular-nums text-gray-900";

/** Grams as the page shows them: "270 g", "1.24 kg". */
function weightText(grams: number) {
  return grams >= 1000
    ? `${(grams / 1000).toFixed(2)} kg`
    : `${Math.round(grams)} g`;
}

/** The spool to put in the In use card: the one in the AMS, else the latest opened. */
function primaryOpen(open: Spool[]) {
  return (
    open.find((s) => s.amsSlot !== null) ??
    [...open].sort(
      (a, b) =>
        new Date(b.openedOn ?? 0).getTime() -
        new Date(a.openedOn ?? 0).getTime()
    )[0] ??
    null
  );
}

/** What's left, as a ring: orange, red at a tenth or less. */
function LevelRing({ spool, size = 140 }: { spool: Spool; size?: number }) {
  const percent = Math.max(0, Math.min(100, spool.remainingPercent));
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: "var(--level-track)" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * percent) / 100} ${c}`}
          style={{ stroke: levelColour(percent) }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-bold tabular-nums text-gray-900">
          {weightText(gramsLeft(spool))}
        </span>
        <span className="text-xs text-gray-500">{percent}% left</span>
      </div>
    </div>
  );
}

/** The summary across the top: the filament, and its three figures. */
function SummaryCard({
  filament,
  images,
  codes,
  code,
  fil,
  grams,
  openCount,
  sealedCount,
  perKg,
  spent,
  daysLeft,
}: {
  filament: PageData["filament"];
  images: Images;
  codes: PageData["codes"];
  code: string | null;
  fil: { id: string; label: string } | null;
  grams: number;
  openCount: number;
  sealedCount: number;
  perKg: number | null;
  spent: number | null;
  daysLeft: number | null;
}) {
  const money = useMoney();
  return (
    <Card className="my-0 flex flex-col gap-6 p-5 lg:flex-row lg:items-center">
      <div className="flex items-center gap-5">
        <PicturePopover filament={filament} images={images} codes={codes} />
        <div className="min-w-0">
          <div className="text-display-xs font-semibold text-gray-900">
            {filament.colourName}
          </div>
          <div className="text-sm text-gray-600">
            {filament.type} · Bambu Lab · 1.75 mm
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {code ? <CodeChip code={code} /> : null}
            <FilamentIdChip fil={fil} className="h-6" />
          </div>
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-3 gap-6 lg:ml-auto lg:max-w-2xl">
        <div>
          <dt className={factLabel}>On hand</dt>
          <dd className="text-display-xs font-semibold tabular-nums text-gray-900">
            {(grams / 1000).toFixed(2)} kg
          </dd>
          {daysLeft !== null ? (
            <dd className="text-xs text-gray-500">
              ≈ {daysLeft} days at your recent rate
            </dd>
          ) : null}
        </div>
        <div>
          <dt className={factLabel}>Units</dt>
          <dd className="text-display-xs font-semibold tabular-nums text-gray-900">
            {openCount + sealedCount}
          </dd>
          <dd className="text-xs text-gray-500">
            {openCount} open · {sealedCount} sealed
          </dd>
        </div>
        <div>
          <dt className={factLabel}>Your cost</dt>
          <dd className="text-display-xs font-semibold tabular-nums text-gray-900">
            {perKg !== null ? (
              <>
                {money(perKg)}
                <span className="text-sm font-medium text-gray-500">/kg</span>
              </>
            ) : (
              "—"
            )}
          </dd>
          {spent !== null ? (
            <dd className="text-xs text-gray-500">
              {money(spent)} spent in total
            </dd>
          ) : null}
        </div>
      </dl>
    </Card>
  );
}

/** The spool in use: its ring, what's known about it, Weigh and Mark finished. */
function InUseCard({
  spool,
  number,
  tare,
}: {
  spool: Spool;
  number: number;
  tare: number | null;
}) {
  const money = useMoney();
  const act = useFetcher<Result>();
  const rate = usageRate(spool);
  const where =
    spool.amsSlot !== null ? `AMS ${spool.amsSlot}` : "On the shelf";
  const facts: [string, ReactNode, ReactNode?][] = [
    ["Opened", <DateText key="o" date={spool.openedOn} empty="—" />],
    [
      "Used so far",
      weightText(rate.used),
      rate.perDay !== null ? `≈ ${Math.round(rate.perDay)} g a day` : undefined,
    ],
    rate.runsOut
      ? [
          "Runs out",
          `≈ ${rate.runsOut.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}`,
          "at this rate",
        ]
      : ["Where", where],
    ["Paid", spool.pricePaid !== null ? money(spool.pricePaid) : "—"],
    ["Bought", <DateText key="b" date={spool.purchasedOn} />],
    [
      "Tare (empty)",
      (spool.spoolWeightGrams ?? tare) !== null
        ? `${spool.spoolWeightGrams ?? tare} g`
        : "—",
    ],
  ];
  return (
    <Card className="my-0 p-0">
      <div className={sectionHead}>
        <h3 className="text-text-md font-semibold text-gray-900">
          {spool.amsSlot !== null ? "In use" : "Open"}
        </h3>
        <span className="rounded-md bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
          #{number} · {spool.packaging === "refill" ? "Refill" : "Spool"}
        </span>
        <span className="text-sm text-gray-500">{where}</span>
        <span className="ml-auto flex items-center gap-2">
          <WeighButton
            spool={spool}
            number={number}
            tare={spool.spoolWeightGrams ?? tare}
            withText
          />
          <Button
            type="button"
            variant="secondary"
            disabled={isFormProcessing(act.state)}
            onClick={() =>
              void act.submit(
                { intent: "retire", id: spool.id },
                { method: "post" }
              )
            }
          >
            Mark finished
          </Button>
        </span>
      </div>
      <div className="flex flex-col items-center gap-8 p-6 sm:flex-row">
        <LevelRing spool={spool} />
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
          {facts.map(([k, v, sub]) => (
            <div key={k}>
              <dt className={factLabel}>{k}</dt>
              <dd className={factValue}>{v}</dd>
              {sub ? <dd className="text-xs text-gray-500">{sub}</dd> : null}
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

/** Another open spool: a slim row under the In use card. */
function AlsoOpenRow({
  spool,
  number,
  tare,
}: {
  spool: Spool;
  number: number;
  tare: number | null;
}) {
  const state = spoolState(spool);
  return (
    <Card className="my-0 flex flex-wrap items-center gap-4 px-5 py-3">
      <span className="rounded-md bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
        #{number} · {spool.packaging === "refill" ? "Refill" : "Spool"}
      </span>
      <span className="text-sm text-gray-500">
        {state === "run-out" ? "Run out?" : "Also open"} ·{" "}
        {spool.amsSlot !== null ? `AMS ${spool.amsSlot}` : "On the shelf"}
      </span>
      <span className="flex min-w-40 flex-1 items-center gap-3">
        <span
          className="h-1.5 flex-1 rounded-full"
          style={barTrack(spool.remainingPercent)}
        >
          <span
            className="block h-1.5 rounded-full"
            style={barFill(spool.remainingPercent)}
          />
        </span>
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          {weightText(gramsLeft(spool))}
        </span>
      </span>
      <RowMenu spool={spool} number={number} tare={tare} kind="open" />
    </Card>
  );
}

/** A row's ⋯ menu: weigh it, open it or bring it back, delete it. */
function RowMenu({
  spool,
  number,
  tare,
  kind,
}: {
  spool: Spool;
  number: number;
  tare: number | null;
  kind: "open" | "sealed" | "finished";
}) {
  const act = useFetcher<Result>();
  const [open, setOpen] = useState(false);
  const [weighing, setWeighing] = useState(false);
  const [grams, setGrams] = useState("");
  const busy = isFormProcessing(act.state);
  const label = `#${number} of ${spool.colourName}`;
  const empty = spool.spoolWeightGrams ?? tare;
  const item =
    "flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-50";
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setWeighing(false);
      }}
    >
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
          className="z-[60] w-60 rounded-md border border-gray-200 bg-white p-1.5 shadow-lg"
        >
          {weighing ? (
            <form
              className="flex flex-col gap-2 p-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void act.submit(
                  { intent: "weigh", id: spool.id, grossGrams: grams },
                  { method: "post" }
                );
                setGrams("");
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
                {empty
                  ? `Less the empty spool, ${empty} g.`
                  : "Set the empty spool weight in Print settings first."}
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={busy || !empty || !grams}
              >
                Update what's left
              </Button>
            </form>
          ) : (
            <>
              {kind !== "finished" ? (
                <button
                  type="button"
                  className={item}
                  onClick={() => setWeighing(true)}
                >
                  <ScaleIcon className="size-4" aria-hidden="true" /> Weigh it
                </button>
              ) : null}
              {kind === "sealed" ? (
                <button
                  type="button"
                  className={item}
                  disabled={busy}
                  onClick={() => {
                    void act.submit(
                      { intent: "open", id: spool.id, label },
                      { method: "post" }
                    );
                    setOpen(false);
                  }}
                >
                  <PackageOpenIcon className="size-4" aria-hidden="true" /> Open
                  it
                </button>
              ) : null}
              {kind === "open" ? (
                <button
                  type="button"
                  className={item}
                  disabled={busy}
                  onClick={() => {
                    void act.submit(
                      { intent: "retire", id: spool.id },
                      { method: "post" }
                    );
                    setOpen(false);
                  }}
                >
                  <CheckCircle2Icon className="size-4" aria-hidden="true" />{" "}
                  Mark finished
                </button>
              ) : null}
              {kind === "finished" ? (
                <button
                  type="button"
                  className={item}
                  disabled={busy}
                  onClick={() => {
                    void act.submit(
                      {
                        intent: "keep",
                        id: spool.id,
                        remainingPercent: String(spool.remainingPercent),
                      },
                      { method: "post" }
                    );
                    setOpen(false);
                  }}
                >
                  <Undo2Icon className="size-4" aria-hidden="true" /> Bring it
                  back
                </button>
              ) : null}
              <div className="px-1 pt-1">
                <DeleteSpool
                  label={label}
                  disabled={busy}
                  onDelete={() =>
                    void act.submit(
                      { intent: "delete", id: spool.id },
                      { method: "post" }
                    )
                  }
                />
              </div>
            </>
          )}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

/** Sealed stock: click a cell to change it. */
function SealedCard({
  items,
  numbers,
  tare,
}: {
  items: Spool[];
  numbers: Map<string, number>;
  tare: number | null;
}) {
  const money = useMoney();
  const grams = items.reduce((n, s) => n + gramsLeft(s), 0);
  const head = "px-5 py-2 text-left text-xs font-medium text-gray-500";
  const cell = "px-5 py-2.5 align-middle text-sm";
  return (
    <Card className="my-0 p-0">
      <div className={sectionHead}>
        <h3 className="text-text-md font-semibold text-gray-900">
          Sealed stock
        </h3>
        <span className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? "unit" : "units"} ·{" "}
          {(grams / 1000).toFixed(2)} kg
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">Nothing sealed left.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-25">
              <tr>
                <th className={head}>#</th>
                <th className={head}>Type</th>
                <th className={head}>Size</th>
                <th className={head}>Paid</th>
                <th className={head}>Bought</th>
                <th className={head} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((s) => (
                <tr key={s.id}>
                  <td className={tw(cell, "font-mono text-gray-400")}>
                    #{numbers.get(s.id)}
                  </td>
                  <td className={cell}>
                    <FilamentCell
                      id={s.id}
                      field="packaging"
                      label="Type"
                      editor={{
                        kind: "select",
                        value: s.packaging === "refill" ? "refill" : "spool",
                        options: [
                          { value: "spool", label: "Spool" },
                          { value: "refill", label: "Refill" },
                        ],
                      }}
                    >
                      {s.packaging === "refill" ? "Refill" : "Spool"}
                    </FilamentCell>
                  </td>
                  <td className={cell}>
                    <FilamentCell
                      id={s.id}
                      field="weightGrams"
                      label="Size (filament, g)"
                      editor={{
                        kind: "number",
                        value: s.weightGrams,
                        min: 1,
                        max: 10000,
                        suffix: "g",
                      }}
                    >
                      <span className="whitespace-nowrap tabular-nums">
                        {s.weightGrams >= 1000
                          ? `${s.weightGrams / 1000} kg`
                          : `${s.weightGrams} g`}
                      </span>
                    </FilamentCell>
                  </td>
                  <td className={cell}>
                    <FilamentCell
                      id={s.id}
                      field="pricePaid"
                      label="Price paid (£)"
                      editor={{
                        kind: "number",
                        value: s.pricePaid,
                        min: 0,
                        step: 0.01,
                      }}
                    >
                      <span className="tabular-nums">
                        {s.pricePaid !== null ? (
                          money(s.pricePaid)
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </span>
                    </FilamentCell>
                  </td>
                  <td className={cell}>
                    <FilamentCell
                      id={s.id}
                      field="purchasedOn"
                      label="Bought on"
                      editor={{ kind: "date", value: s.purchasedOn }}
                    >
                      {s.purchasedOn ? (
                        <DateText date={s.purchasedOn} />
                      ) : (
                        <span className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500">
                          Add date
                        </span>
                      )}
                    </FilamentCell>
                  </td>
                  <td className={tw(cell, "text-right")}>
                    <RowMenu
                      spool={s}
                      number={numbers.get(s.id) ?? 0}
                      tare={tare}
                      kind="sealed"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Finished spools and refills: kept for the history, folded away. */
function FinishedCard({
  items,
  numbers,
}: {
  items: Spool[];
  numbers: Map<string, number>;
}) {
  const money = useMoney();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const paid = items.reduce((n, s) => n + (s.pricePaid ?? 0), 0);
  return (
    <Card className="my-0 p-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3.5 text-left"
      >
        <ChevronDownIcon
          className={tw(
            "size-4 text-gray-500 transition",
            open ? "" : "-rotate-90"
          )}
          aria-hidden="true"
        />
        <span className="text-text-md font-semibold text-gray-900">
          Finished
        </span>
        <span className="text-sm text-gray-500">
          {items.length}
          {paid > 0 ? ` · ${money(paid)} paid` : ""}
        </span>
      </button>
      {open ? (
        <ul className="divide-y divide-gray-100 border-t border-gray-200">
          {items.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-4 px-5 py-2.5 text-sm text-gray-600"
            >
              <span className="font-mono text-gray-400">
                #{numbers.get(s.id)}
              </span>
              <span className="text-gray-900">
                {s.packaging === "refill" ? "Refill" : "Spool"}
              </span>
              <span>
                Bought <DateText date={s.purchasedOn} />
              </span>
              <span>
                Finished <DateText date={s.retiredAt} empty="—" />
              </span>
              <span className="ml-auto tabular-nums text-gray-900">
                {s.pricePaid !== null ? money(s.pricePaid) : "—"}
              </span>
              <RowMenu
                spool={s}
                number={numbers.get(s.id) ?? 0}
                tare={null}
                kind="finished"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/** Reorder: today's store prices, the refill's saving, and Buy. */
function ReorderCard({
  price,
  paidPerKg,
  bought,
  productUrl,
}: {
  price: PageData["price"];
  paidPerKg: number | null;
  bought: number;
  productUrl: string | null;
}) {
  const money = useMoney();
  const fetcher = useFetcher<Result>();
  const summary = priceSummary(price?.variants);
  const saving =
    summary.spool && summary.refill
      ? summary.spool.now - summary.refill.now
      : null;
  const option = (
    name: string,
    sub: ReactNode,
    p: { now: number; was: number | null },
    highlight: boolean
  ) => (
    <div
      className={tw(
        "flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
        highlight ? "border-primary-200 bg-primary-25" : "border-gray-200"
      )}
    >
      <div>
        <div className="text-sm font-semibold text-gray-900">{name}</div>
        <div
          className={tw(
            "text-xs",
            highlight ? "text-primary-700" : "text-gray-500"
          )}
        >
          {sub}
        </div>
      </div>
      <div className="text-right">
        <div className="text-md font-semibold tabular-nums text-gray-900">
          {money(p.now)}
        </div>
        {p.was ? (
          <div className="text-xs text-gray-400 line-through">
            {money(p.was)}
          </div>
        ) : null}
      </div>
    </div>
  );
  return (
    <Card className="my-0 p-0">
      <div className={sectionHead}>
        <h3 className="text-text-md font-semibold text-gray-900">Reorder</h3>
        {summary.onOffer ? (
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            On offer
          </span>
        ) : null}
        <fetcher.Form method="post" className="ml-auto">
          <input type="hidden" name="intent" value="check-prices" />
          <button
            type="submit"
            disabled={isFormProcessing(fetcher.state)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
            title="Check the store now"
          >
            <RefreshCwIcon
              className={tw(
                "size-3.5",
                isFormProcessing(fetcher.state) && "animate-spin"
              )}
              aria-hidden="true"
            />
            {price ? `Checked ${ago(price.checkedAt)}` : "Check now"}
          </button>
        </fetcher.Form>
      </div>
      <div className="flex flex-col gap-3 p-5">
        {price?.status === "found" ? (
          <>
            {summary.spool
              ? option("Spool · 1 kg", "Bambu store", summary.spool, false)
              : null}
            {summary.refill
              ? option(
                  "Refill · 1 kg",
                  saving !== null && saving > 0
                    ? `${money(saving)} cheaper: reuses an empty spool`
                    : "Reuses an empty spool",
                  summary.refill,
                  saving !== null && saving > 0
                )
              : null}
            {!summary.spool && !summary.refill ? (
              <p className="text-sm text-gray-500">
                The store has no 1 kg price for this colour.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-gray-500">
            {price ? price.message : "Not checked yet."}
          </p>
        )}
        {paidPerKg !== null ? (
          <p className="text-xs text-gray-500">
            You've averaged {money(paidPerKg)}/kg across {bought}{" "}
            {bought === 1 ? "purchase" : "purchases"}.
          </p>
        ) : null}
        {productUrl ? (
          <Button
            to={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            width="full"
            className="justify-center"
          >
            <span className="inline-flex items-center gap-2">
              Buy on the Bambu store
              <ExternalLinkIcon className="size-4" aria-hidden="true" />
            </span>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Print settings: the catalogue's temperatures and facts; code and empty spool can be changed. */
function PrintSettingsCard({
  filament,
  catalogue,
  tare,
  code,
}: {
  filament: PageData["filament"];
  catalogue: PageData["catalogue"];
  tare: number | null;
  code: string | null;
}) {
  const tile = (k: string, v: number | null | undefined) => (
    <div className="rounded-lg bg-gray-25 px-4 py-3 ring-1 ring-inset ring-gray-200">
      <div className={factLabel}>{k}</div>
      <div className="text-display-xs font-semibold tabular-nums text-gray-900">
        {v ? `${v} °C` : "—"}
      </div>
    </div>
  );
  return (
    <Card className="my-0 p-0">
      <div className={sectionHead}>
        <h3 className="text-text-md font-semibold text-gray-900">
          Print settings
        </h3>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          {tile("Nozzle", catalogue?.nozzleTemp)}
          {tile("Bed", catalogue?.bedTemp)}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className={factLabel}>Material</dt>
            <dd className={factValue}>{filament.material}</dd>
          </div>
          <div>
            <dt className={factLabel}>Diameter</dt>
            <dd className={factValue}>1.75 mm</dd>
          </div>
          <div>
            <dt className={factLabel}>Density</dt>
            <dd className={factValue}>
              {catalogue?.density ? `${catalogue.density} g/cm³` : "—"}
            </dd>
          </div>
          <div>
            <dt className={factLabel}>Empty spool</dt>
            <dd className={factValue}>
              <FilamentCell
                id=""
                intent="filament-field"
                field="spoolWeightGrams"
                label="Empty spool"
                editor={{
                  kind: "number",
                  value: filament.spoolWeightGrams,
                  min: 0,
                  max: 2000,
                  suffix: "g",
                }}
              >
                {filament.spoolWeightGrams !== null
                  ? `${filament.spoolWeightGrams} g`
                  : tare
                  ? `${tare} g`
                  : "—"}
              </FilamentCell>
            </dd>
          </div>
          <div className="col-span-2">
            <dt className={factLabel}>Code on the box</dt>
            <dd className={factValue}>
              <FilamentCell
                id=""
                intent="filament-field"
                field="filamentCode"
                label="Code on the box"
                editor={{
                  kind: "text",
                  value: code ?? "",
                  placeholder: "e.g. 10100",
                }}
              >
                {code ? (
                  <CodeChip code={code} />
                ) : (
                  <span className="text-gray-400">Add it</span>
                )}
              </FilamentCell>
            </dd>
          </div>
        </dl>
        {!catalogue ? (
          <p className="text-xs text-gray-500">
            This line isn't in Bambu's catalogue.
          </p>
        ) : (
          <p className="text-xs text-gray-400">From Bambu's catalogue.</p>
        )}
      </div>
    </Card>
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
