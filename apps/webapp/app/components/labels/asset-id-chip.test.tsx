/**
 * The asset ID chip: one click copies, a double-click opens the label menu.
 * Part of the labels feature; not in upstream Shelf.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  labelledAt: null as string | null,
  refresh: vi.fn(),
}));

vi.mock("react-router", () => ({
  useFetcher: () => ({ submit: mocks.submit, state: "idle", data: undefined }),
}));
vi.mock("~/modules/customisation/use-customisations", () => ({
  useCustomisations: () => ({ labelsEnabled: true }),
}));
vi.mock("./labelled-badge", () => ({
  useLabelledAt: () => mocks.labelledAt,
  refreshLabelledSoon: mocks.refresh,
}));

import { AssetIdChip } from "./asset-id-chip";

beforeAll(() => {
  // jsdom lacks these; the dropdown's positioning code calls them
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});
beforeEach(() => {
  mocks.submit.mockClear();
  mocks.labelledAt = null;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("AssetIdChip", () => {
  it("copies the ID on a single click, and does not open the menu", async () => {
    const user = userEvent.setup();
    render(<AssetIdChip assetId="a1" sequentialId="SAM-0017" />);
    await user.click(screen.getByRole("button", { name: "SAM-0017" }));
    await wait(400);
    expect(await navigator.clipboard.readText()).toBe("SAM-0017");
    expect(screen.queryByText("Print label")).toBeNull();
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("opens the label menu on a double-click, without copying", async () => {
    const user = userEvent.setup();
    await navigator.clipboard.writeText("untouched");
    render(<AssetIdChip assetId="a1" sequentialId="SAM-0017" />);
    await user.dblClick(screen.getByRole("button", { name: "SAM-0017" }));
    expect(await screen.findByText("Print label")).toBeTruthy();
    await wait(400);
    expect(await navigator.clipboard.readText()).toBe("untouched");
    expect(screen.queryByText("Remove label")).toBeNull(); // nothing printed yet
  });

  it("offers Re-print and Remove once labelled, and is green", async () => {
    mocks.labelledAt = "2026-10-04T10:00:00Z";
    const user = userEvent.setup();
    render(<AssetIdChip assetId="a1" sequentialId="SAM-0017" />);
    const chip = screen.getByRole("button", { name: "SAM-0017" });
    expect(chip.className).toContain("success");
    await user.dblClick(chip);
    expect(await screen.findByText("Re-print label")).toBeTruthy();
    await user.click(screen.getByText("Remove label"));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.submit.mock.calls[0][0]).toEqual({
      "assetIds[0]": "a1",
      intent: "remove",
      source: "asset",
    });
  });

  it("sends a box's id as a box", async () => {
    const user = userEvent.setup();
    render(<AssetIdChip assetId="k1" sequentialId="BOX-0001" kind="box" />);
    await user.dblClick(screen.getByRole("button", { name: "BOX-0001" }));
    await user.click(await screen.findByText("Print label"));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.submit.mock.calls[0][0]).toEqual({
      "kitIds[0]": "k1",
      intent: "print",
      source: "asset",
    });
  });
});
