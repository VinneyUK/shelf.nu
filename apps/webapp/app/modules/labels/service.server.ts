/**
 * Label printing: settings, the print queue, talking to Home Assistant, and
 * the background loop that prints. Part of the labels feature; not in
 * upstream Shelf.
 *
 * Print jobs live in LabelPrintJob. A loop in this server process picks them
 * up within seconds (Shelf's pg-boss queue only polls every five minutes), so
 * the button feels immediate. Each job is claimed with FOR UPDATE SKIP LOCKED,
 * so it can never print twice, and a failed print waits progressively longer
 * before the next try.
 */
import { db } from "~/database/db.server";
import { addAssetActivity } from "~/modules/activity/service.server";
import { getQrBaseUrl } from "~/modules/qr/utils.server";
import { SERVER_URL } from "~/utils/env";
import { ShelfError } from "~/utils/error";
import type { ErrorLabel } from "~/utils/error";
import { Logger } from "~/utils/logger";
import { printRequestBody } from "./layout";
import { retryDelayMs } from "./retry";

const label: ErrorLabel = "Assets";

// ------------------------------------------------------------------ settings

export type LabelSettingsInput = {
  haUrl: string;
  /** Blank keeps the saved token */
  haToken: string;
  deviceId: string;
  labelWidth: number;
  leftMargin: number;
  rotate: number;
  density: number | null;
  queueTagName: string;
};

const DEFAULT_SETTINGS = {
  haUrl: "",
  haToken: "",
  deviceId: "",
  labelWidth: 240,
  leftMargin: 8,
  rotate: 90,
  density: null as number | null,
  queueTagName: "QRP",
};

async function getSettingsWithToken(organizationId: string) {
  const row = await db.labelSettings.findUnique({ where: { organizationId } });
  return { ...DEFAULT_SETTINGS, ...(row ?? {}) };
}

/** The QR link for a QR id, exactly as Shelf's own labels encode it. */
export function qrUrlFor(qrId: string) {
  return `${getQrBaseUrl()}/${qrId}`;
}

/** Settings safe to send to the browser: the token itself never leaves the server. */
export async function getLabelSettings(organizationId: string) {
  const { haToken, ...rest } = await getSettingsWithToken(organizationId);
  return {
    haUrl: rest.haUrl,
    deviceId: rest.deviceId,
    labelWidth: rest.labelWidth,
    leftMargin: rest.leftMargin,
    rotate: rest.rotate,
    density: rest.density,
    queueTagName: rest.queueTagName,
    hasToken: haToken.length > 0,
    isConfigured: Boolean(rest.haUrl && haToken && rest.deviceId),
  };
}

export type PublicLabelSettings = Awaited<ReturnType<typeof getLabelSettings>>;

export async function saveLabelSettings(
  organizationId: string,
  input: LabelSettingsInput
) {
  const data = {
    haUrl: input.haUrl.trim().replace(/\/+$/, ""),
    deviceId: input.deviceId.trim(),
    labelWidth: input.labelWidth,
    leftMargin: input.leftMargin,
    rotate: input.rotate,
    density: input.density,
    queueTagName: input.queueTagName.trim(),
    ...(input.haToken.trim() ? { haToken: input.haToken.trim() } : {}),
  };
  await db.labelSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
}

// ------------------------------------------------------------ Home Assistant

type HaSettings = { haUrl: string; haToken: string };

/** Calls Home Assistant's REST API. Throws a ShelfError with a readable reason. */
async function callHomeAssistant(
  settings: HaSettings,
  path: string,
  body: unknown,
  timeoutMs: number
): Promise<string> {
  let response: Response;
  try {
    // why plain fetch: Home Assistant lives on the home network, which Shelf's
    // safeFetch deliberately refuses. The address is set by a workspace admin.
    response = await fetch(`${settings.haUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.haToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: `Couldn't reach Home Assistant at ${settings.haUrl}.`,
      label,
      shouldBeCaptured: false,
    });
  }
  const text = await response.text();
  if (response.status === 401) {
    throw new ShelfError({
      cause: null,
      message:
        "Home Assistant refused the token. Check it in Labels → Settings.",
      label,
      shouldBeCaptured: false,
    });
  }
  if (!response.ok) {
    throw new ShelfError({
      cause: null,
      message: `Home Assistant couldn't print it (HTTP ${
        response.status
      }). Is the printer on and in range?${
        text ? ` ${text.slice(0, 200)}` : ""
      }`,
      label,
      shouldBeCaptured: false,
    });
  }
  return text;
}

