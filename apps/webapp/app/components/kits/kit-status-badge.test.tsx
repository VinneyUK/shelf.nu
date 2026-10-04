/**
 * Boxes: "Available" without its green dot, like assets (fork).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KitStatusBadge } from "./kit-status-badge";

const hasDot = (container: HTMLElement) =>
  container.querySelector(".size-1\\.5") !== null;

describe("KitStatusBadge", () => {
  it("has no dot on Available", () => {
    const { container } = render(
      <KitStatusBadge status="AVAILABLE" availableToBook />
    );
    expect(screen.getByText("Available")).toBeTruthy();
    expect(hasDot(container)).toBe(false);
  });
  it("keeps the dot on other statuses", () => {
    const { container } = render(
      <KitStatusBadge status="CHECKED_OUT" availableToBook />
    );
    expect(hasDot(container)).toBe(true);
  });
});
