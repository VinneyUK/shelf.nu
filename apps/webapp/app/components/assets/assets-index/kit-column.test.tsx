/**
 * Kit Column UI Tests
 *
 * Behavior tests for the multi-kit rendering on the advanced asset
 * index. A QUANTITY_TRACKED asset can belong to multiple kits with
 * different per-kit quantities; the column shows the primary kit plus
 * a "+N" affordance whose hover tooltip lists every kit name.
 *
 * Mirrors {@link file://./custody-column.test.tsx} — same shape, kit
 * data instead of custody data.
 *
 * @see {@link file://./advanced-asset-columns.tsx}
 */
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdvancedIndexAsset } from "~/modules/asset/types";

// why: lottie-web touches canvas APIs that jsdom doesn't fully
// implement, blowing up at module-import time when the asset-columns
// barrel transitively pulls in the scanner success animation.
vi.mock("lottie-react", () => ({
  default: () => null,
}));

// why: react-router's Link reads route context; in the unit test the
// route tree isn't mounted, so swap it for a plain anchor that
// preserves the `to` prop for assertions. Keep the rest of react-
// router intact via importActual so the column file's other imports
// keep resolving.
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...rest
    }: {
      to: string;
      children: ReactNode;
    } & Record<string, unknown>) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useLoaderData: () => ({}),
  };
});

import { KitColumn } from "./advanced-asset-columns";

/** Wraps the column's `<td>` in the table structure required by JSX
 * validity in jsdom; the column itself only renders the cell. */
function renderCell(kits: AdvancedIndexAsset["kits"]) {
  return render(
    <table>
      <tbody>
        <tr>
          <KitColumn kits={kits} />
        </tr>
      </tbody>
    </table>
  );
}

function makeKit(id: string, name: string): AdvancedIndexAsset["kits"][number] {
  return { id, name, status: "AVAILABLE" };
}

describe("KitColumn", () => {
  it("renders the empty placeholder when boxes is an empty array", () => {
    renderCell([]);

    expect(screen.getByLabelText("No data")).toBeInTheDocument();
    expect(screen.queryByTestId("kit-more-chip")).not.toBeInTheDocument();
  });

  it("renders a single box link with no +N chip", () => {
    renderCell([makeKit("kit-1", "Photography Box")]);

    const link = screen.getByRole("link", { name: "Photography Box" });
    expect(link).toHaveAttribute("href", "/kits/kit-1");
    expect(screen.queryByTestId("kit-more-chip")).not.toBeInTheDocument();
  });

  it("renders the primary box link plus a +N chip for multiple boxes", () => {
    renderCell([
      makeKit("kit-1", "Photography Box"),
      makeKit("kit-2", "Studio Box"),
      makeKit("kit-3", "Field Box"),
    ]);

    // Primary kit gets the visible link.
    const primary = screen.getByRole("link", { name: "Photography Box" });
    expect(primary).toHaveAttribute("href", "/kits/kit-1");

    // Chip indicates 2 additional kits.
    const chip = screen.getByTestId("kit-more-chip");
    expect(chip).toHaveTextContent(/^\+2$/);
    expect(chip).toHaveAttribute("aria-label", "+2 more boxes");
  });

  it("lists every box name in the tooltip on hover", async () => {
    const user = userEvent.setup();

    renderCell([
      makeKit("kit-1", "Photography Box"),
      makeKit("kit-2", "Studio Box"),
      makeKit("kit-3", "Field Box"),
    ]);

    const chip = screen.getByTestId("kit-more-chip");
    await user.hover(chip);

    // The tooltip is portalled; assert via findBy which polls.
    const tooltip = await screen.findByTestId("kit-more-tooltip");
    expect(tooltip).toHaveTextContent("Photography Box");
    expect(tooltip).toHaveTextContent("Studio Box");
    expect(tooltip).toHaveTextContent("Field Box");
  });
});
