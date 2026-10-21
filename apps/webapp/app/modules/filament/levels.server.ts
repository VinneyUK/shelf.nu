/**
 * A filament's usage over time (fork): what's on hand of each filament is
 * kept for each day, hourly and whenever its page is opened, so its page can
 * chart the last 30 days and project ahead.
 */
import { db } from "~/database/db.server";
import { Logger } from "~/utils/logger";
import { filamentKey, gramsLeft } from "./catalogue";
import { dayKey } from "./levels";

/** Today's on-hand grams for each filament of a workspace (or just one), saved. */
export async function recordLevels(organizationId: string, onlyKey?: string) {
  const spools = await db.spool.findMany({
    where: { organizationId, status: { not: "retired" } },
    select: {
      type: true,
      colourName: true,
      weightGrams: true,
      remainingPercent: true,
      pricePaid: true,
    },
  });
  const grams = new Map<string, number>();
  for (const s of spools) {
    const key = filamentKey(s.type, s.colourName);
    if (onlyKey && key !== onlyKey) continue;
    grams.set(key, (grams.get(key) ?? 0) + gramsLeft(s));
  }
  // a filament with nothing left on hand that day still gets its 0
  if (onlyKey && !grams.has(onlyKey)) grams.set(onlyKey, 0);
  const day = new Date(`${dayKey(new Date())}T00:00:00Z`);
  for (const [key, g] of grams) {
    await db.filamentLevel.upsert({
      where: { organizationId_key_day: { organizationId, key, day } },
      create: { organizationId, key, day, grams: Math.round(g) },
      update: { grams: Math.round(g) },
    });
  }
}

/** A filament's records for the last `days` days (and the one before, to carry in). */
export function getLevels(organizationId: string, key: string, days = 30) {
  const since = new Date(Date.now() - (days + 30) * 24 * 60 * 60 * 1000);
  return db.filamentLevel.findMany({
    where: { organizationId, key, day: { gte: since } },
    orderBy: { day: "asc" },
    select: { day: true, grams: true },
  });
}

declare global {
  // One start per process, even when the dev server reloads
  var shelfFilamentLevelsStarted: boolean | undefined;
}

/** Keeps every workspace's filament levels, from when Shelf starts and hourly after. */
export function startFilamentLevels() {
  if (global.shelfFilamentLevelsStarted) return;
  global.shelfFilamentLevelsStarted = true;
  const run = async () => {
    try {
      const orgs = await db.spool.findMany({
        distinct: ["organizationId"],
        select: { organizationId: true },
      });
      for (const { organizationId } of orgs) await recordLevels(organizationId);
    } catch (cause) {
      Logger.error(cause);
    }
  };
  void run();
  setInterval(() => void run(), 60 * 60 * 1000);
}
