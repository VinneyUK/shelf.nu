/**
 * Prints (fork): every print the printer ran, newest first, with what each
 * filament used and what it cost; this month's figures across the top.
 * Recorded by Shelf from the printer's reports (modules/filament/prints.server).
 */
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { ErrorContent } from "~/components/errors";
import { Swatch, useMoney } from "~/components/filament/parts";
import { PrintResult, took, when } from "~/components/filament/prints";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { db } from "~/database/db.server";
import { useSearchParams } from "~/hooks/search-params";
import { filamentSlug } from "~/modules/filament/catalogue";
import { done, failed } from "~/modules/filament/notify.server";
import { readSliceInfo } from "~/modules/filament/printer.server";
import {
  listPrints,
  measurePrint,
  setPrintUses,
} from "~/modules/filament/prints.server";
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

const FILTERS = [
  ["", "All"],
  ["done", "Finished"],
  ["failed", "Failed"],
  ["cancelled", "Cancelled"],
] as const;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    const status = new URL(request.url).searchParams.get("status") ?? "";
    const prints = await listPrints(organizationId, {
      status:
        FILTERS.some(([v]) => v === status) && status ? status : undefined,
    });
    // this month's figures
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const month = await listPrints(organizationId, { since: start });
    // each filament's name and colour, from its spools
    const ids = [
      ...new Set(
        prints.flatMap((p) => p.uses.map((u) => u.spoolId)).filter(Boolean)
      ),
    ] as string[];
    const spools = await db.spool.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, type: true, colourName: true, colourHex: true },
    });
    // the spools a print could have used, for changing its grams by hand
    const choices = await db.spool.findMany({
      where: { organizationId, status: { not: "retired" } },
      orderBy: [{ amsSlot: "asc" }, { type: "asc" }, { colourName: "asc" }],
      select: {
        id: true,
        type: true,
        colourName: true,
        amsSlot: true,
        openedOn: true,
      },
    });
    return payload({
      header: { title: "Prints" },
      prints: prints.map((p) => ({
        id: p.id,
        name: p.name,
        startedAt: p.startedAt,
        endedAt: p.endedAt,
        status: p.status,
        source: p.source,
        uses: p.uses,
      })),
      spools,
      choices: choices.map((c) => ({
        id: c.id,
        label: `${c.colourName} · ${c.type}${
          c.amsSlot
            ? ` (AMS ${c.amsSlot})`
            : c.openedOn
            ? " (open)"
            : " (sealed)"
        }`,
      })),
      month: {
        prints: month.length,
        finished: month.filter((p) => p.status === "done").length,
        grams: month.reduce(
          (n, p) => n + p.uses.reduce((m, u) => m + u.grams, 0),
          0
        ),
        colours: new Set(month.flatMap((p) => p.uses.map((u) => u.key))).size,
        cost: month.reduce(
          (n, p) => n + p.uses.reduce((m, u) => m + (u.cost ?? 0), 0),
          0
        ),
        minutes: month.reduce(
          (n, p) =>
            n +
            (p.endedAt ? Math.round((+p.endedAt - +p.startedAt) / 60000) : 0),
          0
        ),
      },
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

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
    switch (form.get("intent")) {
      // read the print's file on the printer again
      case "measure": {
        const { measured } = await measurePrint(organizationId, id, (f, n) =>
          readSliceInfo(organizationId, f, n)
        );
        return measured
          ? done(
              userId,
              "Print measured",
              "From the slicer's figures in its file."
            )
          : failed(
              userId,
              "Couldn't read the print's file",
              "The printer no longer has it, or isn't reachable. You can set the grams yourself."
            );
      }
      // grams set by hand: spoolId[] and grams[] side by side
      case "set": {
        const ids = form.getAll("spoolId").map(String);
        const grams = form.getAll("grams").map((g) => Number(g));
        await setPrintUses(
          organizationId,
          id,
          ids.map((spoolId, i) => ({ spoolId, grams: grams[i] ?? 0 }))
        );
        return done(userId, "Print updated", "Its filament is as you set it.");
      }
      default:
        return payload({ ok: false });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export const handle = {
  // after the parent's "Filament"
  breadcrumb: () => <span className="single-crumb">Prints</span>,
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

const hours = (mins: number) =>
  mins >= 60
    ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`
    : `${mins}m`;

export default function Prints() {
  const { prints, spools, month, choices } = useLoaderData<typeof loader>();
  const money = useMoney();
  const [params] = useSearchParams();
  const status = params.get("status") ?? "";
  const spool = new Map(spools.map((s) => [s.id, s]));
  const figures: [string, string, string][] = [
    ["Prints this month", String(month.prints), `${month.finished} finished`],
    [
      "Filament used",
      `${(month.grams / 1000).toFixed(2)} kg`,
      `across ${month.colours} ${month.colours === 1 ? "colour" : "colours"}`,
    ],
    ["Cost", money(month.cost), "at what you paid"],
    [
      "Printing time",
      hours(month.minutes),
      month.prints
        ? `≈ ${hours(Math.round(month.minutes / month.prints))} a print`
        : "—",
    ],
  ];
  return (
    <>
      <Header hidePageDescription />
      <div className="mt-4 flex flex-col gap-5">
        <Card className="my-0 grid grid-cols-2 divide-gray-200 p-0 md:grid-cols-4 md:divide-x">
          {figures.map(([k, v, sub]) => (
            <div key={k} className="p-5">
              <div className="text-xs font-medium text-gray-500">{k}</div>
              <div className="text-display-xs font-semibold tabular-nums text-gray-900">
                {v}
              </div>
              <div className="text-xs text-gray-500">{sub}</div>
            </div>
          ))}
        </Card>

        <Card className="my-0 p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-5 py-3.5">
            <h3 className="text-text-md font-semibold text-gray-900">Prints</h3>
            <span className="ml-auto inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
              {FILTERS.map(([v, l]) => (
                <Link
                  key={v}
                  to={v ? `?status=${v}` : "?"}
                  className={tw(
                    "rounded-md px-3 py-1 text-sm font-medium",
                    status === v
                      ? "bg-primary-500 text-white"
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {l}
                </Link>
              ))}
            </span>
          </div>
          {prints.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-500">
              No prints recorded yet. Shelf records each print the printer runs
              from now on: what each filament used, the cost and how long it
              took.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {prints.map((p) => {
                const cost = p.uses.reduce((m, u) => m + (u.cost ?? 0), 0);
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-4 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-gray-900">
                          {p.name}
                        </span>
                        <PrintResult status={p.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {p.uses.length === 0 ? (
                          <span className="text-xs text-gray-400">
                            No filament measured
                          </span>
                        ) : (
                          p.uses.map((u) => {
                            const s = u.spoolId
                              ? spool.get(u.spoolId)
                              : undefined;
                            const chip = (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-900">
                                <Swatch
                                  hex={s?.colourHex ?? "#98A2B3"}
                                  size="size-2.5"
                                />
                                {s ? s.colourName : u.key}
                                <b className="tabular-nums">{u.grams} g</b>
                              </span>
                            );
                            return s ? (
                              <Link
                                key={u.id}
                                to={`/filament/${filamentSlug(
                                  s.type,
                                  s.colourName
                                )}`}
                              >
                                {chip}
                              </Link>
                            ) : (
                              <span key={u.id}>{chip}</span>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold tabular-nums text-gray-900">
                        {cost > 0 ? money(cost) : "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {when(p.startedAt)} · {took(p)}
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-2 text-xs text-gray-400">
                        {p.source === "slicer"
                          ? "From the print's file"
                          : p.source === "manual"
                          ? "Set by hand"
                          : null}
                        <MeasureAgain id={p.id} />
                        <ChangeGrams print={p} choices={choices} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

/** Read the print's file on the printer again, for its slicer figures. */
function MeasureAgain({ id }: { id: string }) {
  const act = useFetcher();
  return (
    <button
      type="button"
      disabled={isFormProcessing(act.state)}
      onClick={() =>
        void act.submit({ intent: "measure", id }, { method: "post" })
      }
      className="font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50"
    >
      {isFormProcessing(act.state) ? "Reading…" : "Read from printer"}
    </button>
  );
}

/** A print's grams, by hand: each filament it used and how much. */
function ChangeGrams({
  print,
  choices,
}: {
  print: { id: string; uses: { spoolId: string | null; grams: number }[] };
  choices: { id: string; label: string }[];
}) {
  const act = useFetcher();
  const [open, setOpen] = useState(false);
  const start = print.uses
    .filter((u) => u.spoolId)
    .map((u) => ({ spoolId: u.spoolId as string, grams: String(u.grams) }));
  const [rows, setRows] = useState(
    start.length ? start : [{ spoolId: choices[0]?.id ?? "", grams: "" }]
  );
  const input =
    "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="font-semibold text-primary-600 hover:text-primary-700"
        >
          Change…
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="z-[60] w-[26rem] rounded-md border border-gray-200 bg-white p-3 shadow-lg"
        >
          <act.Form
            method="post"
            className="flex flex-col gap-2"
            onSubmit={() => setOpen(false)}
          >
            <input type="hidden" name="intent" value="set" />
            <input type="hidden" name="id" value={print.id} />
            <div className="text-sm font-semibold text-gray-900">
              Filament this print used
            </div>
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  name="spoolId"
                  value={r.spoolId}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i ? { ...x, spoolId: e.target.value } : x
                      )
                    )
                  }
                  className={tw(input, "min-w-0 flex-1")}
                >
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  name="grams"
                  type="number"
                  min={0}
                  value={r.grams}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i ? { ...x, grams: e.target.value } : x
                      )
                    )
                  }
                  className={tw(input, "w-20")}
                  aria-label="Grams"
                />
                <span className="text-sm text-gray-500">g</span>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setRows([...rows, { spoolId: choices[0]?.id ?? "", grams: "" }])
              }
              className="self-start text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              + Another filament
            </button>
            <Button
              type="submit"
              size="sm"
              disabled={isFormProcessing(act.state)}
            >
              Save
            </Button>
          </act.Form>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
