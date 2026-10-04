/**
 * The asset ID as a chip in the assets list. Click copies it; it turns green
 * once a label has been printed; double-click opens Print / Remove label.
 * Part of the labels feature; not in upstream Shelf.
 */
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/shared/dropdown";
import { useCustomisations } from "~/modules/customisation/use-customisations";
import { tw } from "~/utils/tw";
import { labelledLookup, useLabelledAt } from "./labelled-badge";

export function AssetIdChip({
  assetId,
  sequentialId,
  className,
  kind = "asset",
}: {
  /** The asset's id, or the box's (kit's) id */
  assetId: string;
  sequentialId: string;
  className?: string;
  kind?: "asset" | "box";
}) {
  const { labelsEnabled } = useCustomisations();
  const labelledAt = useLabelledAt(assetId);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetcher = useFetcher<{ success?: boolean }>();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success)
      void labelledLookup.refresh();
  }, [fetcher.state, fetcher.data]);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    []
  );

  const copy = () => {
    void navigator.clipboard?.writeText(sequentialId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  const act = (intent: "print" | "remove") =>
    void fetcher.submit(
      {
        [kind === "box" ? "kitIds[0]" : "assetIds[0]"]: assetId,
        intent,
        source: "asset",
      },
      { method: "post", action: "/api/labels/print" }
    );

  const chip = (
    <button
      type="button"
      className={tw(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs transition-colors",
        labelledAt
          ? "border-success-200 bg-success-50 text-success-700 hover:bg-success-100"
          : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
        className
      )}
      title={
        (labelledAt ? "Label printed. " : "") +
        "Click to copy" +
        (labelsEnabled ? "; double-click for label options" : "")
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Wait a moment: a double-click opens the menu instead of copying
        if (clickTimer.current) clearTimeout(clickTimer.current);
        clickTimer.current = setTimeout(copy, 220);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (clickTimer.current) clearTimeout(clickTimer.current);
        if (labelsEnabled) setMenuOpen(true);
      }}
    >
      {copied ? "Copied" : sequentialId}
    </button>
  );

  if (!labelsEnabled) return chip;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>{chip}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem onSelect={() => act("print")}>
          {labelledAt ? "Print label again" : "Print label"}
        </DropdownMenuItem>
        {labelledAt ? (
          <DropdownMenuItem onSelect={() => act("remove")}>
            Remove label
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
