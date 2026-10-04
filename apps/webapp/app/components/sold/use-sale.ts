/**
 * Which assets are sold, shared by every Sold status on the page (one request,
 * kept across view switches). Part of the sold feature; not in upstream Shelf.
 */
import { createSharedLookup } from "~/utils/shared-lookup";

export type Sale = { soldOn: string; price: number | null };
export const SOLD_URL = "/api/assets/sold";

export const salesLookup = createSharedLookup<{ sales?: Record<string, Sale> }>(
  SOLD_URL
);

export function useSale(assetId: string): Sale | null {
  return salesLookup.useData()?.sales?.[assetId] ?? null;
}
