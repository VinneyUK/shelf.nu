import { describe, expect, it } from "vitest";
import type { NavItem } from "~/hooks/use-sidebar-nav-items";
import { applyCustomisationsToMenu } from "~/modules/customisation/apply-to-menu";
import {
  DEFAULT_CUSTOMISATIONS,
  redirectForSwitchedOffPage,
} from "~/modules/customisation/catalogue";

import { retryDelayMs } from "./retry";

const Icon = (() => null) as unknown as Parameters<
  typeof applyCustomisationsToMenu
>[2];
const child = (title: string, to: string) =>
  ({ type: "child", title, to, Icon }) as NavItem;
const label = (title: string) => ({ type: "label", title }) as NavItem;
const menu = (withReports = true) => ({
  topMenuItems: [
    label("Asset management"),
    child("Assets", "/assets"),
    ...(withReports ? [child("Reports", "/reports")] : []),
    label("Organization"),
    child("Something", "/x"),
  ],
  bottomMenuItems: [],
});
const tos = (items: NavItem[]) =>
  items.map((i) => ("to" in i ? i.to : `[${i.title}]`));

describe("Labels in the menu", () => {
  it("goes straight after Reports", () => {
    const out = applyCustomisationsToMenu(menu(), DEFAULT_CUSTOMISATIONS, Icon);
    expect(tos(out.topMenuItems)).toEqual([
      "[Asset management]",
      "/assets",
      "/reports",
      "/labels",
      "[Organization]",
      "/x",
    ]);
  });

  it("ends the first section when Reports is hidden", () => {
    const out = applyCustomisationsToMenu(
      menu(),
      { ...DEFAULT_CUSTOMISATIONS, hiddenMenuItems: ["reports"] },
      Icon
    );
    expect(tos(out.topMenuItems)).toEqual([
      "[Asset management]",
      "/assets",
      "/labels",
      "[Organization]",
      "/x",
    ]);
  });

  it("ends the first section when Shelf doesn't show Reports at all", () => {
    const out = applyCustomisationsToMenu(
      menu(false),
      DEFAULT_CUSTOMISATIONS,
      Icon
    );
    expect(tos(out.topMenuItems)).toEqual([
      "[Asset management]",
      "/assets",
      "/labels",
      "[Organization]",
      "/x",
    ]);
  });

  it("is removed when Labels is switched off, page included", () => {
    const off = { ...DEFAULT_CUSTOMISATIONS, labelsEnabled: false };
    const out = applyCustomisationsToMenu(menu(), off, Icon);
    expect(tos(out.topMenuItems)).not.toContain("/labels");
    expect(redirectForSwitchedOffPage("/labels/queue", off)).toBe("/home");
    expect(
      redirectForSwitchedOffPage("/labels", DEFAULT_CUSTOMISATIONS)
    ).toBeNull();
    expect(redirectForSwitchedOffPage("/labelsx", off)).toBeNull();
  });

  it("is never added twice", () => {
    const once = applyCustomisationsToMenu(
      menu(),
      DEFAULT_CUSTOMISATIONS,
      Icon
    );
    const twice = applyCustomisationsToMenu(once, DEFAULT_CUSTOMISATIONS, Icon);
    expect(tos(twice.topMenuItems).filter((t) => t === "/labels")).toHaveLength(
      1
    );
  });
});

describe("retry timing", () => {
  it("waits longer after each failure, up to ten minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map((n) => retryDelayMs(n) / 1000)).toEqual([
      30, 60, 120, 240, 480, 600, 600,
    ]);
  });
});
