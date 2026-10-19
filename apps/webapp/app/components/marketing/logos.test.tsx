/**
 * Vinventory's logo in place of Shelf's (fork).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { config } from "~/config/shelf.config";
import { ShelfSidebarLogo, ShelfSymbolLogo } from "./logos";

describe("the app's own config", () => {
  it("sets no custom logo, so Vinventory's shows", () => {
    expect(config.logoPath).toBeUndefined();
  });
});

describe("the sidebar logo", () => {
  it("is the symbol and the name when the sidebar is open", () => {
    const { container } = render(<ShelfSidebarLogo minimized={false} />);
    expect(screen.getAllByRole("img", { name: "Vinventory" })).toHaveLength(2);
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe(
      "#EF6820"
    );
  });

  it("is just the symbol when the sidebar is collapsed", () => {
    render(<ShelfSidebarLogo minimized />);
    expect(screen.getAllByRole("img", { name: "Vinventory" })).toHaveLength(1);
  });

  it("is the symbol on the sign-in pages", () => {
    render(<ShelfSymbolLogo />);
    expect(screen.getByRole("img", { name: "Vinventory" })).toBeTruthy();
  });
});
