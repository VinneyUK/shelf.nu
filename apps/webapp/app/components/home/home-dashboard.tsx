/**
 * The Home page as movable, hideable tiles, with an Edit layout mode. Each
 * user's order and hidden tiles are saved per workspace.
 * Part of the home layout feature; not in upstream Shelf.
 */
import { useEffect, useState, type ComponentType } from "react";
import { ArrowLeftIcon, ArrowRightIcon, EyeOffIcon } from "lucide-react";
import { useFetcher } from "react-router";
import AssetsByStatusChart from "~/components/dashboard/assets-by-status-chart";
import CustodiansList from "~/components/dashboard/custodians";
import InventoryValueChart from "~/components/dashboard/inventory-value-chart";
import NewestAssets from "~/components/dashboard/newest-assets";
import { Button } from "~/components/shared/button";
import { type Customisations } from "~/modules/customisation/catalogue";
import { useCustomisations } from "~/modules/customisation/use-customisations";
import { tw } from "~/utils/tw";
import ActiveBookings from "./active-bookings";
import AssetGrowthChart from "./asset-growth-chart";
import KpiCards from "./kpi-cards";
import LocationDistribution from "./location-distribution";
import OverdueBookings from "./overdue-bookings";
import UpcomingBookings from "./upcoming-bookings";
import UpcomingReminders from "./upcoming-reminders";

export type HomeLayoutState = { order: string[]; hidden: string[] };

type Tile = {
  id: string;
  title: string;
  /** Width out of 6 columns */
  span: 2 | 3 | 4 | 6;
  Component: ComponentType;
  /** Only shown when this feature is on */
  needs?: keyof Customisations;
};

/** Every tile, in the order Shelf shows them. */
export const HOME_TILES: Tile[] = [
  { id: "summary", title: "Summary", span: 6, Component: KpiCards },
  {
    id: "asset-growth",
    title: "Asset growth",
    span: 4,
    Component: AssetGrowthChart,
  },
  {
    id: "inventory-value",
    title: "Inventory value",
    span: 2,
    Component: InventoryValueChart,
  },
  {
    id: "upcoming-bookings",
    title: "Upcoming bookings",
    span: 2,
    Component: UpcomingBookings,
    needs: "bookingsEnabled",
  },
  {
    id: "active-bookings",
    title: "Active bookings",
    span: 2,
    Component: ActiveBookings,
    needs: "bookingsEnabled",
  },
  {
    id: "overdue-bookings",
    title: "Overdue bookings",
    span: 2,
    Component: OverdueBookings,
    needs: "bookingsEnabled",
  },
  {
    id: "reminders",
    title: "Upcoming reminders",
    span: 2,
    Component: UpcomingReminders,
    needs: "remindersEnabled",
  },
  {
    id: "assets-by-status",
    title: "Assets by status",
    span: 2,
    Component: AssetsByStatusChart,
  },
  {
    id: "locations",
    title: "Locations",
    span: 2,
    Component: LocationDistribution,
    needs: "locationsEnabled",
  },
  {
    id: "custodians",
    title: "Custodians",
    span: 3,
    Component: CustodiansList,
    needs: "custodyEnabled",
  },
  {
    id: "newest-assets",
    title: "Newest assets",
    span: 3,
    Component: NewestAssets,
  },
];

/** Written out in full so Tailwind sees every class. */
const SPAN_CLASS: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
};

/**
 * Lays tiles out in rows of `columns`, in order. A row that comes up short
 * (because tiles were hidden or switched off) has its spare columns shared out
 * from the left, so every row fills the width: [2, 3] becomes [3, 3], and a
 * tile left on its own takes the whole row.
 */
export function packTiles<T extends { span: number }>(
  tiles: T[],
  columns = 6
): { tile: T; span: number }[] {
  const rows: { tile: T; span: number }[][] = [];
  let row: { tile: T; span: number }[] = [];
  let used = 0;
  for (const tile of tiles) {
    if (row.length && used + tile.span > columns) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ tile, span: tile.span });
    used += tile.span;
  }
  if (row.length) rows.push(row);
  for (const r of rows) {
    let spare = columns - r.reduce((n, cell) => n + cell.span, 0);
    for (let i = 0; spare > 0; i = (i + 1) % r.length) {
      r[i].span += 1;
      spare -= 1;
    }
  }
  return rows.flat();
}

/** Saved order first, then any tiles added since, in Shelf's order. */
export function orderedTiles(order: string[], tiles: Tile[] = HOME_TILES) {
  const known = new Map(tiles.map((t) => [t.id, t]));
  const fromSaved = order
    .map((id) => known.get(id))
    .filter((t): t is Tile => Boolean(t));
  const rest = tiles.filter((t) => !order.includes(t.id));
  return [...fromSaved, ...rest];
}

export function HomeDashboard({ initial }: { initial: HomeLayoutState }) {
  const customisations = useCustomisations();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState(initial.order);
  const [hidden, setHidden] = useState(initial.hidden);
  const save = useFetcher<{ error?: { message: string } }>();

  useEffect(() => {
    setOrder(initial.order);
    setHidden(initial.hidden);
  }, [initial.order, initial.hidden]);

  const available = orderedTiles(order).filter(
    (t) => !t.needs || customisations[t.needs]
  );
  const visible = available.filter((t) => !hidden.includes(t.id));
  const hiddenTiles = available.filter((t) => hidden.includes(t.id));

  const move = (id: string, dir: -1 | 1) => {
    const ids = available.map((t) => t.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
  };
  const persist = (nextOrder: string[], nextHidden: string[]) =>
    void save.submit(
      { order: nextOrder.join(","), hidden: nextHidden.join(",") },
      { method: "post", action: "/api/home-layout" }
    );

  return (
    <div className="pb-8">
      <div className="mt-2 flex items-center justify-end gap-2">
        {editing ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setOrder([]);
                setHidden([]);
                persist([], []);
              }}
            >
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                persist(
                  available.map((t) => t.id),
                  hidden
                );
                setEditing(false);
              }}
            >
              Done
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
          >
            Edit layout
          </Button>
        )}
      </div>
      {save.data?.error ? (
        <p role="alert" className="mt-2 text-sm text-error-600">
          {save.data.error.message}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-6">
        {packTiles(visible).map(({ tile, span }, i) => (
          <div
            key={tile.id}
            className={tw(
              SPAN_CLASS[span],
              editing && "rounded-lg border-2 border-dashed border-gray-300"
            )}
          >
            {editing ? (
              <div className="flex items-center justify-between gap-2 px-2 pt-2 text-xs text-gray-600">
                <span className="font-medium">{tile.title}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${tile.title} earlier`}
                    disabled={i === 0}
                    onClick={() => move(tile.id, -1)}
                    className="rounded border px-1.5 py-0.5 disabled:opacity-40"
                  >
                    <ArrowLeftIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${tile.title} later`}
                    disabled={i === visible.length - 1}
                    onClick={() => move(tile.id, 1)}
                    className="rounded border px-1.5 py-0.5 disabled:opacity-40"
                  >
                    <ArrowRightIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Hide ${tile.title}`}
                    onClick={() => setHidden((h) => [...h, tile.id])}
                    className="rounded border px-1.5 py-0.5"
                  >
                    <EyeOffIcon className="size-3.5" />
                  </button>
                </span>
              </div>
            ) : null}
            <tile.Component />
          </div>
        ))}
      </div>

      {editing && hiddenTiles.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>Hidden:</span>
          {hiddenTiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => setHidden((h) => h.filter((id) => id !== tile.id))}
              className="rounded-full border px-3 py-1 hover:bg-gray-50"
            >
              Show {tile.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
