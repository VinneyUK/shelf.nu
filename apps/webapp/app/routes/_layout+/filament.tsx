/**
 * Filament (fork): Bambu Lab spools. The AMS's four slots, an inbox of spools
 * waiting for approval, spools that have run out (waiting for you to confirm),
 * every spool on hand, and the retired history.
 *
 * Phase 1: spools are added and edited by hand, and AMS slots are set by hand.
 * The printer connection (live slots, the inbox filling itself) comes next.
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
  costPerKg,
  gramsLeft,
  remainingTone,
  SPOOL_WEIGHTS,
  summarise,
} from "~/modules/filament/catalogue";
import {
  approveCandidate,
  createSpool,
  deleteSpool,
  dismissCandidate,
  getFilament,
  keepSpool,
  retireSpool,
  updateSpool,
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
    const { spools, candidates } = await getFilament(organizationId);
    return payload({
      header: {
        title: "Filament",
        subHeading:
          "Your Bambu Lab spools: what's loaded, what's left, what it cost.",
      },
      spools,
      candidates,
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
      case "create":
        await createSpool(organizationId, parseData(form, SpoolForm));
        return payload({ message: "Spool added." });
      case "update":
        await updateSpool(organizationId, id, parseData(form, SpoolForm));
        return payload({ message: "Saved." });
      case "approve":
        await approveCandidate(organizationId, id, parseData(form, SpoolForm));
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

/** The fields of a spool, shared by adding, editing and approving. */
function SpoolFields({
  initial,
}: {
  initial?: Partial<{
    type: string;
    colourName: string;
    colourHex: string;
    weightGrams: number;
    remainingPercent: number | null;
    pricePaid: number | null;
    purchasedOn: string | Date | null;
    amsSlot: number | null;
    notes: string | null;
  }>;
}) {
  const known = BAMBU_TYPES.some(([t]) => t === initial?.type);
  const [type, setType] = useState(
    initial?.type ? (known ? initial.type : "__other") : "PLA Basic"
  );
  const [other, setOther] = useState(known ? "" : initial?.type ?? "");
  const [hex, setHex] = useState(initial?.colourHex ?? "#FFFFFF");
  const purchased = initial?.purchasedOn
    ? String(initial.purchasedOn).slice(0, 10)
    : "";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Type
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={inputClass}
        >
          {BAMBU_TYPES.map(([t]) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value="__other">Other…</option>
        </select>
        {type === "__other" ? (
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="e.g. PLA Basic Refill"
            className={inputClass}
          />
        ) : null}
        <input
          type="hidden"
          name="type"
          value={type === "__other" ? other : type}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Colour
        <span className="flex items-center gap-2">
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            aria-label="Colour"
            className="h-9 w-10 shrink-0 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
          />
          <input
            name="colourName"
            defaultValue={initial?.colourName ?? ""}
            placeholder="e.g. Jade White"
            className={inputClass}
            required
          />
        </span>
        <input type="hidden" name="colourHex" value={hex} />
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
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
        Price paid
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
    return <Button type="button" onClick={() => setOpen(true)}>Add a spool</Button>;
  }
  return (
    <Card className="my-0">
      <fetcher.Form method="post" className="flex flex-col gap-4" key={key}>
        <input type="hidden" name="intent" value="create" />
        <h3 className="text-text-md font-semibold text-gray-900">
          Add a spool
        </h3>
        <SpoolFields />
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
            Add spool
          </Button>
        </div>
      </fetcher.Form>
    </Card>
  );
}

function AmsPanel({ spools }: { spools: SpoolRow[] }) {
  return (
    <Card className="my-0">
      <div className="flex items-baseline justify-between">
        <h3 className="text-text-md font-semibold text-gray-900">AMS</h3>
        <span className="text-xs text-gray-500">
          set by hand for now; live from the printer in the next update
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
                  <Swatch hex={s.colourHex} size="size-9" />
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

function CandidateCard({ candidate }: { candidate: CandidateRow }) {
  const fetcher = useFetcher<Result>();
  const busy = isFormProcessing(fetcher.state);
  return (
    <div className="bg-violet-50 rounded-lg border border-violet-200 p-4">
      <fetcher.Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="id" value={candidate.id} />
        <div className="flex items-center gap-3">
          <Swatch hex={candidate.colourHex} size="size-8" />
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
function EmptyCard({ spool }: { spool: SpoolRow }) {
  const fetcher = useFetcher<Result>();
  const busy = isFormProcessing(fetcher.state);
  return (
    <fetcher.Form
      method="post"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-200 bg-warning-25 p-3"
    >
      <input type="hidden" name="id" value={spool.id} />
      <Swatch hex={spool.colourHex} />
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

function SpoolRowView({ spool }: { spool: SpoolRow }) {
  const money = useMoney();
  const fetcher = useFetcher<Result>();
  const [editing, setEditing] = useState(false);
  const busy = isFormProcessing(fetcher.state);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error)
      setEditing(false);
  }, [fetcher.state, fetcher.data]);
  const perKg = costPerKg(spool);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Swatch hex={spool.colourHex} size="size-7" />
        <div className="min-w-40 flex-1">
          <div className="font-medium text-gray-900">{spool.colourName}</div>
          <div className="text-xs text-gray-500">
            {spool.type}
            {spool.amsSlot ? (
              <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
                AMS {spool.amsSlot}
              </span>
            ) : null}
          </div>
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
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close" : "Edit"}
          </Button>
        </div>
      </div>
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
  const { spools, candidates, summary } = useLoaderData<typeof loader>();
  const money = useMoney();
  const active = spools.filter((s) => s.status === "active");
  const empty = spools.filter((s) => s.status === "empty");
  const retired = spools.filter((s) => s.status === "retired");
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

        <AmsPanel spools={spools} />

        {candidates.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-text-md font-semibold text-gray-900">
              Waiting for you ({candidates.length})
            </h3>
            {candidates.map((c) => (
              <CandidateCard key={c.id} candidate={c} />
            ))}
          </div>
        ) : null}

        {empty.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-text-md font-semibold text-gray-900">
              Run out?
            </h3>
            {empty.map((s) => (
              <EmptyCard key={s.id} spool={s} />
            ))}
          </div>
        ) : null}

        <Card className="my-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-text-md font-semibold text-gray-900">
              Spools ({active.length})
            </h3>
            <AddSpool />
          </div>
          {active.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              No spools yet. Add your first with the button above.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {active.map((s) => (
                <SpoolRowView key={s.id} spool={s} />
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
