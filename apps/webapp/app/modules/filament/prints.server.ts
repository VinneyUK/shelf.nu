/**
 * Usage per print (fork). Shelf records each print the printer runs, from its
 * reports: when it starts, the job, its file and the spools in the AMS;
 * while it prints, the slots that feed it; when it stops, what each spool
 * used, from the slicer's own grams in the print's file (read from the
 * printer), scaled by how far a print that stopped early got, and priced at
 * what was paid for that spool. A print's grams can be changed by hand.
 *
 * (The AMS's own level isn't used to measure a print: it's an estimate the
 * AMS revises now and then, in whole percent, and doesn't follow each print.)
 */
import { db } from "~/database/db.server";
import type { StatusReport } from "./ams";
import { filamentKey } from "./catalogue";
import { matchSlots, type SlicedFilament } from "./print-file.server";

type StartLevel = {
  spoolId: string;
  key: string;
  percent: number;
  weightGrams: number;
  pricePaid: number | null;
  colourHex?: string | null;
  material?: string | null;
};

/** Reads a print's slicer figures from the printer (given by the watcher). */
export type ReadFile = (
  gcodeFile: string | null,
  jobName: string
) => Promise<SlicedFilament[] | null>;

/** The spools in the AMS now. */
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
      material: true,
      colourName: true,
      colourHex: true,
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
      colourHex: s.colourHex,
      material: s.material,
    };
  return out;
}

/** What it cost: the grams at what was paid for that spool. */
export function costOf(
  grams: number,
  spool: { pricePaid: number | null; weightGrams: number }
) {
  return spool.pricePaid !== null && spool.weightGrams > 0
    ? Math.round(((grams * spool.pricePaid) / spool.weightGrams) * 100) / 100
    : null;
}

/**
 * Each spool's use from the slicer's figures: the filaments matched to the
 * AMS slots they printed from, scaled by how much of the print was done.
 */
export function usesFromSlicer(
  filaments: SlicedFilament[],
  start: Record<string, StartLevel>,
  fed: number[],
  share: number
) {
  const slots = Object.entries(start).map(([slot, s]) => ({
    slot: Number(slot),
    colourHex: s.colourHex ?? null,
    material: s.material ?? null,
  }));
  const bySlot = matchSlots(filaments, slots, fed);
  const uses: {
    spoolId: string;
    key: string;
    slot: number;
    grams: number;
    cost: number | null;
  }[] = [];
  for (const f of filaments) {
    const slot = bySlot.get(f.id);
    const s = slot !== undefined ? start[String(slot)] : undefined;
    if (!s || slot === undefined) continue;
    const grams = Math.round(f.grams * Math.max(0, Math.min(1, share)));
    if (grams <= 0) continue;
    uses.push({
      spoolId: s.spoolId,
      key: s.key,
      slot,
      grams,
      cost: costOf(grams, s),
    });
  }
  return uses;
}

/** How a print ended, from the printer's state and how far it got. */
export function outcome(status: StatusReport) {
  if (status.state === "error") return "failed";
  return (status.percent ?? 0) >= 99 ? "done" : "cancelled";
}

/** Fills in what each spool used from the print's file (again, if asked). */
export async function measurePrint(
  organizationId: string,
  jobId: string,
  readFile: ReadFile
) {
  const job = await db.printJob.findFirst({
    where: { id: jobId, organizationId },
  });
  if (!job) return { measured: false };
  const filaments = await readFile(job.gcodeFile, job.name).catch(() => null);
  if (!filaments || filaments.length === 0) return { measured: false };
  const share = job.status === "done" ? 1 : (job.endPercent ?? 0) / 100;
  const uses = usesFromSlicer(
    filaments,
    (job.startLevels ?? {}) as Record<string, StartLevel>,
    job.fedSlots ?? [],
    share
  );
  await db.$transaction([
    db.printJobUse.deleteMany({ where: { jobId, organizationId } }),
    db.printJobUse.createMany({
      data: uses.map((u) => ({ ...u, organizationId, jobId })),
    }),
    db.printJob.updateMany({
      where: { id: jobId, organizationId },
      data: { source: "slicer" },
    }),
  ]);
  return { measured: uses.length > 0 };
}

/** Closes a print, then measures it from its file. */
export async function finishPrint(
  organizationId: string,
  jobId: string,
  result: string,
  endPercent: number | null,
  readFile?: ReadFile
) {
  // only the first to close it records it
  const { count } = await db.printJob.updateMany({
    where: { id: jobId, organizationId, status: "running" },
    data: { status: result, endedAt: new Date(), endPercent },
  });
  if (count === 0 || !readFile) return;
  await measurePrint(organizationId, jobId, readFile);
}

/**
 * Called with each report's merged status: opens a print's record when the
 * printer starts, keeps the slots that feed it, and closes and measures it
 * when it stops.
 */
export async function trackPrint(
  organizationId: string,
  before: StatusReport["state"],
  status: StatusReport,
  readFile?: ReadFile
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
    if (running)
      await finishPrint(
        organizationId,
        running.id,
        "cancelled",
        null,
        readFile
      );
    await db.printJob.create({
      data: {
        organizationId,
        name: status.jobName || "Print",
        startedAt: new Date(),
        gcodeFile: status.gcodeFile ?? null,
        fedSlots: status.activeSlot ? [status.activeSlot] : [],
        startLevels: await amsLevels(organizationId),
      },
    });
    return;
  }
  if (printing && running) {
    // what arrives in later reports: the name, the file, a slot feeding it
    const data: {
      name?: string;
      gcodeFile?: string;
      fedSlots?: number[];
    } = {};
    if (status.jobName && running.name === "Print") data.name = status.jobName;
    if (status.gcodeFile && !running.gcodeFile)
      data.gcodeFile = status.gcodeFile;
    if (
      status.activeSlot &&
      !(running.fedSlots ?? []).includes(status.activeSlot)
    )
      data.fedSlots = [...(running.fedSlots ?? []), status.activeSlot];
    if (Object.keys(data).length)
      await db.printJob.updateMany({
        where: { id: running.id, organizationId },
        data,
      });
  }
  if (!printing && wasPrinting && running)
    await finishPrint(
      organizationId,
      running.id,
      outcome(status),
      status.percent ?? null,
      readFile
    );
}

/** A print's grams, set by hand: the filaments it used and how much of each. */
export async function setPrintUses(
  organizationId: string,
  jobId: string,
  entries: { spoolId: string; grams: number }[]
) {
  const job = await db.printJob.findFirst({
    where: { id: jobId, organizationId },
  });
  if (!job) throw new Error("That print isn't recorded.");
  const spools = await db.spool.findMany({
    where: { organizationId, id: { in: entries.map((e) => e.spoolId) } },
    select: {
      id: true,
      type: true,
      colourName: true,
      amsSlot: true,
      weightGrams: true,
      pricePaid: true,
    },
  });
  const byId = new Map(spools.map((s) => [s.id, s]));
  const uses = entries
    .filter((e) => byId.has(e.spoolId) && e.grams > 0)
    .map((e) => {
      const s = byId.get(e.spoolId)!;
      const grams = Math.round(e.grams);
      return {
        organizationId,
        jobId,
        spoolId: s.id,
        key: filamentKey(s.type, s.colourName),
        slot: s.amsSlot,
        grams,
        cost: costOf(grams, s),
      };
    });
  await db.$transaction([
    db.printJobUse.deleteMany({ where: { jobId, organizationId } }),
    db.printJobUse.createMany({ data: uses }),
    db.printJob.updateMany({
      where: { id: jobId, organizationId },
      data: { source: "manual" },
    }),
  ]);
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
