/**
 * "Available" without its green dot (fork). Part of the sold feature's list
 * changes; not in upstream Shelf.
 */
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssetStatusBadge } from "./asset-status-badge";
import type { QuantityAwareAsset } from "./quantity-data";

vi.mock("~/hooks/use-api-query", () => ({
  default: () => ({ data: undefined, isLoading: false, error: undefined }),
}));
vi.mock("../../shared/hover-card", () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const asset: QuantityAwareAsset = {
  type: "INDIVIDUAL",
  quantity: 1,
  custody: null,
  bookingAssets: [],
  assetKits: [],
};
// The Badge draws its dot as a small round div
const hasDot = (container: HTMLElement) =>
  container.querySelector(".size-1\\.5") !== null;

describe("Available has no green dot, on every page", () => {
  it("drops the dot from Available by default", () => {
    const { container } = render(
      <AssetStatusBadge
        id="a"
        status="AVAILABLE"
        availableToBook
        asset={asset}
      />
    );
    expect(screen.getByText("Available")).toBeTruthy();
    expect(hasDot(container)).toBe(false);
  });

  it("can be switched back on", () => {
    const { container } = render(
      <AssetStatusBadge
        id="a"
        status="AVAILABLE"
        availableToBook
        asset={asset}
        noDotWhenAvailable={false}
      />
    );
    expect(hasDot(container)).toBe(true);
  });

  it("leaves other statuses' dots alone", () => {
    const { container } = render(
      <AssetStatusBadge
        id="a"
        status="CHECKED_OUT"
        availableToBook
        asset={asset}
      />
    );
    expect(hasDot(container)).toBe(true);
  });
});
