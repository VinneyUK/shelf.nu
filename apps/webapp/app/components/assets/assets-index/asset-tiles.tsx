/**
 * Tile view (fork): the simple assets list as a grid of cards. Same data,
 * filters, search and pagination as the simple list; only the way it's shown
 * differs. Switched with the Tile button beside Simple and Advanced.
 *
 * Layout of a card: the photo (a plain link to the asset); the title; a row of
 * chips (status, category, tags); then the facts in two columns with small
 * labels; and the row actions along the bottom.
 */
import type { ReactNode } from "react";
import { Link, useLoaderData } from "react-router";
import { AssetImage } from "~/components/assets/asset-image";
import { AssetStatusBadge } from "~/components/assets/asset-status-badge/asset-status-badge";
import { CategoryBadge } from "~/components/assets/category-badge";
import { EmptyState } from "~/components/list/empty-state";
import { DateS } from "~/components/shared/date";
import { Tag as TagBadge } from "~/components/shared/tag";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import type { AssetsFromViewItem } from "~/modules/asset/types";
import { getPrimaryLocation } from "~/modules/asset/utils";
import { useCustomisations } from "~/modules/customisation/use-customisations";
import { formatCurrency } from "~/utils/currency";
import AssetQuickActions from "./asset-quick-actions";

/** One fact: a small label over the value. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="truncate text-[13px] text-gray-800">{children}</div>
    </div>
  );
}

function AssetTile({ item }: { item: AssetsFromViewItem }) {
  const { imagePreviewOnHover, locationsEnabled, kitsEnabled } =
    useCustomisations();
  const organization = useCurrentOrganization();
  const location = getPrimaryLocation(item);
  const kit = item.assetKits?.[0]?.kit ?? null;
  const href = `/assets/${item.id}`;
  const value =
    item.valuation !== null && item.valuation !== undefined
      ? formatCurrency({
          value: item.valuation,
          currency: organization?.currency ?? "GBP",
          locale: "en-GB",
        })
      : null;
  const isQty = item.type === "QUANTITY_TRACKED";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md">
      <Link to={href} className="block aspect-[4/3] bg-gray-50">
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
          hoverPreview={imagePreviewOnHover}
          linkTo={href}
        />
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <Link
          to={href}
          className="line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900 hover:underline"
        >
          {item.title}
        </Link>

        {/* status, category and tags as chips, on the white card so their colours read */}
        <div className="flex flex-wrap items-center gap-1.5">
          <AssetStatusBadge
            id={item.id}
            status={item.status}
            availableToBook={item.availableToBook}
            asset={item}
          />
          {item.category ? <CategoryBadge category={item.category} /> : null}
          {item.tags?.map((tag) => (
            <TagBadge
              key={tag.id}
              color={tag.color ?? undefined}
              withDot={false}
            >
              {tag.name}
            </TagBadge>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-100 pt-3">
          {item.sequentialId ? (
            <Fact label="ID">
              <span className="font-mono">{item.sequentialId}</span>
            </Fact>
          ) : null}
          <Fact label="Added">
            <DateS date={item.createdAt} />
          </Fact>
          {value ? <Fact label="Value">{value}</Fact> : null}
          {isQty ? (
            <Fact label="Quantity">
              {item.quantity ?? 0}
              {item.unitOfMeasure ? ` ${item.unitOfMeasure}` : ""}
            </Fact>
          ) : null}
          {locationsEnabled && location ? (
            <Fact label="Place">{location.name}</Fact>
          ) : null}
          {kitsEnabled && kit ? <Fact label="Box">{kit.name}</Fact> : null}
        </div>
      </div>

      <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
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
