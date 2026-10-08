import type { CSSProperties } from "react";
import { GlobeIcon, PencilIcon, QrCodeIcon, Trash2Icon } from "lucide-react";
import { PrintLabelButton } from "~/components/labels/print-label-button"; // labels feature
import { Button } from "~/components/shared/button";
import When from "~/components/when/when";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import type { AssetsFromViewItem } from "~/modules/asset/types";
import {
  SEARCH_ENGINES,
  webSearchUrl,
} from "~/modules/customisation/catalogue"; // customise feature
import { useCustomisations } from "~/modules/customisation/use-customisations"; // customise feature
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator.client";
import { tw } from "~/utils/tw";
import { CodePreviewDialog } from "../../code-preview/code-preview-dialog";
import { DeleteAsset } from "../delete-asset";

type AssetQuickActionsProps = {
  className?: string;
  style?: CSSProperties;
  asset: Pick<AssetsFromViewItem, "id" | "title" | "mainImage"> & {
    qrId: string;
    sequentialId?: string | null;
  };
};

export default function AssetQuickActions({
  className,
  style,
  asset,
}: AssetQuickActionsProps) {
  const { roles } = useUserRoleHelper();
  const { qrDownloadsEnabled, searchEngine } = useCustomisations(); // customise feature
  const searchEngineLabel =
    SEARCH_ENGINES.find((e) => e.id === searchEngine)?.label ?? "the web";

  return (
    <div className={tw("flex items-center gap-2", className)} style={style}>
      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        <Button
          size="sm"
          variant="secondary"
          className={"p-2"}
          to={`/assets/${asset.id}/edit`}
          aria-label="Edit asset information"
          tooltip="Edit asset information"
        >
          <PencilIcon className="size-4" />
        </Button>
      </When>

      {/* labels feature: print (or re-print) this asset's label */}
      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        <PrintLabelButton id={asset.id} />
      </When>
      {qrDownloadsEnabled ? ( // customise feature
        <CodePreviewDialog
          item={{
            id: asset.id,
            title: asset.title,
            qrId: asset.qrId,
            type: "asset",
            sequentialId: asset.sequentialId,
          }}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={"p-2"}
              aria-label="Show asset label"
              tooltip="Show asset label"
            >
              <QrCodeIcon className="size-4" />
            </Button>
          }
        />
      ) : null}

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        {/* fork: searches the web for the asset (was: duplicate) */}
        <Button
          size="sm"
          variant="secondary"
          className={"p-2"}
          to={webSearchUrl(searchEngine, asset.title)}
          target="_blank"
          rel="noopener noreferrer"
          hideNewTabIcon
          aria-label="Search the web for this asset"
          tooltip={`Search ${searchEngineLabel} for this asset`}
        >
          <GlobeIcon className="size-4" />
        </Button>
      </When>

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.delete,
        })}
      >
        <DeleteAsset
          asset={asset}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={"p-2"}
              aria-label="Delete asset"
              tooltip="Delete asset"
            >
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
      </When>
    </div>
  );
}
