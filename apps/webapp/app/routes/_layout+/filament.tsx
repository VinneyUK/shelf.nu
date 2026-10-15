/**
 * Filament (fork): Bambu Lab spools. The AMS's four slots, an inbox of spools
 * waiting for approval, spools that have run out (waiting for you to confirm),
 * every filament on hand as tiles or a list (each opening its own page), and
 * the retired history. The bottom bar is Shelf's own: pages, per page, back
 * to the top, and Tile or List.
 */
import { useEffect, useState } from "react";
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
  RemainingBar,
  ResultLine,
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
import { useViewportHeight } from "~/hooks/use-viewport-height";
import {
  AMS_SLOTS,
  costPerKg,
  filamentKey,
  filamentSlug,
  groupSpools,
  summarise,
} from "~/modules/filament/catalogue";
import {
  fetchMissingImages,
  imageStatuses,
} from "~/modules/filament/images.server";
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

    // the filaments on hand (search applied), a page of them at a time
    const q = search.toLowerCase();
    const onHand = spools.filter((s) => s.status === "active");
    const matched = q
      ? onHand.filter((s) =>
          `${s.type} ${s.material} ${s.colourName} ${s.filamentCode ?? ""}`
            .toLowerCase()
            .includes(q)
        )
      : onHand;
    const groups = groupSpools(matched).map((g) => ({
      ...g,
      slug: filamentSlug(g.type, g.colourName),
    }));
    const totalItems = groups.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const page = Math.min(pageParam, totalPages);

    const headers = new Headers();
    headers.append("Set-Cookie", await userPrefs.serialize(prefs));
    if (setCookie) headers.append("Set-Cookie", setCookie);

    return data(
      payload({
        header: {
          title: "Filament",
          subHeading:
            "Your Bambu Lab spools: what's loaded, what's left, what it cost.",
        },
        view,
        spools,
        candidates,
        images,
        summary: summarise(spools),
        filamentsOnHand: groupSpools(onHand).length,
        items: groups.slice((page - 1) * perPage, page * perPage),
        search,
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
      default:
        return payload({ message: "Unknown action." });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

type PageData = ReturnType<typeof useLoaderData<typeof loader>>;
type SpoolRow = PageData["spools"][number];
type CandidateRow = PageData["candidates"][number];
type Group = PageData["items"][number];

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
function FilamentListRow({ group, images }: { group: Group; images: Images }) {
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
            {group.spools.length} spool{group.spools.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="hidden w-20 text-right text-xs tabular-nums text-gray-500 sm:block">
          {perKg !== null ? `${money(perKg)}/kg` : ""}
        </div>
        <ChevronRight className="text-gray-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** A filament as a tile, opening its page. */
function FilamentTile({ group, images }: { group: Group; images: Images }) {
  const money = useMoney();
  const image = images[group.key];
  const slots = group.spools
    .map((s) => s.amsSlot)
    .filter((n): n is number => n !== null);
  const priced = group.spools
    .map((s) => costPerKg(s))
    .filter((n): n is number => n !== null);
  const perKg = priced.length
    ? priced.reduce((a, b) => a + b, 0) / priced.length
    : null;
  const shown = group.spools.slice(0, 5);
  return (
    <Link
      to={`/filament/${group.slug}`}
      className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
    >
      <span className="relative block aspect-square w-full bg-white">
        {image?.status === "found" ? (
          <img
            src={`/api/filament/image/${encodeURIComponent(group.key)}`}
            alt=""
            className="size-full object-contain p-3"
            loading="lazy"
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-gray-50">
            <Swatch hex={group.colourHex} size="size-24" />
          </span>
        )}
        <span className="absolute left-2 top-2 flex gap-1">
          {slots.map((n) => (
            <span
              key={n}
              className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-800 shadow-sm ring-1 ring-black/5"
            >
              AMS {n}
            </span>
          ))}
        </span>
        <span className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-800 shadow-sm ring-1 ring-black/5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full ring-1 ring-black/10"
            style={{ background: group.colourHex }}
          />
          {group.spools.length} spool{group.spools.length === 1 ? "" : "s"}
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-2 border-t border-gray-100 p-3">
        <span>
          <span className="block font-semibold text-gray-900">
            {group.colourName}
          </span>
          <span className="block text-xs text-gray-500">{group.type}</span>
        </span>
        <span className="flex flex-col gap-1">
          {shown.map((s) => (
            <span key={s.id} className="flex items-center gap-2">
              <span className="h-1.5 flex-1 rounded-full bg-gray-100">
                <span
                  className={tw(
                    "block h-1.5 rounded-full",
                    barColour(s.remainingPercent)
                  )}
                  style={{ width: `${s.remainingPercent}%` }}
                />
              </span>
              <span className="w-9 text-right text-xs tabular-nums text-gray-600">
                {s.remainingPercent}%
              </span>
            </span>
          ))}
          {group.spools.length > shown.length ? (
            <span className="text-xs text-gray-500">
              and {group.spools.length - shown.length} more
            </span>
          ) : null}
        </span>
        <span className="mt-auto flex items-baseline justify-between border-t border-gray-100 pt-2 text-sm">
          <span className="tabular-nums text-gray-900">
            {(group.gramsLeft / 1000).toFixed(2)} kg left
          </span>
          <span className="text-xs tabular-nums text-gray-500">
            {perKg !== null ? `${money(perKg)}/kg` : ""}
          </span>
        </span>
      </span>
    </Link>
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
    summary,
    images,
    view,
    items,
    search,
    totalItems,
    filamentsOnHand,
  } = useLoaderData<typeof loader>();
  const money = useMoney();
  const active = spools.filter((s) => s.status === "active");
  const empty = spools.filter((s) => s.status === "empty");
  const retired = spools.filter((s) => s.status === "retired");
  return (
    <>
      <Header />
      <div className="mt-4 flex flex-col gap-4 pb-20">
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
              Spools ({active.length}) · {filamentsOnHand} filament
              {filamentsOnHand === 1 ? "" : "s"}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Form method="get" className="flex items-center gap-1">
                <input type="hidden" name="view" value={view} />
                <input
                  type="search"
                  name="s"
                  defaultValue={search}
                  placeholder='Search, e.g. "matte" or "black"'
                  className={tw(inputClass, "w-56")}
                  aria-label="Search filament"
                />
              </Form>
              <GetPictures images={images} spools={spools} />
              <AddSpool />
            </div>
          </div>
          {active.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              No spools yet. Add your first with Add spools.
            </p>
          ) : totalItems === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              Nothing matches "{search}".
            </p>
          ) : view === "tile" ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((g) => (
                <FilamentTile key={g.key} group={g} images={images} />
              ))}
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {items.map((g) => (
                <FilamentListRow key={g.key} group={g} images={images} />
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
      <FilamentBottomBar view={view} />
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
