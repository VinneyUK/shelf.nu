import { describe, expect, it } from "vitest";
import type { NavItem } from "~/hooks/use-sidebar-nav-items";
import {
  applyCustomisationsToMenu,
  CUSTOMISE_PAGE,
  EMAIL_RECEIPTS_PAGE,
  AI_PAGE,
} from "./apply-to-menu";
import {
  type Customisations,
  DEFAULT_CUSTOMISATIONS,
  cleanHiddenMenuItems,
  redirectForSwitchedOffPage,
} from "./catalogue";

const all = DEFAULT_CUSTOMISATIONS;
const off = (changes: Partial<Customisations>): Customisations => ({
  ...all,
  ...changes,
});

describe("redirectForSwitchedOffPage", () => {
  it("lets everything through when nothing is switched off", () => {
    for (const path of [
      "/bookings",
      "/calendar",
      "/audits",
      "/reminders",
      "/assets/a1/bookings",
    ]) {
      expect(redirectForSwitchedOffPage(path, all)).toBeNull();
    }
  });

  it("blocks every bookings page when bookings are off", () => {
    const c = off({ bookingsEnabled: false });
    for (const path of [
      "/bookings",
      "/bookings/new",
      "/bookings/abc/overview",
      "/calendar",
      "/settings/bookings",
      "/assets/a1/bookings",
      "/kits/k1/bookings",
      "/assets/a1/overview/create-new-booking",
      "/kits/k1/overview/add-to-existing-booking",
    ]) {
      expect(redirectForSwitchedOffPage(path, c)).toBe("/home");
    }
  });

  it("leaves pages that only look similar alone", () => {
    const c = off({
      bookingsEnabled: false,
      remindersEnabled: false,
      auditsEnabled: false,
    });
    for (const path of [
      "/bookingsx",
      "/assets",
      "/assets/a1",
      "/assets/a1/overview",
      "/settings/general",
      "/assets/a1/attachments",
      "/home",
    ]) {
      expect(redirectForSwitchedOffPage(path, c)).toBeNull();
    }
  });

  it("blocks reminder pages when reminders are off", () => {
    const c = off({ remindersEnabled: false });
    expect(redirectForSwitchedOffPage("/reminders", c)).toBe("/home");
    expect(redirectForSwitchedOffPage("/assets/a1/reminders", c)).toBe("/home");
    expect(redirectForSwitchedOffPage("/bookings", c)).toBeNull();
  });

  it("blocks audits when audits are off", () => {
    const c = off({ auditsEnabled: false });
    expect(redirectForSwitchedOffPage("/audits", c)).toBe("/home");
    expect(redirectForSwitchedOffPage("/audits/x/scan", c)).toBe("/home");
  });

  it("sends people to Assets when Home is hidden", () => {
    const c = off({ bookingsEnabled: false, hiddenMenuItems: ["home"] });
    expect(redirectForSwitchedOffPage("/bookings", c)).toBe("/assets");
  });
});

describe("cleanHiddenMenuItems", () => {
  it("keeps known keys once and drops anything else", () => {
    expect(
      cleanHiddenMenuItems(["tags", "tags", "nonsense", 3, "team"])
    ).toEqual(["tags", "team"]);
    expect(cleanHiddenMenuItems("tags")).toEqual([]);
    expect(cleanHiddenMenuItems(undefined)).toEqual([]);
  });
});

const Icon = (() => null) as unknown as NavItem extends { Icon: infer I }
  ? I
  : never;
const child = (title: string, to: string): NavItem =>
  ({ type: "child", title, to, Icon }) as NavItem;
const label = (title: string): NavItem => ({ type: "label", title }) as NavItem;

const menu = () => ({
  topMenuItems: [
    label("Asset management"),
    child("Home", "/home"),
    child("Assets", "/assets"),
    child("Kits", "/kits"),
    child("Audits", "/audits"),
    {
      type: "parent",
      title: "Bookings",
      Icon,
      children: [
        { title: "View Bookings", to: "/bookings" },
        { title: "Calendar", to: "/calendar" },
      ],
    } as NavItem,
    child("Reminders", "/reminders"),
    label("Organization"),
    {
      type: "parent",
      title: "Team",
      Icon,
      children: [{ title: "Users", to: "/settings/team/users" }],
    } as NavItem,
    {
      type: "parent",
      title: "Workspace settings",
      Icon,
      children: [
        { title: "General", to: "/settings/general" },
        { title: "Bookings", to: "/settings/bookings" },
      ],
    } as NavItem,
  ],
  bottomMenuItems: [
    child("QR Scanner", "/scanner"),
    { type: "button", title: "Updates", Icon, onClick: () => {} } as NavItem,
  ],
});

