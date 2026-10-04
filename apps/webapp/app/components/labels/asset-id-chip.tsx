/**
 * The asset ID (or a box's ID) as a chip in the lists. A single click copies
 * it; a double-click opens Print / Re-print / Remove label; it turns green
 * once a label has been printed.
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
import { refreshLabelledSoon, useLabelledAt } from "./labelled-badge";

/** Gap within which two clicks count as a double-click. */
const DOUBLE_CLICK_MS = 250;

/** Copies text, with a fallback for pages the clipboard API isn't offered on. */
export async function copyText(text: string) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the fallback
  }
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(box);
    return ok;
  } catch {
    return false;
  }
}

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
      refreshLabelledSoon();
  }, [fetcher.state, fetcher.data]);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    []
  );

  const copy = () => {
    void copyText(sequentialId).then((ok) => {
      if (!ok) return;
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
      // The dropdown trigger opens on the mouse PRESS. Stopping that here is
      // what makes a single click copy only, and a double-click open the menu.
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (clickTimer.current) clearTimeout(clickTimer.current);
        // Wait a moment: a second click means the menu was wanted, not a copy
        clickTimer.current = setTimeout(copy, DOUBLE_CLICK_MS);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (clickTimer.current) clearTimeout(clickTimer.current);
        if (labelsEnabled) setMenuOpen(true);
      }}
      onKeyDown={(e) => {
        // Keyboard: Enter or Space copies; the menu key or Arrow Down opens it
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copy();
        } else if (
          labelsEnabled &&
          (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))
        ) {
          e.preventDefault();
          setMenuOpen(true);
        }
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
          {labelledAt ? "Re-print label" : "Print label"}
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
