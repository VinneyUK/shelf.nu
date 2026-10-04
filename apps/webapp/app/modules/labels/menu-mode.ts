/**
 * Which label entries a selection's Actions menu offers. Pure rules, no I/O.
 * Part of the labels feature; not in upstream Shelf.
 *
 * - nothing selected has a label  → "Print labels"
 * - everything selected has one   → "Re-print labels" and "Remove labels"
 * - a mix, or a select-all across pages (can't tell which) → "Print labels"
 *   and "Remove labels"
 */
import { ALL_SELECTED_KEY } from "~/utils/list";

export type LabelMenuMode = "print" | "reprint-remove" | "print-remove";

export function labelMenuMode(
  selectedIds: string[],
  labelled: Record<string, string>
): LabelMenuMode {
  if (selectedIds.length === 0) return "print";
  if (selectedIds.includes(ALL_SELECTED_KEY)) return "print-remove";
  const withLabel = selectedIds.filter((id) => labelled[id]).length;
  if (withLabel === 0) return "print";
  return withLabel === selectedIds.length ? "reprint-remove" : "print-remove";
}

export function labelMenuEntries(
  mode: LabelMenuMode
): { intent: "print" | "remove"; label: string }[] {
  switch (mode) {
    case "print":
      return [{ intent: "print", label: "Print labels" }];
    case "reprint-remove":
      return [
        { intent: "print", label: "Re-print labels" },
        { intent: "remove", label: "Remove labels" },
      ];
    default:
      return [
        { intent: "print", label: "Print labels" },
        { intent: "remove", label: "Remove labels" },
      ];
  }
}
