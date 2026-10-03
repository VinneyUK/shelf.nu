/**
 * Image preview on hover (customise feature; not in upstream Shelf).
 */
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetImage } from "./component";
import type { AssetForPreview } from "./types";

vi.mock("~/components/layout/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogPortal: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("~/components/shared/button", () => ({
  Button: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock("~/components/shared/spinner", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

const withImage = {
  id: "asset-1",
  thumbnailImage: "https://x/storage/v1/object/sign/assets/a-thumbnail.jpg",
  mainImage: "https://x/storage/v1/object/sign/assets/a.jpg?token=t",
  mainImageExpiration: new Date("2999-01-01T00:00:00.000Z"),
  assetModel: null,
} as unknown as AssetForPreview;

const withoutImage = {
  id: "asset-2",
  thumbnailImage: null,
  mainImage: null,
  mainImageExpiration: null,
  assetModel: null,
} as unknown as AssetForPreview;

// Radix's hover card marks its trigger with data-state; nothing else here does.
// [0] is the thumbnail: the mocked dialog also renders the enlarged image.
const isHoverTrigger = (img: HTMLElement) =>
  img.parentElement?.getAttribute("data-state") !== null;

describe("AssetImage hover preview", () => {
  it("wraps a real image in a hover card when switched on", () => {
    render(
      <AssetImage asset={withImage} alt="Drill" withPreview hoverPreview />
    );
    expect(isHoverTrigger(screen.getAllByAltText("Drill")[0])).toBe(true);
  });

  it("leaves the thumbnail alone when switched off", () => {
    render(<AssetImage asset={withImage} alt="Drill" withPreview />);
    expect(isHoverTrigger(screen.getAllByAltText("Drill")[0])).toBe(false);
  });

  it("never previews the placeholder", () => {
    render(
      <AssetImage asset={withoutImage} alt="Nothing" withPreview hoverPreview />
    );
    expect(isHoverTrigger(screen.getAllByAltText("Nothing")[0])).toBe(false);
  });
});
