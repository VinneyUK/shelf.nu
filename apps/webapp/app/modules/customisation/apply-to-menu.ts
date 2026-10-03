/**
 * Applies workspace customisations to Shelf's sidebar menu.
 * Part of the customise feature; not in upstream Shelf.
 */
import type { NavItem } from "~/hooks/use-sidebar-nav-items";
import {
  type Customisations,
  hiddenMenuMatches,
  matchesMenuItem,
} from "./catalogue";

export const CUSTOMISE_PAGE = "/settings/customise";

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
  c: Customisations
) {
  return {
    topMenuItems: withoutHidden(menu.topMenuItems, c),
    bottomMenuItems: withoutHidden(menu.bottomMenuItems, c),
  };
}
