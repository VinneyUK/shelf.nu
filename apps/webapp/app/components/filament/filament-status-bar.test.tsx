/**
 * The Filament page's status bar (fork, Ant's design).
 */
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import {
  FilamentStatusBar,
  type FilamentStatusBarProps,
} from "./filament-status-bar";

const base: FilamentStatusBarProps = {
  stock: { spools: 46, unopened: 33, kgRemaining: 40.9 },
  money: { spent: 696.28, used: 69.55, currency: "GBP" },
  ams: {
    online: true,
    lastUpdate: Date.now(),
    slots: [
      {
        slot: 1,
        color: "D62B2BFF",
        name: "Red",
        material: "PLA Basic",
        percent: 96,
        active: true,
        href: "/filament/pla-basic--red",
      },
      {
        slot: 2,
        color: "#161616",
        name: "Black",
        material: "PLA Basic",
        percent: 12,
      },
      { slot: 3, color: null, name: null, percent: null },
      {
        slot: 4,
        color: "8A8F98",
        name: "Grey",
        material: "PETG",
        percent: null,
      },
    ],
  },
  printer: { state: "printing", issue: null },
  links: {
    printerSettings: "/settings/printer",
    findInStock: (s) => `/filament?s=${s.name}`,
  },
};

const show = (props: Partial<FilamentStatusBarProps> = {}) => {
  const router = createMemoryRouter(
    [{ path: "/", element: <FilamentStatusBar {...base} {...props} /> }],
    { initialEntries: ["/"] }
  );
  return render(<RouterProvider router={router} />);
};

describe("FilamentStatusBar", () => {
  it("shows what's on hand, its value, and each slot", () => {
    show();
    expect(screen.getByText("40.9")).toBeTruthy();
    expect(screen.getByText("46 spools · 33 sealed")).toBeTruthy();
    expect(screen.getByText("£626.73")).toBeTruthy();
    expect(screen.getByText("Printing")).toBeTruthy();
    expect(
      screen.getByText(/Slot 1: Red PLA Basic, 96% remaining, feeding/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Slot 2: Black PLA Basic, 12% remaining, low/)
    ).toBeTruthy();
    expect(screen.getByText("Slot 3: empty")).toBeTruthy();
    expect(
      screen.getByText(/Slot 4: Grey PETG, level not tracked/)
    ).toBeTruthy();
    // a slot Shelf knows links to its filament
    expect(
      screen
        .getByText(/Slot 1: Red/)
        .closest("a")
        ?.getAttribute("href")
    ).toBe("/filament/pla-basic--red");
  });

  it("says plainly when the access code was rejected, with the way to fix it", () => {
    show({ printer: { state: "offline", issue: { kind: "auth" } } });
    expect(screen.getByRole("alert").textContent).toContain(
      "Printer rejected the connection."
    );
    expect(
      screen
        .getByRole("link", { name: /Update access code/ })
        .getAttribute("href")
    ).toBe("/settings/printer");
    expect(screen.getByText("Can’t connect")).toBeTruthy();
  });

  it("asks you to set the printer up when it isn't", () => {
    show({
      ams: { online: false, lastUpdate: null, slots: [] },
      printer: { state: "offline", issue: { kind: "setup" } },
    });
    expect(screen.getByText("Your printer isn’t set up.")).toBeTruthy();
    expect(screen.getByText("Not set up")).toBeTruthy();
  });

  it("warns when the AMS has gone quiet, keeping the last levels", () => {
    show({
      ams: { ...base.ams, online: false, lastUpdate: Date.now() - 10 * 60_000 },
      printer: { state: "offline", issue: null },
    });
    // the banner, and the screen-reader announcement of it
    expect(screen.getByRole("status").textContent).toContain(
      "No data from the AMS for 10 min."
    );
    expect(screen.getByText("AMS offline")).toBeTruthy();
    expect(
      screen.getByText(/Slot 1: Red PLA Basic, 96% remaining, last known value/)
    ).toBeTruthy();
  });
});
