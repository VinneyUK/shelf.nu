/**
 * Tiles per row in the assets Tile view (fork): Auto (as many 250 px tiles as
 * fit) or a fixed 3 to 8, chosen in the bottom bar as on Filament, and
 * remembered in a cookie. Shared by the bar and the grid.
 */
import { useSyncExternalStore } from "react";

export const TILE_COLS_CHOICES = [
  "auto",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
] as const;
export type TileCols = (typeof TILE_COLS_CHOICES)[number];

const COOKIE = "asset_tile_cols";
/** A tile's width on Auto */
export const TILE_MIN_WIDTH = 250;

export function parseTileCols(value: string | null | undefined): TileCols {
  return (TILE_COLS_CHOICES as readonly string[]).includes(value ?? "")
    ? (value as TileCols)
    : "auto";
}

function readCookie(): TileCols {
  if (typeof document === "undefined") return "auto";
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(document.cookie);
  return parseTileCols(m?.[1]);
}

let current: TileCols | null = null;
const listeners = new Set<() => void>();

export function setTileCols(next: TileCols) {
  current = next;
  document.cookie = `${COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  listeners.forEach((l) => l());
}

export function useTileCols(): TileCols {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => (current ??= readCookie()),
    () => "auto"
  );
}

/** The grid's columns: auto-fill at 250 px, or a fixed count. */
export function tileGridTemplate(cols: TileCols) {
  return cols === "auto"
    ? `repeat(auto-fill, minmax(min(${TILE_MIN_WIDTH}px, 100%), 1fr))`
    : `repeat(${cols}, minmax(0, 1fr))`;
}
