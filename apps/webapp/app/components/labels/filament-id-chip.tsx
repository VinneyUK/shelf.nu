/**
 * A filament's label number (FIL-0001) as a chip: click copies it, a
 * double-click offers Print / Re-print / Remove label, green once labelled.
 * Only there while labels are switched on: the number exists for the label.
 * Part of the filament labels feature (fork).
 */
import { useCustomisations } from "~/modules/customisation/use-customisations";
import { AssetIdChip } from "./asset-id-chip";

export function FilamentIdChip({
  fil,
  className,
}: {
  fil: { id: string; label: string } | null;
  className?: string;
}) {
  const { labelsEnabled } = useCustomisations();
  if (!fil || !labelsEnabled) return null;
  return (
    <AssetIdChip
      assetId={fil.id}
      sequentialId={fil.label}
      kind="filament"
      className={className}
    />
  );
}
