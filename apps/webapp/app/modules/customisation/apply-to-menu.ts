/**
 * Applies workspace customisations to Shelf's sidebar menu.
 * Part of the customise feature; not in upstream Shelf.
 */
import type { LucideIcon } from "lucide-react";
import type { NavItem } from "~/hooks/use-sidebar-nav-items";
import {
  type Customisations,
  hiddenMenuMatches,
  matchesMenuItem,
} from "./catalogue";

export const CUSTOMISE_PAGE = "/settings/customise";
export const EMAIL_RECEIPTS_PAGE = "/settings/email-receipts";
export const LABELS_PAGE = "/labels";

/**
 * labels feature: Labels goes after Reports, or at the end of the first
 * section if Reports is hidden. Added before hiding, so the Labels switch
 * removes it like any other switched-off feature.
 */
function withLabelsItem(items: NavItem[], Icon: LucideIcon): NavItem[] {
  if (items.some((i) => i.type === "child" && i.to === LABELS_PAGE))
    return items;
  const labels = {
    type: "child",
    title: "Labels",
    to: LABELS_PAGE,
    Icon,
  } as NavItem;
  const reports = items.findIndex(
    (i) => i.type === "child" && i.to === "/reports"
  );
  if (reports >= 0) {
    return [
      ...items.slice(0, reports + 1),
      labels,
      ...items.slice(reports + 1),
    ];
  }
  // End of the first section: just before the second heading
  const secondHeading = items.findIndex((i, n) => n > 0 && i.type === "label");
  const at = secondHeading >= 0 ? secondHeading : items.length;
  return [...items.slice(0, at), labels, ...items.slice(at)];
}

function withoutHidden(items: NavItem[], c: Customisations): NavItem[] {
  const matches = hiddenMenuMatches(c);
  const kept = items
    .filter((item) =>
      item.type === "label"
        ? true
        : !matchesMenuItem(
            { title: item.title, to: "to" in item ? item.to : undefined },
            matches
          )
    )
    .map((item) => {
      if (item.type !== "parent") return item;
      const children = item.children.filter(
        (child) => !matchesMenuItem(child, matches)
      );
      // The Customise page always lives under Workspace settings
      if (
        item.title === "Workspace settings" &&
        !children.some((child) => child.to === CUSTOMISE_PAGE)
      ) {
        children.push({ title: "Customise", to: CUSTOMISE_PAGE });
      }
      // email receipts feature
      if (
        item.title === "Workspace settings" &&
        !children.some((child) => child.to === EMAIL_RECEIPTS_PAGE)
      ) {
        children.push({ title: "Email receipts", to: EMAIL_RECEIPTS_PAGE });
      }
      return { ...item, children };
    })
    // A parent whose children have all been hidden goes too
    .filter((item) => item.type !== "parent" || item.children.length > 0);

  // Drop section headings with nothing left under them
  return kept.filter((item, i) => {
    if (item.type !== "label") return true;
    const next = kept[i + 1];
    return next !== undefined && next.type !== "label";
  });
}

export function applyCustomisationsToMenu(
  menu: { topMenuItems: NavItem[]; bottomMenuItems: NavItem[] },
  c: Customisations,
  labelsIcon?: LucideIcon
) {
  const top = labelsIcon
    ? withLabelsItem(menu.topMenuItems, labelsIcon)
    : menu.topMenuItems;
  return {
    topMenuItems: withoutHidden(top, c),
    bottomMenuItems: withoutHidden(menu.bottomMenuItems, c),
  };
}
