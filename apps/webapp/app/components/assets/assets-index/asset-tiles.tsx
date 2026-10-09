/**
 * Tile view (fork): the simple assets list as a grid of cards, in the style of
 * a document library. Same data, filters, search and pagination as the simple
 * list; only the way it's shown differs. Switched with the Tile button beside
 * Simple and Advanced.
 */
import type { ReactNode } from "react";
import { CalendarIcon, HashIcon, MapPinIcon, PackageIcon } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import { AssetImage } from "~/components/assets/asset-image";
import { AssetStatusBadge } from "~/components/assets/asset-status-badge/asset-status-badge";
import { CategoryBadge } from "~/components/assets/category-badge";
import { EmptyState } from "~/components/list/empty-state";
import { DateS } from "~/components/shared/date";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import type { AssetsFromViewItem } from "~/modules/asset/types";
import { getPrimaryLocation } from "~/modules/asset/utils";
import { useCustomisations } from "~/modules/customisation/use-customisations";
import { formatCurrency } from "~/utils/currency";
import AssetQuickActions from "./asset-quick-actions";

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px] text-gray-600">
      <span className="shrink-0 text-gray-400">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function AssetTile({ item }: { item: AssetsFromViewItem }) {
  const { imagePreviewOnHover, locationsEnabled, kitsEnabled } =
    useCustomisations();
  const organization = useCurrentOrganization();
  const location = getPrimaryLocation(item);
  const kit = item.assetKits?.[0]?.kit ?? null;
  const value =
    item.valuation !== null && item.valuation !== undefined
      ? formatCurrency({
          value: item.valuation,
          currency: organization?.currency ?? "GBP",
          locale: "en-GB",
        })
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* the photo, with the status and category over its corner */}
      <div className="relative aspect-[4/3] bg-gray-50">
        <Link to={`/assets/${item.id}`} className="block size-full">
          <AssetImage
            asset={{
              id: item.id,
              mainImage: item.mainImage,
              thumbnailImage: item.thumbnailImage,
              mainImageExpiration: item.mainImageExpiration,
              assetModel: item.assetModel ?? null,
            }}
            alt={`Image of ${item.title}`}
            className="size-full object-cover"
            withPreview
            hoverPreview={imagePreviewOnHover}
          />
        </Link>
        <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
          <div className="pointer-events-auto">
            <AssetStatusBadge
              id={item.id}
              status={item.status}
              availableToBook={item.availableToBook}
              asset={item}
            />
          </div>
          {item.category ? (
            <div className="pointer-events-auto">
              <CategoryBadge category={item.category} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          to={`/assets/${item.id}`}
          className="line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900 hover:underline"
        >
          {item.title}
        </Link>
        <div className="flex flex-col gap-1 border-t border-gray-100 pt-2">
          {item.sequentialId ? (
            <Meta icon={<HashIcon className="size-3.5" />}>
              <span className="font-mono">{item.sequentialId}</span>
            </Meta>
          ) : null}
          <Meta icon={<CalendarIcon className="size-3.5" />}>
            <DateS date={item.createdAt} />
          </Meta>
          {value ? (
            <Meta icon={<span className="text-[12px] font-semibold">£</span>}>
              {value}
            </Meta>
          ) : null}
          {locationsEnabled && location ? (
            <Meta icon={<MapPinIcon className="size-3.5" />}>
              {location.name}
            </Meta>
          ) : null}
          {kitsEnabled && kit ? (
            <Meta icon={<PackageIcon className="size-3.5" />}>{kit.name}</Meta>
          ) : null}
        </div>
      </div>

      <div className="border-t border-gray-200 p-2">
        <AssetQuickActions asset={{ ...item, qrId: item.qrCodes?.[0]?.id }} />
      </div>
    </div>
  );
}

/** The grid. Pagination is rendered by the caller, as for the list. */
export function AssetTiles({ emptyState }: { emptyState?: ReactNode }) {
  const { items } = useLoaderData<{ items: AssetsFromViewItem[] }>();
  if (items.length === 0) {
    return <>{emptyState ?? <EmptyState />}</>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((item) => (
        <AssetTile key={item.id} item={item} />
      ))}
    </div>
  );
}
