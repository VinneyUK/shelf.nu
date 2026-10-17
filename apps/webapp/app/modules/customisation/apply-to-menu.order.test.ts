import { describe, expect, it } from "vitest";
import type { NavItem } from "~/hooks/use-sidebar-nav-items";
import { menuKey, orderMenu } from "./apply-to-menu";

const child = (to: string, title = to) =>
  ({ type: "child", title, to }) as NavItem;
const parent = (title: string) =>
  ({ type: "parent", title, children: [] }) as unknown as NavItem;
const keys = (items: NavItem[]) => items.map(menuKey);

describe("the menu's order", () => {
  it("knows each item by its address, or its kind and title", () => {
    expect(menuKey(child("/assets", "Assets"))).toBe("/assets");
    expect(menuKey(parent("Settings"))).toBe("parent:Settings");
  });
  it("follows the order you dragged", () => {
    const items = [
      child("/home"),
      child("/assets"),
      child("/kits"),
      parent("Settings"),
    ];
    expect(
      keys(orderMenu(items, ["/kits", "/home", "parent:Settings", "/assets"]))
    ).toEqual(["/kits", "/home", "parent:Settings", "/assets"]);
  });
  it("is Shelf's order until you drag", () => {
    const items = [child("/home"), child("/assets")];
    expect(orderMenu(items, [])).toBe(items);
  });
  it("leaves an item you never placed (a new feature's) in its own place", () => {
    const items = [
      child("/home"),
      child("/assets"),
      child("/filament"),
      child("/kits"),
    ];
    expect(keys(orderMenu(items, ["/kits", "/assets", "/home"]))).toEqual([
      "/kits",
      "/assets",
      "/filament",
      "/home",
    ]);
  });
  it("ignores items that have gone", () => {
    expect(
      keys(
        orderMenu(
          [child("/home"), child("/assets")],
          ["/gone", "/assets", "/home"]
        )
      )
    ).toEqual(["/assets", "/home"]);
  });
});
