/**
 * The Bambu printer Shelf reads the AMS from (fork): its settings (access
 * code encrypted at rest), a one-off probe for the Test button, and a watcher
 * that keeps an MQTT connection to the printer and syncs the AMS into
 * Filament whenever the slots change.
 *
 * Works with the printer in cloud mode: the X1 series answers on the local
 * network with just the access code (user bblp), read-only. No Developer
 * mode, no Bambu account.
 */
import mqtt, { type MqttClient } from "mqtt";
import { db } from "~/database/db.server";
import { Logger } from "~/utils/logger";
import { decryptSecret, encryptSecret } from "~/utils/secret-box.server";
import { sameTrays, traysInReport, type Tray } from "./ams";
import { syncAmsTrays } from "./service.server";

export type PrinterSettings = {
  enabled: boolean;
  host: string;
  serial: string;
  /** The access code; empty when none is kept */
  accessCode: string;
  lastSeenAt: Date | null;
  lastError: string | null;
};

export async function getPrinterSettings(
  organizationId: string
): Promise<PrinterSettings> {
  const row = await db.printer.findUnique({ where: { organizationId } });
  return {
    enabled: row?.enabled ?? false,
    host: row?.host ?? "",
    serial: row?.serial ?? "",
    accessCode: decryptSecret(row?.accessCode ?? ""),
    lastSeenAt: row?.lastSeenAt ?? null,
    lastError: row?.lastError ?? null,
  };
}

/** What the browser may see: everything but the code itself. */
export async function getPrinterSettingsForPage(organizationId: string) {
  const { accessCode, ...rest } = await getPrinterSettings(organizationId);
  return { ...rest, hasCode: accessCode.length > 0 };
}

export async function savePrinterSettings(
  organizationId: string,
  input: {
    enabled: boolean;
    host: string;
    serial: string;
    accessCode?: string | null;
  }
) {
  const host = input.host.trim();
  const serial = input.serial.trim().toUpperCase();
  const data = {
    enabled: input.enabled,
    host,
    serial,
    ...(input.accessCode
      ? { accessCode: encryptSecret(input.accessCode.trim()) }
      : {}),
    lastError: null,
  };
  await db.printer.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
  await ensureAmsWatcher(organizationId, true);
}

type Target = { host: string; serial: string; accessCode: string };

function connectTo(target: Target, clientId: string): MqttClient {
  return mqtt.connect(`mqtts://${target.host}:8883`, {
    username: "bblp",
    password: target.accessCode,
    clientId,
    rejectUnauthorized: false, // the printer's certificate is self-signed
    connectTimeout: 10_000,
    reconnectPeriod: 30_000,
    keepalive: 30,
  });
}

const reportTopic = (serial: string) => `device/${serial}/report`;
const requestTopic = (serial: string) => `device/${serial}/request`;
const PUSHALL = JSON.stringify({
  pushing: { sequence_id: "1", command: "pushall" },
});

/**
 * One connection, for the Test button: what the AMS holds right now, or why
 * the printer couldn't be read. Gives up after 20 seconds.
 */
export function probePrinter(
  target: Target
): Promise<{ ok: true; trays: Tray[] } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let done = false;
    const client = connectTo(target, `shelf-probe-${Date.now()}`);
    const finish = (
      result: { ok: true; trays: Tray[] } | { ok: false; error: string }
    ) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.end(true);
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          error:
            "The printer connected but sent no AMS report in 20 seconds. Is it on and awake?",
        }),
      20_000
    );
    client.on("connect", () => {
      client.subscribe(reportTopic(target.serial));
      client.publish(requestTopic(target.serial), PUSHALL);
    });
    client.on("message", (_topic, payload) => {
      try {
        const report = JSON.parse(payload.toString());
        if ((report as { print?: { ams?: unknown } })?.print?.ams)
          finish({ ok: true, trays: traysInReport(report) });
      } catch {
        // not JSON: ignore
      }
    });
    client.on("error", (cause) =>
      finish({ ok: false, error: plainError(cause) })
    );
  });
}

function plainError(cause: unknown) {
  const m = cause instanceof Error ? cause.message : String(cause);
  if (/not authorized|bad user name or password/i.test(m))
    return "The printer refused the access code. Check it on the printer's screen under WLAN.";
  if (
    /ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ENOTFOUND|connack timeout|timed out/i.test(
      m
    )
  )
    return `Couldn't reach the printer at that address (${m}).`;
  return m;
}

// ------------------------------------------------------------- the watcher

type Watch = {
  key: string;
  client: MqttClient;
  last: Tray[] | null;
  lastSync: number;
};
const watchers = new Map<string, Watch>();

const keyOf = (t: Target) => `${t.host}|${t.serial}|${t.accessCode}`;

/**
 * Keeps a connection to the printer for this workspace: starts one if none,
 * restarts it when the settings change, stops it when reading is switched
 * off. Safe to call often (the Filament page does).
 */
export async function ensureAmsWatcher(
  organizationId: string,
  restart = false
) {
  const s = await getPrinterSettings(organizationId);
  const current = watchers.get(organizationId);
  const wanted = s.enabled && s.host && s.serial && s.accessCode;
  if (!wanted) {
    if (current) {
      current.client.end(true);
      watchers.delete(organizationId);
    }
    return false;
  }
  const key = keyOf(s);
  if (current && current.key === key && !restart) return true;
  if (current) {
    current.client.end(true);
    watchers.delete(organizationId);
  }
  const client = connectTo(
    s,
    `shelf-ams-${organizationId.slice(0, 8)}-${Date.now()}`
  );
  const watch: Watch = { key, client, last: null, lastSync: 0 };
  watchers.set(organizationId, watch);
  client.on("connect", () => {
    client.subscribe(reportTopic(s.serial));
    client.publish(requestTopic(s.serial), PUSHALL);
  });
  client.on("message", (_topic, payload) => {
    void handleReport(organizationId, watch, payload);
  });
  client.on("error", (cause) => {
    void note(organizationId, { lastError: plainError(cause) });
  });
  return true;
}

async function handleReport(
  organizationId: string,
  watch: Watch,
  payload: Buffer
) {
  let report: unknown;
  try {
    report = JSON.parse(payload.toString());
  } catch {
    return;
  }
  if (!(report as { print?: { ams?: unknown } })?.print?.ams) return;
  const trays = traysInReport(report);
  const stale = Date.now() - watch.lastSync > 10 * 60 * 1000;
  if (watch.last && sameTrays(watch.last, trays) && !stale) {
    await note(organizationId, { lastSeenAt: new Date(), lastError: null });
    return;
  }
  watch.last = trays;
  watch.lastSync = Date.now();
  try {
    await syncAmsTrays(organizationId, trays);
    await note(organizationId, { lastSeenAt: new Date(), lastError: null });
  } catch (cause) {
    Logger.error(cause);
    await note(organizationId, {
      lastError: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

let lastNoted = 0;
async function note(
  organizationId: string,
  data: { lastSeenAt?: Date; lastError?: string | null }
) {
  // the printer reports every few seconds; a "seen" alone is written at most once a minute
  if (
    data.lastError === undefined &&
    data.lastSeenAt &&
    Date.now() - lastNoted < 60_000
  )
    return;
  lastNoted = Date.now();
  await db.printer
    .update({ where: { organizationId }, data })
    .catch(() => undefined);
}