const titles = (items: NavItem[]) => items.map((i) => i.title);
const settingsChildren = (items: NavItem[]) => {
  const s = items.find((i) => i.title === "Settings");
  return s && s.type === "parent" ? s.children.map((c) => c.to) : [];
};

describe("applyCustomisationsToMenu", () => {
  it("only adds the Customise page when nothing is switched off", () => {
    const out = applyCustomisationsToMenu(menu(), all);
    // headings go, and Workspace settings becomes Settings
    expect(titles(out.topMenuItems)).toEqual(
      titles(menu().topMenuItems)
        .filter((t) => !["Asset management", "Organization"].includes(t))
        .map((t) => (t === "Workspace settings" ? "Settings" : t))
    );
    expect(settingsChildren(out.topMenuItems)).toEqual([
      "/settings/general",
      "/settings/bookings",
      CUSTOMISE_PAGE,
      EMAIL_RECEIPTS_PAGE,
      AI_PAGE,
    ]);
  });

  it("removes switched-off features, including booking settings", () => {
    const out = applyCustomisationsToMenu(
      menu(),
      off({
        bookingsEnabled: false,
        auditsEnabled: false,
        remindersEnabled: false,
      })
    );
    expect(titles(out.topMenuItems)).not.toContain("Bookings");
    expect(titles(out.topMenuItems)).not.toContain("Audits");
    expect(titles(out.topMenuItems)).not.toContain("Reminders");
    expect(settingsChildren(out.topMenuItems)).toEqual([
      "/settings/general",
      CUSTOMISE_PAGE,
      EMAIL_RECEIPTS_PAGE,
      AI_PAGE,
    ]);
  });

  it("hides chosen items, and a heading left with nothing under it", () => {
    const out = applyCustomisationsToMenu(
      menu(),
      off({
        hiddenMenuItems: ["team", "scanner", "updates", "tags"],
        kitsEnabled: false,
      })
    );
    expect(titles(out.topMenuItems)).not.toContain("Team");
    expect(titles(out.topMenuItems)).not.toContain("Boxes");
    expect(titles(out.topMenuItems)).not.toContain("Tags");
    expect(titles(out.topMenuItems)).not.toContain("Organization"); // headings are gone
    expect(out.bottomMenuItems).toEqual([]);
  });

  it("drops a heading when everything under it is hidden", () => {
    const m = menu();
    m.topMenuItems = m.topMenuItems.filter(
      (i) => i.title !== "Workspace settings"
    );
    const out = applyCustomisationsToMenu(
      m,
      off({ hiddenMenuItems: ["team"] })
    );
    expect(titles(out.topMenuItems)).not.toContain("Organization");
  });

  it("never adds Customise twice", () => {
    const once = applyCustomisationsToMenu(menu(), all);
    const twice = applyCustomisationsToMenu(once, all);
    expect(
      settingsChildren(twice.topMenuItems).filter((to) => to === CUSTOMISE_PAGE)
    ).toHaveLength(1);
  });
});

describe("custody switch", () => {
  it("blocks the assign and release custody pages for assets and boxes", () => {
    const c = { ...DEFAULT_CUSTOMISATIONS, custodyEnabled: false };
    for (const path of [
      "/assets/a1/overview/assign-custody",
      "/assets/a1/overview/release-custody",
      "/kits/k1/assets/assign-custody",
      "/kits/k1/assets/release-custody",
    ]) {
      expect(redirectForSwitchedOffPage(path, c)).toBe("/home");
      expect(
        redirectForSwitchedOffPage(path, DEFAULT_CUSTOMISATIONS)
      ).toBeNull();
    }
    expect(redirectForSwitchedOffPage("/assets/a1/overview", c)).toBeNull();
  });
});
