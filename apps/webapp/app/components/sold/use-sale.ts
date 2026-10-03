/**
 * Which assets are sold, shared by every Sold status on the page (one request).
 * Part of the sold feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import { useFetcher } from "react-router";

export type Sale = { soldOn: string; price: number | null };
export const SOLD_URL = "/api/assets/sold";
const FETCHER_KEY = "asset-sales";
let lastRequested = 0;

export function useSale(assetId: string): Sale | null {
  const fetcher = useFetcher<{ sales?: Record<string, Sale> }>({
    key: FETCHER_KEY,
  });
  useEffect(() => {
    if (fetcher.state === "idle" && Date.now() - lastRequested > 3000) {
      lastRequested = Date.now();
      void fetcher.load(SOLD_URL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return fetcher.data?.sales?.[assetId] ?? null;
}
