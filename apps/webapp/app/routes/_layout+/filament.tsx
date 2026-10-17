/**
 * Filament (fork): Bambu Lab spools, laid out like the assets list. Add
 * spools in the header; a compact strip with the figures and the AMS; the
 * inbox and spools that have run out; a filter bar (state, search, sort,
 * line); the filaments as tiles or a list, each opening its own page; and
 * Shelf's own bottom bar (pages, per page, back to the top, Tile or List).
 */
import { useEffect, type ReactNode } from "react";
import { GlobeIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, Form, Link, useFetcher, useLoaderData } from "react-router";
import { z } from "zod";
import { ErrorContent } from "~/components/errors";
import {
  FilamentPicture,
  inputClass,
  SpoolFields,
  Swatch,
  barColour,
  useMoney,
  type Images,
  type Result,
} from "~/components/filament/parts";
import { ChevronRight } from "~/components/icons/library";
import Header from "~/components/layout/header";
import { useSidebar } from "~/components/layout/sidebar/sidebar";
import { Pagination } from "~/components/list/pagination";
import { Button } from "~/components/shared/button";
import { ButtonGroup } from "~/components/shared/button-group";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import { useSearchParams } from "~/hooks/search-params";
import { useViewportHeight } from "~/hooks/use-viewport-height";
import {
  AMS_SLOTS,
  costPerKg,
  filamentKey,
  filamentSlug,
  groupSpools,
  spoolState,
  stateCounts,
  summarise,
} from "~/modules/filament/catalogue";
import {
  fetchMissingImages,
  imageStatuses,
} from "~/modules/filament/images.server";
import { done, failed } from "~/modules/filament/notify.server";
import { priceSummary, type PriceSummary } from "~/modules/filament/prices";
import {
  priceStatuses,
  refreshStalePrices,
} from "~/modules/filament/prices.server";
import {
  approveCandidate,
  createSpools,
  dismissCandidate,
  getFilament,
  keepSpool,
  retireSpool,
} from "~/modules/filament/service.server";
import { resolveFilamentView } from "~/modules/filament/view.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { updateCookieWithPerPage, userPrefs } from "~/utils/cookies.server";
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

