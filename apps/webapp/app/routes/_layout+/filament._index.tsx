/**
 * Filament (fork): Bambu Lab spools, laid out like the assets list. Add
 * spools in the header; a compact strip with the figures and the AMS; the
 * inbox and spools that have run out; a filter bar (state, search, sort,
 * line); the filaments as tiles or a list, each opening its own page; and
 * Shelf's own bottom bar (pages, per page, back to the top, Tile or List).
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { GlobeIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  data,
  Form,
  Link,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
} from "react-router";
import { z } from "zod";
import { ErrorContent } from "~/components/errors";
import { FilterBuilder } from "~/components/filament/filter-builder";
import { useAmsLiveUpdates } from "~/components/filament/live-updates";
import {
  barFill,
  CodeChip,
  FilamentPicture,
  type Images,
  inputClass,
  type Result,
  SpoolFields,
  Swatch,
  TypeRows,
  useMoney,
} from "~/components/filament/parts";
import { ChevronRight } from "~/components/icons/library";
import { FilamentIdChip } from "~/components/labels/filament-id-chip";
import { PrintLabelButton } from "~/components/labels/print-label-button";
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
  daysAgo,
  filamentKey,
  filamentSlug,
  groupSpools,
  type KnownCode,
  spoolState,
  stateCounts,
  summarise,
  typeCounts,
} from "~/modules/filament/catalogue";
import { refreshCodesIfStale } from "~/modules/filament/codes.server";
import {
  filterParam,
  matchesGroup,
  matchesItem,
  parseFilters,
} from "~/modules/filament/filters";
import {
  fetchMissingImages,
  imageStatuses,
} from "~/modules/filament/images.server";
import { done, failed } from "~/modules/filament/notify.server";
import {
  formatFilamentId,
  parseFilamentNumber,
} from "~/modules/filament/numbers";
import { getFilamentNumbers } from "~/modules/filament/numbers.server";
import { priceSummary, type PriceSummary } from "~/modules/filament/prices";
import {
  fillMissingPrices,
  priceStatuses,
  refreshStalePrices,
} from "~/modules/filament/prices.server";
import {
  currentTrays,
  ensureAmsWatcher,
  getPrinterSettingsForPage,
} from "~/modules/filament/printer.server";
import {
  approveCandidate,
  createSpools,
  dismissCandidate,
  getFilament,
  keepSpool,
  knownCodes,
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
    // the filters, in Assets' form ("material=is:PLA"); a bare "line=PLA Basic" means is
    const active = parseFilters(url.searchParams);
    const line =
      active.find((f) => f.name === "line" && f.op === "is")?.value ?? "";
    const colour =
      active.find((f) => f.name === "colour" && f.op === "is")?.value ?? "";
    // tiles per row: auto, or 3 to 8; remembered in a cookie
    const colsParam = url.searchParams.get("cols");
    const colsCookie = /(?:^|;\s*)filament_cols=(auto|[3-8])/.exec(
      request.headers.get("Cookie") ?? ""
    )?.[1];
    const cols =
      colsParam && /^(auto|[3-8])$/.test(colsParam)
        ? colsParam
        : colsCookie ?? "auto";
    const pageParam = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const perPageParam = Number(url.searchParams.get("per_page")) || 0;
    const prefs = await updateCookieWithPerPage(request, perPageParam);
    const perPage = Number(prefs.perPage) || 20;

    const [{ spools, candidates }, images, { view, setCookie }, numbers] =
      await Promise.all([
        getFilament(organizationId),
        imageStatuses(organizationId),
        resolveFilamentView(request),
        // FIL-0001: each filament's label number, numbering any new ones
        getFilamentNumbers(organizationId),
      ]);
    // store prices: what's kept, and a background check of anything over a day old
    const codes = await knownCodes(organizationId); // for finding a filament by its code
    void refreshCodesIfStale(organizationId); // Bambu's box codes, weekly, in the background
    void ensureAmsWatcher(organizationId); // keep in touch with the printer
    const printer = await getPrinterSettingsForPage(organizationId);
    const storePrices = await priceStatuses(organizationId);
    refreshStalePrices(organizationId);
    // filament with no price paid, where the store's price is already known
    const missingPrices = spools.filter((s) => {
      if (s.pricePaid !== null) return false;
      const p = priceSummary(
        storePrices[filamentKey(s.type, s.colourName)]?.variants
      );
      return (
        (s.packaging === "refill"
          ? p.refill ?? p.spool
          : p.spool ?? p.refill) !== null
      );
    }).length;
    const prices: Record<string, PriceSummary> = Object.fromEntries(
      Object.entries(storePrices).map(([key, p]) => [
        key,
        priceSummary(p.variants),
      ])
    );

    // spools on hand (active, or run out and waiting), then the filters
    const q = search.toLowerCase();
    // "FIL-0007" or "fil-7" finds that filament
    const filNumber = parseFilamentNumber(search);
    const filLabel =
      filNumber !== null ? formatFilamentId(filNumber).toLowerCase() : null;
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
        matchesItem(s, active) &&
        (!q ||
          (filLabel !== null
            ? numbers[
                filamentKey(s.type, s.colourName)
              ]?.label.toLowerCase() === filLabel
            : `${s.type} ${s.material} ${s.colourName} ${
                s.filamentCode ?? ""
              } ${numbers[filamentKey(s.type, s.colourName)]?.label ?? ""}`
                .toLowerCase()
                .includes(q)))
    );
    const newest = (g: { spools: { createdAt: Date | string }[] }) =>
      Math.max(...g.spools.map((s) => new Date(s.createdAt).getTime()));
    const groups = groupSpools(matched)
      .map((g) => ({
        ...g,
        slug: filamentSlug(g.type, g.colourName),
        // the label number: its id (what labels point at) and FIL-0001
        fil: numbers[g.key]
          ? { id: numbers[g.key].id, label: numbers[g.key].label }
          : null,
      }))
      .filter((g) => matchesGroup(g, prices[g.key], active))
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
    // the list's totals, across everything the filters match
    const pricedKg = matched
      .map((s) => costPerKg(s))
      .filter((n): n is number => n !== null);
    const storeBest = groups
      .map((g) => prices[g.key]?.best)
      .filter((n): n is number => typeof n === "number");
    const totals = {
      spools: matched.filter((s) => s.packaging !== "refill").length,
      refills: matched.filter((s) => s.packaging === "refill").length,
      kgLeft: groups.reduce((n, g) => n + g.gramsLeft, 0) / 1000,
      avgPaidPerKg: pricedKg.length
        ? pricedKg.reduce((a, b) => a + b, 0) / pricedKg.length
        : null,
      avgStore: storeBest.length
        ? storeBest.reduce((a, b) => a + b, 0) / storeBest.length
        : null,
    };
    const totalItems = groups.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const page = Math.min(pageParam, totalPages);

    const headers = new Headers();
    headers.append("Set-Cookie", await userPrefs.serialize(prefs));
    if (setCookie) headers.append("Set-Cookie", setCookie);
    if (colsParam && colsParam === cols) {
      headers.append(
        "Set-Cookie",
        `filament_cols=${cols}; Path=/; Max-Age=31536000; SameSite=Lax`
      );
    }

    return data(
      payload({
        header: { title: "Filament" },
        view,
        spools,
        candidates,
        images,
        codes,
        amsTrays: currentTrays(organizationId),
        printer: {
          enabled: printer.enabled,
          lastSeenAt: printer.lastSeenAt,
          lastError: printer.lastError,
        },
        missingPrices,
        prices,
        anyPrice: spools.some((s) => s.pricePaid !== null),
        lines: [...new Set(onHand.map((s) => s.type))].sort(),
        filters: { search, state, sort, line, colour },
        activeFilters: active,
        choices: {
          materials: [...new Set(onHand.map((s) => s.material))].sort(),
          lines: [...new Set(onHand.map((s) => s.type))].sort(),
          colours: [...new Set(onHand.map((s) => s.colourName))].sort(),
        },
        cols,
        totals,
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
  packaging: z.enum(["spool", "refill"]).default("spool"),
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
          made.length === 1
            ? "Filament added"
            : `${made.length} filaments added`,
          `${input.colourName} · ${input.type}`
        );
      }
      case "fill-prices": {
        const { filled, unpriced } = await fillMissingPrices(organizationId);
        return done(
          userId,
          filled === 1 ? "1 price filled in" : `${filled} prices filled in`,
          `From the Bambu store${
            unpriced
              ? `; ${unpriced} have no store price yet (try Check prices first)`
              : ""
          }.`
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
          quantity === 1 ? "Filament added" : `${quantity} filaments added`,
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
          "Filament retired",
          "It's in Finished filament, and can be brought back from there."
        );
      case "keep": {
        const percent = Number(form.get("remainingPercent") ?? 0);
        await keepSpool(organizationId, id, percent);
        return done(userId, "Filament back in use", `${percent}% left.`);
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
function AddSpoolPanel({ codes }: { codes: KnownCode[] }) {
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
        <h3 className="text-text-md font-semibold text-gray-900">
          Add filament
        </h3>
        <SpoolFields withQuantity codes={codes} />
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
  printer,
  amsTrays,
}: {
  amsTrays: PageData["amsTrays"];
  spools: SpoolRow[];
  images: Images;
  anyPrice: boolean;
  printer: PageData["printer"];
}) {
  const money = useMoney();
  const summary = summarise(spools);
  const newSpools = spools.filter((s) => spoolState(s) === "new").length;
  const figures: [string, string][] = [
    ["In stock", `${summary.spools}${newSpools ? ` (${newSpools} new)` : ""}`],
    ["Filament left", `${(summary.gramsLeft / 1000).toFixed(1)} kg`],
    ["Worth", anyPrice ? money(summary.valueLeft) : "—"],
    ["Spent", anyPrice ? money(summary.spent) : "—"],
    // the value of filament printed through: what was paid, less what's still on the shelf
    [
      "Used",
      anyPrice ? money(Math.max(0, summary.spent - summary.valueLeft)) : "—",
    ],
  ];
  return (
    <Card className="my-0 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
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
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>AMS</span>
          <PrinterStatus printer={printer} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {AMS_SLOTS.map((n) => {
            const s = spools.find(
              (x) => x.amsSlot === n && x.status !== "retired"
            );
            const tray = s ? null : amsTrays?.find((t) => t.slot === n) ?? null;
            return (
              <div
                key={n}
                className="flex min-w-0 items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5"
              >
                {s ? (
                  <FilamentPicture {...s} images={images} size="size-8" />
                ) : tray ? (
                  <Swatch hex={tray.colourHex} size="size-8" />
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
                  ) : tray ? (
                    <div
                      className="truncate text-xs text-gray-900"
                      title="In the AMS, not added to Shelf yet"
                    >
                      {tray.colourName ?? tray.colourHex}{" "}
                      <span className="tabular-nums text-gray-500">
                        {tray.remainingPercent}%
                      </span>
                      <span className="block text-[11px] text-primary-600">
                        Not added yet
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
      </div>
    </Card>
  );
}

/** The filter bar, like the assets list's: state, search, sort, and line. */
function FilterBar({
  filters,
  lines,
  activeFilters,
  choices,
}: {
  activeFilters: PageData["activeFilters"];
  choices: PageData["choices"];
  filters: PageData["filters"];
  lines: string[];
}) {
  const searchTimer = useRef<number | undefined>(undefined);
  const submit = (e: { currentTarget: HTMLSelectElement }) =>
    e.currentTarget.form?.requestSubmit();
  const select =
    "rounded border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm text-gray-700";
  return (
    <Card className="my-0">
      <Form method="get" className="flex flex-wrap items-center gap-2">
        <FilterBuilder active={activeFilters} choices={choices} />
        {/* the builder's filters, kept when you search or sort (line has its own control) */}
        {activeFilters
          .filter((f) => f.name !== "line")
          .map((f) => (
            <input
              key={f.name}
              type="hidden"
              name={f.name}
              value={filterParam(f)}
            />
          ))}
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
            onChange={(e) => {
              const form = e.currentTarget.form;
              const empty = !e.currentTarget.value;
              window.clearTimeout(searchTimer.current);
              searchTimer.current = window.setTimeout(
                () => form?.requestSubmit(),
                empty ? 0 : 400
              );
            }}
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

/** How the printer is doing: live, a problem, or not set up yet. */
function PrinterStatus({ printer }: { printer: PageData["printer"] }) {
  if (!printer.enabled) {
    return (
      <Link to="/settings/printer" className="text-primary-600 hover:underline">
        Read the AMS from your printer
      </Link>
    );
  }
  if (printer.lastError) {
    return (
      <Link
        to="/settings/printer"
        className="text-error-600 hover:underline"
        title={printer.lastError}
      >
        Printer: problem, see settings
      </Link>
    );
  }
  if (!printer.lastSeenAt)
    return <span>Waiting for the printer's first report…</span>;
  return <span>Printer reported {daysAgo(printer.lastSeenAt)}</span>;
}

/** Fill in the price paid where it's missing, from the store prices Shelf holds. */
function FillPrices({ count }: { count: number }) {
  const fetcher = useFetcher<Result>();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="fill-prices" />
      <Button
        type="submit"
        variant="secondary"
        disabled={isFormProcessing(fetcher.state)}
      >
        Fill in missing prices ({count})
      </Button>
    </fetcher.Form>
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

/** A filament as a tile, like an asset tile: the picture with chips, the facts, the actions. */
function FilamentTile({
  group,
  images,
  price,
  compact = false,
}: {
  group: Group;
  images: Images;
  price?: PriceSummary;
  /** At 6 or more per row there's no room for the price pills or the code */
  compact?: boolean;
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
  const chip =
    "rounded-full bg-white px-2 py-0.5 text-xs font-medium shadow-sm ring-1 ring-black/5";
  // a touch smaller than the chip above, so both prices fit side by side
  const priceChip =
    "pointer-events-none rounded-full bg-white px-1.5 py-0.5 font-medium leading-4 text-gray-800 shadow-sm ring-1 ring-black/5 tabular-nums";
  const code =
    group.spools.find((s) => s.filamentCode)?.filamentCode ??
    image?.filamentCode ??
    null;
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
        {!compact && perKg !== null ? (
          <span
            className={tw(priceChip, "absolute bottom-2 left-2")}
            style={{ fontSize: "10.5px" }}
            title="What you paid, per kg"
          >
            {money(perKg)}/kg
          </span>
        ) : null}
        {!compact && price?.best != null ? (
          <span
            className={tw(priceChip, "absolute bottom-2 right-2")}
            style={{ fontSize: "10.5px" }}
            title="Today's Bambu store price"
          >
            {money(price.best)}
            {price.onOffer ? (
              <span className="ml-1 font-normal text-gray-400 line-through">
                {money(Math.max(price.spool?.was ?? 0, price.refill?.was ?? 0))}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="min-w-0">
          <Link
            to={`?colour=${encodeURIComponent(group.colourName)}`}
            className="block truncate text-[15px] font-semibold leading-snug text-gray-900 hover:underline"
            title={`Show only ${group.colourName}`}
          >
            {group.colourName}
          </Link>
          <Link
            to={`?line=${encodeURIComponent(group.type)}`}
            className="block truncate text-xs text-gray-500 hover:underline"
            title={`Show only ${group.type}`}
          >
            {group.type}
          </Link>
        </div>
        <TypeRows items={group.spools} />
      </div>

      <div className="flex items-center gap-1 border-t border-gray-100 bg-gray-50 px-3 py-1.5">
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
          aria-label="Add more of this"
          tooltip="Add more of this"
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
        {group.fil ? (
          // the same button as on asset tiles: green once the label's printed
          <PrintLabelButton id={group.fil.id} kind="filament" />
        ) : null}
        {code && !compact ? <CodeChip code={code} className="ml-auto" /> : null}
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
  codes,
}: {
  candidate: CandidateRow;
  images: Images;
  codes: KnownCode[];
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
        <SpoolFields initial={candidate} withQuantity codes={codes} />
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
            Add filament
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

/** The list's columns, shared by its headings and its rows so they line up. */
const LIST_COLUMNS =
  "md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_4.5rem_4.5rem_minmax(0,1.6fr)_5.5rem_6rem_1.25rem] md:gap-4";

/** The list's headings. */
function ListHeadings() {
  return (
    <div
      className={tw(
        "hidden items-center border-b border-gray-200 px-1 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400",
        LIST_COLUMNS
      )}
    >
      <span>Filament</span>
      <span>Line</span>
      <span className="text-right">Spools</span>
      <span className="text-right">Refills</span>
      <span>Left</span>
      <span className="text-right">Paid/kg</span>
      <span className="text-right">Store</span>
      <span />
    </div>
  );
}

/**
 * A filament in the list. The picture and the arrow open it; its colour and
 * line show only that colour or line.
 */
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
  const href = `/filament/${group.slug}`;
  const priced = group.spools
    .map((s) => costPerKg(s))
    .filter((n): n is number => n !== null);
  const perKg = priced.length
    ? priced.reduce((a, b) => a + b, 0) / priced.length
    : null;
  const slots = group.spools
    .map((s) => s.amsSlot)
    .filter((n): n is number => n !== null);
  const counts = typeCounts(group.spools);
  return (
    <li
      className={tw(
        "flex items-center gap-4 px-1 py-3 hover:bg-gray-25",
        LIST_COLUMNS
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          to={href}
          aria-label={`Open ${group.colourName} ${group.type}`}
          className="shrink-0"
        >
          <FilamentPicture {...group} images={images} />
        </Link>
        <span className="min-w-0">
          <Link
            to={`?colour=${encodeURIComponent(group.colourName)}`}
            className="block truncate font-semibold text-gray-900 hover:underline"
            title={`Show only ${group.colourName}`}
          >
            {group.colourName}
          </Link>
          <Link
            to={`?line=${encodeURIComponent(group.type)}`}
            className="block text-xs text-gray-500 hover:underline md:hidden"
          >
            {group.type}
          </Link>
          {slots.length || group.fil ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-1">
              <FilamentIdChip fil={group.fil} className="py-0 text-[11px]" />
              {slots.map((n) => (
                <span
                  key={n}
                  className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700"
                >
                  AMS {n}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </span>
      <Link
        to={`?line=${encodeURIComponent(group.type)}`}
        className="hidden truncate text-sm text-gray-700 hover:underline md:block"
        title={`Show only ${group.type}`}
      >
        {group.type}
      </Link>
      <span className="hidden text-right text-sm tabular-nums text-gray-700 md:block">
        {counts.spools || "—"}
      </span>
      <span className="hidden text-right text-sm tabular-nums text-gray-700 md:block">
        {counts.refills || "—"}
      </span>
      <span className="flex min-w-28 items-center gap-3">
        <span
          className="hidden flex-1 flex-col gap-1 sm:flex"
          aria-label="Left on each one"
        >
          {group.spools.slice(0, 3).map((s) => (
            <span key={s.id} className="block h-1.5 rounded-full bg-gray-100">
              <span
                className={"block h-1.5 rounded-full"}
                style={barFill(s.remainingPercent)}
              />
            </span>
          ))}
        </span>
        <span className="text-right text-sm">
          <span className="block tabular-nums text-gray-900">
            {(group.gramsLeft / 1000).toFixed(2)} kg
          </span>
          <span className="block text-xs text-gray-500">
            {spoolCountWords(group.spools)}
          </span>
        </span>
      </span>
      <span className="hidden text-right text-sm tabular-nums text-gray-600 md:block">
        {perKg !== null ? money(perKg) : "—"}
      </span>
      <span className="text-right text-sm">
        {price?.best != null ? (
          <>
            <span className="block tabular-nums text-gray-900">
              {money(price.best)}
            </span>
            {price.onOffer ? (
              <span className="block text-xs font-medium text-primary-700">
                On offer
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </span>
      <Link
        to={href}
        aria-label={`Open ${group.colourName} ${group.type}`}
        className="text-gray-400 hover:text-gray-700"
      >
        <ChevronRight aria-hidden="true" />
      </Link>
    </li>
  );
}

/** The list's totals: spools, refills and kg; the average paid per kg and store price. */
function ListTotals({ totals }: { totals: PageData["totals"] }) {
  const money = useMoney();
  return (
    <div
      className={tw(
        "flex items-center gap-4 border-t border-gray-200 bg-gray-25 px-1 py-2.5 text-sm font-medium text-gray-900",
        LIST_COLUMNS
      )}
    >
      <span>Total</span>
      <span className="hidden md:block" />
      <span className="hidden text-right tabular-nums md:block">
        {totals.spools}
      </span>
      <span className="hidden text-right tabular-nums md:block">
        {totals.refills}
      </span>
      <span className="ml-auto text-right tabular-nums md:ml-0">
        {totals.kgLeft.toFixed(2)} kg
      </span>
      <span
        className="hidden text-right tabular-nums md:block"
        title="Average paid per kg"
      >
        {totals.avgPaidPerKg !== null
          ? `avg ${money(totals.avgPaidPerKg)}`
          : "—"}
      </span>
      <span className="text-right tabular-nums" title="Average store price">
        {totals.avgStore !== null ? `avg ${money(totals.avgStore)}` : "—"}
      </span>
      <span />
    </div>
  );
}

/** The bottom bar, as on the assets list: pages, per page, back to the top, Tile or List. */
function FilamentBottomBar({
  view,
  cols,
}: {
  view: "tile" | "list";
  cols: string;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
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
        {view === "tile" ? (
          <label className="hidden items-center gap-1.5 text-sm text-gray-600 lg:flex">
            Per row
            <select
              value={cols}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                next.set("cols", e.target.value);
                void navigate(`?${next.toString()}`);
              }}
              className="h-[34px] rounded-md border border-gray-300 py-0 pl-2 pr-7 text-sm"
              aria-label="Tiles per row"
            >
              <option value="auto">Auto</option>
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
  useAmsLiveUpdates(); // the page follows the AMS
  const location = useLocation();
  const {
    amsTrays,
    activeFilters,
    choices,
    cols,
    totals,
    spools,
    candidates,
    images,
    codes,
    missingPrices,
    printer,
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
          {missingPrices > 0 ? <FillPrices count={missingPrices} /> : null}
          {onHand.length > 0 ? (
            <Button to="/filament/stocktake" variant="secondary">
              Stocktake
            </Button>
          ) : null}
          <Button to="?add=1" disabled={adding}>
            Add filament
          </Button>
        </div>
      </Header>
      <div className="mt-4 flex flex-col gap-4 pb-20">
        {adding ? <AddSpoolPanel codes={codes} /> : null}

        <Overview
          spools={spools}
          images={images}
          anyPrice={anyPrice}
          printer={printer}
          amsTrays={amsTrays}
        />

        {candidates.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-text-md font-semibold text-gray-900">
              Waiting for you ({candidates.length})
            </h3>
            {candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                images={images}
                codes={codes}
              />
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

        <FilterBar
          filters={filters}
          lines={lines}
          activeFilters={activeFilters}
          choices={choices}
        />
        {filters.colour ? (
          <div className="flex">
            <Link
              to={`?${(() => {
                const next = new URLSearchParams(location.search);
                next.delete("colour");
                return next.toString();
              })()}`}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50"
              aria-label={`Stop showing only ${filters.colour}`}
            >
              Colour: {filters.colour}
              <span aria-hidden="true" className="text-gray-400">
                ×
              </span>
            </Link>
          </div>
        ) : null}

        {onHand.length === 0 ? (
          <Card className="my-0">
            <p className="text-sm text-gray-600">
              No filament yet. Add your first with Add filament, at the top.
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
          <div
            className={tw(
              "grid grid-cols-1 gap-4 sm:grid-cols-2",
              cols === "auto"
                ? "lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                : "lg:[grid-template-columns:var(--tile-cols)]"
            )}
            style={
              cols === "auto"
                ? undefined
                : ({
                    "--tile-cols": `repeat(${cols}, minmax(0, 1fr))`,
                  } as CSSProperties)
            }
          >
            {items.map((g) => (
              <FilamentTile
                key={g.key}
                group={g}
                images={images}
                price={prices[g.key]}
                compact={cols !== "auto" && Number(cols) >= 6}
              />
            ))}
          </div>
        ) : (
          <Card className="my-0 py-0">
            <ListHeadings />
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
            <ListTotals totals={totals} />
          </Card>
        )}

        {retired.length > 0 ? (
          <details className="rounded-lg border border-gray-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">
              Finished filament ({retired.length})
            </summary>
            <ul className="mt-2 divide-y divide-gray-100">
              {retired.map((s) => (
                <RetiredRow key={s.id} spool={s} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      <FilamentBottomBar view={view} cols={cols} />
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
