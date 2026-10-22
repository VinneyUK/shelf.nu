/**
 * Usage per print (fork). Shelf records each print the printer runs, from its
 * reports: when it starts, the level of each spool in the AMS; when it ends,
 * what each one used (the drop in its level), priced at what was paid for it.
 * The AMS already takes the filament off each spool as it goes; this is the
 * record of which print used it.
 */
import { db } from "~/database/db.server";
import type { StatusReport } from "./ams";
import { filamentKey } from "./catalogue";

type StartLevel = {
  spoolId: string;
  key: string;
  percent: number;
  weightGrams: number;
  pricePaid: number | null;
};

/** The spools in the AMS now, and their levels. */
async function amsLevels(organizationId: string) {
  const spools = await db.spool.findMany({
    where: {
      organizationId,
      amsSlot: { not: null },
      status: { not: "retired" },
    },
    select: {
      id: true,
      amsSlot: true,
      type: true,
      colourName: true,
      remainingPercent: true,
      weightGrams: true,
      pricePaid: true,
    },
  });
  const out: Record<string, StartLevel> = {};
  for (const s of spools)
    out[String(s.amsSlot)] = {
      spoolId: s.id,
      key: filamentKey(s.type, s.colourName),
      percent: s.remainingPercent,
      weightGrams: s.weightGrams,
      pricePaid: s.pricePaid,
    };
  return out;
}

/** What each spool used: the drop in its level since the print started. */
export function usesFrom(
  start: Record<string, StartLevel>,
  now: Map<string, number>
) {
  const uses: {
    spoolId: string;
    key: string;
    slot: number;
    grams: number;
    cost: number | null;
  }[] = [];
  for (const [slot, s] of Object.entries(start)) {
    const nowPercent = now.get(s.spoolId) ?? s.percent;
    const grams = Math.round(
      (Math.max(0, s.percent - nowPercent) / 100) * s.weightGrams
    );
    if (grams <= 0) continue;
    const perGram =
      s.pricePaid !== null && s.weightGrams > 0
        ? s.pricePaid / s.weightGrams
        : null;
    uses.push({
      spoolId: s.spoolId,
      key: s.key,
      slot: Number(slot),
      grams,
      cost: perGram !== null ? Math.round(grams * perGram * 100) / 100 : null,
    });
  }
  return uses;
}

/** How a print ended, from the printer's state and how far it got. */
export function outcome(status: StatusReport) {
  if (status.state === "error") return "failed";
  return (status.percent ?? 0) >= 99 ? "done" : "cancelled";
}

/** Closes a print: what each spool used, and how it ended. */
export async function finishPrint(
  organizationId: string,
  jobId: string,
  result: string
) {
  const job = await db.printJob.findFirst({
    where: { id: jobId, organizationId, status: "running" },
  });
  if (!job) return;
  const start = (job.startLevels ?? {}) as Record<string, StartLevel>;
  const ids = Object.values(start).map((s) => s.spoolId);
  const now = await db.spool.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, remainingPercent: true, status: true },
  });
  const uses = usesFrom(
    start,
    new Map(
      now.map((s) => [s.id, s.status === "retired" ? 0 : s.remainingPercent])
    )
  );
  // only the first to close it records it
  const { count } = await db.printJob.updateMany({
    where: { id: jobId, organizationId, status: "running" },
    data: { status: result, endedAt: new Date() },
  });
  if (count === 0 || uses.length === 0) return;
  await db.printJobUse.createMany({
    data: uses.map((u) => ({ ...u, organizationId, jobId })),
  });
}

/** Wait for the AMS's last levels before closing a print. */
const SETTLE_MS = 90 * 1000;

/**
 * Called with each report's merged status: starts a print's record when the
 * printer starts printing, and closes it (after the levels settle) when it
 * stops.
 */
export async function trackPrint(
  organizationId: string,
  before: StatusReport["state"],
  status: StatusReport
) {
  const printing = status.state === "printing" || status.state === "paused";
  const wasPrinting = before === "printing" || before === "paused";
  const running = await db.printJob.findFirst({
    where: { organizationId, status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (printing && !wasPrinting) {
    // Shelf (re)started mid-print: carry on with the one already open
    if (running && before === undefined) return;
    if (running) await finishPrint(organizationId, running.id, "cancelled");
    await db.printJob.create({
      data: {
        organizationId,
        name: status.jobName || "Print",
        startedAt: new Date(),
        startLevels: await amsLevels(organizationId),
      },
    });
    return;
  }
  // a name only arrives with a later report: keep it
  if (printing && running && status.jobName && running.name === "Print")
    await db.printJob.updateMany({
      where: { id: running.id, organizationId },
      data: { name: status.jobName },
    });
  if (!printing && wasPrinting && running) {
    const result = outcome(status);
    setTimeout(
      () =>
        void finishPrint(organizationId, running.id, result).catch(() => {}),
      SETTLE_MS
    );
  }
}

/** Prints, newest first, with what each filament used. */
export function listPrints(
  organizationId: string,
  opts: { since?: Date; key?: string; status?: string } = {}
) {
  return db.printJob.findMany({
    where: {
      organizationId,
      status: opts.status ? opts.status : { not: "running" },
      ...(opts.since ? { startedAt: { gte: opts.since } } : {}),
      ...(opts.key ? { uses: { some: { key: opts.key } } } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: 200,
    include: { uses: true },
  });
}
