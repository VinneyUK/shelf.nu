import { useState } from "react";
import { useAtomValue } from "jotai";
import { BadgePoundSterlingIcon } from "lucide-react"; // sold feature
import { useNavigation } from "react-router";
import { useHydrated } from "remix-utils/use-hydrated";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { usePrintSelectedLabels } from "~/components/labels/use-print-selected-labels"; // labels feature
import {
  MarkSoldDialog,
  useMarkNotSold,
} from "~/components/sold/mark-sold-dialog"; // sold feature
import { useSelectedAssets } from "~/components/sold/use-selected-assets"; // sold feature
import { useControlledDropdownMenu } from "~/hooks/use-controlled-dropdown-menu";
import { useUserData } from "~/hooks/use-user-data";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { getPrimaryCustody } from "~/modules/custody/utils";
import { useCustomisations } from "~/modules/customisation/use-customisations"; // customise feature
import { isFormProcessing } from "~/utils/form";
import { isSelectingAllItems } from "~/utils/list";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator.client";
import { tw } from "~/utils/tw";
import BulkAddToAuditDialog from "./bulk-add-to-audit-dialog";
import BulkAddToKitDialog from "./bulk-add-to-kit-dialog";
import BulkAssetModelRemoveDialog from "./bulk-asset-model-remove-dialog";
import BulkAssetModelUpdateDialog from "./bulk-asset-model-update-dialog";
import BulkAssignCustodyDialog from "./bulk-assign-custody-dialog";
import BulkAssignTagsDialog from "./bulk-assign-tags-dialog";
import BulkCategoryUpdateDialog from "./bulk-category-update-dialog";
import BulkDeleteDialog from "./bulk-delete-dialog";
import BulkLocationUpdateDialog from "./bulk-location-update-dialog";
import BulkMarkAvailabilityDialog from "./bulk-mark-availability-dialog";
import BulkReleaseCustodyDialog from "./bulk-release-custody-dialog";
import BulkRemoveFromKits from "./bulk-remove-from-kits";
import BulkRemoveTagsDialog from "./bulk-remove-tags-dialog";
import BulkStartAuditDialog from "./bulk-start-audit-dialog";
import { BulkUpdateDialogTrigger } from "../bulk-update-dialog/bulk-update-dialog";
import { ChevronRight } from "../icons/library";
import { Button } from "../shared/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../shared/dropdown";
import { MobileDropdownStyles } from "../shared/mobile-dropdown-styles";
import When from "../when/when";
import BookSelectedAssetsDropdown from "./assets-index/book-selected-assets-dropdown";
import BulkDownloadQrDialog from "./bulk-download-qr-dialog";
import Icon from "../icons/icon";

export default function BulkActionsDropdown() {
  const { bookingsEnabled } = useCustomisations(); // customise feature
  const isHydrated = useHydrated();

  if (!isHydrated) {
    return (
      <Button variant="secondary" to="#" className="font-medium">
        <span className="flex items-center gap-2">
          Actions <ChevronRight className="chev rotate-90" />
        </span>
      </Button>
    );
  }

  return (
    <div className="actions-dropdown flex w-full items-center gap-2">
      <ConditionalDropdown />
      {bookingsEnabled ? <BookSelectedAssetsDropdown /> : null}
    </div>
  );
}

