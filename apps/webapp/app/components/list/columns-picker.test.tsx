/**
 * The shared column picker (fork), used by Assets' and Filament's Advanced views.
 */
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColumnsPicker } from "./columns-picker";

vi.mock("framer-motion", () => ({
  Reorder: {
    Group: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
    Item: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  },
}));

const columns = [
  { name: "line", label: "Line", visible: true },
  { name: "code", label: "Code", visible: true },
  { name: "spent", label: "Spent", visible: false },
];

describe("ColumnsPicker", () => {
  it("shows the fixed column and the others, and applies what's ticked", () => {
    const onApply = vi.fn();
    render(
      <ColumnsPicker
        fixedLabel="Filament"
        columns={columns}
        onApply={onApply}
      />
    );
    fireEvent.click(screen.getByLabelText("Columns configuration"));
    expect(screen.getByText("Fixed columns")).toBeTruthy();
    expect(screen.getByText("Filament")).toBeTruthy();
    expect(screen.getByText("Columns (3)")).toBeTruthy();

    const apply = screen.getByRole("button", { name: "Apply" });
    expect((apply as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Spent/ }));
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith([
      { name: "line", label: "Line", visible: true },
      { name: "code", label: "Code", visible: true },
      { name: "spent", label: "Spent", visible: true },
    ]);
  });
});
