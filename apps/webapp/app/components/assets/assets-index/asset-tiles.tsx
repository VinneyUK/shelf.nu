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
import {
  AttachmentsHover,
  useAttachmentCount,
} from "~/components/asset-attachment/attachment-count"; // attachments feature
import { AssetImage } from "~/components/assets/asset-image";
import { CategoryBadge } from "~/components/assets/category-badge";
import { InlineStatusCell } from "~/components/inline-edit/inline-status-cell"; // inline editing
import { useLabelledAt } from "~/components/labels/labelled-badge"; // labels feature
import { EmptyState } from "~/components/list/empty-state";
import { DateS } from "~/components/shared/date";
import { Tag as TagBadge } from "~/components/shared/tag";
import { StatusOrSold } from "~/components/sold/status-or-sold"; // sold feature
import { useSale } from "~/components/sold/use-sale"; // sold feature
import { TeamMemberBadge } from "~/components/user/team-member-badge";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import type { AssetsFromViewItem } from "~/modules/asset/types";
import { getPrimaryLocation } from "~/modules/asset/utils";
import { formatCustodyList } from "~/modules/custody/utils";
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
  const { locationsEnabled, kitsEnabled, custodyEnabled, labelsEnabled } =
    useCustomisations();
  const attachments = useAttachmentCount(item.id); // attachments feature
  const labelledAt = useLabelledAt(item.id); // labels feature
  const { primary: custody, total: custodians } = formatCustodyList(
    item.custody
  );
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
  const sale = useSale(item.id); // sold feature
  const soldFor =
    sale && sale.price !== null
      ? formatCurrency({
          value: sale.price,
          currency: organization?.currency ?? "GBP",
          locale: "en-GB",
        })
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] bg-gray-50">
        <Link to={href} className="block size-full">
          {/* the full-size image, not the small thumbnail: a tile is big enough to show it */}
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
            useThumbnail={false}
          />
        </Link>
        {/* status, category and tags over the photo, each on a white backing so
            its pale colour reads against any photo */}
        <div className="pointer-events-none absolute right-2 top-2 flex max-w-[85%] flex-wrap justify-end gap-1">
          {[
            // the same sold-aware status as the list rows: Sold (with the date), and
            // the inline editor to mark it sold or available
            <InlineStatusCell
              key="status"
              assetId={item.id}
              status={item.status}
            >
              <StatusOrSold
                id={item.id}
                status={item.status}
                availableToBook={item.availableToBook}
                asset={item}
              />
            </InlineStatusCell>,
            item.category ? (
              <CategoryBadge key="category" category={item.category} />
            ) : null,
            ...(item.tags ?? []).map((tag) => (
              <TagBadge
                key={tag.id}
                color={tag.color ?? undefined}
                withDot={false}
              >
                {tag.name}
              </TagBadge>
            )),
          ]
            .filter(Boolean)
            .map((chip, i) => (
              <span
                key={i}
                className="pointer-events-auto rounded-full bg-white shadow-sm ring-1 ring-black/5"
              >
                {chip}
              </span>
            ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <Link
          to={href}
          className="line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900 hover:underline"
        >
          {item.title}
        </Link>

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
          {sale ? (
            <Fact label="Sold for">
              {soldFor ?? "—"}
              {sale.soldOn ? (
                <span className="text-gray-500">
                  {" "}
                  on <DateS date={sale.soldOn} />
                </span>
              ) : null}
            </Fact>
          ) : null}
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
          {custodyEnabled && custody ? (
            <Fact label="Custodian">
              <TeamMemberBadge teamMember={custody.custodian} />
              {custodians > 1 ? (
                <span className="ml-1 text-gray-500">+{custodians - 1}</span>
              ) : null}
            </Fact>
          ) : null}
          {labelsEnabled && labelledAt ? (
            <Fact label="Labelled">
              <DateS date={labelledAt} />
            </Fact>
          ) : null}
          {attachments > 0 ? (
            <Fact label="Attachments">
              <AttachmentsHover assetId={item.id} count={attachments}>
                <span className="underline decoration-dotted">
                  {attachments}
                </span>
              </AttachmentsHover>
            </Fact>
          ) : null}
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