export type PrinterEntity = {
  entity: string;
  name: string | null;
  state: string;
  unit: string | null;
  device_class: string | null;
};

/** Every sensor on the printer, from Home Assistant. Null if it can't be asked. */
export async function getPrinterStatus(
  organizationId: string
): Promise<PrinterEntity[] | null> {
  const s = await getSettingsWithToken(organizationId);
  if (!s.haUrl || !s.haToken || !/^[A-Za-z0-9]+$/.test(s.deviceId)) return null;
  const template = `{% set ns = namespace(items=[]) %}{% for e in device_entities('${s.deviceId}') %}{% set ns.items = ns.items + [{'entity': e, 'name': state_attr(e, 'friendly_name'), 'state': states(e), 'unit': state_attr(e, 'unit_of_measurement'), 'device_class': state_attr(e, 'device_class')}] %}{% endfor %}{{ ns.items | tojson }}`;
  try {
    const text = await callHomeAssistant(
      s,
      "/api/template",
      { template },
      6000
    );
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as PrinterEntity[]) : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- the queue

export type PrintSource = "asset" | "bulk" | "tag" | "labels-page";

/**
 * Queues a label for each asset. Assets already waiting or printing are
 * skipped, so pressing Print twice doesn't print twice.
 */
export async function queueLabels({
  organizationId,
  assetIds,
  source,
  userId,
}: {
  organizationId: string;
  assetIds: string[];
  source: PrintSource;
  userId: string | null;
}) {
  const unique = [...new Set(assetIds)];
  if (unique.length === 0) return { queued: 0, alreadyQueued: 0, noQrCode: 0 };

  const assets = await db.asset.findMany({
    where: { id: { in: unique }, organizationId },
    select: {
      id: true,
      title: true,
      sequentialId: true,
      qrCodes: {
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const pending = await db.labelPrintJob.findMany({
    where: {
      organizationId,
      assetId: { in: assets.map((a) => a.id) },
      status: { in: ["queued", "printing"] },
    },
    select: { assetId: true },
  });
  const pendingIds = new Set(pending.map((p) => p.assetId));

  const toQueue = assets.filter((a) => !pendingIds.has(a.id) && a.qrCodes[0]);
  if (toQueue.length > 0) {
    await db.labelPrintJob.createMany({
      data: toQueue.map((a) => ({
        organizationId,
        assetId: a.id,
        sequentialId: a.sequentialId ?? "",
        title: a.title,
        qrId: a.qrCodes[0].id,
        source,
        requestedById: userId,
      })),
    });
    nudgeLabelPrinter();
  }
  return {
    queued: toQueue.length,
    alreadyQueued: assets.filter((a) => pendingIds.has(a.id)).length,
    noQrCode: assets.filter((a) => !a.qrCodes[0]).length,
  };
}

/** Everything the Labels page shows. */
export async function getLabelQueue(organizationId: string) {
  const [active, history] = await Promise.all([
    db.labelPrintJob.findMany({
      where: { organizationId, status: { in: ["queued", "printing"] } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    db.labelPrintJob.findMany({
      where: { organizationId, status: { in: ["printed", "cancelled"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return {
    printing: active.find((j) => j.status === "printing") ?? null,
    waiting: active.filter((j) => j.status === "queued"),
    history,
  };
}

export async function cancelLabelJob(organizationId: string, jobId: string) {
  const { count } = await db.labelPrintJob.updateMany({
    where: { id: jobId, organizationId, status: "queued" },
    data: { status: "cancelled" },
  });
  return count > 0;
}

/** Puts a waiting job's next try right now (after fixing the printer, say). */
export async function retryLabelJobsNow(organizationId: string) {
  await db.labelPrintJob.updateMany({
    where: { organizationId, status: "queued" },
    data: { nextAttemptAt: null },
  });
  nudgeLabelPrinter();
}

/** When each asset last had a label printed — the "Labelled" badge. */
export async function getLabelledAssets(organizationId: string) {
  const rows = await db.labelPrintJob.groupBy({
    by: ["assetId"],
    where: {
      organizationId,
      status: "printed",
      assetId: { not: null },
      labelRemovedAt: null,
    },
    _max: { printedAt: true },
  });
  const labelled: Record<string, string> = {};
  for (const row of rows) {
    if (row.assetId && row._max.printedAt) {
      labelled[row.assetId] = row._max.printedAt.toISOString();
    }
  }
  return labelled;
}

/** "Remove label": the asset is no longer Labelled; its prints stay in the history. */
export async function removeLabels({
  organizationId,
  assetIds,
  userId = null,
}: {
  organizationId: string;
  assetIds: string[];
  userId?: string | null;
}) {
  const { count } = await db.labelPrintJob.updateMany({
    where: {
      organizationId,
      assetId: { in: assetIds },
      status: "printed",
      labelRemovedAt: null,
    },
    data: { labelRemovedAt: new Date() },
  });
  if (count > 0) {
    await addAssetActivity({
      organizationId,
      assetIds,
      userId,
      action: "removed the **label** (no longer marked as labelled).",
    });
  }
  return count;
}

/** The asset's current label, for the card on the asset overview; null if not labelled. */
export async function getPrintedLabel({
  organizationId,
  assetId,
}: {
  organizationId: string;
  assetId: string;
}) {
  const job = await db.labelPrintJob.findFirst({
    where: { organizationId, assetId, status: "printed", labelRemovedAt: null },
    orderBy: { printedAt: "desc" },
    select: { sequentialId: true, title: true, qrId: true, printedAt: true },
  });
  if (!job) return null;
  const s = await getSettingsWithToken(organizationId);
  return {
    sequentialId: job.sequentialId,
    title: job.title,
    qrUrl: qrUrlFor(job.qrId),
    printedAt: job.printedAt,
    settings: { labelWidth: s.labelWidth, leftMargin: s.leftMargin },
  };
}

/** A test print of a sample label, straight away, bypassing the queue. */
export async function printTestLabel(organizationId: string, preview: boolean) {
  const s = await getSettingsWithToken(organizationId);
  if (!s.haUrl || !s.haToken || !s.deviceId) {
    throw new ShelfError({
      cause: null,
      message: "Fill in and save the Home Assistant settings first.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  }
  const body = printRequestBody(
    {
      sequentialId: "SAM-0000",
      title: "Test label from Shelf",
      qrUrl: `${SERVER_URL}/labels`,
    },
    s,
    { preview }
  );
  await callHomeAssistant(s, "/api/services/niimbot/print", body, 120_000);
}

// ---------------------------------------------------------------- printing

type ClaimedJob = {
  id: string;
  organizationId: string;
  assetId: string | null;
  sequentialId: string;
  title: string;
  qrId: string;
  attempts: number;
  source: string;
  requestedById: string | null;
};

/** Takes the next job that's due, marking it printing in the same statement. */
async function claimNextJob(): Promise<ClaimedJob | null> {
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE "LabelPrintJob" SET status = 'printing', "startedAt" = now()
    WHERE id = (
      SELECT id FROM "LabelPrintJob"
      WHERE status = 'queued' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "organizationId", "assetId", "sequentialId", title, "qrId", attempts, source, "requestedById"`;
  return rows[0] ?? null;
}

async function printJob(job: ClaimedJob): Promise<boolean> {
  try {
    const s = await getSettingsWithToken(job.organizationId);
    if (!s.haUrl || !s.haToken || !s.deviceId) {
      throw new ShelfError({
        cause: null,
        message: "The printer isn't set up yet. Fill in Labels → Settings.",
        label,
        shouldBeCaptured: false,
      });
    }
    const body = printRequestBody(
      {
        sequentialId: job.sequentialId,
        title: job.title,
        // Same link Shelf's own QR codes use (honours URL_SHORTENER)
        qrUrl: qrUrlFor(job.qrId),
      },
      s
    );
    await callHomeAssistant(s, "/api/services/niimbot/print", body, 120_000);
    await db.labelPrintJob.updateMany({
      where: { id: job.id, organizationId: job.organizationId },
      data: { status: "printed", printedAt: new Date(), lastError: null },
    });
    if (job.assetId) {
      await addAssetActivity({
        organizationId: job.organizationId,
        assetIds: [job.assetId],
        userId: job.requestedById,
        action: `printed a **label**${
          job.source === "tag" ? " (queued by tag)" : ""
        }.`,
      });
    }
    return true;
  } catch (cause) {
    const attempts = job.attempts + 1;
    const message =
      cause instanceof ShelfError
        ? cause.message
        : "Printing failed unexpectedly.";
    await db.labelPrintJob.updateMany({
      where: { id: job.id, organizationId: job.organizationId },
      data: {
        status: "queued",
        attempts,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
      },
    });
    return false;
  }
}

/** Jobs left "printing" by a restart mid-print go back in the queue. */
async function recoverInterruptedJobs() {
  await db.labelPrintJob.updateMany({
    where: {
      status: "printing",
      startedAt: { lt: new Date(Date.now() - 5 * 60_000) },
    },
    data: { status: "queued" },
  });
}

let printing = false;
let printAgain = false;

/** Prints everything that's due, one label at a time. Never throws. */
export async function printDueLabels() {
  if (printing) {
    printAgain = true;
    return;
  }
  printing = true;
  try {
    await recoverInterruptedJobs();
    // A failure usually means the printer is off: stop until the job's next try
    for (let job = await claimNextJob(); job; job = await claimNextJob()) {
      if (!(await printJob(job))) break;
    }
  } catch (cause) {
    Logger.error(
      new ShelfError({ cause, message: "Label printing loop failed", label })
    );
  } finally {
    printing = false;
    if (printAgain) {
      printAgain = false;
      void printDueLabels();
    }
  }
}

/** Start printing now rather than at the next tick. */
export function nudgeLabelPrinter() {
  void printDueLabels();
}

// --------------------------------------------------------------- QRP tag

/**
 * Queues assets carrying a workspace's queue tag, then takes the tag off.
 * Done in that order so a crash in between prints twice rather than never.
 */
export async function queueTaggedAssets() {
  try {
    const workspaces = await db.labelSettings.findMany({
      where: { queueTagName: { not: "" } },
      select: { organizationId: true, queueTagName: true },
    });
    for (const { organizationId, queueTagName } of workspaces) {
      const customisation = await db.workspaceCustomisation.findUnique({
        where: { organizationId },
        select: { labelsEnabled: true },
      });
      if (customisation && !customisation.labelsEnabled) continue;

      const tags = await db.tag.findMany({
        where: {
          organizationId,
          name: { equals: queueTagName, mode: "insensitive" },
        },
        select: { id: true, assets: { select: { id: true }, take: 500 } },
      });
      for (const tag of tags) {
        const assetIds = tag.assets.map((a) => a.id);
        if (assetIds.length === 0) continue;
        await queueLabels({
          organizationId,
          assetIds,
          source: "tag",
          userId: null,
        });
        await db.$executeRaw`
          DELETE FROM "_AssetToTag"
          WHERE "B" = ${tag.id}
            AND "A" IN (SELECT id FROM "Asset" WHERE "organizationId" = ${organizationId} AND id = ANY(${assetIds}))`;
      }
    }
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Checking for the label tag failed",
        label,
      })
    );
  }
}

// ------------------------------------------------------------------ worker

declare global {
  // One set of timers per process, even when the dev server reloads
  var shelfLabelWorkerStarted: boolean | undefined;
}

/** Starts the background printing: every 10 s for jobs, every 60 s for the tag. */
export function startLabelWorker() {
  if (global.shelfLabelWorkerStarted) return;
  global.shelfLabelWorkerStarted = true;
  setInterval(() => void printDueLabels(), 10_000);
  setInterval(() => void queueTaggedAssets(), 60_000);
  void printDueLabels();
}
