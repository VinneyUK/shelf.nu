/**
 * Sold and Labelled in SQL, for the assets list's filters. Shared so the
 * simple and advanced views agree. Part of the sold and labels features.
 */
import { Prisma } from "@prisma/client";

export { SOLD_STATUS } from "./constants";

/** True for an asset (aliased `a`) that has been marked sold. */
export const ASSET_IS_SOLD = Prisma.sql`EXISTS (SELECT 1 FROM public."AssetSale" s WHERE s."assetId" = a.id)`;
/** True for an asset (aliased `a`) with a label printed and not removed. */
export const ASSET_IS_LABELLED = Prisma.sql`EXISTS (SELECT 1 FROM public."LabelPrintJob" j WHERE j."assetId" = a.id AND j.status = 'printed' AND j."labelRemovedAt" IS NULL)`;
