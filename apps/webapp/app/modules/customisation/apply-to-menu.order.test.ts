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

describe("the IoT menu item (fork)", () => {
  it("goes straight after Filament", async () => {
    const { applyCustomisationsToMenu } = await import("./apply-to-menu");
    const { DEFAULT_CUSTOMISATIONS } = await import("./catalogue");
    const Icon = (() => null) as never;
    const out = applyCustomisationsToMenu(
      {
        topMenuItems: [
          { type: "child", title: "Assets", to: "/assets", Icon } as never,
        ],
        bottomMenuItems: [],
      },
      { ...DEFAULT_CUSTOMISATIONS, filamentEnabled: true },
      undefined,
      undefined,
      Icon,
      Icon
    );
    const tos = out.topMenuItems.map((i) => ("to" in i ? i.to : i.title));
    expect(tos.indexOf("/iot")).toBe(tos.indexOf("/filament") + 1);
  });
});
