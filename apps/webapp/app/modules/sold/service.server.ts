/**
 * Sold assets: marking, unmarking and reporting.
 * Part of the sold feature; not in upstream Shelf.
 *
 * A sale is a row in AssetSale (date and optional price). The asset itself is
 * untouched, so Shelf's own statuses keep working; "Sold" is shown in place of
 * the status wherever the sold feature wraps the status badge.
 */
import { db } from "~/database/db.server";

/** Records (or updates) the sale of each asset in the workspace. */
export async function markAssetsSold({
  organizationId,
  assetIds,
  soldOn,
  price,
}: {
  organizationId: string;
  assetIds: string[];
  soldOn: Date;
  price: number | null;
}) {
  const assets = await db.asset.findMany({
    where: { id: { in: [...new Set(assetIds)] }, organizationId },
    select: { id: true },
  });
  await db.$transaction(
    assets.map(({ id }) =>
      db.assetSale.upsert({
        where: { assetId: id },
        create: { assetId: id, organizationId, soldOn, price },
        update: { soldOn, price },
      })
    )
  );
  return assets.length;
}

/** Marks assets as not sold again. */
export async function markAssetsNotSold({
  organizationId,
  assetIds,
}: {
  organizationId: string;
  assetIds: string[];
}) {
  const { count } = await db.assetSale.deleteMany({
    where: { assetId: { in: assetIds }, organizationId },
  });
  return count;
}

/** Every sold asset's sale, for the Sold status in lists. */
export async function getSales(organizationId: string) {
  const rows = await db.assetSale.findMany({
    where: { organizationId },
    select: { assetId: true, soldOn: true, price: true },
  });
  const sales: Record<string, { soldOn: string; price: number | null }> = {};
  for (const row of rows) {
    sales[row.assetId] = {
      soldOn: row.soldOn.toISOString().slice(0, 10),
      price: row.price,
    };
  }
  return sales;
}

/** The sold assets report: each sale, and totals, optionally between dates. */
export async function getSoldReport({
  organizationId,
  from,
  to,
}: {
  organizationId: string;
  from?: Date | null;
  to?: Date | null;
}) {
  const sales = await db.assetSale.findMany({
    where: {
      organizationId,
      soldOn: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
    },
    orderBy: { soldOn: "desc" },
    select: {
      soldOn: true,
      price: true,
      asset: {
        select: { id: true, title: true, sequentialId: true, valuation: true },
      },
    },
  });
  const rows = sales.map((sale) => ({
    assetId: sale.asset.id,
    title: sale.asset.title,
    sequentialId: sale.asset.sequentialId ?? "",
    soldOn: sale.soldOn.toISOString().slice(0, 10),
    price: sale.price,
    value: sale.asset.valuation,
    // Sale price against the value recorded in Shelf
    difference:
      sale.price !== null && sale.asset.valuation !== null
        ? sale.price - sale.asset.valuation
        : null,
  }));
  const sum = (values: (number | null)[]) =>
    values.reduce<number>((total, v) => total + (v ?? 0), 0);
  return {
    rows,
    totals: {
      count: rows.length,
      price: sum(rows.map((r) => r.price)),
      value: sum(rows.map((r) => r.value)),
      difference: sum(rows.map((r) => r.difference)),
      withoutPrice: rows.filter((r) => r.price === null).length,
    },
  };
}
