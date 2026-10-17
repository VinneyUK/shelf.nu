/**
 * Filament stocktake (fork): every spool on hand in one list, each with a box
 * for its weight on the scale. Enter saves it (less the empty spool), shows
 * what's left, and moves to the next spool. A spool that weighs as empty goes
 * to "Run out?" on the Filament page for you to confirm, as usual.
 */
import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { ErrorContent } from "~/components/errors";
import {
  barColour,
  FilamentPicture,
  type Images,
  type Result,
} from "~/components/filament/parts";
import { ChevronRight } from "~/components/icons/library";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import {
  catalogueEntry,
  spoolState,
  stocktakeOrder,
} from "~/modules/filament/catalogue";
import { imageStatuses } from "~/modules/filament/images.server";
import { done, failed } from "~/modules/filament/notify.server";
import { getFilament, weighSpool } from "~/modules/filament/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    const [{ spools }, images] = await Promise.all([
      getFilament(organizationId),
      imageStatuses(organizationId),
    ]);
    // sealed (New) spools are full by definition: skipped unless asked for
    const withSealed = new URL(request.url).searchParams.get("sealed") === "1";
    const onHand = stocktakeOrder(
      spools.filter(
        (s) => s.status !== "retired" && (withSealed || spoolState(s) !== "new")
      )
    ).map((s) => ({
      ...s,
      tare: s.spoolWeightGrams ?? catalogueEntry(s.type)?.spoolWeight ?? null,
    }));
    const sealed = spools.filter((s) => spoolState(s) === "new").length;
    return payload({
      header: { title: "Stocktake" },
      spools: onHand,
      images,
      withSealed,
      sealed,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const handle = {
  breadcrumb: () => (
    <span className="flex items-center gap-2">
      <Link to="/filament" className="text-gray-600 hover:text-gray-900">
        Filament
      </Link>
      <ChevronRight className="size-4 text-gray-400" aria-hidden="true" />
      <span className="single-crumb">Stocktake</span>
    </span>
  ),
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

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
    const id = String(form.get("id") ?? "");
    const label = String(form.get("label") ?? "Spool");
    const percent = await weighSpool(
      organizationId,
      id,
      Number(form.get("grossGrams") ?? 0)
    );
    return done(
      userId,
      "Spool weighed",
      percent === 0
        ? `${label}: empty. Confirm it on the Filament page.`
        : `${label}: ${percent}% left.`,
      { id, percent }
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    failed(userId, "weigh", reason.message);
    return data(error(reason), { status: reason.status });
  }
}

type Spool = ReturnType<typeof useLoaderData<typeof loader>>["spools"][number];
type Weighed = Result & { percent?: number };

/** One spool: its picture and name, what it was, the scale box, and what it is now. */
function StocktakeRow({
  spool,
  images,
  index,
  inputRef,
  onDone,
}: {
  spool: Spool;
  images: Images;
  index: number;
  inputRef: (el: HTMLInputElement | null) => void;
  onDone: (index: number) => void;
}) {
  const fetcher = useFetcher<Weighed>();
  const done =
    fetcher.state === "idle" &&
    fetcher.data &&
    !fetcher.data.error &&
    fetcher.data.percent !== undefined;
  const percent = done ? fetcher.data?.percent ?? spool.remainingPercent : null;
  useEffect(() => {
    if (done) onDone(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  return (
    <li
      className={tw(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3",
        done ? "bg-success-25" : ""
      )}
    >
      <FilamentPicture {...spool} images={images} size="size-10" />
      <div className="min-w-48 flex-1">
        <div className="font-medium text-gray-900">{spool.colourName}</div>
        <div className="text-xs text-gray-500">
          {spool.type}
          {spool.amsSlot ? (
            <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
              AMS {spool.amsSlot}
            </span>
          ) : null}
        </div>
      </div>
      <div className="w-24 text-right text-sm text-gray-500">
        was{" "}
        <span className="tabular-nums text-gray-800">
          {spool.remainingPercent}%
        </span>
      </div>
      <fetcher.Form method="post" className="flex items-center gap-2">
        <input type="hidden" name="id" value={spool.id} />
        <input
          type="hidden"
          name="label"
          value={`${spool.colourName} · ${spool.type}`}
        />
        <label className="flex items-center gap-1 text-sm text-gray-700">
          <span className="sr-only">
            Weight on the scale for {spool.colourName} {spool.type}
          </span>
          <input
            ref={inputRef}
            name="grossGrams"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder={spool.tare ? "scale g" : "—"}
            disabled={!spool.tare}
            className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
          />
          g
        </label>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!spool.tare || isFormProcessing(fetcher.state)}
        >
          Save
        </Button>
      </fetcher.Form>
      <div className="w-44">
        {!spool.tare ? (
          <span className="text-xs text-gray-500">
            Set the empty spool's weight on its filament page first.
          </span>
        ) : percent !== null ? (
          <div className="flex items-center gap-2" role="status">
            <div className="h-2 flex-1 rounded-full bg-gray-100">
              <div
                className={tw("h-2 rounded-full", barColour(percent))}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="w-10 text-right text-sm tabular-nums text-gray-800">
              {percent}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">
            less the empty spool, {spool.tare} g
          </span>
        )}
      </div>
    </li>
  );
}

export default function Stocktake() {
  const { spools, images, withSealed, sealed } = useLoaderData<typeof loader>();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [weighed, setWeighed] = useState<Set<number>>(new Set());
  const next = (from: number) => {
    setWeighed((prev) => new Set(prev).add(from));
    // on to the next spool that can be weighed
    const following = inputs.current.findIndex(
      (el, i) => i > from && el && !el.disabled
    );
    if (following >= 0) {
      inputs.current[following]?.focus();
      inputs.current[following]?.select();
    }
  };
  useEffect(() => {
    inputs.current.find((el) => el && !el.disabled)?.focus();
  }, []);
  return (
    <>
      <Header
        hidePageDescription
        subHeading="Put each spool on the scale and type the reading. Enter saves it and moves to the next."
      >
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {weighed.size} of {spools.length} weighed
          </span>
          {sealed > 0 ? (
            <Button to={withSealed ? "?" : "?sealed=1"} variant="secondary">
              {withSealed ? "Skip sealed spools" : `Include ${sealed} sealed`}
            </Button>
          ) : null}
          <Button to="/filament" variant="secondary">
            Done
          </Button>
        </div>
      </Header>
      <div className="mt-4 pb-10">
        <Card className="my-0 p-0">
          {spools.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-600">
              No spools on hand to weigh.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {spools.map((s, i) => (
                <StocktakeRow
                  key={s.id}
                  spool={s}
                  images={images as Images}
                  index={i}
                  inputRef={(el) => {
                    inputs.current[i] = el;
                  }}
                  onDone={next}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
