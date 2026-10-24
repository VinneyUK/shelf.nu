/**
 * The Matter mark beside names in the assets list (fork): only on assets with
 * Matter devices.
 */
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { MatterNameMark } from "./matter-name-mark";

function show(ids: string[]) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <>
          <MatterNameMark assetId="plug" />
          <MatterNameMark assetId="bike" />
        </>
      ),
    },
    { path: "/api/matter/assets", loader: () => ({ assetIds: ids }) },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("MatterNameMark", () => {
  it("shows on assets with Matter devices, not on others", async () => {
    show(["plug"]);
    expect(
      await screen.findAllByRole("img", { name: "Matter device" })
    ).toHaveLength(1);
  });
});
