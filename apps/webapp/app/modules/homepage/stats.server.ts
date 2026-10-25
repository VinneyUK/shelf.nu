/**
 * Figures for a Homepage (gethomepage.dev) dashboard widget (fork), read by
 * its customapi widget from /api/homepage. The keys are a published
 * contract: Homepage's config refers to them by path (assets.total,
 * filament.low…), so they must not be renamed or moved, only added to.
 */
import { db } from "~/database/db.server";
import { printerStatus } from "~/modules/filament/printer.server";

/** A spool at or under this level counts as low (the filament pages' red). */
export const LOW_PERCENT = 10;

export type HomepageStats = {
  assets: { total: number; available: number; sold: number; value: number };
  boxes: { total: number };
  filament: {
    total: number;
    in_use: number;
    low: number;
    opened: number;
    new: number;
  };
  prints: {
    active: number;
    progress: number | null;
    name: string | null;
    eta_min: number | null;
  };
  iot: { assets: number; devices: number };
  updated: string;
};

/**
 * The workspace the dashboard shows: HOMEPAGE_ORGANIZATION_ID if set, else
 * the workspace with the most assets (on a one-person Shelf, yours).
 */
export async function homepageOrganizationId(): Promise<string | null> {
  const fromEnv = process.env.HOMEPAGE_ORGANIZATION_ID?.trim();
  if (fromEnv) return fromEnv;
  const top = await db.asset.groupBy({
    by: ["organizationId"],
    _count: { _all: true },
    orderBy: { _count: { organizationId: "desc" } },
    take: 1,
  });
  if (top[0]) return top[0].organizationId;
  const any = await db.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return any?.id ?? null;
}

const iotCategory = {
  OR: [
    { category: { name: { equals: "IoT", mode: "insensitive" as const } } },
    {
      category: {
        name: { equals: "Internet of Things", mode: "insensitive" as const },
      },
    },
  ],
};

/** The figures, one small query per block. */
export async function homepageStats(
  organizationId: string
): Promise<HomepageStats> {
  const org = { organizationId };
  const [
    total,
    available,
    sold,
    unsold,
    boxes,
    spools,
    iotAssets,
    devices,
    printer,
  ] = await Promise.all([
    db.asset.count({ where: org }),
    db.asset.count({
      where: { ...org, status: "AVAILABLE", sale: { is: null } },
    }),
    db.asset.count({ where: { ...org, sale: { isNot: null } } }),
    db.asset.findMany({
      where: { ...org, sale: { is: null }, valuation: { not: null } },
      select: { valuation: true, quantity: true },
    }),
    db.kit.count({ where: org }),
    db.spool.findMany({
      where: { ...org, status: { not: "retired" } },
      select: { amsSlot: true, openedOn: true, remainingPercent: true },
    }),
    db.asset.count({ where: { ...org, ...iotCategory } }),
    db.matterDevice.count({ where: org }),
    printerStatus(organizationId).catch(() => null),
  ]);
  const value = unsold.reduce(
    (n, a) => n + (a.valuation ?? 0) * (a.quantity ?? 1),
    0
  );
  const job = printer?.job ?? null;
  const printing = printer?.state === "printing" || printer?.state === "paused";
  return {
    assets: { total, available, sold, value: Math.round(value * 100) / 100 },
    boxes: { total: boxes },
    filament: {
      total: spools.length,
      in_use: spools.filter((s) => s.amsSlot !== null).length,
      low: spools.filter((s) => s.remainingPercent <= LOW_PERCENT).length,
      opened: spools.filter((s) => s.openedOn !== null).length,
      new: spools.filter((s) => s.openedOn === null).length,
    },
    prints: {
      active: printing && job ? 1 : 0,
      progress: printing && job ? job.percent : null,
      name: printing && job ? job.name : null,
      eta_min: printing && job ? job.minutesLeft : null,
    },
    iot: { assets: iotAssets, devices },
    updated: new Date().toISOString(),
  };
}

const CACHE_MS = 30_000;
let cached: { at: number; org: string; stats: HomepageStats } | null = null;

/** The figures, kept 30 seconds (Homepage polls every 10–30 s). */
export async function cachedHomepageStats(
  organizationId: string,
  now = Date.now()
) {
  if (cached && cached.org === organizationId && now - cached.at < CACHE_MS)
    return cached.stats;
  const stats = await homepageStats(organizationId);
  cached = { at: now, org: organizationId, stats };
  return stats;
}

/** For tests. */
export function resetHomepageCache() {
  cached = null;
}
