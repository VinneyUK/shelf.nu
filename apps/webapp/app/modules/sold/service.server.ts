/**
 * Sold assets: marking, unmarking and reporting.
 * Part of the sold feature; not in upstream Shelf.
 *
 * A sale is a row in AssetSale (date and optional price). The asset itself is
 * untouched, so Shelf's own statuses keep working; "Sold" is shown in place of
 * the status wherever the sold feature wraps the status badge.
 */
import { db } from "~/database/db.server";
import { addAssetActivity } from "~/modules/activity/service.server";
import { formatCurrency } from "~/utils/currency";
import { SOLD_FIELDS } from "./constants";

/** Records (or updates) the sale of each asset in the workspace. */
export async function markAssetsSold({
  organizationId,
  assetIds,
  soldOn,
  price,
  userId = null,
}: {
  organizationId: string;
  assetIds: string[];
  soldOn: Date;
  price: number | null;
  userId?: string | null;
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
  const organization = await db.organization.findFirst({
    where: { id: organizationId },
    select: { currency: true },
  });
  const when = soldOn.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const forPrice =
    price !== null && organization
      ? ` for ${formatCurrency({
          value: price,
          currency: organization.currency,
          locale: "en-GB",
        })}`
      : "";
  await addAssetActivity({
    organizationId,
    assetIds: assets.map((a) => a.id),
    userId,
    action: `marked this asset as **sold** (${when}${forPrice}).`,
  });
  // fork: sold assets go into the Sold box. A failure here never stops the sale.
  try {
    const { moveToSoldBox } = await import("./sold-box.server");
    await moveToSoldBox({
      organizationId,
      userId,
      assetIds: assets.map((a) => a.id),
    });
  } catch {
    // moveToSoldBox logs its own failures
  }
  return assets.length;
}

/** Marks assets as not sold again. */
export async function markAssetsNotSold({
  organizationId,
  assetIds,
  userId = null,
}: {
  organizationId: string;
  assetIds: string[];
  userId?: string | null;
}) {
  const sold = await db.assetSale.findMany({
    where: { assetId: { in: assetIds }, organizationId },
    // previousKitId: where it was before the Sold box, read before the sale is deleted
    select: { assetId: true, previousKitId: true },
  });
  const { count } = await db.assetSale.deleteMany({
    where: { assetId: { in: assetIds }, organizationId },
  });
  await addAssetActivity({
    organizationId,
    assetIds: sold.map((s) => s.assetId),
    userId,
    action: "marked this asset as **not sold**.",
  });
  // fork: take them out of the Sold box, back to where they came from
  try {
    const { moveBackFromSoldBox } = await import("./sold-box.server");
    await moveBackFromSoldBox({
      organizationId,
      userId,
      previousBoxes: new Map(sold.map((s) => [s.assetId, s.previousKitId])),
    });
  } catch {
    // moveBackFromSoldBox logs its own failures
  }
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

/**
 * Applies the edit form's Sold row. Nothing happens unless the row was in
 * the form; unmarking only when the asset was sold, so activity isn't noisy.
 */
export async function applySoldFromForm({
  formData,
  organizationId,
  assetId,
  userId,
}: {
  formData: FormData;
  organizationId: string;
  assetId: string;
  userId: string;
}) {
  const sold = formData.get(SOLD_FIELDS.sold);
  if (sold !== "true" && sold !== "false") return;

  const current = await db.assetSale.findFirst({
    where: { assetId, organizationId },
    select: { soldOn: true, price: true },
  });
  if (sold === "false") {
    if (current)
      await markAssetsNotSold({ organizationId, assetIds: [assetId], userId });
    return;
  }
  const soldOnRaw = String(formData.get(SOLD_FIELDS.soldOn) ?? "");
  const soldOn = /^\d{4}-\d{2}-\d{2}$/.test(soldOnRaw)
    ? new Date(`${soldOnRaw}T00:00:00.000Z`)
    : current?.soldOn ?? new Date();
  const priceRaw = String(formData.get(SOLD_FIELDS.price) ?? "").trim();
  const price = priceRaw === "" ? null : Math.max(0, Number(priceRaw) || 0);
  const unchanged =
    current &&
    current.soldOn.toISOString().slice(0, 10) ===
      soldOn.toISOString().slice(0, 10) &&
    current.price === price;
  if (unchanged) return;
  await markAssetsSold({
    organizationId,
    assetIds: [assetId],
    soldOn,
    price,
    userId,
  });
}
