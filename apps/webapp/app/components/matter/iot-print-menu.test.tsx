/**
 * Print, for an IoT asset (fork): Matter labels for every device, only those
 * not printed, chosen devices, or the usual asset label.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { IotPrintMenu } from "./iot-print-menu";

vi.mock("~/modules/customisation/use-customisations", () => ({
  useCustomisations: () => ({ labelsEnabled: true }),
}));

describe("IotPrintMenu", () => {
  it("offers the device labels and the asset label", async () => {
    const Stub = createRoutesStub([
      { path: "/", Component: () => <IotPrintMenu assetId="a1" /> },
    ]);
    render(<Stub initialEntries={["/"]} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Print labels" })
    );
    expect(screen.getByText("Matter labels: every device")).toBeTruthy();
    expect(
      screen.getByText("Matter labels: only those not printed")
    ).toBeTruthy();
    expect(screen.getByText("Matter labels: choose devices…")).toBeTruthy();
    expect(screen.getByText("Asset label")).toBeTruthy();
  });
});
