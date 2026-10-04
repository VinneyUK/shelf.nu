/**
 * Switched-off features leave no trace in columns or reports.
 * Part of the customise feature; not in upstream Shelf.
 */
import { describe, expect, it } from "vitest";
import { REPORTS } from "~/modules/reports/registry";
import {
  DEFAULT_CUSTOMISATIONS,
  columnsWithoutSwitchedOff,
  redirectForSwitchedOffPage,
  reportIsAvailable,
} from "./catalogue";

const on = DEFAULT_CUSTOMISATIONS;
const cols = [
  "name",
  "status",
  "custody",
  "availableToBook",
  "upcomingBookings",
  "upcomingReminder",
  "location",
].map((name) => ({ name, visible: true, position: 0 }));
const names = (c: typeof on) =>
  columnsWithoutSwitchedOff(cols, c).map((col) => col.name);

describe("columns", () => {
  it("keeps everything when every feature is on", () => {
    expect(names(on)).toEqual(cols.map((c) => c.name));
  });
  it("drops each feature's own columns, and only those", () => {
    expect(names({ ...on, bookingsEnabled: false })).toEqual([
      "name",
      "status",
      "custody",
      "upcomingReminder",
      "location",
    ]);
    expect(names({ ...on, remindersEnabled: false })).not.toContain(
      "upcomingReminder"
    );
    expect(names({ ...on, custodyEnabled: false })).toEqual([
      "name",
      "status",
      "availableToBook",
      "upcomingBookings",
      "upcomingReminder",
      "location",
    ]);
  });
});

const visible = (c: typeof on) =>
  REPORTS.filter((r) => reportIsAvailable(r, c)).map((r) => r.id);

describe("reports", () => {
  it("shows every report when every feature is on", () => {
    expect(visible(on)).toEqual(REPORTS.map((r) => r.id));
  });
  it("drops booking reports, and Idle Assets, when bookings are off", () => {
    const v = visible({ ...on, bookingsEnabled: false });
    for (const id of [
      "booking-compliance",
      "top-booked-assets",
      "overdue-items",
      "idle-assets",
    ]) {
      expect(v).not.toContain(id);
    }
    expect(v).toContain("asset-utilization"); // custody still counts
    expect(v).toContain("custody-snapshot");
  });
  it("drops Custody Snapshot when custody is off, and Utilization only when both are", () => {
    expect(visible({ ...on, custodyEnabled: false })).not.toContain(
      "custody-snapshot"
    );
    expect(visible({ ...on, custodyEnabled: false })).toContain(
      "asset-utilization"
    );
    expect(
      visible({ ...on, custodyEnabled: false, bookingsEnabled: false })
    ).not.toContain("asset-utilization");
  });
  it("always keeps Sold Assets and the inventory reports", () => {
    const v = visible({
      ...on,
      bookingsEnabled: false,
      custodyEnabled: false,
      auditsEnabled: false,
    });
    for (const id of [
      "sold-assets",
      "asset-inventory",
      "distribution",
      "asset-activity",
    ])
      expect(v).toContain(id);
  });
  it("blocks a hidden report's address too", () => {
    const off = { ...on, bookingsEnabled: false, custodyEnabled: false };
    expect(redirectForSwitchedOffPage("/reports/booking-compliance", off)).toBe(
      "/home"
    );
    expect(redirectForSwitchedOffPage("/reports/custody-snapshot", off)).toBe(
      "/home"
    );
    expect(redirectForSwitchedOffPage("/reports/idle-assets", off)).toBe(
      "/home"
    );
    expect(redirectForSwitchedOffPage("/reports/sold-assets", off)).toBeNull();
    expect(redirectForSwitchedOffPage("/reports", off)).toBeNull();
    expect(
      redirectForSwitchedOffPage("/reports/booking-compliance", on)
    ).toBeNull();
  });
  it("knows the category of every Shelf report that a switch can hide", () => {
    // If a Shelf update adds or moves a bookings, custody or audits report,
    // this fails: add it to REPORT_CATEGORY in catalogue.ts.
    const off = {
      ...on,
      bookingsEnabled: false,
      custodyEnabled: false,
      auditsEnabled: false,
    };
    for (const r of REPORTS.filter((r) =>
      ["bookings", "custody", "audits"].includes(r.category)
    )) {
      expect(redirectForSwitchedOffPage(`/reports/${r.id}`, off), r.id).toBe(
        "/home"
      );
    }
  });
});

describe("locations, kits and asset models", () => {
  it("drop their columns", () => {
    expect(names({ ...on, locationsEnabled: false })).not.toContain("location");
    expect(names({ ...on, locationsEnabled: false })).toContain("custody");
    expect(
      columnsWithoutSwitchedOff(
        [{ name: "kit" }, { name: "assetModel" }, { name: "name" }],
        { ...on, kitsEnabled: false, assetModelsEnabled: false }
      ).map((c) => c.name)
    ).toEqual(["name"]);
  });
  it("block their pages", () => {
    const off = {
      ...on,
      locationsEnabled: false,
      kitsEnabled: false,
      assetModelsEnabled: false,
    };
    for (const path of [
      "/locations",
      "/locations/l1",
      "/kits",
      "/kits/k1/overview",
      "/settings/asset-models",
      "/settings/asset-models/new",
      "/assets/a1/overview/update-location",
    ]) {
      expect(redirectForSwitchedOffPage(path, off), path).toBe("/home");
      expect(redirectForSwitchedOffPage(path, on), path).toBeNull();
    }
    expect(redirectForSwitchedOffPage("/settings/general", off)).toBeNull();
  });
});