const STATES = {
  all: "All",
  new: "New",
  opened: "Opened",
  inuse: "In use",
  out: "Run out?",
  offer: "On offer",
} as const;
const SORTS = {
  recent: "Recently added",
  line: "Line",
  colour: "Colour",
  most: "Most left",
  least: "Least left",
  cheapest: "Store price",
} as const;
type State = keyof typeof STATES;
type Sort = keyof typeof SORTS;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    const url = new URL(request.url);
    const search = (url.searchParams.get("s") ?? "").trim();
    const stateParam = url.searchParams.get("state") ?? "all";
    const state: State = stateParam in STATES ? (stateParam as State) : "all";
    const sortParam = url.searchParams.get("sort") ?? "recent";
    const sort: Sort = sortParam in SORTS ? (sortParam as Sort) : "recent";
    const line = (url.searchParams.get("line") ?? "").trim();
    const pageParam = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const perPageParam = Number(url.searchParams.get("per_page")) || 0;
    const prefs = await updateCookieWithPerPage(request, perPageParam);
    const perPage = Number(prefs.perPage) || 20;

    const [{ spools, candidates }, images, { view, setCookie }] =
      await Promise.all([
        getFilament(organizationId),
        imageStatuses(organizationId),
        resolveFilamentView(request),
      ]);
    // store prices: what's kept, and a background check of anything over a day old
    const storePrices = await priceStatuses(organizationId);
    refreshStalePrices(organizationId);
    const prices: Record<string, PriceSummary> = Object.fromEntries(
      Object.entries(storePrices).map(([key, p]) => [
        key,
        priceSummary(p.variants),
      ])
    );

    // spools on hand (active, or run out and waiting), then the filters
    const q = search.toLowerCase();
    const onHand = spools.filter((s) => s.status !== "retired");
    const matched = onHand.filter(
      (s) =>
        (state === "all" ||
          (state === "new" && spoolState(s) === "new") ||
          (state === "opened" && spoolState(s) === "opened") ||
          (state === "inuse" && spoolState(s) === "in-use") ||
          (state === "out" && spoolState(s) === "run-out") ||
          (state === "offer" &&
            Boolean(prices[filamentKey(s.type, s.colourName)]?.onOffer))) &&
        (!line || s.type === line) &&
        (!q ||
          `${s.type} ${s.material} ${s.colourName} ${s.filamentCode ?? ""}`
            .toLowerCase()
            .includes(q))
    );
    const newest = (g: { spools: { createdAt: Date | string }[] }) =>
      Math.max(...g.spools.map((s) => new Date(s.createdAt).getTime()));
    const groups = groupSpools(matched)
      .map((g) => ({ ...g, slug: filamentSlug(g.type, g.colourName) }))
      .sort((a, b) => {
        switch (sort) {
          case "line":
            return (
              a.type.localeCompare(b.type) ||
              a.colourName.localeCompare(b.colourName)
            );
          case "colour":
            return a.colourName.localeCompare(b.colourName);
          case "most":
            return b.gramsLeft - a.gramsLeft;
          case "least":
            return a.gramsLeft - b.gramsLeft;
          case "cheapest": {
            const pa = prices[a.key]?.best ?? Infinity;
            const pb = prices[b.key]?.best ?? Infinity;
            return pa - pb;
          }
          default:
            return newest(b) - newest(a);
        }
      });
    const totalItems = groups.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const page = Math.min(pageParam, totalPages);

    const headers = new Headers();
    headers.append("Set-Cookie", await userPrefs.serialize(prefs));
    if (setCookie) headers.append("Set-Cookie", setCookie);

    return data(
      payload({
        header: { title: "Filament" },
        view,
        spools,
        candidates,
        images,
        prices,
        anyPrice: spools.some((s) => s.pricePaid !== null),
        lines: [...new Set(onHand.map((s) => s.type))].sort(),
        filters: { search, state, sort, line },
        items: groups.slice((page - 1) * perPage, page * perPage),
        page,
        perPage,
        totalItems,
        totalPages,
        modelName: { singular: "filament", plural: "filaments" },
      }),
      { headers }
    );
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
  let intent = "";
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const form = await request.formData();
    intent = String(form.get("intent") ?? "");
    const id = String(form.get("id") ?? "");

    switch (intent) {
      case "create": {
        const input = parseData(form, SpoolForm);
        const made = await createSpools(
          organizationId,
          input,
          Number(form.get("quantity") ?? 1)
        );
        fetchMissingImages(organizationId); // the picture, in the background
        return done(
          userId,
          made.length === 1 ? "Spool added" : `${made.length} spools added`,
          `${input.colourName} · ${input.type}`
        );
      }
      case "check-prices":
        return done(
          userId,
          "Checking prices",
          refreshStalePrices(organizationId, { force: true })
            ? "Prices are being checked on the Bambu store. Refresh in a minute or two."
            : "Prices are already being checked. Refresh in a minute or two."
        );
      case "fetch-images":
        return done(
          userId,
          "Getting pictures",
          fetchMissingImages(organizationId)
            ? "Pictures are coming from the Bambu store. Refresh in a minute or two."
            : "Pictures are already on their way. Refresh in a minute or two."
        );
      case "approve": {
        const input = parseData(form, SpoolForm);
        const quantity = Math.max(1, Number(form.get("quantity") ?? 1) || 1);
        await approveCandidate(organizationId, id, input, quantity);
        fetchMissingImages(organizationId);
        return done(
          userId,
          quantity === 1 ? "Spool added" : `${quantity} spools added`,
          `${input.colourName} · ${input.type}, from the inbox`
        );
      }
      case "dismiss":
        await dismissCandidate(organizationId, id);
        return done(userId, "Dismissed", "Removed from Waiting for you.");
      case "retire":
        await retireSpool(organizationId, id);
        return done(
          userId,
          "Spool retired",
          "It's in Finished spools, and can be brought back from there."
        );
      case "keep": {
        const percent = Number(form.get("remainingPercent") ?? 0);
        await keepSpool(organizationId, id, percent);
        return done(userId, "Spool back in use", `${percent}% left.`);
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
type SpoolRow = PageData["spools"][number];
type CandidateRow = PageData["candidates"][number];
type Group = PageData["items"][number];

/** Add spools, opened by the header's button (?add=1), closed when done. */
function AddSpoolPanel() {
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
      <fetcher.Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="create" />
        <h3 className="text-text-md font-semibold text-gray-900">Add spools</h3>
        <SpoolFields withQuantity />
        <div className="flex items-center justify-end gap-3">
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

/** The figures and the AMS, in one compact strip. "—" for money nobody has recorded. */
function Overview({
  spools,
  images,
  anyPrice,
}: {
  spools: SpoolRow[];
  images: Images;
  anyPrice: boolean;
}) {
  const money = useMoney();
  const summary = summarise(spools);
  const newSpools = spools.filter((s) => spoolState(s) === "new").length;
  const figures: [string, string][] = [
    ["Spools", `${summary.spools}${newSpools ? ` (${newSpools} new)` : ""}`],
    ["Filament left", `${(summary.gramsLeft / 1000).toFixed(1)} kg`],
    ["Worth", anyPrice ? money(summary.valueLeft) : "—"],
    ["Spent", anyPrice ? money(summary.spent) : "—"],
  ];
  return (
    <Card className="my-0 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="grid grid-cols-4 gap-3">
        {figures.map(([k, v]) => (
          <div key={k}>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {k}
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">
              {v}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {AMS_SLOTS.map((n) => {
          const s = spools.find(
            (x) => x.amsSlot === n && x.status !== "retired"
          );
          return (
            <div
              key={n}
              className="flex min-w-0 items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5"
            >
              {s ? (
                <FilamentPicture {...s} images={images} size="size-8" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  AMS {n}
                </div>
                {s ? (
                  <div className="truncate text-xs text-gray-900">
                    {s.colourName}{" "}
                    <span className="tabular-nums text-gray-500">
                      {s.remainingPercent}%
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** The filter bar, like the assets list's: state, search, sort, and line. */
function FilterBar({
  filters,
  lines,
}: {
  filters: PageData["filters"];
  lines: string[];
}) {
  const submit = (e: { currentTarget: HTMLSelectElement }) =>
    e.currentTarget.form?.requestSubmit();
  const select =
    "rounded border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm text-gray-700";
  return (
    <Card className="my-0">
      <Form method="get" className="flex flex-wrap items-center gap-2">
        <select
          name="state"
          defaultValue={filters.state}
          onChange={submit}
          className={select}
          aria-label="Show"
        >
          {Object.entries(STATES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="relative flex min-w-64 flex-1 items-center md:max-w-md">
          <SearchIcon
            className="pointer-events-none absolute left-3 size-4 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="search"
            name="s"
            defaultValue={filters.search}
            placeholder="Search filament: a line, colour or code"
            className={tw(inputClass, "py-2 pl-9")}
            aria-label="Search filament"
          />
        </label>
        <select
          name="sort"
          defaultValue={filters.sort}
          onChange={submit}
          className={select}
          aria-label="Sort"
        >
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              Sorted by: {v}
            </option>
          ))}
        </select>
        <select
          name="line"
          defaultValue={filters.line}
          onChange={submit}
          className={tw(select, "ml-auto border-transparent text-gray-600")}
          aria-label="Line"
        >
          <option value="">All lines</option>
          {lines.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Form>
    </Card>
  );
}

/** Check every filament's store price now, in the background. */
function CheckPrices() {
  const fetcher = useFetcher<Result>();
  return (
    <fetcher.Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="check-prices" />
      <Button
        type="submit"
        variant="secondary"
        disabled={isFormProcessing(fetcher.state)}
      >
        Check prices
      </Button>
    </fetcher.Form>
  );
}

/** A filament's spools in words: "2 new · 1 open", or "3 spools". */
function spoolCountWords(spools: Parameters<typeof stateCounts>[0]) {
  const c = stateCounts(spools);
  const parts = [
    c.new ? `${c.new} new` : "",
    c.open ? `${c.open} open` : "",
  ].filter(Boolean);
  return parts.length
    ? parts.join(" · ")
    : `${spools.length} spool${spools.length === 1 ? "" : "s"}`;
}

/** One labelled fact, as on an asset tile. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="truncate text-[13px] text-gray-800">{children}</div>
    </div>
  );
}

/** A filament as a tile, like an asset tile: the picture with chips, the facts, the actions. */
function FilamentTile({
  group,
  images,
  price,
}: {
  group: Group;
  images: Images;
  price?: PriceSummary;
}) {
  const money = useMoney();
  const image = images[group.key];
  const href = `/filament/${group.slug}`;
  const priced = group.spools
    .map((s) => costPerKg(s))
    .filter((n): n is number => n !== null);
  const perKg = priced.length
    ? priced.reduce((a, b) => a + b, 0) / priced.length
    : null;
  const full = group.spools.reduce((n, s) => n + s.weightGrams, 0);
  const leftPercent = full > 0 ? Math.round((group.gramsLeft / full) * 100) : 0;
  const chip =
    "rounded-full bg-white px-2 py-0.5 text-xs font-medium shadow-sm ring-1 ring-black/5";
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md">
      <div className="relative aspect-square bg-gray-50">
        <Link to={href} className="block size-full">
          {image?.status === "found" ? (
            <img
              src={`/api/filament/image/${encodeURIComponent(group.key)}`}
              alt={`${group.colourName} ${group.type}`}
              className="size-full object-contain"
              loading="lazy"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <Swatch hex={group.colourHex} size="size-24" />
            </span>
          )}
        </Link>
        {price?.onOffer ? (
          <span
            className={tw(
              chip,
              "pointer-events-none absolute left-2 top-2 text-primary-700"
            )}
          >
            On offer
          </span>
        ) : null}
        <div className="pointer-events-none absolute right-2 top-2 flex flex-wrap justify-end gap-1">
          <span className={tw(chip, "flex items-center gap-1.5 text-gray-800")}>
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full ring-1 ring-black/10"
              style={{ background: group.colourHex }}
            />
            {spoolCountWords(group.spools)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <Link to={href} className="hover:underline">
          <span className="block text-[15px] font-semibold leading-snug text-gray-900">
            {group.colourName}
          </span>
          <span className="block text-xs text-gray-500">{group.type}</span>
        </Link>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-100 pt-3">
          <Fact label="Left">
            {(group.gramsLeft / 1000).toFixed(2)} kg
            <span className="mt-1 block h-1 rounded-full bg-gray-100">
              <span
                className={tw("block h-1 rounded-full", barColour(leftPercent))}
                style={{ width: `${leftPercent}%` }}
              />
            </span>
          </Fact>
          <Fact label="Spools">{group.spools.length}</Fact>
          <Fact label="Paid/kg">{perKg !== null ? money(perKg) : "—"}</Fact>
          <Fact label="Store">
            {price?.best != null ? (
              <>
                {money(price.best)}
                {price.onOffer ? (
                  <span className="ml-1 text-xs text-gray-400 line-through">
                    {money(
                      Math.max(price.spool?.was ?? 0, price.refill?.was ?? 0)
                    )}
                  </span>
                ) : null}
              </>
            ) : (
              "—"
            )}
          </Fact>
        </div>
      </div>

      <div className="flex gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2">
        <Button
          to={href}
          variant="secondary"
          size="sm"
          className="p-2"
          aria-label="Open"
          tooltip="Open"
        >
          <PencilIcon className="size-4" />
        </Button>
        <Button
          to={`${href}?add=1`}
          variant="secondary"
          size="sm"
          className="p-2"
          aria-label="Add spools of this"
          tooltip="Add spools of this"
        >
          <PlusIcon className="size-4" />
        </Button>
        {image?.productUrl ? (
          <Button
            to={image.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            hideNewTabIcon
            variant="secondary"
            size="sm"
            className="p-2"
            aria-label="See it on the Bambu store"
            tooltip="See it on the Bambu store"
          >
            <GlobeIcon className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
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
      {!fetcher.data && problem ? (
        <span className="text-xs text-gray-500">Last time: {problem}</span>
      ) : null}
    </fetcher.Form>
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
        <SpoolFields initial={candidate} withQuantity />
        <div className="flex items-center justify-end gap-2">
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

/** A filament in the list: one row, opening its page. */
function FilamentListRow({
  group,
  images,
  price,
}: {
  group: Group;
  images: Images;
  price?: PriceSummary;
}) {
  const money = useMoney();
  const priced = group.spools
    .map((s) => costPerKg(s))
    .filter((n): n is number => n !== null);
  const perKg = priced.length
    ? priced.reduce((a, b) => a + b, 0) / priced.length
    : null;
  const slots = group.spools
    .map((s) => s.amsSlot)
    .filter((n): n is number => n !== null);
  return (
    <li>
      <Link
        to={`/filament/${group.slug}`}
        className="flex items-center gap-4 py-3 hover:bg-gray-25"
      >
        <FilamentPicture {...group} images={images} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900">{group.colourName}</div>
          <div className="text-xs text-gray-500">
            {group.type}
            {slots.map((n) => (
              <span
                key={n}
                className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-gray-700"
              >
                AMS {n}
              </span>
            ))}
          </div>
        </div>
        <div
          className="hidden w-48 flex-col gap-1 md:flex"
          aria-label="Left on each spool"
        >
          {group.spools.slice(0, 3).map((s) => (
            <div key={s.id} className="h-1.5 rounded-full bg-gray-100">
              <div
                className={tw(
                  "h-1.5 rounded-full",
                  barColour(s.remainingPercent)
                )}
                style={{ width: `${s.remainingPercent}%` }}
              />
            </div>
          ))}
        </div>
        <div className="w-24 text-right text-sm">
          <div className="tabular-nums text-gray-900">
            {(group.gramsLeft / 1000).toFixed(2)} kg
          </div>
          <div className="text-xs text-gray-500">
            {spoolCountWords(group.spools)}
          </div>
        </div>
        <div className="hidden w-20 text-right text-xs tabular-nums text-gray-500 sm:block">
          {perKg !== null ? `${money(perKg)}/kg` : ""}
        </div>
        <div className="w-24 text-right text-sm">
          {price?.best != null ? (
            <>
              <div className="tabular-nums text-gray-900">
                {money(price.best)}
              </div>
              <div
                className={tw(
                  "text-xs",
                  price.onOffer
                    ? "font-medium text-primary-700"
                    : "text-gray-500"
                )}
              >
                {price.onOffer ? "On offer" : "store"}
              </div>
            </>
          ) : null}
        </div>
        <ChevronRight className="text-gray-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** The bottom bar, as on the assets list: pages, per page, back to the top, Tile or List. */
function FilamentBottomBar({ view }: { view: "tile" | "list" }) {
  const { isMd } = useViewportHeight();
  const { state } = useSidebar();
  const active =
    "cursor-not-allowed pointer-events-none bg-gray-50 text-gray-800";
  function toTop() {
    const target: Element | Window = document.querySelector("main") ?? window;
    target.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div
      className={tw(
        "asset-index-pagination flex flex-col items-center justify-between border-t border-gray-200 bg-white transition-all delay-75 ease-in-out md:flex-row",
        isMd ? "fixed bottom-0 right-0 z-[12]" : "",
        state === "collapsed" ? "lg:left-[48px]" : "lg:left-[256px]"
      )}
    >
      <Pagination className="px-4 py-[6px]" />
      <div className="flex items-stretch gap-2 px-4 py-[6px]">
        <Button
          type="button"
          onClick={toTop}
          variant="secondary"
          title="Scroll to top"
          aria-label="Scroll to top"
          className="h-[34px]"
        >
          <ChevronRight className="chev -rotate-90" />
        </Button>
        <ButtonGroup>
          <Button
            to="?view=tile"
            variant="secondary"
            className={tw("h-[34px]", view === "tile" ? active : "")}
            aria-label="Show as tiles"
          >
            Tile
          </Button>
          <Button
            to="?view=list"
            variant="secondary"
            className={tw("h-[34px]", view === "list" ? active : "")}
            aria-label="Show as a list"
          >
            List
          </Button>
        </ButtonGroup>
      </div>
    </div>
  );
}

export default function FilamentPage() {
  const {
    spools,
    candidates,
    images,
    prices,
    view,
    items,
    totalItems,
    anyPrice,
    filters,
    lines,
  } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const adding = params.get("add") === "1";
  const empty = spools.filter((s) => s.status === "empty");
  const retired = spools.filter((s) => s.status === "retired");
  const onHand = spools.filter((s) => s.status !== "retired");
  const filtered = Boolean(
    filters.search || filters.line || filters.state !== "all"
  );
  return (
    <>
      <Header hidePageDescription>
        <div className="flex items-center gap-2">
          <GetPictures images={images} spools={spools} />
          {onHand.length > 0 ? <CheckPrices /> : null}
          {onHand.length > 0 ? (
            <Button to="/filament/stocktake" variant="secondary">
              Stocktake
            </Button>
          ) : null}
          <Button to="?add=1" disabled={adding}>
            Add spools
          </Button>
        </div>
      </Header>
      <div className="mt-4 flex flex-col gap-4 pb-20">
        {adding ? <AddSpoolPanel /> : null}

        <Overview spools={spools} images={images} anyPrice={anyPrice} />

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

        <FilterBar filters={filters} lines={lines} />

        {onHand.length === 0 ? (
          <Card className="my-0">
            <p className="text-sm text-gray-600">
              No spools yet. Add your first with Add spools, at the top.
            </p>
          </Card>
        ) : totalItems === 0 ? (
          <Card className="my-0">
            <p className="text-sm text-gray-600">
              Nothing matches{filtered ? " these filters" : ""}.{" "}
              <Link to="/filament" className="text-primary-600 hover:underline">
                Show everything
              </Link>
            </p>
          </Card>
        ) : view === "tile" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((g) => (
              <FilamentTile
                key={g.key}
                group={g}
                images={images}
                price={prices[g.key]}
              />
            ))}
          </div>
        ) : (
          <Card className="my-0 py-0">
            <ul className="divide-y divide-gray-100">
              {items.map((g) => (
                <FilamentListRow
                  key={g.key}
                  group={g}
                  images={images}
                  price={prices[g.key]}
                />
              ))}
            </ul>
          </Card>
        )}

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
      <FilamentBottomBar view={view} />
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
