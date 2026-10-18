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
import { ShelfError } from "~/utils/error";
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
    select: { id: true, quantity: true },
  });
  await db.$transaction(
    assets.map(({ id, quantity }) => {
      // all of it is sold (quantities, fork): however many it has
      const sold = quantity ?? 1;
      return db.assetSale.upsert({
        where: { assetId: id },
        create: { assetId: id, organizationId, soldOn, price, quantity: sold },
        update: { soldOn, price, quantity: sold },
      });
    })
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

// ------------------------------------------------- part of an asset (fork)

const money = async (organizationId: string, value: number | null) => {
  if (value === null) return "";
  const organization = await db.organization.findFirst({
    where: { id: organizationId },
    select: { currency: true },
  });
  return organization
    ? ` for ${formatCurrency({
        value,
        currency: organization.currency,
        locale: "en-GB",
      })}`
    : "";
};

const dayOf = (d: Date) =>
  d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Sells some of an asset (quantities, fork). Fewer than it has: the sale is
 * recorded and its quantity goes down; it stays unsold. All of what's left:
 * it's sold as a whole (Sold, into the Sold box). `price` is for all of them
 * together. Returns which happened and how many are left.
 */
export async function sellPart({
  organizationId,
  assetId,
  quantity,
  soldOn,
  price,
  userId = null,
}: {
  organizationId: string;
  assetId: string;
  quantity: number;
  soldOn: Date;
  price: number | null;
  userId?: string | null;
}): Promise<{ kind: "part" | "all"; left: number }> {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true, quantity: true, sale: { select: { assetId: true } } },
  });
  if (!asset)
    throw new ShelfError({
      cause: null,
      message: "That asset isn't here.",
      status: 404,
      label: "Assets",
      shouldBeCaptured: false,
    });
  if (asset.sale)
    throw new ShelfError({
      cause: null,
      message: "It's already sold.",
      status: 400,
      label: "Assets",
      shouldBeCaptured: false,
    });
  const have = asset.quantity ?? 1;
  const count = Math.floor(quantity);
  if (!Number.isFinite(count) || count < 1)
    throw new ShelfError({
      cause: null,
      message: "Sell at least one.",
      status: 400,
      label: "Assets",
      shouldBeCaptured: false,
    });
  if (count >= have) {
    await markAssetsSold({
      organizationId,
      assetIds: [assetId],
      soldOn,
      price,
      userId,
    });
    return { kind: "all", left: 0 };
  }
  await db.$transaction(async (tx) => {
    // the quantity only goes down if it's still what was read
    const { count: changed } = await tx.asset.updateMany({
      where: { id: assetId, organizationId, quantity: asset.quantity },
      data: { quantity: have - count },
    });
    if (changed === 0)
      throw new ShelfError({
        cause: null,
        message: "Its quantity changed while you were selling. Try again.",
        status: 409,
        label: "Assets",
        shouldBeCaptured: false,
      });
    await tx.assetPartSale.create({
      data: { organizationId, assetId, quantity: count, soldOn, price },
    });
  });
  const forPrice = await money(organizationId, price);
  const left = have - count;
  const when = dayOf(soldOn);
  await addAssetActivity({
    organizationId,
    assetIds: [assetId],
    userId,
    action: `sold **${count} of ${have}** on ${when}${forPrice}, with ${left} left.`,
  });
  return { kind: "part", left: have - count };
}

/** Undoes selling part of an asset: the sale goes and its quantity comes back. */
export async function undoPartSale({
  organizationId,
  partSaleId,
  userId = null,
}: {
  organizationId: string;
  partSaleId: string;
  userId?: string | null;
}) {
  const sale = await db.assetPartSale.findFirst({
    where: { id: partSaleId, organizationId },
    select: { id: true, assetId: true, quantity: true },
  });
  if (!sale)
    throw new ShelfError({
      cause: null,
      message: "That sale isn't here.",
      status: 404,
      label: "Assets",
      shouldBeCaptured: false,
    });
  await db.$transaction(async (tx) => {
    const asset = await tx.asset.findFirst({
      where: { id: sale.assetId, organizationId },
      select: { quantity: true },
    });
    await tx.asset.updateMany({
      where: { id: sale.assetId, organizationId },
      data: { quantity: (asset?.quantity ?? 1) + sale.quantity },
    });
    await tx.assetPartSale.deleteMany({
      where: { id: sale.id, organizationId },
    });
  });
  await addAssetActivity({
    organizationId,
    assetIds: [sale.assetId],
    userId,
    action: `undid the sale of **${sale.quantity}**; they're back.`,
  });
  return sale;
}

/** An asset's part sales, newest first, for its page. */
export async function getPartSales(organizationId: string, assetId: string) {
  const rows = await db.assetPartSale.findMany({
    where: { organizationId, assetId },
    orderBy: [{ soldOn: "desc" }, { createdAt: "desc" }],
    select: { id: true, quantity: true, soldOn: true, price: true },
  });
  return rows.map((r) => ({
    ...r,
    soldOn: r.soldOn.toISOString().slice(0, 10),
  }));
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
  const when = {
    organizationId,
    soldOn: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
  };
  const asset = {
    select: {
      id: true,
      title: true,
      sequentialId: true,
      valuation: true,
      quantity: true,
    },
  };
  const [sales, partSales] = await Promise.all([
    db.assetSale.findMany({
      where: when,
      select: { soldOn: true, price: true, quantity: true, asset },
    }),
    // quantities (fork): some of an asset sold, the rest kept
    db.assetPartSale.findMany({
      where: when,
      select: { soldOn: true, price: true, quantity: true, asset },
    }),
  ]);
  const row = (
    sale: (typeof sales)[number] | (typeof partSales)[number],
    quantity: number,
    part: boolean
  ) => {
    // the value recorded for the same number of them
    const value =
      sale.asset.valuation !== null ? sale.asset.valuation * quantity : null;
    return {
      assetId: sale.asset.id,
      title: sale.asset.title,
      sequentialId: sale.asset.sequentialId ?? "",
      soldOn: sale.soldOn.toISOString().slice(0, 10),
      quantity,
      /** Some of it, with the rest kept */
      part,
      price: sale.price,
      value,
      // Sale price against the value recorded in Shelf
      difference:
        sale.price !== null && value !== null ? sale.price - value : null,
    };
  };
  const rows = [
    ...sales.map((s) => row(s, s.quantity ?? s.asset.quantity ?? 1, false)),
    ...partSales.map((s) => row(s, s.quantity, true)),
  ].sort((a, b) => b.soldOn.localeCompare(a.soldOn));
  const sum = (values: (number | null)[]) =>
    values.reduce<number>((total, v) => total + (v ?? 0), 0);
  return {
    rows,
    totals: {
      count: rows.length,
      quantity: rows.reduce((n, r) => n + r.quantity, 0),
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
