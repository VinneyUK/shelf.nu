/**
 * The totals behind the Categories, Places and Boxes lists (fork).
 *
 * Definitions, the same as the Sold report's:
 *  - recorded: the value recorded on the assets (value × quantity; an asset with
 *    no value counts as nothing).
 *  - soldFor: what the sold assets were sold for (a sale with no price counts as nothing).
 *  - difference: soldFor minus the recorded value, over sold assets that have BOTH
 *    a price and a recorded value, so it is always a like-for-like gain or loss.
 *
 * In the database the asset's value is the column "value" (the Prisma field is
 * called valuation). Each query takes the workspace as $1, so another
 * workspace's assets can never be counted.
 *
 * Part of the fork; not in upstream Shelf.
 */

/** Like for like: a sold asset's price against the value recorded for the same quantity. */
const FIGURES = (value: string, quantity: string) => `
  COALESCE(SUM(COALESCE(${value}, 0) * ${quantity}), 0)::float AS recorded,
  COALESCE(SUM(s."price"), 0)::float AS sold_for,
  COALESCE(SUM(CASE WHEN s."price" IS NOT NULL AND ${value} IS NOT NULL
                    THEN s."price" - ${value} * ${quantity} END), 0)::float AS difference`;

const ASSET_FIGURES = FIGURES('a."value"', 'COALESCE(a."quantity", 1)');
const SLICE_FIGURES = (slice: string) => FIGURES('a."value"', slice);

/** Per category: every asset with that category. */
export const CATEGORY_FIGURES_SQL = `
  SELECT a."categoryId" AS id, COUNT(*)::int AS assets, ${ASSET_FIGURES}
  FROM "Asset" a
  LEFT JOIN "AssetSale" s ON s."assetId" = a."id"
  WHERE a."organizationId" = $1 AND a."categoryId" IS NOT NULL
  GROUP BY a."categoryId"`;

/** The assets with no category, as one row (id is null). */
export const UNCATEGORISED_FIGURES_SQL = `
  SELECT NULL::text AS id, COUNT(*)::int AS assets, ${ASSET_FIGURES}
  FROM "Asset" a
  LEFT JOIN "AssetSale" s ON s."assetId" = a."id"
  WHERE a."organizationId" = $1 AND a."categoryId" IS NULL`;

/** Per place: each asset's share held there (a quantity-tracked asset can be in several places). */
export const PLACE_FIGURES_SQL = `
  SELECT al."locationId" AS id, COUNT(*)::int AS assets, ${SLICE_FIGURES(
    'al."quantity"'
  )}
  FROM "AssetLocation" al
  JOIN "Asset" a ON a."id" = al."assetId"
  LEFT JOIN "AssetSale" s ON s."assetId" = a."id"
  WHERE al."organizationId" = $1
  GROUP BY al."locationId"`;

/** Per box, for the boxes in $2: each asset's share held in it. */
export const BOX_FIGURES_SQL = `
  SELECT ak."kitId" AS id, COUNT(*)::int AS assets, ${SLICE_FIGURES(
    'ak."quantity"'
  )}
  FROM "AssetKit" ak
  JOIN "Asset" a ON a."id" = ak."assetId"
  LEFT JOIN "AssetSale" s ON s."assetId" = a."id"
  WHERE ak."organizationId" = $1 AND ak."kitId" = ANY($2::text[])
  GROUP BY ak."kitId"`;
