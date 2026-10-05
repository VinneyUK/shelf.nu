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
export const AI_PAGE = "/settings/ai";
export const DRAFTS_PAGE = "/drafts";

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

/** AI feature: Drafts goes straight after Labels (or Reports), only once AI is switched on. */
function withDraftsItem(items: NavItem[], Icon: LucideIcon): NavItem[] {
  if (items.some((i) => i.type === "child" && i.to === DRAFTS_PAGE))
    return items;
  const drafts = {
    type: "child",
    title: "Drafts",
    to: DRAFTS_PAGE,
    Icon,
  } as NavItem;
  const anchor = [LABELS_PAGE, "/reports"]
    .map((to) => items.findIndex((i) => i.type === "child" && i.to === to))
    .find((i) => i >= 0);
  if (anchor === undefined) return [...items, drafts];
  return [...items.slice(0, anchor + 1), drafts, ...items.slice(anchor + 1)];
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
      // AI feature
      if (
        item.title === "Workspace settings" &&
        !children.some((child) => child.to === AI_PAGE)
      ) {
        children.push({ title: "AI", to: AI_PAGE });
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

/**
 * Fork: a tidier menu. No section headings ("Asset management",
 * "Organization"), and "Workspace settings" is just "Settings".
 */
function tidy(items: NavItem[]): NavItem[] {
  return items
    .filter((item) => item.type !== "label")
    .map((item) =>
      item.title === "Workspace settings"
        ? { ...item, title: "Settings" }
        : item
    );
}

export function applyCustomisationsToMenu(
  menu: { topMenuItems: NavItem[]; bottomMenuItems: NavItem[] },
  c: Customisations,
  labelsIcon?: LucideIcon,
  draftsIcon?: LucideIcon
) {
  const withLabels = labelsIcon
    ? withLabelsItem(menu.topMenuItems, labelsIcon)
    : menu.topMenuItems;
  const top =
    draftsIcon && c.aiEnabled
      ? withDraftsItem(withLabels, draftsIcon)
      : withLabels;
  return {
    topMenuItems: tidy(withoutHidden(top, c)),
    bottomMenuItems: tidy(withoutHidden(menu.bottomMenuItems, c)),
  };
}