// react-doctor:no-giant-component — deferred for follow-up refactor
function ConditionalDropdown() {
  const navigation = useNavigation();
  const isLoading = isFormProcessing(navigation.state);
  const [isBulkDownloadQrOpen, setIsBulkDownloadQrOpen] = useState(false);

  const {
    ref: dropdownRef,
    defaultApplied,
    open,
    defaultOpen,
    setOpen,
  } = useControlledDropdownMenu();

  const selectedAssets = useAtomValue(selectedBulkItemsAtom);
  const disabled = selectedAssets.length === 0;

  const allSelected = isSelectingAllItems(selectedAssets);

  const { roles, isSelfService } = useUserRoleHelper();
  const {
    auditsEnabled,
    labelsEnabled,
    custodyEnabled,
    locationsEnabled,
    kitsEnabled,
    assetModelsEnabled,
    bookingsEnabled,
    qrDownloadsEnabled,
  } = useCustomisations(); // customise feature
  const printSelectedLabels = usePrintSelectedLabels(); // labels feature
  // sold feature
  const soldSelection = useSelectedAssets();
  const markNotSold = useMarkNotSold();
  const [isMarkSoldOpen, setIsMarkSoldOpen] = useState(false);
  const user = useUserData();

  /**
   * Due to select all multi page selection,
   * some of the checks we do cannot be completed as we dont have the data loaded from the server.
   * As a solution for now we will handle the validation serverSide if hasSelectedAll is true
   */
  const allAssetsAreInCustody =
    allSelected ||
    selectedAssets.every((asset) => asset.status === "IN_CUSTODY");

  const allAssetsAreAvailable =
    allSelected ||
    selectedAssets.every((asset) => asset.status === "AVAILABLE");

  const someAssetCheckedOut = selectedAssets.some(
    (asset) => asset.status === "CHECKED_OUT"
  );

  const someAssetPartOfUnavailableKit = selectedAssets.some(
    (asset) => asset?.kit && asset.kit.status !== "AVAILABLE"
  );

  const selfUserCustody = selectedAssets.some((a) => {
    const primary = getPrimaryCustody(
      a?.custody as Record<string, unknown>[] | undefined
    ) as { custodian?: { userId?: string } } | null;
    return primary?.custodian?.userId === user?.id;
  });
  const disableReleaseCustody = isSelfService && !selfUserCustody;

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      {open && (
        <div
          className={tw(
            "fixed right-0 top-0 z-10 h-screen w-screen cursor-pointer bg-gray-700/50  transition duration-300 ease-in-out md:hidden"
          )}
        />
      )}
      {/* sold feature */}
      <MarkSoldDialog
        open={isMarkSoldOpen}
        onOpenChange={setIsMarkSoldOpen}
        assetIds={soldSelection.assetIds}
        currentSearchParams={soldSelection.currentSearchParams}
        countLabel={
          soldSelection.assetIds.length === 1
            ? "this asset"
            : "the selected assets"
        }
      />
      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        <When
          truthy={
            auditsEnabled /* customise feature */ &&
            userHasPermission({
              roles,
              entity: PermissionEntity.audit,
              action: PermissionAction.create,
            })
          }
        >
          <BulkStartAuditDialog />
        </When>
        <When
          truthy={
            auditsEnabled /* customise feature */ &&
            userHasPermission({
              roles,
              entity: PermissionEntity.audit,
              action: PermissionAction.update,
            })
          }
        >
          <BulkAddToAuditDialog />
        </When>
        <BulkLocationUpdateDialog />
        <BulkAssignTagsDialog />
        <BulkRemoveTagsDialog />
        <BulkCategoryUpdateDialog />
        <BulkAssetModelUpdateDialog />
        <BulkAssetModelRemoveDialog />
        <BulkDeleteDialog />
        <BulkMarkAvailabilityDialog type="available" />
        <BulkMarkAvailabilityDialog type="unavailable" />
        <BulkAddToKitDialog />
        <BulkRemoveFromKits />
      </When>

      <BulkDownloadQrDialog
        isDialogOpen={isBulkDownloadQrOpen}
        onClose={() => {
          setIsBulkDownloadQrOpen(false);
        }}
      />

      <When
        truthy={
          custodyEnabled /* customise feature */ &&
          userHasPermission({
            roles,
            entity: PermissionEntity.asset,
            action: PermissionAction.custody,
          })
        }
      >
        <BulkAssignCustodyDialog />
        <BulkReleaseCustodyDialog />
      </When>

      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (defaultApplied && window.innerWidth <= 640) setOpen(open);
        }}
        open={open}
        defaultOpen={defaultOpen}
      >
        <DropdownMenuTrigger
          className="actions-dropdown hidden font-medium sm:flex"
          onClick={() => setOpen(!open)}
          asChild
          disabled={disabled}
        >
          <Button
            type="button"
            variant="secondary"
            disabled={
              disabled
                ? {
                    reason:
                      "You must select at least 1 asset to perform an action",
                  }
                : false
            }
          >
            <span className="flex items-center gap-2">Actions</span>
          </Button>
        </DropdownMenuTrigger>

        {/* using custom dropdown menu trigger on mobile which only opens dropdown not toggles menu to avoid conflicts with overlay*/}
        <Button
          variant="secondary"
          className="asset-actions flex-1 sm:hidden"
          onClick={() => setOpen(true)}
          disabled={disabled}
          type="button"
        >
          <span className="flex items-center gap-2">Actions</span>
        </Button>

        <MobileDropdownStyles open={open} />

        <DropdownMenuContent
          asChild
          align="end"
          className="order actions-dropdown static w-screen rounded-b-none rounded-t-[4px] bg-white p-0 text-right md:static md:w-[230px] md:rounded-t-[4px]"
          ref={dropdownRef}
        >
          <div className="order fixed bottom-0 left-0 w-screen rounded-b-none rounded-t-[4px] bg-white p-0 text-right md:static md:w-[180px] md:rounded-t-[4px]">
            {qrDownloadsEnabled ? ( // customise feature
              <DropdownMenuItem
                onClick={() => {
                  closeMenu();
                  setIsBulkDownloadQrOpen(true);
                }}
                className="border-b py-1 lg:p-0"
              >
                <Button
                  type="button"
                  variant="link"
                  className="w-full justify-start px-4  py-3 text-gray-700 hover:text-gray-700"
                  width="full"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="download" /> Download QR Codes
                  </span>
                </Button>
              </DropdownMenuItem>
            ) : null}
            {/* labels feature: print / re-print / remove, by what's selected */}
            {labelsEnabled
              ? printSelectedLabels.entries.map((entry, i, all) => (
                  <DropdownMenuItem
                    key={entry.intent}
                    onClick={() => {
                      closeMenu();
                      printSelectedLabels.run(entry.intent);
                    }}
                    className={
                      i === all.length - 1
                        ? "border-b py-1 lg:p-0"
                        : "py-1 lg:p-0"
                    }
                    disabled={printSelectedLabels.isBusy}
                  >
                    <Button
                      type="button"
                      variant="link"
                      className="w-full justify-start px-4  py-3 text-gray-700 hover:text-gray-700"
                      width="full"
                    >
                      <span className="flex items-center gap-2">
                        <Icon icon="print" /> {entry.label}
                      </span>
                    </Button>
                  </DropdownMenuItem>
                ))
              : null}
            {/* sold feature */}
            <DropdownMenuItem
              onClick={() => {
                closeMenu();
                setIsMarkSoldOpen(true);
              }}
              className="py-1 lg:p-0"
            >
              <Button
                type="button"
                variant="link"
                className="w-full justify-start px-4  py-3 text-gray-700 hover:text-gray-700"
                width="full"
              >
                <span className="flex items-center gap-2">
                  <BadgePoundSterlingIcon className="size-4" /> Mark as sold
                </span>
              </Button>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                closeMenu();
                markNotSold(
                  soldSelection.assetIds,
                  soldSelection.currentSearchParams
                );
              }}
              className="border-b py-1 lg:p-0"
            >
              <Button
                type="button"
                variant="link"
                className="w-full justify-start px-4  py-3 text-gray-700 hover:text-gray-700"
                width="full"
              >
                <span className="flex items-center gap-2">
                  <BadgePoundSterlingIcon className="size-4" /> Mark as not sold
                </span>
              </Button>
            </DropdownMenuItem>
            <When
              truthy={
                auditsEnabled /* customise feature */ &&
                userHasPermission({
                  roles,
                  entity: PermissionEntity.audit,
                  action: PermissionAction.create,
                })
              }
            >
              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="start-audit"
                  label="Create audit"
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
            </When>

            <When
              truthy={
                auditsEnabled /* customise feature */ &&
                userHasPermission({
                  roles,
                  entity: PermissionEntity.audit,
                  action: PermissionAction.update,
                })
              }
            >
              <DropdownMenuItem className="border-b py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="add-to-audit"
                  label="Add to existing audit"
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
            </When>

            <When
              truthy={
                custodyEnabled /* customise feature */ &&
                userHasPermission({
                  roles,
                  entity: PermissionEntity.asset,
                  action: PermissionAction.custody,
                })
              }
            >
              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="release-custody"
                  label="Release custody"
                  onClick={closeMenu}
                  disabled={
                    !allAssetsAreInCustody ||
                    someAssetPartOfUnavailableKit ||
                    disableReleaseCustody
                      ? {
                          reason: someAssetPartOfUnavailableKit
                            ? "Some of the selected assets have custody assigned via a box. If you want to change their custody, please update the box instead."
                            : disableReleaseCustody
                            ? "Self service can only release their own custody."
                            : "Some of the selected assets are not in custody.",
                        }
                      : isLoading
                  }
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="border-b py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="assign-custody"
                  label={isSelfService ? "Take custody" : "Assign custody"}
                  onClick={closeMenu}
                  disabled={
                    !allAssetsAreAvailable || someAssetPartOfUnavailableKit
                      ? {
                          reason: someAssetPartOfUnavailableKit
                            ? "Some of the selected assets have custody assigned via a box. If you want to change their custody, please update the box instead."
                            : "Some of the selected assets are not available.",
                        }
                      : isLoading
                  }
                />
              </DropdownMenuItem>
            </When>

            <When
              truthy={userHasPermission({
                roles,
                entity: PermissionEntity.asset,
                action: PermissionAction.update,
              })}
            >
              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="tag-add"
                  onClick={closeMenu}
                  disabled={isLoading}
                  label="Assign tags"
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="tag-remove"
                  onClick={closeMenu}
                  disabled={isLoading}
                  label="Remove tags"
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="border-t py-1 lg:p-0">
                {locationsEnabled ? ( // customise feature
                  <BulkUpdateDialogTrigger
                    type="location"
                    onClick={closeMenu}
                    disabled={isLoading}
                  />
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="category"
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="py-1 lg:p-0">
                {assetModelsEnabled ? ( // customise feature
                  <BulkUpdateDialogTrigger
                    type="asset-model"
                    label="Update asset model"
                    onClick={closeMenu}
                    disabled={isLoading}
                  />
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem className="py-1 lg:p-0">
                {assetModelsEnabled ? ( // customise feature
                  <BulkUpdateDialogTrigger
                    type="asset-model-remove"
                    label="Remove from asset model"
                    onClick={closeMenu}
                    disabled={isLoading}
                  />
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem className="border-t py-1 lg:p-0">
                {kitsEnabled ? ( // customise feature
                  <BulkUpdateDialogTrigger
                    label="Add to box"
                    type="add-to-kit"
                    onClick={closeMenu}
                    disabled={
                      someAssetCheckedOut
                        ? {
                            reason:
                              "Some of the selected boxes are checked out. Please finish your booking first, before adding them in box.",
                          }
                        : isLoading
                    }
                  />
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem className=" py-1 lg:p-0">
                {kitsEnabled ? ( // customise feature
                  <BulkUpdateDialogTrigger
                    label="Remove from box"
                    type="remove-from-kit"
                    onClick={closeMenu}
                    disabled={isLoading}
                  />
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem className="border-t py-1 lg:p-0">
                {bookingsEnabled ? ( // customise feature
                  <BulkUpdateDialogTrigger
                    label="Mark as available"
                    type="available"
                    onClick={closeMenu}
                    disabled={isLoading}
                  />
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem className="border-b py-1 lg:p-0">
                {bookingsEnabled ? ( // customise feature
                  <BulkUpdateDialogTrigger
                    label="Mark as unavailable"
                    type="unavailable"
                    onClick={closeMenu}
                    disabled={isLoading}
                  />
                ) : null}
              </DropdownMenuItem>

              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="trash"
                  label="Delete"
                  onClick={closeMenu}
                  disabled={
                    someAssetCheckedOut
                      ? {
                          reason:
                            "Some of the selected boxes are checked out. Please finish your booking first, before deleting them.",
                        }
                      : isLoading
                  }
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="border-t md:hidden lg:p-0">
                <Button
                  type="button"
                  role="button"
                  variant="secondary"
                  className="flex items-center justify-center text-gray-700 hover:text-gray-700 "
                  width="full"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </DropdownMenuItem>
            </When>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
