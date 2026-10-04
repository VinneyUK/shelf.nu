/**
 * SamIdCell
 *
 * Renders the "SAM ID" cell in the advanced asset table. SAM has no preview
 * dialog (only QR has one), so the chip is static. Extracted from
 * `advanced-asset-columns.tsx` for the same react-doctor reason as `QrIdCell`.
 */

import type { QrIdDisplayPreference } from "@prisma/client";
import { AssetIdChip } from "~/components/labels/asset-id-chip"; // labels feature
import { EmptyTableValue } from "~/components/shared/empty-table-value";
import type { AdvancedIndexAsset } from "~/modules/asset/types";
import { Td } from "./td";

type SamIdCellProps = {
  item: AdvancedIndexAsset;
  workspacePreference: QrIdDisplayPreference;
};

/**
 * Renders the SAM ID column cell. Falls back to `<EmptyTableValue>` when
 * `sequentialId` is null (asset created before SAM was enabled, or under a
 * pricing tier that doesn't include SAM).
 */
export function SamIdCell({ item }: SamIdCellProps) {
  return (
    <Td className="w-full max-w-none !overflow-visible whitespace-nowrap">
      {item.sequentialId ? (
        // labels feature: click copies, green when labelled, double-click for label options
        <AssetIdChip assetId={item.id} sequentialId={item.sequentialId} />
      ) : (
        <EmptyTableValue />
      )}
    </Td>
  );
}
